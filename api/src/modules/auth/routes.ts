import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { Database } from '../../db/client.js'
import type { Env } from '../../config/env.js'
import { sessions, users } from '../../db/schema.js'
import { hashPassword, verifyPassword } from './password.js'
import { loginSchema } from './schemas.js'
import { newToken, tokenHash, cookieName, cookieOptions } from './session.js'
import { signIn, AttoInvalidCredentialsError, AttoRateLimitedError, AttoServiceUnavailableError } from '../atto-auth/client.js'
import { encryptToken } from '../atto-auth/crypto.js'

type User = typeof users.$inferSelect

const GENERIC_MESSAGE = 'Usuário ou senha inválidos.'
const RATE_LIMITED_MESSAGE = 'Muitas tentativas. Tente novamente mais tarde.'

export async function authRoutes(app: FastifyInstance, db: Database, env: Env, deps: {
  fetch?: typeof globalThis.fetch
  now?: () => Date
} = {}) {
  const fetchImpl = deps.fetch ?? globalThis.fetch
  const now = deps.now ?? (() => new Date())
  // Dedupe concurrent login attempts for the same user into one Atto SignIn.
  const signInFlights = new Map<string, Promise<Awaited<ReturnType<typeof signIn>>>>()

  app.post('/auth/login', {
    config: { rateLimit: {
      max: env.LOGIN_RATE_LIMIT_MAX, timeWindow: env.LOGIN_RATE_LIMIT_WINDOW, hook: 'preHandler',
      keyGenerator: (req) => `${req.ip}:${String((req.body as Record<string, unknown> | undefined)?.username ?? '').trim().toLowerCase()}`,
    } },
  }, async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Dados inválidos.' })
    const { username, password } = parsed.data
    const usernameNormalized = username.trim().toLowerCase()

    const [user] = await db.select().from(users).where(eq(users.attoLoginNormalized, usernameNormalized))
    const genericFail = (reason: string) => {
      request.log.warn({ event: 'login_rejected', reason, username: usernameNormalized }, 'Login rejeitado')
      return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: GENERIC_MESSAGE })
    }
    if (user && !user.isActive) return genericFail('inactive_user')

    const minIntervalMs = env.ATTO_LOGIN_MIN_INTERVAL_MINUTES * 60_000
    const withinCooldown = !!(user?.lastSigninAt && now().getTime() - user.lastSigninAt.getTime() < minIntervalMs)
    const tokenValid = !!(user?.tokenEncrypted && !user.tokenInvalidatedAt && user.tokenExpiresAt && user.tokenExpiresAt.getTime() > now().getTime())

    async function createSession(target: User) {
      const token = newToken()
      const previous = request.cookies[cookieName]
      await db.transaction(async tx => {
        if (previous) await tx.delete(sessions).where(eq(sessions.tokenHash, tokenHash(previous)))
        await tx.insert(sessions).values({ userId: target.id, tokenHash: tokenHash(token), expiresAt: new Date(now().getTime() + env.SESSION_TTL_HOURS * 3_600_000) })
        await tx.update(users).set({ lastLoginAt: now(), updatedAt: now() }).where(eq(users.id, target.id))
      })
      reply.setCookie(cookieName, token, { ...cookieOptions(env), maxAge: env.SESSION_TTL_HOURS * 3600 })
      return reply.send({ user: { id: target.id, name: target.name, atto_login: target.attoLogin } })
    }

    if (user?.passwordHash && tokenValid) {
      const valid = await verifyPassword(user.passwordHash, password)
      if (valid) return createSession(user)
      if (withinCooldown) return genericFail('local_password_mismatch_within_cooldown')
      // Password mismatch after the cooldown window: it may have changed at the Atto side.
    } else if (withinCooldown) {
      request.log.warn({ event: 'login_cooldown_429', username: usernameNormalized }, 'Login bloqueado por cooldown antes de chamar a Atto')
      const remainingMs = minIntervalMs - (now().getTime() - user!.lastSigninAt!.getTime())
      reply.header('Retry-After', String(Math.max(Math.ceil(remainingMs / 1000), 1)))
      return reply.code(429).send({ statusCode: 429, error: 'Too Many Requests', message: RATE_LIMITED_MESSAGE })
    }

    let flight = signInFlights.get(usernameNormalized)
    if (!flight) {
      flight = signIn(username.trim(), password, { adminUrl: env.ATTO_ADMIN_URL, timeoutMs: env.ATTO_REQUEST_TIMEOUT_MS, fetch: fetchImpl })
      signInFlights.set(usernameNormalized, flight)
      flight.finally(() => signInFlights.delete(usernameNormalized)).catch(() => {})
    }

    let result: Awaited<typeof flight>
    try {
      result = await flight
    } catch (error) {
      if (error instanceof AttoInvalidCredentialsError) {
        request.log.warn({ event: 'login_atto_rejected', username: usernameNormalized, status: error.status, attoError: error.attoError }, 'Atto recusou o SignIn')
        return genericFail('atto_invalid_credentials')
      }
      if (error instanceof AttoRateLimitedError) {
        request.log.warn({ event: 'login_atto_rate_limited', username: usernameNormalized }, 'Atto sinalizou 429 no SignIn')
        if (user) await db.update(users).set({ lastSigninAt: now() }).where(eq(users.id, user.id))
        reply.header('Retry-After', String(env.ATTO_LOGIN_MIN_INTERVAL_MINUTES * 60))
        return reply.code(429).send({ statusCode: 429, error: 'Too Many Requests', message: RATE_LIMITED_MESSAGE })
      }
      request.log.warn({ event: 'login_atto_unavailable', username: usernameNormalized, reason: error instanceof AttoServiceUnavailableError ? error.reason : 'unknown' }, 'Falha ao contatar a Atto')
      return reply.code(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'Serviço de autenticação indisponível. Tente novamente em instantes.' })
    }

    if (result.customerSid !== env.ATTO_CUSTOMER_SID) {
      request.log.warn({ event: 'login_customer_sid_mismatch', username: usernameNormalized, attoLogin: result.login, received: result.customerSid, expected: env.ATTO_CUSTOMER_SID }, 'CustomerSid da Atto não corresponde ao configurado')
      return genericFail('customer_sid_mismatch')
    }

    const obtainedAt = now()
    const tokenExpiresAt = new Date(obtainedAt.getTime() + env.ATTO_TOKEN_TTL_HOURS * 3_600_000)
    const passwordHash = await hashPassword(password)
    const tokenEncrypted = encryptToken(result.jwt, env.ATTO_TOKEN_ENC_KEY)
    const attoLogin = result.login || username.trim()
    const name = `${result.name} ${result.surname}`.trim() || attoLogin
    const [savedUser] = await db.insert(users).values({
      attoLogin, attoLoginNormalized: usernameNormalized, name,
      attoSid: result.sid || null, customerSid: result.customerSid, isRoot: result.isRoot, attoRoles: result.roles,
      passwordHash, tokenEncrypted,
      tokenObtainedAt: obtainedAt, tokenExpiresAt, tokenInvalidatedAt: null, lastSigninAt: obtainedAt,
    }).onConflictDoUpdate({
      target: users.attoLoginNormalized,
      set: {
        attoLogin, name, attoSid: result.sid || null, customerSid: result.customerSid,
        isRoot: result.isRoot, attoRoles: result.roles, passwordHash, tokenEncrypted,
        tokenObtainedAt: obtainedAt, tokenExpiresAt, tokenInvalidatedAt: null, lastSigninAt: obtainedAt, updatedAt: now(),
      },
    }).returning()

    return createSession(savedUser!)
  })

  app.get('/auth/me', { preHandler: app.authenticate }, async request => ({ user: request.user! }))
  app.post('/auth/logout', { preHandler: app.authenticate }, async (request, reply) => {
    await db.delete(sessions).where(eq(sessions.id, request.sessionId))
    return reply.clearCookie(cookieName, cookieOptions(env)).code(204).send()
  })
}
