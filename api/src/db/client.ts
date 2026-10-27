import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from './schema.js'
export function createDatabase(url: string) {
  const sql = postgres(url, { max: 10, onnotice: () => {} })
  return { sql, db: drizzle(sql, { schema }), close: () => sql.end() }
}
export type Database = ReturnType<typeof createDatabase>['db']
