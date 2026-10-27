import { lt } from 'drizzle-orm'
import { readEnv } from './config/env.js'
import { createDatabase } from './db/client.js'
import { sessions } from './db/schema.js'
import { buildApp } from './app.js'

async function main() {
  const env = readEnv()
  const { db, sql } = createDatabase(env.DATABASE_URL)
  const app = await buildApp({ db, env })
  const cleanup = async () => {
    try { await db.delete(sessions).where(lt(sessions.expiresAt, new Date())) }
    catch { app.log.error('Falha na limpeza de sessões expiradas.') }
  }
  await cleanup()
  const timer = setInterval(() => { void cleanup() }, 3_600_000)
  timer.unref()
  app.addHook('onClose', async () => { clearInterval(timer); await sql.end() })
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void app.close() })
  await app.listen({ port: env.API_PORT, host: env.API_HOST })
}
main().catch(() => { console.error('API não iniciou. Confira as variáveis de ambiente e a conexão com o banco.'); process.exitCode = 1 })
