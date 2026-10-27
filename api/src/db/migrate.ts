import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { createDatabase } from './client.js'
import { readEnv } from '../config/env.js'
const { sql, db } = createDatabase(readEnv().DATABASE_URL)
try {
  await migrate(db, { migrationsFolder: './drizzle' })
  console.info('Migrations aplicadas.')
} catch {
  console.error('Falha nas migrations. Confira a configuração e disponibilidade do banco.')
  process.exitCode = 1
} finally { await sql.end() }
