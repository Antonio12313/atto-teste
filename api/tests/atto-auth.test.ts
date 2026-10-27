import { randomBytes } from 'node:crypto'
import { describe, test, expect, vi } from 'vitest'
import {
  signIn, AttoInvalidCredentialsError, AttoRateLimitedError, AttoServiceUnavailableError,
} from '../src/modules/atto-auth/client.js'
import { encryptToken, decryptToken } from '../src/modules/atto-auth/crypto.js'

const key = () => randomBytes(32).toString('base64')
const options = { adminUrl: 'https://atto.example/AdminService.svc', timeoutMs: 1000 }

describe('Atto: criptografia do token', () => {
  test('AES-256-GCM usa IV aleatório e redonda viagem corretamente', () => {
    const token = randomBytes(24).toString('base64url')
    const encKey = key()
    const first = encryptToken(token, encKey)
    const second = encryptToken(token, encKey)
    expect(first === second).toBe(false)
    expect(decryptToken(first, encKey)).toBe(token)
  })
  test('detecta adulteração e chave incorreta', () => {
    const token = randomBytes(24).toString('base64url')
    const encKey = key()
    const encrypted = encryptToken(token, encKey)
    expect(() => decryptToken(encrypted, key())).toThrow()
    const parts = encrypted.split(':')
    parts[2] = Buffer.from('tampered').toString('base64')
    expect(() => decryptToken(parts.join(':'), encKey)).toThrow()
  })
})

describe('Atto: cliente de SignIn', () => {
  test('sucesso envia Login/Password e retorna os campos da resposta', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      Error: null, Sid: 's1', CustomerSid: 'c1', Login: 'ana', Name: 'Ana', Surname: 'Silva', ROOT: true, Roles: ['admin'], jwt: 'token-123',
    }), { status: 200 }))
    const result = await signIn('ana', 'segredo', { ...options, fetch: fetchMock })
    expect(result).toEqual({ sid: 's1', customerSid: 'c1', login: 'ana', name: 'Ana', surname: 'Silva', isRoot: true, roles: ['admin'], jwt: 'token-123' })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://atto.example/AdminService.svc/Login/SignIn')
    expect(JSON.parse(String(init?.body))).toEqual({ Login: 'ana', Password: 'segredo' })
  })
  test('Error preenchido na resposta 200 é credencial inválida', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ Error: 'nok' }), { status: 200 }))
    await expect(signIn('ana', 'x', { ...options, fetch: fetchMock })).rejects.toBeInstanceOf(AttoInvalidCredentialsError)
  })
  test.each([401, 403])('status %i é credencial inválida', async status => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status }))
    await expect(signIn('ana', 'x', { ...options, fetch: fetchMock })).rejects.toBeInstanceOf(AttoInvalidCredentialsError)
  })
  test('status 429 é limite de requisições', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 429 }))
    await expect(signIn('ana', 'x', { ...options, fetch: fetchMock })).rejects.toBeInstanceOf(AttoRateLimitedError)
  })
  test.each([500, 503])('status %i é serviço indisponível', async status => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status }))
    await expect(signIn('ana', 'x', { ...options, fetch: fetchMock })).rejects.toBeInstanceOf(AttoServiceUnavailableError)
  })
  test('resposta sem jwt é serviço indisponível', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ Error: null, CustomerSid: 'c1' }), { status: 200 }))
    await expect(signIn('ana', 'x', { ...options, fetch: fetchMock })).rejects.toBeInstanceOf(AttoServiceUnavailableError)
  })
  test('erro de rede é serviço indisponível', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error('ECONNREFUSED'))
    await expect(signIn('ana', 'x', { ...options, fetch: fetchMock })).rejects.toBeInstanceOf(AttoServiceUnavailableError)
  })
  test('timeout aborta a requisição e é serviço indisponível', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      (init as RequestInit).signal?.addEventListener('abort', () => reject(new Error('aborted')))
    }))
    await expect(signIn('ana', 'x', { ...options, timeoutMs: 20, fetch: fetchMock })).rejects.toBeInstanceOf(AttoServiceUnavailableError)
  })
})
