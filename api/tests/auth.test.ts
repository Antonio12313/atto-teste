import { randomBytes } from 'node:crypto'
import { describe, test, expect, beforeAll, afterEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import { hashPassword } from '../src/modules/auth/password.js'
import { sessions, users } from '../src/db/schema.js'
import { tokenHash } from '../src/modules/auth/session.js'
import { readEnv } from '../src/config/env.js'
import { db, env, sql } from './setup.js'

const password = randomBytes(24).toString('base64url')
let hash: string
let apps: FastifyInstance[] = []
beforeAll(async () => { hash = await hashPassword(password) })
afterEach(async () => { await Promise.all(apps.map(a => a.close())); apps = [] })
async function setup(overrides = {}) {
  await db.insert(users).values({ name: 'Administrador de teste', email: 'admin@example.com', passwordHash: hash })
  const app = await buildApp({ db, env: { ...env, ...overrides }, logger: false }); apps.push(app); return app
}
const login = (app: FastifyInstance, payload = { email: 'admin@example.com', password }, cookie?: string) => app.inject({ method: 'POST', url: '/auth/login', payload, headers: cookie ? { cookie } : {} })
const cookie = (response: Awaited<ReturnType<typeof login>>) => String(response.headers['set-cookie']).split(';')[0]!

describe('Autenticação local', () => {
  test('sucesso normaliza e-mail, flags, hash de sessão e senha, sem dados privados', async () => {
    const app = await setup()
    const response = await login(app, { email: ' ADMIN@EXAMPLE.COM ', password })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ user: { id: expect.any(String), name: 'Administrador de teste', email: 'admin@example.com' } })
    expect(response.headers['set-cookie']).toContain('HttpOnly')
    expect(response.headers['set-cookie']).toContain('SameSite=Lax')
    expect(response.headers['set-cookie']).toContain('Max-Age=28800')
    const [session] = await db.select().from(sessions)
    const value = cookie(response).slice(4)
    expect(Buffer.from(value, 'base64url')).toHaveLength(32)
    expect(session!.tokenHash === tokenHash(value)).toBe(true)
    expect(session!.tokenHash === value).toBe(false)
    const [user] = await db.select().from(users)
    expect(user!.passwordHash.startsWith('$argon2id$')).toBe(true)
    expect(user!.passwordHash.includes(password)).toBe(false)
    expect(user!.lastLoginAt).not.toBeNull()
  })
  test('senha incorreta, usuário inexistente e inativo têm resposta idêntica', async () => {
    const app = await setup()
    const wrong = await login(app, { email: 'admin@example.com', password: randomBytes(12).toString('hex') })
    const missing = await login(app, { email: 'missing@example.com', password })
    await db.update(users).set({ isActive: false })
    const inactive = await login(app)
    for (const response of [wrong, missing, inactive]) {
      expect(response.statusCode).toBe(401)
      expect(response.json()).toEqual({ statusCode: 401, error: 'Unauthorized', message: 'E-mail ou senha inválidos.' })
      expect(response.body).toBe(wrong.body)
    }
  })
  test('body inválido retorna 400', async () => {
    const app = await setup()
    for (const payload of [{}, { email: 'invalid', password }, { email: 'a@b.com', password: '' }, { email: 'a@b.com', password: 'a'.repeat(129) }]) {
      expect((await app.inject({ method: 'POST', url: '/auth/login', payload })).statusCode).toBe(400)
    }
  })
  test('me exige cookie e retorna apenas usuário público', async () => {
    const app = await setup()
    expect((await app.inject('/auth/me')).statusCode).toBe(401)
    const response = await login(app)
    const me = await app.inject({ url: '/auth/me', headers: { cookie: cookie(response) } })
    expect(me.statusCode).toBe(200); expect(me.json()).toEqual(response.json())
    expect(me.headers['cache-control']).toBe('no-store')
  })
  test('logout exige sessão e invalida cookie antigo; zero chamadas Atto', async () => {
    const app = await setup()
    const response = await login(app)
    const headers = { cookie: cookie(response) }
    const logout = await app.inject({ method: 'POST', url: '/auth/logout', headers, payload: {} })
    expect(logout.statusCode).toBe(204)
    expect(logout.headers['set-cookie']).toContain('Max-Age=0')
    expect((await app.inject({ url: '/auth/me', headers })).statusCode).toBe(401)
    expect((await app.inject({ method: 'POST', url: '/auth/logout', payload: {} })).statusCode).toBe(401)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
  test.each(['expired', 'inactive'])('%s invalida sessão e limpa cookie', async kind => {
    const app = await setup()
    const response = await login(app)
    if (kind === 'expired') await db.update(sessions).set({ expiresAt: new Date(0) })
    else await db.update(users).set({ isActive: false })
    const me = await app.inject({ url: '/auth/me', headers: { cookie: cookie(response) } })
    expect(me.statusCode).toBe(401)
    expect(me.headers['set-cookie']).toContain('Max-Age=0')
    expect(await db.select().from(sessions)).toHaveLength(0)
  })
  test('rate limit normaliza e-mail, retorna Retry-After e ignora X-Forwarded-For forjado', async () => {
    const app = await setup({ LOGIN_RATE_LIMIT_MAX: 2 })
    for (let i = 0; i < 2; i++) await login(app, { email: 'admin@example.com', password: 'invalid' })
    const response = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: ' ADMIN@EXAMPLE.COM ', password }, headers: { 'x-forwarded-for': '203.0.113.12' } })
    expect(response.statusCode).toBe(429)
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0)
    expect((await login(app, { email: 'other@example.com', password })).statusCode).toBe(401)
  })
  test('cada login rotaciona token e revoga sessão anterior', async () => {
    const app = await setup()
    const first = await login(app); const second = await login(app, undefined, cookie(first))
    expect(cookie(first) === cookie(second)).toBe(false)
    expect((await app.inject({ url: '/auth/me', headers: { cookie: cookie(first) } })).statusCode).toBe(401)
    expect(await db.select().from(sessions)).toHaveLength(1)
  })
  test('CSRF exige origem permitida quando presente e JSON', async () => {
    const app = await setup(); const response = await login(app)
    expect((await app.inject({ method: 'POST', url: '/auth/logout', headers: { cookie: cookie(response), origin: 'https://invalid.example' }, payload: {} })).statusCode).toBe(403)
    expect((await app.inject({ method: 'POST', url: '/auth/logout', payload: 'bad', headers: { 'content-type': 'text/plain' } })).statusCode).toBe(415)
    expect((await app.inject({ method: 'POST', url: '/auth/logout', headers: { cookie: cookie(response), origin: env.WEB_ORIGIN }, payload: {} })).statusCode).toBe(204)
  })
  test('produção usa __Host-sid com Secure, Path=/ e sem Domain', async () => {
    const app = await setup({ NODE_ENV: 'production', COOKIE_SECURE: true })
    const response = await login(app)
    expect(response.headers['set-cookie']).toMatch(/^__Host-sid=/)
    expect(response.headers['set-cookie']).toContain('Secure')
    expect(response.headers['set-cookie']).toContain('Path=/')
    expect(response.headers['set-cookie']).not.toContain('Domain=')
  })
  test('validação de ambiente rejeita produção HTTP e chave Atto inválida sem imprimir valores', () => {
    expect(() => readEnv({ ...process.env, NODE_ENV: 'production', COOKIE_SECURE: 'false' })).toThrow(/COOKIE_SECURE/)
    expect(() => readEnv({ ...process.env, ATTO_LOGIN: randomBytes(8).toString('hex'), ATTO_TOKEN_ENC_KEY: 'invalid' })).toThrow(/ATTO_TOKEN_ENC_KEY/)
  })
  test('health público e boot não chamam Atto; guard compõe novas rotas', async () => {
    const app = await setup()
    app.get('/protected', { preHandler: app.authenticate }, async req => ({ id: req.user!.id }))
    expect((await app.inject('/health')).json()).toEqual({ status: 'ok' })
    expect((await app.inject('/protected')).statusCode).toBe(401)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
  test('last_seen_at é limitado a uma escrita por minuto sem renovar expiração', async () => {
    const app = await setup(); const response = await login(app)
    await sql`update sessions set last_seen_at = now() - interval '2 minutes'`
    const [before] = await db.select().from(sessions)
    await app.inject({ url: '/auth/me', headers: { cookie: cookie(response) } })
    const [after] = await db.select().from(sessions)
    expect(after!.lastSeenAt.getTime()).toBeGreaterThan(before!.lastSeenAt.getTime())
    expect(after!.expiresAt).toEqual(before!.expiresAt)
    await app.inject({ url: '/auth/me', headers: { cookie: cookie(response) } })
    const [again] = await db.select().from(sessions).where(eq(sessions.id, after!.id))
    expect(again!.lastSeenAt).toEqual(after!.lastSeenAt)
  })
  test('logs não expõem senha, cookies ou token', async () => {
    let logs = ''
    const app = await buildApp({ db, env, logger: { stream: { write: (chunk: string) => { logs += chunk } } } }); apps.push(app)
    await db.insert(users).values({ name: 'Teste', email: 'admin@example.com', passwordHash: hash })
    const response = await login(app)
    await app.inject({ url: '/auth/me', headers: { cookie: cookie(response), authorization: `Bearer ${password}` } })
    expect(logs.length).toBeGreaterThan(0)
    expect(logs.includes(password)).toBe(false)
    expect(logs.includes(cookie(response).slice(4))).toBe(false)
    expect(vi.mocked(globalThis.fetch).mock.calls).toHaveLength(0)
  })
})
