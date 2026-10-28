// No date library: Intl.DateTimeFormat (built into Node) is enough for the
// timezone math this collector needs, so adding one wasn't justified.

/**
 * Atto's own services, confirmed live against a real Campaigns/OutboundCalls
 * response (DialMoment): "DD/MM/YYYY HH:MM:SS", not WCF's "/Date(...)/ ".
 * Parse that explicitly — never hand it to `new Date(string)`, which assumes
 * MM/DD and silently mis-parses or rejects it. `/Date(...)/ ` is kept as a
 * fallback in case some other field still uses the WCF wire format.
 */
export function parseAttoDate(value: unknown, timeZone: string): Date | null {
  if (typeof value === 'string') {
    const wcf = /^\/Date\((-?\d+)\)\/$/.exec(value)
    if (wcf) return new Date(Number(wcf[1]))
    const br = /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(value)
    if (br) {
      const [, day, month, year, hour = '00', minute = '00', second = '00'] = br
      const naiveUtc = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second))
      return new Date(naiveUtc - offsetMsAt(new Date(naiveUtc), timeZone))
    }
    const parsed = new Date(value)
    if (!isNaN(parsed.getTime())) return parsed
  }
  if (typeof value === 'number') return new Date(value)
  return null
}

/**
 * Atto's documented request format for MomentStart/MomentEnd (and friends
 * like MomentEndedCall_From/_To): "YYYY-MM-DD HH:MM:SS", local time, no
 * timezone marker. Confirmed against Atto's own published Postman examples
 * (Agents/Report, Agents/WorkingTime, Campaigns/OutboundCalls) — previously
 * this sent WCF's "/Date(...)/ ", which Atto's services don't parse as a
 * date and likely explains the timeouts on OutboundCalls (falls back to an
 * unfiltered/expensive query instead of erroring).
 */
export function formatAttoDate(date: Date, timeZone: string): string {
  const p = partsOf(date, timeZone)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`
}

function partsOf(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: string) => Number(parts.find(p => p.type === type)!.value)
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') }
}

/** Offset (ms) of `timeZone` relative to UTC at the instant `date`. */
function offsetMsAt(date: Date, timeZone: string): number {
  const p = partsOf(date, timeZone)
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUTC - date.getTime()
}

/** Floors `date` to the start of its local hour in `timeZone`, as a real UTC instant. */
export function hourStartInTimezone(date: Date, timeZone: string): Date {
  const offsetMs = offsetMsAt(date, timeZone)
  const localFloored = Math.floor((date.getTime() + offsetMs) / 3_600_000) * 3_600_000
  return new Date(localFloored - offsetMs)
}

/** Floors `date` to the start of its local day in `timeZone`, as a real UTC instant. */
export function dayStartInTimezone(date: Date, timeZone: string): Date {
  const offsetMs = offsetMsAt(date, timeZone)
  const localFloored = Math.floor((date.getTime() + offsetMs) / 86_400_000) * 86_400_000
  return new Date(localFloored - offsetMs)
}

/** The calendar date (YYYY-MM-DD) `date` falls on in `timeZone`. */
export function dateOnlyInTimezone(date: Date, timeZone: string): string {
  const p = partsOf(date, timeZone)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

/** The local hour-of-day (0-23) `date` falls on in `timeZone`. */
export function hourOfDayInTimezone(date: Date, timeZone: string): number {
  return partsOf(date, timeZone).hour
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000)
}
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Durations come back as "H:MM:SS"/"HH:MM:SS" or plain seconds — format not confirmed live. */
export function parseDurationSeconds(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value !== 'string') return 0
  const trimmed = value.trim()
  if (!trimmed) return 0
  if (/^\d+$/.test(trimmed)) return Number(trimmed)
  const hms = /^(\d+):(\d{2}):(\d{2})$/.exec(trimmed)
  if (hms) return Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3])
  const ms = /^(\d{2}):(\d{2})$/.exec(trimmed)
  if (ms) return Number(ms[1]) * 60 + Number(ms[2])
  return 0
}
