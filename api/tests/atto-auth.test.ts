import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { createAttoAuth, AttoLoginCooldownError, AttoLoginError } from '../src/modules/atto-auth/service.js'
import { encryptToken, decryptToken } from '../src/modules/atto-auth/crypto.js'
import { attoAuthState } from '../src/db/schema.js'
import { createDatabase } from '../src/db/client.js'
import { db, env, database } from './setup.js'

// Synthetic values generated at runtime, never a real JWT or stored credential fixture.
const secret = () => randomBytes(32).toString('base64url')
let token: string
let clock: Date
let options: typeof env
let request: ReturnType<typeof vi.fn<typeof fetch>>
let extra: ReturnType<typeof createDatabase>[] = []
beforeEach(() => {
  token = secret(); clock = new Date('2030-01-01T00:00:00Z')
  options = { ...env, ATTO_LOGIN: secret(), ATTO_PASSWORD: secret(), ATTO_CUSTOMER_SID: secret(), ATTO_TOKEN_ENC_KEY: randomBytes(32).toString('base64') }
  request = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify({ Error: null, jwt: token }), { status: 200 }))
})
afterEach(async () => { await Promise.all(extra.map(d => d.close())); extra = []; vi.restoreAllMocks() })
const service = (databaseOverride = database) => createAttoAuth({ ...databaseOverride, env: options, fetch: request, now: () => clock })
const advance = (minutes: number) => { clock = new Date(clock.getTime() + minutes * 60_000) }
const state = async () => (await db.select().from(attoAuthState))[0]!

describe('Atto: credencial de serviço isolada', () => {
  test('cache vazio faz uma chamada, grava criptografado e reaproveita sem rede', async () => {
    const auth = service()
    expect((await auth.getToken()) === token).toBe(true)
    expect(request.mock.calls.length).toBe(1)
    const saved = await state()
    expect(saved.tokenEncrypted === token).toBe(false)
    expect(decryptToken(saved.tokenEncrypted!, options.ATTO_TOKEN_ENC_KEY) === token).toBe(true)
    expect(saved.lastStatus).toBe('ok'); expect(saved.sid).toBeNull()
    const call = request.mock.calls[0]!
    expect(call[0]).toBe(`${options.ATTO_ADMIN_URL}/Login/SignIn`)
    expect(Object.keys(JSON.parse(String(call[1]?.body)))).toEqual(['Login', 'Password'])
    advance(20)
    expect((await auth.getToken()) === token).toBe(true)
    expect(request.mock.calls.length).toBe(1)
    expect(JSON.stringify(await auth.getStatus()).includes(token)).toBe(false)
  })
  test('20 chamadas concorrentes fazem apenas um SignIn', async () => {
    const auth = service()
    const results = await Promise.all(Array.from({ length: 20 }, () => auth.getToken()))
    expect(results.every(t => t === token)).toBe(true)
    expect(request.mock.calls.length).toBe(1)
  })
  test('duas instâncias com pools independentes serializam pelo PostgreSQL', async () => {
    const anotherDb = createDatabase(env.DATABASE_URL_TEST!); extra.push(anotherDb)
    const a = service(); const b = service(anotherDb)
    const values = await Promise.all([a.getToken(), b.getToken()])
    expect(values.every(v => v === token)).toBe(true)
    expect(request.mock.calls.length).toBe(1)
  })
  test('reinício com mesmo banco reaproveita token', async () => {
    await service().getToken(); request.mockClear()
    const restarted = createDatabase(env.DATABASE_URL_TEST!); extra.push(restarted)
    expect((await service(restarted).getToken()) === token).toBe(true)
    expect(request.mock.calls.length).toBe(0)
  })
  test('token expirado respeita cooldown e depois renova uma vez', async () => {
    await service().getToken()
    await db.update(attoAuthState).set({ expiresAt: clock }).where(eq(attoAuthState.id, 1))
    advance(59)
    await expect(service().getToken()).rejects.toBeInstanceOf(AttoLoginCooldownError)
    expect(request.mock.calls.length).toBe(1)
    advance(2); await service().getToken()
    expect(request.mock.calls.length).toBe(2)
  })
  test('margem de cinco minutos renova antes de vencer', async () => {
    await service().getToken(); advance(23 * 60 - 4)
    await service().getToken(); expect(request.mock.calls.length).toBe(2)
  })
  test('invalidate não persiste razão sensível nem permite retry imediato', async () => {
    const auth = service(); await auth.getToken()
    await auth.invalidate(options.ATTO_PASSWORD)
    expect((await state()).invalidatedAt).toEqual(clock)
    expect(JSON.stringify(await state()).includes(options.ATTO_PASSWORD)).toBe(false)
    await expect(auth.getToken()).rejects.toBeInstanceOf(AttoLoginCooldownError)
    expect(request.mock.calls.length).toBe(1)
    advance(61); await auth.getToken(); expect(request.mock.calls.length).toBe(2)
    expect((await state()).invalidatedAt).toBeNull()
  })
  test.each(['Error', '500', '429', 'timeout', 'network', 'malformed', 'missing-jwt'])('falha %s conta tentativa, sanitiza e bloqueia retry após reinício', async kind => {
    options.ATTO_REQUEST_TIMEOUT_MS = 25
    request.mockImplementation(async () => {
      if (kind === 'timeout') return new Promise<Response>(() => {})
      if (kind === 'network') throw new Error(options.ATTO_PASSWORD)
      if (kind === 'malformed') return new Response(token, { status: 200 })
      if (kind === 'missing-jwt') return new Response('{}', { status: 200 })
      return new Response(JSON.stringify({ Error: `${token}:${options.ATTO_PASSWORD}`, jwt: token }), { status: kind === 'Error' ? 200 : Number(kind) })
    })
    const auth = service()
    await expect(auth.getToken()).rejects.toBeInstanceOf(AttoLoginError)
    expect(request.mock.calls.length).toBe(1)
    const saved = await state()
    expect(saved.lastAttemptAt).toEqual(clock)
    expect(saved.lastStatus).toBe(kind === 'Error' ? 'bad_credentials' : kind === '429' ? 'rate_limited' : kind === 'timeout' ? 'timeout' : 'error')
    expect(saved.lastError!.includes(token)).toBe(false)
    expect(saved.lastError!.includes(options.ATTO_PASSWORD)).toBe(false)
    expect(saved.tokenEncrypted).toBeNull()
    await expect(service().getToken()).rejects.toBeInstanceOf(AttoLoginCooldownError)
    expect(request.mock.calls.length).toBe(1)
    advance(61)
    request.mockImplementation(async () => new Response(JSON.stringify({ Error: null, jwt: token })))
    await service().getToken(); expect(request.mock.calls.length).toBe(2)
  })
  test('tentativa já está durável durante a rede; rollback do lock não a apaga', async () => {
    let release!: () => void
    let started!: () => void
    const pending = new Promise<void>(resolve => { release = resolve })
    const observed = new Promise<void>(resolve => { started = resolve })
    request.mockImplementation(async () => { started(); await pending; throw new Error('simulated failure') })
    const promise = service().getToken()
    const rejection = expect(promise).rejects.toBeInstanceOf(AttoLoginError)
    await observed
    const saved = await state()
    expect(saved.lastAttemptAt).toEqual(clock)
    release(); await rejection
    await expect(service().getToken()).rejects.toBeInstanceOf(AttoLoginCooldownError)
    expect(request.mock.calls.length).toBe(1)
  })
  test('status e configuração ausente não usam rede', async () => {
    options.ATTO_LOGIN = ''
    const auth = service()
    expect(await auth.getStatus()).toMatchObject({ hasToken: false, lastAttemptAt: null })
    await expect(auth.getToken()).rejects.toBeInstanceOf(AttoLoginError)
    expect(request.mock.calls.length).toBe(0)
  })
  test('AES-GCM usa IV aleatório, detecta adulteração e chave incorreta', () => {
    const first = encryptToken(token, options.ATTO_TOKEN_ENC_KEY)
    expect(first === encryptToken(token, options.ATTO_TOKEN_ENC_KEY)).toBe(false)
    expect(() => decryptToken(first, randomBytes(32).toString('base64'))).toThrow()
    const parts = first.split(':'); parts[2] = Buffer.from('tampered').toString('base64')
    expect(() => decryptToken(parts.join(':'), options.ATTO_TOKEN_ENC_KEY)).toThrow()
  })
  test('chave diferente após reinício falha sem chamar SignIn', async () => {
    await service().getToken(); request.mockClear()
    options.ATTO_TOKEN_ENC_KEY = randomBytes(32).toString('base64')
    await expect(service().getToken()).rejects.toBeInstanceOf(AttoLoginError)
    expect(request.mock.calls.length).toBe(0)
  })
  test('token e senha nunca aparecem em logs do módulo', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await service().getToken()
    const captured = JSON.stringify([...info.mock.calls, ...error.mock.calls, ...log.mock.calls])
    expect(captured.includes(token)).toBe(false)
    expect(captured.includes(options.ATTO_PASSWORD)).toBe(false)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})
