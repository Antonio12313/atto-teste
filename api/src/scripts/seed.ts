import { fileURLToPath } from 'node:url'
import { eq } from 'drizzle-orm'
import { readEnv } from '../config/env.js'
import { createDatabase, type Database } from '../db/client.js'
import { users, roles, rolePermissions, userRoles } from '../db/schema.js'

const ROLE_SEEDS = [
  { name: 'Administrador', nodes: ['dashboard', 'admin'] },
  { name: 'Supervisor', nodes: ['dashboard'] },
  { name: 'Consultor', nodes: ['dashboard.atto.agentes'] },
] as const

/**
 * Idempotent, no Atto call: ensures the fixed roles exist and that the
 * user identified by ATTO_LOGIN (creating it bare if needed, same as a
 * first login would) has the Administrador role — otherwise nobody could
 * ever grant anyone a permission, since a new user starts with none.
 */
export async function seed(db: Database, env: { ATTO_LOGIN: string }) {
  const roleIdByName = new Map<string, string>()
  for (const roleSeed of ROLE_SEEDS) {
    const [inserted] = await db.insert(roles).values({ name: roleSeed.name })
      .onConflictDoNothing({ target: roles.name }).returning({ id: roles.id })
    const roleId = inserted?.id ?? (await db.select({ id: roles.id }).from(roles).where(eq(roles.name, roleSeed.name)))[0]!.id
    roleIdByName.set(roleSeed.name, roleId)
    if (roleSeed.nodes.length) {
      await db.insert(rolePermissions).values(roleSeed.nodes.map(node => ({ roleId, node })))
        .onConflictDoNothing({ target: [rolePermissions.roleId, rolePermissions.node] })
    }
  }

  const attoLoginNormalized = env.ATTO_LOGIN.trim().toLowerCase()
  const [existing] = await db.select().from(users).where(eq(users.attoLoginNormalized, attoLoginNormalized))
  const [inserted] = existing ? [] : await db.insert(users)
    .values({ attoLogin: env.ATTO_LOGIN, attoLoginNormalized, name: env.ATTO_LOGIN })
    .onConflictDoNothing({ target: users.attoLoginNormalized }).returning()
  const user = existing ?? inserted ?? (await db.select().from(users).where(eq(users.attoLoginNormalized, attoLoginNormalized)))[0]!

  const administradorId = roleIdByName.get('Administrador')!
  await db.insert(userRoles).values({ userId: user.id, roleId: administradorId })
    .onConflictDoNothing({ target: [userRoles.userId, userRoles.roleId] })

  return user
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const env = readEnv()
  const { db, sql } = createDatabase(env.DATABASE_URL)
  try {
    const user = await seed(db, env)
    console.info(`Seed concluído. Administrador: ${user.attoLogin}`)
  } catch {
    console.error('Falha ao executar o seed. Confira a configuração do banco.')
    process.exitCode = 1
  } finally { await sql.end() }
}
