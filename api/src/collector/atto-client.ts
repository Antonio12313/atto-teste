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
// Agents/List: confirmed live 2026-10-27 to live on AdminService.svc (same
// as Campaigns/List), despite the "Agents/" prefix matching the Supervision
// endpoints elsewhere — checked against both services' unauthenticated
// `.help` pages, it only appears under Admin's.
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
/**
 * Per Atto's own docs: filtering by MomentStart/MomentEnd (dial time) can
 * return calls still in progress; MomentEndedCall_From/_To (call-end time)
 * is what they recommend for a closed window, and is what's used here.
 * Also paginates via `Seq`: the docs say the next page is requested by
 * sending the last row's `Seq` back; the one real sample response we have
 * doesn't show a `Seq` field (only `Indice`), so both are read defensively.
 * `pageDelayMs` re-applies the same rate-limit floor between pages, not
 * just between windows, since a window with many rows means several calls.
 */
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
    // Confirmed live: OutboundCalls keeps 429ing even at the same spacing that
    // Agents/* succeeds at, so it gets fewer retries — fail fast and move on to
    // the next window instead of burning ~30s per call retrying in place.
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
