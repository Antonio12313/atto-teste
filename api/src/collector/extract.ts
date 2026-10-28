import { parseAttoDate, parseDurationSeconds } from './dates.js'

/**
 * Field names here are taken from the real response XML Schema published at
 * each operation's own `.../help/operations/Get_*` page (fetched live
 * 2026-10-27) — NOT guessed. What's still unconfirmed, because the schema
 * only shows placeholder "String content" values, is the exact *format* of
 * a few string fields (durations, dates); see README for how to verify
 * against a real captured response.
 */

function pickString(row: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'string' && value) return value
  }
  return undefined
}
function pickNumber(row: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'number') return value
    if (typeof value === 'string' && value.trim() && !isNaN(Number(value))) return Number(value)
  }
  return 0
}
function pickDate(row: Record<string, unknown>, keys: string[], timeZone: string): Date | null {
  for (const key of keys) {
    const parsed = parseAttoDate(row[key], timeZone)
    if (parsed) return parsed
  }
  return null
}
function nullableString(row: Record<string, unknown>, key: string): string | null {
  const value = row[key]
  return typeof value === 'string' ? value : null
}
function nullableNumber(row: Record<string, unknown>, key: string): number | null {
  const value = row[key]
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim() && !isNaN(Number(value))) return Number(value)
  return null
}
function nullableBoolean(row: Record<string, unknown>, key: string): boolean | null {
  const value = row[key]
  return typeof value === 'boolean' ? value : null
}
function nullableStringArray(row: Record<string, unknown>, key: string): string[] | null {
  const value = row[key]
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : null
}

// Campaigns/List (Admin service) → confirmed live 2026-10-28 against a real
// response. No "Name" field — the display text is "Description"; the id is
// "Sid". Everything else is kept verbatim (see schema.ts comment on
// attoCampaigns for why it's all nullable and not customer data).
export interface ExtractedCampaign {
  sid: string
  name: string
  customerSid: string | null
  accessLineSid: string | null
  agentMsg: string | null
  aggressiveness: number | null
  blackListSid: string | null
  callClassify: boolean | null
  callClassifyLevel: number | null
  callFileSid: string | null
  dialRuleSid: string | null
  dialType: number | null
  dialerStatus: number | null
  displayPhone: string | null
  displayType: number | null
  factorD: number | null
  gatewaySid: string | null
  grammarSid: string | null
  holdMsg: string | null
  holidaySid: string | null
  ivrName: string | null
  ivrSid: string | null
  maxChannels: number | null
  maxPendingCalls: number | null
  noAgentMsg: string | null
  openingSid: string | null
  playWaveMsg: string | null
  priority: number | null
  queue: string | null
  record: boolean | null
  recordFileTemplate: string | null
  recordFolder: string | null
  retention: number | null
  scriptName: string | null
  scriptSid: string | null
  statusSid: string | null
  type: number | null
  waitMsg: string | null
  waitTimeMsg: string | null
  welcomeMsg: string | null
}
export function extractCampaign(row: Record<string, unknown>): ExtractedCampaign | null {
  const sid = pickString(row, ['Sid'])
  if (!sid) return null
  return {
    sid, name: pickString(row, ['Description']) ?? sid,
    customerSid: nullableString(row, 'CustomerSid'),
    accessLineSid: nullableString(row, 'AccessLineSid'),
    agentMsg: nullableString(row, 'AgentMsg'),
    aggressiveness: nullableNumber(row, 'Aggressiveness'),
    blackListSid: nullableString(row, 'BlackListSid'),
    callClassify: nullableBoolean(row, 'CallClassify'),
    callClassifyLevel: nullableNumber(row, 'CallClassifyLevel'),
    callFileSid: nullableString(row, 'CallFileSid'),
    dialRuleSid: nullableString(row, 'DialRuleSid'),
    dialType: nullableNumber(row, 'DialType'),
    dialerStatus: nullableNumber(row, 'DialerStatus'),
    displayPhone: nullableString(row, 'DisplayPhone'),
    displayType: nullableNumber(row, 'DisplayType'),
    factorD: nullableNumber(row, 'FactorD'),
    gatewaySid: nullableString(row, 'GatewaySid'),
    grammarSid: nullableString(row, 'GrammarSid'),
    holdMsg: nullableString(row, 'HoldMsg'),
    holidaySid: nullableString(row, 'HolidaySid'),
    ivrName: nullableString(row, 'IvrName'),
    ivrSid: nullableString(row, 'IvrSid'),
    maxChannels: nullableNumber(row, 'MaxChannels'),
    maxPendingCalls: nullableNumber(row, 'MaxPendingCalls'),
    noAgentMsg: nullableString(row, 'NoAgentMsg'),
    openingSid: nullableString(row, 'OpeningSid'),
    playWaveMsg: nullableString(row, 'PlayWaveMsg'),
    priority: nullableNumber(row, 'Priority'),
    queue: nullableString(row, 'Queue'),
    record: nullableBoolean(row, 'Record'),
    recordFileTemplate: nullableString(row, 'RecordFileTemplate'),
    recordFolder: nullableString(row, 'RecordFolder'),
    retention: nullableNumber(row, 'Retention'),
    scriptName: nullableString(row, 'ScriptName'),
    scriptSid: nullableString(row, 'ScriptSid'),
    statusSid: nullableString(row, 'StatusSid'),
    type: nullableNumber(row, 'Type'),
    waitMsg: nullableString(row, 'WaitMsg'),
    waitTimeMsg: nullableString(row, 'WaitTimeMsg'),
    welcomeMsg: nullableString(row, 'WelcomeMsg'),
  }
}

// Agents/List (Admin service) → confirmed live 2026-10-28 against a real
// response. `Login` is the natural key. Deliberately excludes `Password`
// (an agent credential hash from Atto's own system) — see schema.ts comment
// on attoAgents for why.
export interface ExtractedAgent {
  login: string
  name: string | null
  surname: string | null
  customerSid: string | null
  alreadyLogged: boolean | null
  block: boolean | null
  chatCampaigns: string[] | null
  dialModeEnable: boolean | null
  dialModeTime: number | null
  distributorSid: string | null
  employeeCode: string | null
  gender: string | null
  groupSid: string | null
  holidaySid: string | null
  inbCampaigns: string[] | null
  interactionsNumber: number | null
  mailCampaigns: string[] | null
  manualCampaigns: string[] | null
  mediaCampaigns: string[] | null
  openingSid: string | null
  outCampaigns: string[] | null
  pauseSid: string | null
  readyEnable: boolean | null
  shift: number | null
  supervisorSid: string | null
  withoutHeadset: boolean | null
  workSpaceHeight: number | null
  workSpaceName: string | null
  workSpaceSid: string | null
  workSpaceWidth: number | null
  wrapupEnable: boolean | null
  wrapupExtended: number | null
  wrapupTime: number | null
}
export function extractAgent(row: Record<string, unknown>): ExtractedAgent | null {
  const login = pickString(row, ['Login'])
  if (!login) return null
  return {
    login,
    name: nullableString(row, 'Name'),
    surname: nullableString(row, 'Surname'),
    customerSid: nullableString(row, 'CustomerSid'),
    alreadyLogged: nullableBoolean(row, 'AlreadyLogged'),
    block: nullableBoolean(row, 'Block'),
    chatCampaigns: nullableStringArray(row, 'ChatCampaigns'),
    dialModeEnable: nullableBoolean(row, 'DialModeEnable'),
    dialModeTime: nullableNumber(row, 'DialModeTime'),
    distributorSid: nullableString(row, 'DistributorSid'),
    employeeCode: nullableString(row, 'EmployeeCode'),
    gender: nullableString(row, 'Gender'),
    groupSid: nullableString(row, 'GroupSid'),
    holidaySid: nullableString(row, 'HolidaySid'),
    inbCampaigns: nullableStringArray(row, 'InbCampaigns'),
    interactionsNumber: nullableNumber(row, 'InteractionsNumber'),
    mailCampaigns: nullableStringArray(row, 'MailCampaigns'),
    manualCampaigns: nullableStringArray(row, 'ManualCampaigns'),
    mediaCampaigns: nullableStringArray(row, 'MediaCampaigns'),
    openingSid: nullableString(row, 'OpeningSid'),
    outCampaigns: nullableStringArray(row, 'OutCampaigns'),
    pauseSid: nullableString(row, 'PauseSid'),
    readyEnable: nullableBoolean(row, 'ReadyEnable'),
    shift: nullableNumber(row, 'Shift'),
    supervisorSid: nullableString(row, 'SupervisorSid'),
    withoutHeadset: nullableBoolean(row, 'WithoutHeadset'),
    workSpaceHeight: nullableNumber(row, 'WorkSpaceHeight'),
    workSpaceName: nullableString(row, 'WorkSpaceName'),
    workSpaceSid: nullableString(row, 'WorkSpaceSid'),
    workSpaceWidth: nullableNumber(row, 'WorkSpaceWidth'),
    wrapupEnable: nullableBoolean(row, 'WrapupEnable'),
    wrapupExtended: nullableNumber(row, 'WrapupExtended'),
    wrapupTime: nullableNumber(row, 'WrapupTime'),
  }
}

// Agents/Report → ArrayOfAgentReportResult. Not scoped by campaign at all.
// CallsCount is the closest match to "atendimentos"; TotalWorkingTime the
// closest to "tempo de conversação" (durations are strings, format TBD).
export interface ExtractedAgentReportRow {
  agentLogin: string
  campaignSid: string
  answeredCalls: number
  talkSeconds: number
}
export function extractAgentReportRow(row: Record<string, unknown>): ExtractedAgentReportRow | null {
  const agentLogin = pickString(row, ['Agent'])
  if (!agentLogin) return null
  return {
    agentLogin,
    campaignSid: '',
    answeredCalls: pickNumber(row, ['CallsCount']),
    talkSeconds: parseDurationSeconds(row.TotalWorkingTime),
  }
}

// Agents/WorkingTime → ArrayOfAgentWorkingTimeResult. LoggedTime_sec/
// PauseTime_sec are already plain integer seconds (no parsing needed).
// "Login" (lowercase) is the agent; "LOGIN"/"LOGOUT" (uppercase) are the
// session's moments.
export interface ExtractedWorkingTimeRow {
  sessionKey: string
  agentLogin: string
  campaignSid: string
  loginAt: Date
  logoutAt: Date | null
  loggedSeconds: number
  pausedSeconds: number
}
export function extractWorkingTimeRow(row: Record<string, unknown>, timeZone: string): ExtractedWorkingTimeRow | null {
  const agentLogin = pickString(row, ['Login'])
  const loginAt = pickDate(row, ['LOGIN'], timeZone)
  if (!agentLogin || !loginAt) return null
  const campaignSid = pickString(row, ['CampaignSid']) ?? ''
  return {
    sessionKey: `${agentLogin}:${campaignSid}:${loginAt.getTime()}`,
    agentLogin, campaignSid, loginAt,
    logoutAt: pickDate(row, ['LOGOUT'], timeZone),
    loggedSeconds: pickNumber(row, ['LoggedTime_sec']),
    pausedSeconds: pickNumber(row, ['PauseTime_sec']),
  }
}

// Campaigns/OutboundCalls → confirmed live against a real sample response
// (2026-10-28): fields are CallDuration (plain seconds, a number — not a
// formatted "ConvDuration" string), DialMoment ("DD/MM/YYYY HH:MM:SS"),
// CallHistorySid (per the test spec, its presence marks an answered row).
// TelNumber (the customer's phone) exists on this row and must never be
// read here.
export interface ExtractedCall { momentStart: Date; answered: boolean; talkSeconds: number }
export function extractCallRow(row: Record<string, unknown>, timeZone: string): ExtractedCall | null {
  const momentStart = pickDate(row, ['DialMoment'], timeZone)
  if (!momentStart) return null
  return {
    momentStart,
    answered: !!pickString(row, ['CallHistorySid']),
    talkSeconds: typeof row.CallDuration === 'number' ? row.CallDuration : parseDurationSeconds(row.CallDuration),
  }
}
