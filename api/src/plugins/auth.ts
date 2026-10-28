import { eq } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Env } from '../config/env.js'
import type { Database } from '../db/client.js'
import { sessions, users } from '../db/schema.js'
import { cookieName, cookieOptions, tokenHash } from '../modules/auth/session.js'
import type { PublicUser } from '../modules/auth/schemas.js'
import { loadResolveContext } from '../permissions/load.js'
import { resolveAny } from '../permissions/resolve.js'

declare module 'fastify' {
  interface FastifyRequest { user: PublicUser | null; sessionId: string }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    requirePermission: (nodes: string | string[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}
export function registerAuth(app: FastifyInstance, db: Database, env: Env) {
  app.decorateRequest('user', null)
  app.decorateRequest('sessionId', '')
  app.decorate('authenticate', async (request, reply) => {
    const token = request.cookies[cookieName]
    const reject = () => {
      reply.clearCookie(cookieName, cookieOptions(env))
      reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Autenticação necessária.' })
    }
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) { reject(); return }
    const [row] = await db.select({ session: sessions, user: users }).from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId)).where(eq(sessions.tokenHash, tokenHash(token)))
    if (!row) { reject(); return }
    if (!row.user.isActive || row.session.expiresAt <= new Date()) {
      await db.delete(sessions).where(eq(sessions.id, row.session.id))
      reject(); return
    }
    request.user = { id: row.user.id, name: row.user.name, atto_login: row.user.attoLogin }
    request.sessionId = row.session.id
  })
  app.decorate('requirePermission', (nodes: string | string[]) => {
    const required = Array.isArray(nodes) ? nodes : [nodes]
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const ctx = await loadResolveContext(db, request.user!.id)
      if (!resolveAny(required, ctx)) {
        reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Acesso negado.' })
      }
    }
  })
}
