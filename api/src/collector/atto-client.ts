import { formatAttoDate, sleep } from './dates.js'

export class AttoUnauthorizedError extends Error {
  constructor() { super('Atto recusou o token (401/403).') }
}
export class AttoCollectorError extends Error {
  constructor(public readonly reason: string) { super(`Falha ao consultar a Atto (${reason}).`) }
}

export interface AttoClientOptions {
  adminUrl: string
  supervisionUrl: string
  customerSid: string
  token: string
  timeoutMs: number
  fetch?: typeof globalThis.fetch
}

async function get(baseUrl: string, path: string, options: AttoClientOptions): Promise<unknown> {
  const request = options.fetch ?? globalThis.fetch
  const url = `${baseUrl.replace(/\/$/, '')}${path}`
  const maxAttempts = 4
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), options.timeoutMs)
    let response: Response
    try {
      response = await request(url, {
        method: 'GET',
        // WebAdmin defaults to JSON; WebSupervision apparently defaults to
        // XML unless asked for JSON explicitly (confirmed live: Campaigns/
        // List parsed fine, Agents/Report didn't until this header was added).
        headers: { Authorization: `Bearer ${options.token}`, Accept: 'application/json' },
        signal: controller.signal,
      })
    } catch (error) {
      clearTimeout(timer)
      throw new AttoCollectorError(error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'network')
    }
    clearTimeout(timer)
    if (response.status === 401 || response.status === 403) throw new AttoUnauthorizedError()
    if (response.status === 429) {
      if (attempt === maxAttempts) throw new AttoCollectorError('rate-limited')
      const retryAfterHeader = Number(response.headers.get('retry-after'))
      await sleep(Number.isFinite(retryAfterHeader) && retryAfterHeader > 0 ? retryAfterHeader * 1000 : 5000 * attempt)
      continue
    }
    if (!response.ok) throw new AttoCollectorError(`http-${response.status}`)
    // 204 (or any empty body) means "no rows for this query", not an error.
    const text = await response.text()
    if (!text.trim()) return []
    try { return JSON.parse(text) } catch { throw new AttoCollectorError('invalid-json') }
  }
  throw new AttoCollectorError('rate-limited')
}

/** Some WCF/.svc endpoints wrap arrays in an envelope; try a few common shapes defensively. */
function asRecordArray(body: unknown): Record<string, unknown>[] {
  const candidate = Array.isArray(body)
    ? body
    : body && typeof body === 'object'
      ? (body as Record<string, unknown>).d ?? (body as Record<string, unknown>).Items ?? (body as Record<string, unknown>).Result
      : null
  return Array.isArray(candidate) ? candidate.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object') : []
}

// Confirmed live against the real .../help operation listing (2026-10-27):
// CustomerSid is required on every call below; Campaigns/List lives on the
// Admin service, not Supervision (Supervision has no "List"-style campaign
// endpoint at all). Agents/Report and Agents/WorkingTime take an `Agents`
// filter — left empty here, assumed to mean "all agents" (not confirmed).

export async function fetchCampaigns(options: AttoClientOptions): Promise<Record<string, unknown>[]> {
  const query = new URLSearchParams({ CustomerSid: options.customerSid })
  return asRecordArray(await get(options.adminUrl, `/Campaigns/List?${query}`, options))
}
export async function fetchAgentReport(options: AttoClientOptions, momentStart: Date, momentEnd: Date): Promise<Record<string, unknown>[]> {
  const query = new URLSearchParams({
    CustomerSid: options.customerSid, Agents: '',
    MomentStart: formatAttoDate(momentStart), MomentEnd: formatAttoDate(momentEnd),
  })
  return asRecordArray(await get(options.supervisionUrl, `/Agents/Report?${query}`, options))
}
export async function fetchWorkingTime(options: AttoClientOptions, momentStart: Date, momentEnd: Date): Promise<Record<string, unknown>[]> {
  const query = new URLSearchParams({
    CustomerSid: options.customerSid, Agents: '',
    MomentStart: formatAttoDate(momentStart), MomentEnd: formatAttoDate(momentEnd),
  })
  return asRecordArray(await get(options.supervisionUrl, `/Agents/WorkingTime?${query}`, options))
}
export async function fetchOutboundCalls(options: AttoClientOptions, campaignSid: string, momentStart: Date, momentEnd: Date): Promise<Record<string, unknown>[]> {
  const query = new URLSearchParams({
    CustomerSid: options.customerSid, CampaignSid: campaignSid,
    MomentStart: formatAttoDate(momentStart), MomentEnd: formatAttoDate(momentEnd),
  })
  return asRecordArray(await get(options.supervisionUrl, `/Campaigns/OutboundCalls?${query}`, options))
}
