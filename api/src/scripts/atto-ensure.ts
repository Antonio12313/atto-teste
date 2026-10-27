import { readEnv } from '../config/env.js'
import { createDatabase } from '../db/client.js'
import { createAttoAuth, AttoLoginCooldownError } from '../modules/atto-auth/service.js'
const env = readEnv()
const database = createDatabase(env.DATABASE_URL)
const service = createAttoAuth({ ...database, env })
console.info('AVISO: este comando pode fazer um SignIn real e invalidar tokens de outros ambientes.')
try {
  await service.getToken()
  console.info(JSON.stringify(await service.getStatus(), null, 2))
} catch (error) {
  console.error(error instanceof AttoLoginCooldownError ? `Cooldown até ${error.retryAt.toISOString()}.` : 'Falha ao obter credencial Atto. Consulte atto:status.')
  process.exitCode = 1
} finally { await database.close() }
