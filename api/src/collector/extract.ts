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
function pickDate(row: Record<string, unknown>, keys: string[]): Date | null {
  for (const key of keys) {
    const parsed = parseAttoDate(row[key])
    if (parsed) return parsed
  }
  return null
}

// Campaigns/List (Admin service) → ArrayOfCampaignParam. No "Name" field —
// the display text is "Description"; the id is "Sid".
export interface ExtractedCampaign { sid: string; name: string }
export function extractCampaign(row: Record<string, unknown>): ExtractedCampaign | null {
  const sid = pickString(row, ['Sid'])
  if (!sid) return null
  return { sid, name: pickString(row, ['Description']) ?? sid }
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
export function extractWorkingTimeRow(row: Record<string, unknown>): ExtractedWorkingTimeRow | null {
  const agentLogin = pickString(row, ['Login'])
  const loginAt = pickDate(row, ['LOGIN'])
  if (!agentLogin || !loginAt) return null
  const campaignSid = pickString(row, ['CampaignSid']) ?? ''
  return {
    sessionKey: `${agentLogin}:${campaignSid}:${loginAt.getTime()}`,
    agentLogin, campaignSid, loginAt,
    logoutAt: pickDate(row, ['LOGOUT']),
    loggedSeconds: pickNumber(row, ['LoggedTime_sec']),
    pausedSeconds: pickNumber(row, ['PauseTime_sec']),
  }
}

// Campaigns/OutboundCalls → ArrayOfOutboundCallResult. CallHistorySid is
// confirmed in the spec itself as the "answered" marker. TelNumber (the
// customer's phone) exists on this row and must never be read here.
export interface ExtractedCall { momentStart: Date; answered: boolean; talkSeconds: number }
export function extractCallRow(row: Record<string, unknown>): ExtractedCall | null {
  const momentStart = pickDate(row, ['DialMoment'])
  if (!momentStart) return null
  return {
    momentStart,
    answered: !!pickString(row, ['CallHistorySid']),
    talkSeconds: parseDurationSeconds(row.ConvDuration),
  }
}
