import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { Database } from '../../db/client.js'
import type { Env } from '../../config/env.js'
import { sessions, users } from '../../db/schema.js'
import { loginSchema } from './schemas.js'
import { newToken, tokenHash, cookieName, cookieOptions } from './session.js'
import { createLoginResolver } from './login.js'
import { loadResolveContext } from '../../permissions/load.js'
import { resolveAllPermissions } from '../../permissions/resolve.js'

const GENERIC_MESSAGE = 'Usuário ou senha inválidos.'
const RATE_LIMITED_MESSAGE = 'Muitas tentativas. Tente novamente mais tarde.'

export async function authRoutes(app: FastifyInstance, db: Database, env: Env, deps: {
  fetch?: typeof globalThis.fetch
  now?: () => Date
} = {}) {
  const now = deps.now ?? (() => new Date())
  const resolveLogin = createLoginResolver(db, env, deps)

  app.post('/auth/login', {
    config: { rateLimit: {
      max: env.LOGIN_RATE_LIMIT_MAX, timeWindow: env.LOGIN_RATE_LIMIT_WINDOW, hook: 'preHandler',
      keyGenerator: (req) => `${req.ip}:${String((req.body as Record<string, unknown> | undefined)?.username ?? '').trim().toLowerCase()}`,
    } },
  }, async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Dados inválidos.' })

    const outcome = await resolveLogin(parsed.data.username, parsed.data.password)
    switch (outcome.kind) {
      case 'rejected':
        return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: GENERIC_MESSAGE })
      case 'rate_limited':
        reply.header('Retry-After', String(outcome.retryAfterSeconds))
        return reply.code(429).send({ statusCode: 429, error: 'Too Many Requests', message: RATE_LIMITED_MESSAGE })
      case 'unavailable':
        return reply.code(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'Serviço de autenticação indisponível. Tente novamente em instantes.' })
      case 'authenticated': {
        const token = newToken()
        const previous = request.cookies[cookieName]
        await db.transaction(async tx => {
          if (previous) await tx.delete(sessions).where(eq(sessions.tokenHash, tokenHash(previous)))
          await tx.insert(sessions).values({ userId: outcome.user.id, tokenHash: tokenHash(token), expiresAt: new Date(now().getTime() + env.SESSION_TTL_HOURS * 3_600_000) })
          await tx.update(users).set({ lastLoginAt: now(), updatedAt: now() }).where(eq(users.id, outcome.user.id))
        })
        reply.setCookie(cookieName, token, { ...cookieOptions(env), maxAge: env.SESSION_TTL_HOURS * 3600 })
        return reply.send({ user: { id: outcome.user.id, name: outcome.user.name, atto_login: outcome.user.attoLogin } })
      }
    }
  })

  app.get('/auth/me', { preHandler: app.authenticate }, async request => {
    const ctx = await loadResolveContext(db, request.user!.id)
    return { user: request.user!, permissions: resolveAllPermissions(ctx) }
  })
  app.post('/auth/logout', { preHandler: app.authenticate }, async (request, reply) => {
    await db.delete(sessions).where(eq(sessions.id, request.sessionId))
    return reply.clearCookie(cookieName, cookieOptions(env)).code(204).send()
  })
}
