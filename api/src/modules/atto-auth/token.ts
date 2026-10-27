import { eq } from 'drizzle-orm'
import type { Env } from '../../config/env.js'
import type { Database } from '../../db/client.js'
import { users } from '../../db/schema.js'
import { decryptToken } from './crypto.js'

// For the future Atto collector: it reads the token of the user whose
// atto_login matches ATTO_LOGIN, so the login route is the only writer.
export async function getValidToken(db: Database, env: Env, attoLoginNormalized: string): Promise<string | null> {
  const [user] = await db.select().from(users).where(eq(users.attoLoginNormalized, attoLoginNormalized))
  if (!user?.tokenEncrypted || user.tokenInvalidatedAt || !user.tokenExpiresAt || user.tokenExpiresAt.getTime() <= Date.now()) {
    return null
  }
  return decryptToken(user.tokenEncrypted, env.ATTO_TOKEN_ENC_KEY)
}

export async function invalidateToken(db: Database, attoLoginNormalized: string): Promise<void> {
  await db.update(users).set({ tokenInvalidatedAt: new Date() }).where(eq(users.attoLoginNormalized, attoLoginNormalized))
}
