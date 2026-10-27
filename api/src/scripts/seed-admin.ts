import { readEnv } from '../config/env.js'
import { createDatabase } from '../db/client.js'
import { users } from '../db/schema.js'
import { hashPassword } from '../modules/auth/password.js'

const env = readEnv()
const { db, sql } = createDatabase(env.DATABASE_URL)
try {
  const inserted = await db.insert(users).values({ name: env.ADMIN_NAME, email: env.ADMIN_EMAIL, passwordHash: await hashPassword(env.ADMIN_PASSWORD) }).onConflictDoNothing({ target: users.email }).returning({ id: users.id })
  console.info(inserted.length ? 'Administrador inicial criado.' : 'Usuário já existe; nenhuma alteração realizada.')
} catch { console.error('Falha ao criar administrador. Confira a configuração do banco.'); process.exitCode = 1 }
finally { await sql.end() }
