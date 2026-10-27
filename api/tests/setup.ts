import { beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { createDatabase } from '../src/db/client.js'
import { readEnv } from '../src/config/env.js'

export const env = { ...readEnv(), NODE_ENV: 'test' as const, COOKIE_SECURE: false, LOGIN_RATE_LIMIT_MAX: 100 }
const url = env.DATABASE_URL_TEST
if (!url || url === env.DATABASE_URL || !new URL(url).pathname.endsWith('_test')) throw new Error('DATABASE_URL_TEST deve apontar para um banco separado com sufixo _test.')
export const database = createDatabase(url)
export const { db, sql } = database
beforeAll(async () => {
  // Block any accidental network call: Atto tests explicitly inject their mock.
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Rede real proibida nos testes.') }))
  const admin = createDatabase(env.DATABASE_URL)
  try {
    const name = decodeURIComponent(new URL(url).pathname.slice(1))
    const rows = await admin.sql`select 1 from pg_database where datname = ${name}`
    if (!rows.length) await admin.sql`create database ${admin.sql(name)}`
  } finally { await admin.close() }
  await migrate(db, { migrationsFolder: './drizzle' })
})
beforeEach(async () => {
  await sql`truncate table sessions, users cascade`
  vi.mocked(globalThis.fetch).mockClear()
})
afterAll(async () => { await database.close(); vi.unstubAllGlobals() })
