import { and, desc, eq, gte, inArray, lt, lte } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { Database } from '../../db/client.js'
import type { Env } from '../../config/env.js'
import { attoCampaigns, attoAgents, attoCollectRuns, attoCallsHourly, attoAgentReport, attoWorkingTime } from '../../db/schema.js'
import { ALL_NODES } from '../../permissions/tree.js'
import { dayStartInTimezone, addDays, hourOfDayInTimezone } from '../../collector/dates.js'
import { rangeQuerySchema, pagedRangeQuerySchema } from './schemas.js'

const BAD_REQUEST = { statusCode: 400, error: 'Bad Request', message: 'Dados inválidos.' }
const DASHBOARD_NODES = ALL_NODES.filter(node => node === 'dashboard' || node.startsWith('dashboard.'))

/** Agents/Report and Agents/WorkingTime only carry the agent's login — the
 * real name comes from the separately-collected Agents/List (atto_agents). */
async function loadAgentNames(db: Database, logins: string[]): Promise<Map<string, string>> {
  if (!logins.length) return new Map()
  const rows = await db.select({ login: attoAgents.login, name: attoAgents.name }).from(attoAgents).where(inArray(attoAgents.login, logins))
  return new Map(rows.filter((r): r is { login: string; name: string } => !!r.name).map(r => [r.login, r.name]))
}
function matchesSearch(q: string | undefined, ...fields: Array<string | null | undefined>): boolean {
  if (!q) return true
  const needle = q.toLowerCase()
  return fields.some(f => f?.toLowerCase().includes(needle))
}
function paginate<T>(items: T[], page: number, pageSize: number): { items: T[]; total: number } {
  const total = items.length
  const start = (page - 1) * pageSize
  return { items: items.slice(start, start + pageSize), total }
}

export async function dashboardRoutes(app: FastifyInstance, db: Database, env: Env) {
  app.get('/dashboard/atto/meta', { preHandler: [app.authenticate, app.requirePermission(DASHBOARD_NODES)] }, async () => {
    const campaigns = await db.select().from(attoCampaigns)
    const [lastRun] = await db.select().from(attoCollectRuns)
      .where(inArray(attoCollectRuns.status, ['ok', 'partial']))
      .orderBy(desc(attoCollectRuns.finishedAt)).limit(1)
    return {
      campaigns: campaigns.map(c => ({ id: c.sid, name: c.name })),
      updatedAt: lastRun?.finishedAt ?? null,
    }
  })

  app.get('/dashboard/atto/chamadas', { preHandler: [app.authenticate, app.requirePermission('dashboard.atto.chamadas')] }, async (request, reply) => {
    const parsed = rangeQuerySchema.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send(BAD_REQUEST)
    const { from, to, campaignId } = parsed.data
    const fromDate = dayStartInTimezone(new Date(`${from}T12:00:00Z`), env.APP_TIMEZONE)
    const toDateExclusive = addDays(dayStartInTimezone(new Date(`${to}T12:00:00Z`), env.APP_TIMEZONE), 1)

    const rows = await db.select().from(attoCallsHourly).where(and(
      gte(attoCallsHourly.hourStart, fromDate), lt(attoCallsHourly.hourStart, toDateExclusive),
      campaignId ? eq(attoCallsHourly.campaignSid, campaignId) : undefined,
    ))

    let attempts = 0, answered = 0, talkSeconds = 0
    const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, answered: 0 }))
    for (const row of rows) {
      attempts += row.attempts
      answered += row.answered
      talkSeconds += row.talkSeconds
      byHour[hourOfDayInTimezone(row.hourStart, env.APP_TIMEZONE)]!.answered += row.answered
    }
    return {
      attempts, answered,
      answerRate: attempts ? answered / attempts : 0,
      avgTalkSeconds: answered ? talkSeconds / answered : 0,
      byHour,
    }
  })

  app.get('/dashboard/atto/agentes', { preHandler: [app.authenticate, app.requirePermission('dashboard.atto.agentes')] }, async (request, reply) => {
    const parsed = pagedRangeQuerySchema.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send(BAD_REQUEST)
    const { from, to, page, pageSize, q } = parsed.data

    const rows = await db.select().from(attoAgentReport).where(and(gte(attoAgentReport.day, from), lte(attoAgentReport.day, to)))
    const byAgent = new Map<string, { answeredCalls: number; talkSeconds: number }>()
    for (const row of rows) {
      const acc = byAgent.get(row.agentLogin) ?? { answeredCalls: 0, talkSeconds: 0 }
      acc.answeredCalls += row.answeredCalls
      acc.talkSeconds += row.talkSeconds
      byAgent.set(row.agentLogin, acc)
    }
    const names = await loadAgentNames(db, [...byAgent.keys()])
    const fullRanking = [...byAgent.entries()]
      .map(([agentLogin, acc]) => ({
        agentLogin, agentName: names.get(agentLogin) ?? null,
        answeredCalls: acc.answeredCalls, avgTalkSeconds: acc.answeredCalls ? acc.talkSeconds / acc.answeredCalls : 0,
      }))
      .filter(r => matchesSearch(q, r.agentLogin, r.agentName))
      .sort((a, b) => b.answeredCalls - a.answeredCalls)
    const { items: ranking, total } = paginate(fullRanking, page, pageSize)
    // Agents/Report isn't scoped by campaign in the Atto response, so this block can't filter by it.
    return { ranking, total, page, pageSize, campaignFilterSupported: false }
  })

  app.get('/dashboard/atto/tempo', { preHandler: [app.authenticate, app.requirePermission('dashboard.atto.tempo')] }, async (request, reply) => {
    const parsed = pagedRangeQuerySchema.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send(BAD_REQUEST)
    const { from, to, campaignId, page, pageSize, q } = parsed.data
    const fromDate = dayStartInTimezone(new Date(`${from}T12:00:00Z`), env.APP_TIMEZONE)
    const toDateExclusive = addDays(dayStartInTimezone(new Date(`${to}T12:00:00Z`), env.APP_TIMEZONE), 1)

    const rows = await db.select().from(attoWorkingTime).where(and(
      gte(attoWorkingTime.loginAt, fromDate), lt(attoWorkingTime.loginAt, toDateExclusive),
      campaignId ? eq(attoWorkingTime.campaignSid, campaignId) : undefined,
    ))
    const byAgent = new Map<string, { loggedSeconds: number; pausedSeconds: number }>()
    for (const row of rows) {
      const acc = byAgent.get(row.agentLogin) ?? { loggedSeconds: 0, pausedSeconds: 0 }
      acc.loggedSeconds += row.loggedSeconds
      acc.pausedSeconds += row.pausedSeconds
      byAgent.set(row.agentLogin, acc)
    }
    const names = await loadAgentNames(db, [...byAgent.keys()])
    const fullItems = [...byAgent.entries()]
      .map(([agentLogin, acc]) => {
        const totalSeconds = acc.loggedSeconds + acc.pausedSeconds
        return {
          agentLogin, agentName: names.get(agentLogin) ?? null,
          loggedSeconds: acc.loggedSeconds, pausedSeconds: acc.pausedSeconds,
          pauseRate: totalSeconds ? acc.pausedSeconds / totalSeconds : 0,
        }
      })
      .filter(r => matchesSearch(q, r.agentLogin, r.agentName))
      .sort((a, b) => b.loggedSeconds - a.loggedSeconds)
    const { items, total } = paginate(fullItems, page, pageSize)
    return { items, total, page, pageSize }
  })
}
