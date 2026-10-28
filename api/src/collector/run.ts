import { and, eq, sql } from 'drizzle-orm'
import type { Database } from '../db/client.js'
import type { Env } from '../config/env.js'
import { attoCampaigns, attoAgents, attoAgentReport, attoWorkingTime, attoCallsHourly, attoCollectRuns } from '../db/schema.js'
import { getValidToken, invalidateToken } from '../modules/atto-auth/token.js'
import {
  fetchCampaigns, fetchAgentsList, fetchAgentReport, fetchWorkingTime, fetchOutboundCalls,
  AttoUnauthorizedError, type AttoClientOptions,
} from './atto-client.js'
import { extractCampaign, extractAgent, extractAgentReportRow, extractWorkingTimeRow, extractCallRow } from './extract.js'
import { dayStartInTimezone, hourStartInTimezone, dateOnlyInTimezone, addDays, sleep } from './dates.js'

type LogFn = (entry: Record<string, unknown>) => void

export async function runCollection(db: Database, env: Env, deps: {
  fetch?: typeof globalThis.fetch
  now?: () => Date
  log?: LogFn
} = {}, trigger: 'scheduled' | 'once' = 'scheduled'): Promise<void> {
  const now = deps.now ?? (() => new Date())
  const cycleStartMs = now().getTime()
  const log: LogFn = deps.log ?? (entry => console.log(JSON.stringify(entry)))
  const attoLoginNormalized = env.ATTO_LOGIN.trim().toLowerCase()
  const records = { campaigns: 0, agents: 0, agentReport: 0, workingTime: 0, callsHourly: 0 }
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
    token, timeoutMs: env.ATTO_REQUEST_TIMEOUT_MS, timeZone: env.APP_TIMEZONE, fetch: deps.fetch,
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
      await db.insert(attoCampaigns).values(campaigns.map(c => ({ ...c, updatedAt: now() })))
        .onConflictDoUpdate({
          target: attoCampaigns.sid,
          set: {
            name: sql`excluded.name`, updatedAt: now(),
            customerSid: sql`excluded.customer_sid`, accessLineSid: sql`excluded.access_line_sid`,
            agentMsg: sql`excluded.agent_msg`, aggressiveness: sql`excluded.aggressiveness`,
            blackListSid: sql`excluded.black_list_sid`, callClassify: sql`excluded.call_classify`,
            callClassifyLevel: sql`excluded.call_classify_level`, callFileSid: sql`excluded.call_file_sid`,
            dialRuleSid: sql`excluded.dial_rule_sid`, dialType: sql`excluded.dial_type`,
            dialerStatus: sql`excluded.dialer_status`, displayPhone: sql`excluded.display_phone`,
            displayType: sql`excluded.display_type`, factorD: sql`excluded.factor_d`,
            gatewaySid: sql`excluded.gateway_sid`, grammarSid: sql`excluded.grammar_sid`,
            holdMsg: sql`excluded.hold_msg`, holidaySid: sql`excluded.holiday_sid`,
            ivrName: sql`excluded.ivr_name`, ivrSid: sql`excluded.ivr_sid`,
            maxChannels: sql`excluded.max_channels`, maxPendingCalls: sql`excluded.max_pending_calls`,
            noAgentMsg: sql`excluded.no_agent_msg`, openingSid: sql`excluded.opening_sid`,
            playWaveMsg: sql`excluded.play_wave_msg`, priority: sql`excluded.priority`,
            queue: sql`excluded.queue`, record: sql`excluded.record`,
            recordFileTemplate: sql`excluded.record_file_template`, recordFolder: sql`excluded.record_folder`,
            retention: sql`excluded.retention`, scriptName: sql`excluded.script_name`,
            scriptSid: sql`excluded.script_sid`, statusSid: sql`excluded.status_sid`,
            type: sql`excluded.type`, waitMsg: sql`excluded.wait_msg`,
            waitTimeMsg: sql`excluded.wait_time_msg`, welcomeMsg: sql`excluded.welcome_msg`,
          },
        })
      records.campaigns = campaigns.length
    }
    await sleep(env.COLLECT_DELAY_OTHERS_MS)

    const agentRows = await guarded('Agents/List', () => fetchAgentsList(client))
    const agents = (agentRows ?? []).map(extractAgent).filter((a): a is NonNullable<typeof a> => !!a)
    if (agents.length) {
      await db.insert(attoAgents).values(agents.map(a => ({ ...a, updatedAt: now() })))
        .onConflictDoUpdate({
          target: attoAgents.login,
          set: {
            name: sql`excluded.name`, surname: sql`excluded.surname`, updatedAt: now(),
            customerSid: sql`excluded.customer_sid`, alreadyLogged: sql`excluded.already_logged`,
            block: sql`excluded.block`, chatCampaigns: sql`excluded.chat_campaigns`,
            dialModeEnable: sql`excluded.dial_mode_enable`, dialModeTime: sql`excluded.dial_mode_time`,
            distributorSid: sql`excluded.distributor_sid`, employeeCode: sql`excluded.employee_code`,
            gender: sql`excluded.gender`, groupSid: sql`excluded.group_sid`,
            holidaySid: sql`excluded.holiday_sid`, inbCampaigns: sql`excluded.inb_campaigns`,
            interactionsNumber: sql`excluded.interactions_number`, mailCampaigns: sql`excluded.mail_campaigns`,
            manualCampaigns: sql`excluded.manual_campaigns`, mediaCampaigns: sql`excluded.media_campaigns`,
            openingSid: sql`excluded.opening_sid`, outCampaigns: sql`excluded.out_campaigns`,
            pauseSid: sql`excluded.pause_sid`, readyEnable: sql`excluded.ready_enable`,
            shift: sql`excluded.shift`, supervisorSid: sql`excluded.supervisor_sid`,
            withoutHeadset: sql`excluded.without_headset`, workSpaceHeight: sql`excluded.work_space_height`,
            workSpaceName: sql`excluded.work_space_name`, workSpaceSid: sql`excluded.work_space_sid`,
            workSpaceWidth: sql`excluded.work_space_width`, wrapupEnable: sql`excluded.wrapup_enable`,
            wrapupExtended: sql`excluded.wrapup_extended`, wrapupTime: sql`excluded.wrapup_time`,
          },
        })
      records.agents = agents.length
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
        const row = extractWorkingTimeRow(raw, env.APP_TIMEZONE)
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

    const callsDeadlineMs = cycleStartMs + env.COLLECT_INTERVAL_MINUTES * 60_000 * 0.8
    let callsBudgetExceeded = false
    callsLoop: for (const campaign of campaigns) {
      for (const hourStart of hours) {
        if (Date.now() >= callsDeadlineMs) { callsBudgetExceeded = true; break callsLoop }
        const hourEnd = new Date(hourStart.getTime() + 3_600_000)
        const [existing] = await db.select().from(attoCallsHourly)
          .where(and(eq(attoCallsHourly.hourStart, hourStart), eq(attoCallsHourly.campaignSid, campaign.sid)))
        if (existing?.final) continue

        const callRows = await guarded('Campaigns/OutboundCalls', () => fetchOutboundCalls(client, campaign.sid, hourStart, hourEnd, env.COLLECT_DELAY_CALLS_MS))
        await sleep(env.COLLECT_DELAY_CALLS_MS)
        if (callRows === null) continue

        let attempts = 0, answered = 0, talkSeconds = 0
        for (const raw of callRows) {
          const call = extractCallRow(raw, env.APP_TIMEZONE)
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
    if (callsBudgetExceeded) {
      hadFailure = true
      log({ event: 'collect_skip', reason: 'calls_budget_exceeded', endpoint: 'Campaigns/OutboundCalls' })
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
