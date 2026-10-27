import { readEnv } from '../config/env.js'
import { createDatabase } from '../db/client.js'
import { createAttoAuth } from '../modules/atto-auth/service.js'
const env = readEnv()
const database = createDatabase(env.DATABASE_URL)
try { console.info(JSON.stringify(await createAttoAuth({ ...database, env }).getStatus(), null, 2)) }
catch { console.error('Não foi possível ler o status Atto.'); process.exitCode = 1 }
finally { await database.close() }
