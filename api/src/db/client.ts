import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from './schema.js'
export function createDatabase(url: string) {
  // Atto lock holder and durable attempt writer need independent connections.
  const sql = postgres(url, { max: 10, onnotice: () => {} })
  return { sql, db: drizzle(sql, { schema }) }
}
export type Database = ReturnType<typeof createDatabase>['db']
export type SqlClient = ReturnType<typeof createDatabase>['sql']
