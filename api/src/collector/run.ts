import { and, eq, sql } from 'drizzle-orm'
import type { Database } from '../db/client.js'
import type { Env } from '../config/env.js'
import { attoCampaigns, attoAgentReport, attoWorkingTime, attoCallsHourly, attoCollectRuns } from '../db/schema.js'
import { getValidToken, invalidateToken } from '../modules/atto-auth/token.js'
import {
  fetchCampaigns, fetchAgentReport, fetchWorkingTime, fetchOutboundCalls,
  AttoUnauthorizedError, type AttoClientOptions,
} from './atto-client.js'
import { extractCampaign, extractAgentReportRow, extractWorkingTimeRow, extractCallRow } from './extract.js'
import { dayStartInTimezone, hourStartInTimezone, dateOnlyInTimezone, addDays, sleep } from './dates.js'

type LogFn = (entry: Record<string, unknown>) => void

export async function runCollection(db: Database, env: Env, deps: {
  fetch?: typeof globalThis.fetch
  now?: () => Date
  log?: LogFn
} = {}, trigger: 'scheduled' | 'once' = 'scheduled'): Promise<void> {
  const now = deps.now ?? (() => new Date())
  const log: LogFn = deps.log ?? (entry => console.log(JSON.stringify(entry)))
  const attoLoginNormalized = env.ATTO_LOGIN.trim().toLowerCase()
  const records = { campaigns: 0, agentReport: 0, workingTime: 0, callsHourly: 0 }
  let hadFailure = false

  const [run] = await db.insert(attoCollectRuns).values({ startedAt: now(), status: 'error', trigger }).returning()
  const runId = run!.id

  const token = await getValidToken(db, env, deps)
  if (!token) {
    log({ event: 'collect_skip', reason: 'no_token' })
    await db.update(attoCollectRuns).set({ finishedAt: now(), status: 'error', error: 'Sem token disponível (login/cooldown).', records }).where(eq(attoCollectRuns.id, runId))
    return
  }
  const client: AttoClientOptions = {
    adminUrl: env.ATTO_ADMIN_URL, supervisionUrl: env.ATTO_SUPERVISION_URL, customerSid: env.ATTO_CUSTOMER_SID,
    token, timeoutMs: env.ATTO_REQUEST_TIMEOUT_MS, fetch: deps.fetch,
  }

  async function guarded<T>(endpoint: string, fn: () => Promise<T>): Promise<T | null> {
    const startedCall = Date.now()
    try {
      const result = await fn()
      log({ event: 'collect_call', endpoint, status: 'ok', durationMs: Date.now() - startedCall })
      return result
    } catch (error) {
      if (error instanceof AttoUnauthorizedError) {
        await invalidateToken(db, attoLoginNormalized)
        log({ event: 'collect_call', endpoint, status: 'unauthorized', durationMs: Date.now() - startedCall })
        throw error
      }
      hadFailure = true
      log({ event: 'collect_call', endpoint, status: 'error', durationMs: Date.now() - startedCall, message: error instanceof Error ? error.message : 'erro desconhecido' })
      return null
    }
  }

  try {
    const campaignRows = await guarded('Campaigns/List', () => fetchCampaigns(client))
    const campaigns = (campaignRows ?? []).map(extractCampaign).filter((c): c is NonNullable<typeof c> => !!c)
    if (campaigns.length) {
      await db.insert(attoCampaigns).values(campaigns.map(c => ({ sid: c.sid, name: c.name, updatedAt: now() })))
        .onConflictDoUpdate({ target: attoCampaigns.sid, set: { name: sql`excluded.name`, updatedAt: now() } })
      records.campaigns = campaigns.length
    }
    await sleep(env.COLLECT_DELAY_OTHERS_MS)

    for (let offset = 0; offset <= env.COLLECT_BACKFILL_DAYS; offset++) {
      const dayStart = dayStartInTimezone(addDays(now(), -offset), env.APP_TIMEZONE)
      const dayEnd = addDays(dayStart, 1)
      const day = dateOnlyInTimezone(dayStart, env.APP_TIMEZONE)

      const reportRows = await guarded('Agents/Report', () => fetchAgentReport(client, dayStart, dayEnd))
      for (const raw of reportRows ?? []) {
        const row = extractAgentReportRow(raw)
        if (!row) continue
        await db.insert(attoAgentReport).values({ day, ...row, updatedAt: now() })
          .onConflictDoUpdate({
            target: [attoAgentReport.day, attoAgentReport.agentLogin, attoAgentReport.campaignSid],
            set: { answeredCalls: row.answeredCalls, talkSeconds: row.talkSeconds, updatedAt: now() },
          })
        records.agentReport++
      }
      await sleep(env.COLLECT_DELAY_AGENTS_MS)

      const workingRows = await guarded('Agents/WorkingTime', () => fetchWorkingTime(client, dayStart, dayEnd))
      for (const raw of workingRows ?? []) {
        const row = extractWorkingTimeRow(raw)
        if (!row) continue
        await db.insert(attoWorkingTime).values({ ...row, updatedAt: now() })
          .onConflictDoUpdate({
            target: attoWorkingTime.sessionKey,
            set: { logoutAt: row.logoutAt, loggedSeconds: row.loggedSeconds, pausedSeconds: row.pausedSeconds, updatedAt: now() },
          })
        records.workingTime++
      }
      await sleep(env.COLLECT_DELAY_AGENTS_MS)
    }

    const lookbackStart = new Date(now().getTime() - env.COLLECT_CALLS_LOOKBACK_HOURS * 3_600_000)
    const hours: Date[] = []
    for (let h = hourStartInTimezone(lookbackStart, env.APP_TIMEZONE); h.getTime() < now().getTime(); h = new Date(h.getTime() + 3_600_000)) {
      hours.push(h)
    }

    for (const campaign of campaigns) {
      for (const hourStart of hours) {
        const hourEnd = new Date(hourStart.getTime() + 3_600_000)
        const [existing] = await db.select().from(attoCallsHourly)
          .where(and(eq(attoCallsHourly.hourStart, hourStart), eq(attoCallsHourly.campaignSid, campaign.sid)))
        if (existing?.final) continue

        const callRows = await guarded('Campaigns/OutboundCalls', () => fetchOutboundCalls(client, campaign.sid, hourStart, hourEnd))
        await sleep(env.COLLECT_DELAY_OTHERS_MS)
        if (callRows === null) continue

        let attempts = 0, answered = 0, talkSeconds = 0
        for (const raw of callRows) {
          const call = extractCallRow(raw)
          if (!call) continue
          attempts++
          if (call.answered) { answered++; talkSeconds += call.talkSeconds }
        }
        const final = hourEnd.getTime() <= now().getTime()
        await db.insert(attoCallsHourly).values({ hourStart, campaignSid: campaign.sid, attempts, answered, talkSeconds, final, updatedAt: now() })
          .onConflictDoUpdate({ target: [attoCallsHourly.hourStart, attoCallsHourly.campaignSid], set: { attempts, answered, talkSeconds, final, updatedAt: now() } })
        records.callsHourly++
      }
    }

    const status = hadFailure ? 'partial' : 'ok'
    await db.update(attoCollectRuns).set({ finishedAt: now(), status, records }).where(eq(attoCollectRuns.id, runId))
    log({ event: 'collect_summary', status, records })
  } catch (error) {
    const message = error instanceof AttoUnauthorizedError
      ? 'Token da Atto recusado (401/403); invalidado para renovação no próximo ciclo.'
      : 'Falha ao coletar.'
    await db.update(attoCollectRuns).set({ finishedAt: now(), status: 'error', records, error: message }).where(eq(attoCollectRuns.id, runId))
    log({ event: 'collect_summary', status: 'error', records, error: message })
  }
}
