import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { Database } from '../../db/client.js'
import type { Env } from '../../config/env.js'
import { sessions, users } from '../../db/schema.js'
import { hashPassword, verifyPassword } from './password.js'
import { loginSchema } from './schemas.js'
import { newToken, tokenHash, cookieName, cookieOptions } from './session.js'

export async function authRoutes(app: FastifyInstance, db: Database, env: Env) {
  const dummyHash = await hashPassword(randomBytes(32).toString('base64url'))
  app.post('/auth/login', {
    config: { rateLimit: {
      max: env.LOGIN_RATE_LIMIT_MAX, timeWindow: env.LOGIN_RATE_LIMIT_WINDOW, hook: 'preHandler',
      keyGenerator: (req) => `${req.ip}:${String((req.body as Record<string, unknown> | undefined)?.email ?? '').trim().toLowerCase()}`,
    } },
  }, async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Dados inválidos.' })
    const { email, password } = parsed.data
    const [user] = await db.select().from(users).where(eq(users.email, email))
    const valid = await verifyPassword(user?.passwordHash ?? dummyHash, password)
    if (!user || !valid || !user.isActive) {
      return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'E-mail ou senha inválidos.' })
    }
    const token = newToken()
    const previous = request.cookies[cookieName]
    await db.transaction(async tx => {
      if (previous) await tx.delete(sessions).where(eq(sessions.tokenHash, tokenHash(previous)))
      await tx.insert(sessions).values({ userId: user.id, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + env.SESSION_TTL_HOURS * 3_600_000) })
      await tx.update(users).set({ lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(users.id, user.id))
    })
    reply.setCookie(cookieName, token, { ...cookieOptions(env), maxAge: env.SESSION_TTL_HOURS * 3600 })
    return { user: { id: user.id, name: user.name, email: user.email } }
  })
  app.get('/auth/me', { preHandler: app.authenticate }, async request => ({ user: request.user! }))
  app.post('/auth/logout', { preHandler: app.authenticate }, async (request, reply) => {
    await db.delete(sessions).where(eq(sessions.id, request.sessionId))
    return reply.clearCookie(cookieName, cookieOptions(env)).code(204).send()
  })
}
