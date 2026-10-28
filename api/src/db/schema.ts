import { sql } from 'drizzle-orm'
import { pgTable, uuid, text, boolean, integer, jsonb, timestamp, date, check, primaryKey } from 'drizzle-orm/pg-core'
const time = (name: string) => timestamp(name, { withTimezone: true })
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  attoLogin: text('atto_login').notNull(),
  attoLoginNormalized: text('atto_login_normalized').notNull().unique(),
  name: text('name').notNull(),
  // Local accounts have their own admin-set password and never talk to Atto;
  // everyone else is a mirror of a real Atto account (see auth/login.ts).
  isLocal: boolean('is_local').notNull().default(false),
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

// Collector tables: written only by the scheduled collector, read-only for
// the dashboard. campaignSid defaults to '' (never null) so the natural-key
// upserts below work — Postgres treats NULL as distinct from NULL in a
// unique/primary key, which would silently defeat ON CONFLICT dedup.
export const attoCampaigns = pgTable('atto_campaigns', {
  sid: text('sid').primaryKey(),
  name: text('name').notNull(),
  updatedAt: time('updated_at').notNull().defaultNow(),
})
export const attoAgentReport = pgTable('atto_agent_report', {
  day: date('day').notNull(),
  agentLogin: text('agent_login').notNull(),
  campaignSid: text('campaign_sid').notNull().default(''),
  answeredCalls: integer('answered_calls').notNull().default(0),
  talkSeconds: integer('talk_seconds').notNull().default(0),
  updatedAt: time('updated_at').notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.day, t.agentLogin, t.campaignSid] })])
export const attoWorkingTime = pgTable('atto_working_time', {
  sessionKey: text('session_key').primaryKey(),
  agentLogin: text('agent_login').notNull(),
  campaignSid: text('campaign_sid').notNull().default(''),
  loginAt: time('login_at').notNull(),
  logoutAt: time('logout_at'),
  loggedSeconds: integer('logged_seconds').notNull().default(0),
  pausedSeconds: integer('paused_seconds').notNull().default(0),
  updatedAt: time('updated_at').notNull().defaultNow(),
})
export const attoCallsHourly = pgTable('atto_calls_hourly', {
  hourStart: time('hour_start').notNull(),
  campaignSid: text('campaign_sid').notNull(),
  attempts: integer('attempts').notNull().default(0),
  answered: integer('answered').notNull().default(0),
  talkSeconds: integer('talk_seconds').notNull().default(0),
  final: boolean('final').notNull().default(false),
  updatedAt: time('updated_at').notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.hourStart, t.campaignSid] })])
export const attoCollectRuns = pgTable('atto_collect_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  startedAt: time('started_at').notNull(),
  finishedAt: time('finished_at'),
  status: text('status', { enum: ['ok', 'partial', 'error'] }).notNull(),
  trigger: text('trigger', { enum: ['scheduled', 'once'] }).notNull(),
  records: jsonb('records'),
  error: text('error'),
})
