import { sql } from 'drizzle-orm'
import { pgTable, uuid, text, boolean, timestamp, smallint, index, check } from 'drizzle-orm/pg-core'
const time = (name: string) => timestamp(name, { withTimezone: true })
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  lastLoginAt: time('last_login_at'),
  createdAt: time('created_at').notNull().defaultNow(),
  updatedAt: time('updated_at').notNull().defaultNow(),
}, t => [check('users_email_normalized', sql`${t.email} = lower(btrim(${t.email}))`)])
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  createdAt: time('created_at').notNull().defaultNow(),
  expiresAt: time('expires_at').notNull(),
  lastSeenAt: time('last_seen_at').notNull().defaultNow(),
}, t => [index('sessions_user_id_idx').on(t.userId), index('sessions_expires_at_idx').on(t.expiresAt)])
export const attoAuthState = pgTable('atto_auth_state', {
  id: smallint('id').primaryKey(),
  tokenEncrypted: text('token_encrypted'),
  obtainedAt: time('obtained_at'),
  expiresAt: time('expires_at'),
  invalidatedAt: time('invalidated_at'),
  lastAttemptAt: time('last_attempt_at'),
  lastStatus: text('last_status'),
  lastError: text('last_error'),
  sid: text('sid'),
}, t => [check('atto_auth_state_singleton', sql`${t.id} = 1`)])
