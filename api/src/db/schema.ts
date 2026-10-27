import { sql } from 'drizzle-orm'
import { pgTable, uuid, text, boolean, jsonb, timestamp, check } from 'drizzle-orm/pg-core'
const time = (name: string) => timestamp(name, { withTimezone: true })
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  attoLogin: text('atto_login').notNull(),
  attoLoginNormalized: text('atto_login_normalized').notNull().unique(),
  name: text('name').notNull(),
  attoSid: text('atto_sid'),
  customerSid: text('customer_sid'),
  isRoot: boolean('is_root').notNull().default(false),
  attoRoles: jsonb('atto_roles'),
  passwordHash: text('password_hash'),
  tokenEncrypted: text('token_encrypted'),
  tokenObtainedAt: time('token_obtained_at'),
  tokenExpiresAt: time('token_expires_at'),
  tokenInvalidatedAt: time('token_invalidated_at'),
  lastSigninAt: time('last_signin_at'),
  isActive: boolean('is_active').notNull().default(true),
  lastLoginAt: time('last_login_at'),
  createdAt: time('created_at').notNull().defaultNow(),
  updatedAt: time('updated_at').notNull().defaultNow(),
}, t => [check('users_atto_login_normalized', sql`${t.attoLoginNormalized} = lower(btrim(${t.attoLogin}))`)])
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  createdAt: time('created_at').notNull().defaultNow(),
  expiresAt: time('expires_at').notNull(),
})
