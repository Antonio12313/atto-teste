import { createHash, randomBytes } from 'node:crypto'
import type { Env } from '../../config/env.js'
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex')
export const newToken = () => randomBytes(32).toString('base64url')
export const cookieName = 'sid'
export const cookieOptions = (env: Env) => ({
  httpOnly: true, secure: env.COOKIE_SECURE, sameSite: 'lax' as const, path: '/',
})
