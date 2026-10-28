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
  timeZone: string
  fetch?: typeof globalThis.fetch
}

async function get(baseUrl: string, path: string, options: AttoClientOptions, maxAttempts = 4): Promise<unknown> {
  const request = options.fetch ?? globalThis.fetch
  const url = `${baseUrl.replace(/\/$/, '')}${path}`
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), options.timeoutMs)
    let response: Response
    try {
      response = await request(url, {
        method: 'GET',
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
    const text = await response.text()
    if (!text.trim()) return []
    try { return JSON.parse(text) } catch { throw new AttoCollectorError('invalid-json') }
  }
  throw new AttoCollectorError('rate-limited')
}

function asRecordArray(body: unknown): Record<string, unknown>[] {
  const candidate = Array.isArray(body)
    ? body
    : body && typeof body === 'object'
      ? (body as Record<string, unknown>).d ?? (body as Record<string, unknown>).Items ?? (body as Record<string, unknown>).Result
      : null
  return Array.isArray(candidate) ? candidate.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object') : []
}

export async function fetchCampaigns(options: AttoClientOptions): Promise<Record<string, unknown>[]> {
  const query = new URLSearchParams({ CustomerSid: options.customerSid })
  return asRecordArray(await get(options.adminUrl, `/Campaigns/List?${query}`, options))
}
export async function fetchAgentsList(options: AttoClientOptions): Promise<Record<string, unknown>[]> {
  const query = new URLSearchParams({ CustomerSid: options.customerSid })
  return asRecordArray(await get(options.adminUrl, `/Agents/List?${query}`, options))
}
export async function fetchAgentReport(options: AttoClientOptions, momentStart: Date, momentEnd: Date): Promise<Record<string, unknown>[]> {
  const query = new URLSearchParams({
    CustomerSid: options.customerSid, Agents: '',
    MomentStart: formatAttoDate(momentStart, options.timeZone), MomentEnd: formatAttoDate(momentEnd, options.timeZone),
  })
  return asRecordArray(await get(options.supervisionUrl, `/Agents/Report?${query}`, options))
}
export async function fetchWorkingTime(options: AttoClientOptions, momentStart: Date, momentEnd: Date): Promise<Record<string, unknown>[]> {
  const query = new URLSearchParams({
    CustomerSid: options.customerSid, Agents: '',
    MomentStart: formatAttoDate(momentStart, options.timeZone), MomentEnd: formatAttoDate(momentEnd, options.timeZone),
  })
  return asRecordArray(await get(options.supervisionUrl, `/Agents/WorkingTime?${query}`, options))
}
export async function fetchOutboundCalls(
  options: AttoClientOptions, campaignSid: string, momentStart: Date, momentEnd: Date, pageDelayMs: number,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  let seq: number | undefined
  const MAX_PAGES = 50
  for (let page = 0; page < MAX_PAGES; page++) {
    if (page > 0) await sleep(pageDelayMs)
    const query = new URLSearchParams({
      CustomerSid: options.customerSid, CampaignSid: campaignSid,
      MomentEndedCall_From: formatAttoDate(momentStart, options.timeZone),
      MomentEndedCall_To: formatAttoDate(momentEnd, options.timeZone),
    })
    if (seq !== undefined) query.set('Seq', String(seq))
    const pageRows = asRecordArray(await get(options.supervisionUrl, `/Campaigns/OutboundCalls?${query}`, options, 2))
    if (pageRows.length === 0) break
    rows.push(...pageRows)
    const lastRow = pageRows[pageRows.length - 1]!
    const lastSeq = lastRow.Seq ?? lastRow.Indice
    if (typeof lastSeq !== 'number' || lastSeq === seq) break
    seq = lastSeq
  }
  return rows
}
