import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from './schema.js'
export function createDatabase(url: string) {
  // Atto lock holder and durable attempt writer need independent connections.
  const sql = postgres(url, { max: 10, onnotice: () => {} })
  const lockSql = postgres(url, { max: 2, onnotice: () => {} })
  return { sql, lockSql, db: drizzle(sql, { schema }), close: async () => { await Promise.all([sql.end(), lockSql.end()]) } }
}
export type Database = ReturnType<typeof createDatabase>['db']
export type SqlClient = ReturnType<typeof createDatabase>['sql']
