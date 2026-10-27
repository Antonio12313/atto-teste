import { eq } from 'drizzle-orm'
import type { Env } from '../../config/env.js'
import type { Database, SqlClient } from '../../db/client.js'
import { attoAuthState } from '../../db/schema.js'
import { encryptToken, decryptToken } from './crypto.js'

export class AttoLoginCooldownError extends Error {
  constructor(public readonly retryAt: Date) { super('Login Atto em cooldown. Aguarde a próxima janela.'); this.name = 'AttoLoginCooldownError' }
}
export class AttoLoginError extends Error {
  constructor() { super('Não foi possível obter a credencial de serviço Atto. Consulte o status sanitizado.'); this.name = 'AttoLoginError' }
}
type State = typeof attoAuthState.$inferSelect
const LOCK_ID = 71842631
export function createAttoAuth({ db, lockSql, env, fetch: request = globalThis.fetch, now = () => new Date() }: {
  db: Database; lockSql: SqlClient; env: Env; fetch?: typeof globalThis.fetch; now?: () => Date
}) {
  let flight: Promise<string> | undefined
  const read = async () => (await db.select().from(attoAuthState).where(eq(attoAuthState.id, 1)))[0]
  const nextAllowed = (state?: State) => state?.lastAttemptAt ? new Date(state.lastAttemptAt.getTime() + env.ATTO_LOGIN_MIN_INTERVAL_MINUTES * 60_000) : null
  const cached = (state?: State) => {
    if (!state?.tokenEncrypted || state.invalidatedAt || !state.expiresAt || now().getTime() >= state.expiresAt.getTime() - 300_000) return undefined
    try { return decryptToken(state.tokenEncrypted, env.ATTO_TOKEN_ENC_KEY) }
    catch { throw new AttoLoginError() } // A bad key must never trigger a new SignIn.
  }
  async function obtain(): Promise<string> {
    if (!env.ATTO_LOGIN || !env.ATTO_PASSWORD || !env.ATTO_CUSTOMER_SID || !env.ATTO_TOKEN_ENC_KEY) throw new AttoLoginError()
    const token = cached(await read())
    if (token) return token
    // Separate lock pool: committed state writes must not queue behind lock waiters.
    return lockSql.begin(async tx => {
      await tx`select pg_advisory_xact_lock(${LOCK_ID})`
      const state = await read()
      const existing = cached(state)
      if (existing) return existing
      const retryAt = nextAllowed(state)
      if (retryAt && now() < retryAt) throw new AttoLoginCooldownError(retryAt)
      // AUTOCOMMIT on the data pool BEFORE the network. Survives crash, timeout,
      // transaction rollback and process restart while the advisory lock is held.
      await db.insert(attoAuthState).values({ id: 1, lastAttemptAt: now(), lastStatus: 'error', lastError: 'Tentativa iniciada; resultado ainda indisponível.' })
        .onConflictDoUpdate({ target: attoAuthState.id, set: { lastAttemptAt: now(), lastStatus: 'error', lastError: 'Tentativa iniciada; resultado ainda indisponível.' } })
      let status = 'error'
      const controller = new AbortController()
      let timeoutId: ReturnType<typeof setTimeout> | undefined
      try {
        const timeout = new Promise<never>((_resolve, reject) => {
          timeoutId = setTimeout(() => { status = 'timeout'; controller.abort(); reject(new AttoLoginError()) }, env.ATTO_REQUEST_TIMEOUT_MS)
        })
        // Deadline covers response body too, even if an injected fetch ignores abort.
        const result = await Promise.race([(async () => {
          const response = await request(`${env.ATTO_ADMIN_URL.replace(/\/$/, '')}/Login/SignIn`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ Login: env.ATTO_LOGIN, Password: env.ATTO_PASSWORD }), signal: controller.signal,
            redirect: 'error',
          })
          if (response.status !== 200) {
            status = response.status === 429 ? 'rate_limited' : [401, 403].includes(response.status) ? 'bad_credentials' : 'error'
            throw new AttoLoginError()
          }
          const body: unknown = await response.json()
          if (!body || typeof body !== 'object') throw new AttoLoginError()
          const payload = body as Record<string, unknown>
          if (payload.Error != null) { status = 'bad_credentials'; throw new AttoLoginError() }
          if (typeof payload.jwt !== 'string' || !payload.jwt) throw new AttoLoginError()
          return payload.jwt
        })(), timeout])
        clearTimeout(timeoutId)
        const obtainedAt = now()
        await db.update(attoAuthState).set({
          tokenEncrypted: encryptToken(result, env.ATTO_TOKEN_ENC_KEY), obtainedAt,
          expiresAt: new Date(obtainedAt.getTime() + env.ATTO_TOKEN_TTL_HOURS * 3_600_000),
          invalidatedAt: null, lastStatus: 'ok', lastError: null,
          // Sid is not persisted until a documented consumer actually needs it.
          sid: null,
        }).where(eq(attoAuthState.id, 1))
        return result
      } catch {
        clearTimeout(timeoutId)
        const messages: Record<string, string> = { bad_credentials: 'Autenticação recusada pelo serviço.', rate_limited: 'Limite do serviço atingido.', timeout: 'Tempo limite da requisição excedido.', error: 'Falha ao obter credencial de serviço.' }
        await db.update(attoAuthState).set({ lastStatus: status, lastError: messages[status]! }).where(eq(attoAuthState.id, 1))
        throw new AttoLoginError()
      }
    }) as Promise<string>
  }
  return {
    getToken(): Promise<string> {
      if (!flight) flight = obtain().finally(() => { flight = undefined })
      return flight
    },
    async invalidate(reason: string): Promise<void> {
      void reason
      // The caller's reason can contain upstream secrets; never persist/log it.
      await lockSql.begin(async tx => {
        await tx`select pg_advisory_xact_lock(${LOCK_ID})`
        await db.update(attoAuthState).set({ invalidatedAt: now() }).where(eq(attoAuthState.id, 1))
      })
    },
    async getStatus() {
      const state = await read()
      return {
        hasToken: !!state?.tokenEncrypted, obtainedAt: state?.obtainedAt ?? null,
        expiresAt: state?.expiresAt ?? null, invalidatedAt: state?.invalidatedAt ?? null,
        lastAttemptAt: state?.lastAttemptAt ?? null, lastStatus: state?.lastStatus ?? null,
        nextLoginAllowedAt: nextAllowed(state),
      }
    },
  }
}
