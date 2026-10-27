import { eq } from 'drizzle-orm'
import type { Env } from '../../config/env.js'
import type { Database } from '../../db/client.js'
import { users } from '../../db/schema.js'
import { decryptToken } from './crypto.js'
import { createLoginResolver } from '../auth/login.js'

/**
 * For the collector's service account: a currently valid token for
 * ATTO_LOGIN. Checks the cached token first (no need for ATTO_PASSWORD on
 * a cache hit); on a miss, asks the same manager the web login route uses
 * (createLoginResolver) to sign in with ATTO_LOGIN/ATTO_PASSWORD, honoring
 * the same cooldown and single-flight. Returns null if no token could be
 * obtained this cycle — the collector should skip and retry next cycle.
 */
export async function getValidToken(db: Database, env: Env, deps: {
  fetch?: typeof globalThis.fetch
  now?: () => Date
} = {}): Promise<string | null> {
  const now = deps.now ?? (() => new Date())
  const attoLoginNormalized = env.ATTO_LOGIN.trim().toLowerCase()
  const [user] = await db.select().from(users).where(eq(users.attoLoginNormalized, attoLoginNormalized))
  const cachedValid = user?.tokenEncrypted && !user.tokenInvalidatedAt && user.tokenExpiresAt && user.tokenExpiresAt.getTime() > now().getTime()
  if (cachedValid) return decryptToken(user!.tokenEncrypted!, env.ATTO_TOKEN_ENC_KEY)

  if (!env.ATTO_PASSWORD) return null
  const resolveLogin = createLoginResolver(db, env, deps)
  const outcome = await resolveLogin(env.ATTO_LOGIN, env.ATTO_PASSWORD)
  if (outcome.kind !== 'authenticated' || !outcome.user.tokenEncrypted) return null
  return decryptToken(outcome.user.tokenEncrypted, env.ATTO_TOKEN_ENC_KEY)
}

export async function invalidateToken(db: Database, attoLoginNormalized: string): Promise<void> {
  await db.update(users).set({ tokenInvalidatedAt: new Date() }).where(eq(users.attoLoginNormalized, attoLoginNormalized))
}
