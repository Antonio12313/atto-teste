import { sql } from 'drizzle-orm'
import { pgTable, uuid, text, boolean, jsonb, timestamp, check, primaryKey } from 'drizzle-orm/pg-core'
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

export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  description: text('description'),
  createdAt: time('created_at').notNull().defaultNow(),
  updatedAt: time('updated_at').notNull().defaultNow(),
})
export const rolePermissions = pgTable('role_permissions', {
  roleId: uuid('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
  node: text('node').notNull(),
}, t => [primaryKey({ columns: [t.roleId, t.node] })])
export const userRoles = pgTable('user_roles', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  roleId: uuid('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
}, t => [primaryKey({ columns: [t.userId, t.roleId] })])
export const userPermissions = pgTable('user_permissions', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  node: text('node').notNull(),
  effect: text('effect', { enum: ['allow', 'deny'] }).notNull(),
}, t => [primaryKey({ columns: [t.userId, t.node] })])
