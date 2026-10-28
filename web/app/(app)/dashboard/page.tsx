import { AlertTriangle, Clock, PhoneIncoming, PhoneOutgoing, TimerOff, Trophy } from "lucide-react"
import { getSession } from "@/lib/session"
import { serverApi, ServerApiError } from "@/lib/server-api"
import { formatDateTime } from "@/lib/format"
import { NoAccess } from "@/components/no-access"
import { DashboardFilters } from "@/components/dashboard/filters"
import { CallsByHourChart } from "@/components/dashboard/calls-chart"
import { StatTile } from "@/components/dashboard/stat-tile"
import { TableControls } from "@/components/dashboard/table-controls"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface Campaign {
  id: string
  name: string
}
interface MetaResponse {
  campaigns: Campaign[]
  updatedAt: string | null
}
interface ChamadasResponse {
  attempts: number
  answered: number
  answerRate: number
  avgTalkSeconds: number
  byHour: Array<{ hour: number; answered: number }>
}
interface AgentesResponse {
  ranking: Array<{ agentLogin: string; agentName: string | null; answeredCalls: number; avgTalkSeconds: number }>
  total: number
  page: number
  pageSize: number
  campaignFilterSupported: boolean
}
interface TempoResponse {
  items: Array<{ agentLogin: string; agentName: string | null; loggedSeconds: number; pausedSeconds: number; pauseRate: number }>
  total: number
  page: number
  pageSize: number
}

function localISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}
function defaultRange() {
  const to = new Date()
  const from = new Date(to.getTime() - 6 * 86_400_000)
  return { from: localISODate(from), to: localISODate(to) }
}
function formatHMS(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  return `${h}h${String(m).padStart(2, "0")}`
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string
    to?: string
    campaignId?: string
    agentesPage?: string
    agentesQ?: string
    tempoPage?: string
    tempoQ?: string
  }>
}) {
  const session = await getSession()
  const permissions = session?.permissions ?? []
  const hasDashboardAccess = permissions.some((p) => p === "dashboard" || p.startsWith("dashboard."))
  if (!hasDashboardAccess) return <NoAccess />

  const params = await searchParams
  const defaults = defaultRange()
  const from = params.from || defaults.from
  const to = params.to || defaults.to
  const campaignId = params.campaignId || undefined
  const agentesPage = params.agentesPage || "1"
  const agentesQ = params.agentesQ || undefined
  const tempoPage = params.tempoPage || "1"
  const tempoQ = params.tempoQ || undefined

  let meta: MetaResponse
  let chamadas: ChamadasResponse | null = null
  let agentes: AgentesResponse | null = null
  let tempo: TempoResponse | null = null
  let rangeError: string | null = null
  try {
    meta = await serverApi<MetaResponse>("/dashboard/atto/meta")
    const query = new URLSearchParams({ from, to, ...(campaignId ? { campaignId } : {}) }).toString()
    const agentesQuery = new URLSearchParams({ from, to, page: agentesPage, ...(agentesQ ? { q: agentesQ } : {}) }).toString()
    const tempoQuery = new URLSearchParams({ from, to, page: tempoPage, ...(campaignId ? { campaignId } : {}), ...(tempoQ ? { q: tempoQ } : {}) }).toString()
    const [chamadasResult, agentesResult, tempoResult] = await Promise.all([
      permissions.includes("dashboard.atto.chamadas") ? serverApi<ChamadasResponse>(`/dashboard/atto/chamadas?${query}`) : Promise.resolve(null),
      permissions.includes("dashboard.atto.agentes") ? serverApi<AgentesResponse>(`/dashboard/atto/agentes?${agentesQuery}`) : Promise.resolve(null),
      permissions.includes("dashboard.atto.tempo") ? serverApi<TempoResponse>(`/dashboard/atto/tempo?${tempoQuery}`) : Promise.resolve(null),
    ])
    chamadas = chamadasResult
    agentes = agentesResult
    tempo = tempoResult
  } catch (error) {
    if (error instanceof ServerApiError && error.status === 400) {
      rangeError = error.message
      meta = { campaigns: [], updatedAt: null }
    } else {
      throw error
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {meta.updatedAt
            ? `Atualizado em ${formatDateTime(meta.updatedAt)}`
            : "Ainda sem coleta registrada."}
        </p>
      </div>

      <DashboardFilters from={from} to={to} campaignId={campaignId} campaigns={meta.campaigns} />

      {rangeError && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Período inválido</AlertTitle>
          <AlertDescription>{rangeError}</AlertDescription>
        </Alert>
      )}

      {!rangeError && permissions.includes("dashboard.atto.chamadas") && chamadas && (
        <section className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatTile label="Tentativas" value={chamadas.attempts.toLocaleString("pt-BR")} icon={PhoneOutgoing} />
            <StatTile label="Atendidas" value={chamadas.answered.toLocaleString("pt-BR")} icon={PhoneIncoming} />
            <StatTile label="Taxa de atendimento" value={`${(chamadas.answerRate * 100).toFixed(1)}%`} icon={Trophy} />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Chamadas atendidas por hora</CardTitle>
              <CardDescription>Volume de atendimentos ao longo do período selecionado.</CardDescription>
            </CardHeader>
            <CardContent>
              {chamadas.attempts === 0 ? (
                <p className="text-sm text-muted-foreground">Sem dados no período.</p>
              ) : (
                <CallsByHourChart data={chamadas.byHour} />
              )}
            </CardContent>
          </Card>
        </section>
      )}

      {!rangeError && permissions.includes("dashboard.atto.agentes") && agentes && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="size-4 text-muted-foreground" />
              Ranking de agentes
            </CardTitle>
            {!agentes.campaignFilterSupported && (
              <CardDescription>Este bloco não pode ser filtrado por campanha.</CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <TableControls prefix="agentes" total={agentes.total} page={agentes.page} pageSize={agentes.pageSize} q={agentesQ} />
            {agentes.ranking.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {agentesQ ? "Nenhum agente encontrado para essa busca." : "Sem dados no período."}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agente</TableHead>
                    <TableHead>Login</TableHead>
                    <TableHead>Atendimentos</TableHead>
                    <TableHead>Tempo médio de conversação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agentes.ranking.map((row) => (
                    <TableRow key={row.agentLogin}>
                      <TableCell className="font-medium">{row.agentName ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{row.agentLogin}</TableCell>
                      <TableCell className="tabular-nums">{row.answeredCalls}</TableCell>
                      <TableCell className="tabular-nums">{formatHMS(Math.round(row.avgTalkSeconds))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {!rangeError && permissions.includes("dashboard.atto.tempo") && tempo && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="size-4 text-muted-foreground" />
              Tempo logado e pausas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <TableControls prefix="tempo" total={tempo.total} page={tempo.page} pageSize={tempo.pageSize} q={tempoQ} />
            {tempo.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {tempoQ ? "Nenhum agente encontrado para essa busca." : "Sem dados no período."}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agente</TableHead>
                    <TableHead>Login</TableHead>
                    <TableHead>Tempo logado</TableHead>
                    <TableHead>Tempo em pausa</TableHead>
                    <TableHead>% em pausa</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tempo.items.map((row) => (
                    <TableRow key={row.agentLogin}>
                      <TableCell className="font-medium">{row.agentName ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{row.agentLogin}</TableCell>
                      <TableCell className="tabular-nums">{formatHMS(row.loggedSeconds)}</TableCell>
                      <TableCell className="tabular-nums">{formatHMS(row.pausedSeconds)}</TableCell>
                      <TableCell className="tabular-nums">
                        <Badge variant={row.pauseRate > 0.3 ? "destructive" : "secondary"}>
                          {(row.pauseRate * 100).toFixed(0)}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {!chamadas && !agentes && !tempo && !rangeError && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <TimerOff className="size-8" />
            Você não tem acesso a nenhum bloco do dashboard.
          </CardContent>
        </Card>
      )}
    </div>
  )
}
