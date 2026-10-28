import { eq } from 'drizzle-orm'
import type { Database } from '../../db/client.js'
import type { Env } from '../../config/env.js'
import { users, roles, rolePermissions, userRoles } from '../../db/schema.js'
import { ALL_NODES } from '../../permissions/tree.js'
import { hashPassword, verifyPassword } from './password.js'
import { signIn, AttoInvalidCredentialsError, AttoRateLimitedError } from '../atto-auth/client.js'
import { encryptToken } from '../atto-auth/crypto.js'

type User = typeof users.$inferSelect

export type LoginOutcome =
  | { kind: 'authenticated'; user: User }
  | { kind: 'rejected' }
  | { kind: 'rate_limited'; retryAfterSeconds: number }
  | { kind: 'unavailable' }

/** First user ever to sign in successfully: there's no seed, so without this
 *  bootstrap nobody would ever have admin.usuarios to grant anyone else access. */
async function grantFullAccess(db: Database, userId: string) {
  const [inserted] = await db.insert(roles).values({ name: 'Administrador' })
    .onConflictDoNothing({ target: roles.name }).returning({ id: roles.id })
  const roleId = inserted?.id ?? (await db.select({ id: roles.id }).from(roles).where(eq(roles.name, 'Administrador')))[0]!.id
  await db.insert(rolePermissions).values(ALL_NODES.map(node => ({ roleId, node })))
    .onConflictDoNothing({ target: [rolePermissions.roleId, rolePermissions.node] })
  await db.insert(userRoles).values({ userId, roleId }).onConflictDoNothing({ target: [userRoles.userId, userRoles.roleId] })
}

/**
 * All the Atto-login business rules, decoupled from HTTP: local-vs-Atto
 * decision, cooldown, single-flight SignIn, tenant lock, user upsert.
 * The route handler only translates the returned outcome into a response.
 */
export function createLoginResolver(db: Database, env: Env, deps: {
  fetch?: typeof globalThis.fetch
  now?: () => Date
} = {}) {
  const fetchImpl = deps.fetch ?? globalThis.fetch
  const now = deps.now ?? (() => new Date())
  // Dedupe concurrent login attempts for the same user into one Atto SignIn.
  const signInFlights = new Map<string, Promise<Awaited<ReturnType<typeof signIn>>>>()

  return async function resolveLogin(username: string, password: string): Promise<LoginOutcome> {
    const usernameNormalized = username.trim().toLowerCase()
    const [user] = await db.select().from(users).where(eq(users.attoLoginNormalized, usernameNormalized))
    if (user && !user.isActive) return { kind: 'rejected' }

    // Local accounts (admin-created, own password) never talk to Atto at all —
    // no cooldown, no token, no tenant check, just a direct password check.
    if (user?.isLocal) {
      if (!user.passwordHash) return { kind: 'rejected' }
      return (await verifyPassword(user.passwordHash, password)) ? { kind: 'authenticated', user } : { kind: 'rejected' }
    }

    const tenantOk = (currentUser: User) => currentUser.customerSid === env.ATTO_CUSTOMER_SID

    const minIntervalMs = env.ATTO_LOGIN_MIN_INTERVAL_MINUTES * 60_000
    const withinCooldown = !!(user?.lastSigninAt && now().getTime() - user.lastSigninAt.getTime() < minIntervalMs)
    const tokenValid = !!(user?.tokenEncrypted && !user.tokenInvalidatedAt && user.tokenExpiresAt && user.tokenExpiresAt.getTime() > now().getTime())

    if (user?.passwordHash && tokenValid) {
      if (await verifyPassword(user.passwordHash, password)) {
        return tenantOk(user) ? { kind: 'authenticated', user } : { kind: 'rejected' }
      }
      if (withinCooldown) return { kind: 'rejected' }
      // Password mismatch after the cooldown window: it may have changed at the Atto side.
    } else if (withinCooldown) {
      const remainingMs = minIntervalMs - (now().getTime() - user!.lastSigninAt!.getTime())
      return { kind: 'rate_limited', retryAfterSeconds: Math.max(Math.ceil(remainingMs / 1000), 1) }
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
      if (error instanceof AttoInvalidCredentialsError) return { kind: 'rejected' }
      if (error instanceof AttoRateLimitedError) {
        if (user) await db.update(users).set({ lastSigninAt: now() }).where(eq(users.id, user.id))
        return { kind: 'rate_limited', retryAfterSeconds: env.ATTO_LOGIN_MIN_INTERVAL_MINUTES * 60 }
      }
      return { kind: 'unavailable' }
    }

    // A successful SignIn is precious (Atto allows one per login per hour), so it's
    // always persisted below — even if the CustomerSid check rejects the session —
    // so this exact attempt is never wasted and a retry can reuse it locally.
    const isFirstUserEver = !user && (await db.select({ id: users.id }).from(users).limit(1)).length === 0

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

    if (isFirstUserEver) await grantFullAccess(db, savedUser!.id)
    if (result.customerSid !== env.ATTO_CUSTOMER_SID) return { kind: 'rejected' }
    return { kind: 'authenticated', user: savedUser! }
  }
}
