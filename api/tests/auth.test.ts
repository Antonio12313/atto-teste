import { randomBytes } from 'node:crypto'
import { describe, test, expect, afterEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import { verifyPassword } from '../src/modules/auth/password.js'
import { decryptToken } from '../src/modules/atto-auth/crypto.js'
import { users } from '../src/db/schema.js'
import { readEnv } from '../src/config/env.js'
import { db, env } from './setup.js'

const secret = () => randomBytes(24).toString('base64url')
let clock = new Date('2030-01-01T00:00:00Z')
const now = () => clock
const advanceMinutes = (minutes: number) => { clock = new Date(clock.getTime() + minutes * 60_000) }

function attoResponse(jwt: string, overrides: Record<string, unknown> = {}) {
  return {
    Error: null, Sid: 'sid-1', CustomerSid: env.ATTO_CUSTOMER_SID, Login: 'ana.silva',
    Name: 'Ana', Surname: 'Silva', ROOT: false, Roles: ['supervisor'], jwt,
    ...overrides,
  }
}

let request: ReturnType<typeof vi.fn<typeof fetch>>
let apps: FastifyInstance[] = []
afterEach(async () => { await Promise.all(apps.map(a => a.close())); apps = []; vi.restoreAllMocks() })

async function setup(envOverrides: Partial<typeof env> = {}) {
  const jwt = secret()
  request = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify(attoResponse(jwt)), { status: 200 }))
  const app = await buildApp({ db, env: { ...env, ...envOverrides }, logger: false, atto: { fetch: request, now } })
  apps.push(app)
  return { app, jwt }
}
const login = (app: FastifyInstance, payload: Record<string, unknown> = { username: 'ana.silva', password: 'senha-correta-1' }, cookie?: string) =>
  app.inject({ method: 'POST', url: '/auth/login', payload, headers: cookie ? { cookie } : {} })
const cookie = (response: Awaited<ReturnType<typeof login>>) => String(response.headers['set-cookie']).split(';')[0]!
const userRow = async (attoLoginNormalized = 'ana.silva') => (await db.select().from(users).where(eq(users.attoLoginNormalized, attoLoginNormalized)))[0]

describe('Login autenticado pela Atto', () => {
  test('primeiro login cria o usuário com os dados da Atto, criptografa o token e abre sessão', async () => {
    const { app, jwt } = await setup()
    const response = await login(app, { username: ' Ana.Silva ', password: 'senha-correta-1' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ user: { id: expect.any(String), name: 'Ana Silva', atto_login: 'ana.silva' } })
    expect(request.mock.calls).toHaveLength(1)
    const sentBody = JSON.parse(String(request.mock.calls[0]![1]?.body))
    expect(sentBody).toEqual({ Login: 'Ana.Silva', Password: 'senha-correta-1' })

    const user = await userRow()
    expect(user!.attoLoginNormalized).toBe('ana.silva')
    expect(user!.isActive).toBe(true)
    expect(user!.customerSid).toBe(env.ATTO_CUSTOMER_SID)
    expect(user!.passwordHash!.startsWith('$argon2id$')).toBe(true)
    expect(await verifyPassword(user!.passwordHash!, 'senha-correta-1')).toBe(true)
    expect(user!.tokenEncrypted === jwt).toBe(false)
    expect(decryptToken(user!.tokenEncrypted!, env.ATTO_TOKEN_ENC_KEY)).toBe(jwt)
    expect(response.headers['set-cookie']).toContain('HttpOnly')
  })

  test('segundo login com a mesma senha não chama a Atto', async () => {
    const { app } = await setup()
    await login(app)
    request.mockClear()
    const second = await login(app)
    expect(second.statusCode).toBe(200)
    expect(request.mock.calls).toHaveLength(0)
  })

  test('logout e login repetidos nunca chamam a Atto', async () => {
    const { app } = await setup()
    const first = await login(app)
    request.mockClear()
    let sessionCookie = cookie(first)
    for (let i = 0; i < 10; i++) {
      await app.inject({ method: 'POST', url: '/auth/logout', headers: { cookie: sessionCookie }, payload: {} })
      const response = await login(app)
      sessionCookie = cookie(response)
    }
    expect(request.mock.calls).toHaveLength(0)
  })

  test('senha errada para usuário com token válido retorna 401 genérico sem chamar a Atto', async () => {
    const { app } = await setup()
    await login(app)
    request.mockClear()
    const response = await login(app, { username: 'ana.silva', password: 'senha-errada' })
    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({ statusCode: 401, error: 'Unauthorized', message: 'Usuário ou senha inválidos.' })
    expect(request.mock.calls).toHaveLength(0)
  })

  test('Atto recusa a credencial: 401 genérico e nada é persistido', async () => {
    const { app, jwt } = await setup()
    request.mockImplementation(async () => new Response(JSON.stringify(attoResponse(jwt, { Error: 'Credenciais inválidas' })), { status: 200 }))
    const response = await login(app, { username: 'novo.usuario', password: 'qualquer' })
    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({ statusCode: 401, error: 'Unauthorized', message: 'Usuário ou senha inválidos.' })
    expect(await userRow('novo.usuario')).toBeUndefined()
  })

  test('CustomerSid diferente do configurado: 401 genérico e descarta a resposta', async () => {
    const { app, jwt } = await setup()
    request.mockImplementation(async () => new Response(JSON.stringify(attoResponse(jwt, { CustomerSid: 'outro-cliente' })), { status: 200 }))
    const response = await login(app, { username: 'novo.usuario', password: 'qualquer' })
    expect(response.statusCode).toBe(401)
    expect(await userRow('novo.usuario')).toBeUndefined()
  })

  test('usuário inativo não entra, sem chamar a Atto', async () => {
    const { app } = await setup()
    await db.insert(users).values({ attoLogin: 'inativo', attoLoginNormalized: 'inativo', name: 'Inativo', isActive: false })
    const response = await login(app, { username: 'inativo', password: 'qualquer' })
    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({ statusCode: 401, error: 'Unauthorized', message: 'Usuário ou senha inválidos.' })
    expect(request.mock.calls).toHaveLength(0)
  })

  test('timeout da Atto retorna 503', async () => {
    const { app } = await setup({ ATTO_REQUEST_TIMEOUT_MS: 20 })
    request.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      (init as RequestInit).signal?.addEventListener('abort', () => reject(new Error('aborted')))
    }))
    const response = await login(app, { username: 'novo.usuario', password: 'qualquer' })
    expect(response.statusCode).toBe(503)
    expect(response.json()).toMatchObject({ statusCode: 503 })
  })

  test('Atto sinaliza 429: responde 429 com Retry-After e registra o cooldown', async () => {
    const { app } = await setup()
    await db.insert(users).values({ attoLogin: 'ana.silva', attoLoginNormalized: 'ana.silva', name: 'Ana Silva' })
    request.mockImplementation(async () => new Response('', { status: 429 }))
    const response = await login(app, { username: 'ana.silva', password: 'qualquer' })
    expect(response.statusCode).toBe(429)
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0)
    const saved = await userRow()
    expect(saved!.lastSigninAt).toEqual(clock)
  })

  test('senha local não confere após o intervalo mínimo: chama a Atto e atualiza hash e token', async () => {
    const { app } = await setup()
    const first = await login(app, { username: 'ana.silva', password: 'senha-antiga' })
    expect(first.statusCode).toBe(200)
    advanceMinutes(61)
    request.mockClear()
    request.mockImplementation(async () => new Response(JSON.stringify(attoResponse('novo-jwt-token')), { status: 200 }))
    const response = await login(app, { username: 'ana.silva', password: 'senha-nova' })
    expect(response.statusCode).toBe(200)
    expect(request.mock.calls).toHaveLength(1)
    const saved = await userRow()
    expect(await verifyPassword(saved!.passwordHash!, 'senha-nova')).toBe(true)
    expect(decryptToken(saved!.tokenEncrypted!, env.ATTO_TOKEN_ENC_KEY)).toBe('novo-jwt-token')
  })

  test('GET /auth/me exige cookie; logout invalida o mesmo cookie', async () => {
    const { app } = await setup()
    expect((await app.inject('/auth/me')).statusCode).toBe(401)
    const response = await login(app)
    const me = await app.inject({ url: '/auth/me', headers: { cookie: cookie(response) } })
    expect(me.statusCode).toBe(200)
    expect(me.json()).toEqual(response.json())
    await app.inject({ method: 'POST', url: '/auth/logout', headers: { cookie: cookie(response) }, payload: {} })
    expect((await app.inject({ url: '/auth/me', headers: { cookie: cookie(response) } })).statusCode).toBe(401)
  })

  test('body inválido retorna 400', async () => {
    const { app } = await setup()
    for (const payload of [{}, { username: '', password: 'x' }, { username: 'ana', password: '' }]) {
      expect((await app.inject({ method: 'POST', url: '/auth/login', payload })).statusCode).toBe(400)
    }
  })

  test('senha, jwt e hash nunca aparecem na resposta HTTP ou nos logs', async () => {
    let logs = ''
    const jwt = secret()
    request = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify(attoResponse(jwt)), { status: 200 }))
    const app = await buildApp({ db, env, logger: { stream: { write: (chunk: string) => { logs += chunk } } }, atto: { fetch: request, now } })
    apps.push(app)
    const response = await login(app, { username: 'ana.silva', password: 'senha-secreta' })
    expect(response.body.includes('senha-secreta')).toBe(false)
    expect(response.body.includes(jwt)).toBe(false)
    expect(logs.includes('senha-secreta')).toBe(false)
    expect(logs.includes(jwt)).toBe(false)
    const saved = await userRow()
    expect(logs.includes(saved!.passwordHash!)).toBe(false)
    expect(logs.includes(saved!.tokenEncrypted!)).toBe(false)
  })

  test('validação de ambiente rejeita produção HTTP e chave Atto inválida sem imprimir valores', () => {
    expect(() => readEnv({ ...process.env, NODE_ENV: 'production', COOKIE_SECURE: 'false' })).toThrow(/COOKIE_SECURE/)
    expect(() => readEnv({ ...process.env, ATTO_TOKEN_ENC_KEY: 'invalid' })).toThrow(/ATTO_TOKEN_ENC_KEY/)
  })
})
