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
// Everything below `name` is the rest of what Campaigns/List returns, kept
// verbatim (confirmed live 2026-10-28) — none of it is customer data (it's
// campaign/telephony config: file paths, queue/IVR settings, Sids), so the
// "no dados pessoais" rule doesn't apply here. All nullable: only one real
// sample row has been seen, so which fields are ever absent isn't confirmed.
export const attoCampaigns = pgTable('atto_campaigns', {
  sid: text('sid').primaryKey(),
  name: text('name').notNull(),
  customerSid: text('customer_sid'),
  accessLineSid: text('access_line_sid'),
  agentMsg: text('agent_msg'),
  aggressiveness: integer('aggressiveness'),
  blackListSid: text('black_list_sid'),
  callClassify: boolean('call_classify'),
  callClassifyLevel: integer('call_classify_level'),
  callFileSid: text('call_file_sid'),
  dialRuleSid: text('dial_rule_sid'),
  dialType: integer('dial_type'),
  dialerStatus: integer('dialer_status'),
  displayPhone: text('display_phone'),
  displayType: integer('display_type'),
  factorD: integer('factor_d'),
  gatewaySid: text('gateway_sid'),
  grammarSid: text('grammar_sid'),
  holdMsg: text('hold_msg'),
  holidaySid: text('holiday_sid'),
  ivrName: text('ivr_name'),
  ivrSid: text('ivr_sid'),
  maxChannels: integer('max_channels'),
  maxPendingCalls: integer('max_pending_calls'),
  noAgentMsg: text('no_agent_msg'),
  openingSid: text('opening_sid'),
  playWaveMsg: text('play_wave_msg'),
  priority: integer('priority'),
  queue: text('queue'),
  record: boolean('record'),
  recordFileTemplate: text('record_file_template'),
  recordFolder: text('record_folder'),
  retention: integer('retention'),
  scriptName: text('script_name'),
  scriptSid: text('script_sid'),
  statusSid: text('status_sid'),
  type: integer('type'),
  waitMsg: text('wait_msg'),
  waitTimeMsg: text('wait_time_msg'),
  welcomeMsg: text('welcome_msg'),
  updatedAt: time('updated_at').notNull().defaultNow(),
})
// Agents/List (Admin service, confirmed live 2026-10-28 — same service as
// Campaigns/List, not the rate-limited Supervision one). Kept verbatim like
// atto_campaigns, with one deliberate exception: the real response includes
// a `Password` field (an agent credential hash from Atto's own system) —
// never stored here, there's no reason for this app to hold another
// system's credential material, hashed or not. `Login` is the natural key
// (matches agentLogin elsewhere). Campaign-list fields (ChatCampaigns,
// InbCampaigns, ManualCampaigns, MediaCampaigns, OutCampaigns) are arrays —
// kept as jsonb rather than exploded into their own table, since nothing
// currently queries into them.
export const attoAgents = pgTable('atto_agents', {
  login: text('login').primaryKey(),
  name: text('name'),
  surname: text('surname'),
  customerSid: text('customer_sid'),
  alreadyLogged: boolean('already_logged'),
  block: boolean('block'),
  chatCampaigns: jsonb('chat_campaigns'),
  dialModeEnable: boolean('dial_mode_enable'),
  dialModeTime: integer('dial_mode_time'),
  distributorSid: text('distributor_sid'),
  employeeCode: text('employee_code'),
  gender: text('gender'),
  groupSid: text('group_sid'),
  holidaySid: text('holiday_sid'),
  inbCampaigns: jsonb('inb_campaigns'),
  interactionsNumber: integer('interactions_number'),
  mailCampaigns: jsonb('mail_campaigns'),
  manualCampaigns: jsonb('manual_campaigns'),
  mediaCampaigns: jsonb('media_campaigns'),
  openingSid: text('opening_sid'),
  outCampaigns: jsonb('out_campaigns'),
  pauseSid: text('pause_sid'),
  readyEnable: boolean('ready_enable'),
  shift: integer('shift'),
  supervisorSid: text('supervisor_sid'),
  withoutHeadset: boolean('without_headset'),
  workSpaceHeight: integer('work_space_height'),
  workSpaceName: text('work_space_name'),
  workSpaceSid: text('work_space_sid'),
  workSpaceWidth: integer('work_space_width'),
  wrapupEnable: boolean('wrapup_enable'),
  wrapupExtended: integer('wrapup_extended'),
  wrapupTime: integer('wrapup_time'),
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
