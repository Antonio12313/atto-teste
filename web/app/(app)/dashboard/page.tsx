import { getSession } from "@/lib/session"
import { serverApi, ServerApiError } from "@/lib/server-api"
import { NoAccess } from "@/components/no-access"
import { DashboardFilters } from "@/components/dashboard/filters"
import { CallsByHourChart } from "@/components/dashboard/calls-chart"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
  ranking: Array<{ agentLogin: string; answeredCalls: number; avgTalkSeconds: number }>
  campaignFilterSupported: boolean
}
interface TempoResponse {
  items: Array<{ agentLogin: string; loggedSeconds: number; pausedSeconds: number }>
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
  searchParams: Promise<{ from?: string; to?: string; campaignId?: string }>
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

  let meta: MetaResponse
  let chamadas: ChamadasResponse | null = null
  let agentes: AgentesResponse | null = null
  let tempo: TempoResponse | null = null
  let rangeError: string | null = null
  try {
    meta = await serverApi<MetaResponse>("/dashboard/atto/meta")
    const query = new URLSearchParams({ from, to, ...(campaignId ? { campaignId } : {}) }).toString()
    const simpleQuery = new URLSearchParams({ from, to }).toString()
    const [chamadasResult, agentesResult, tempoResult] = await Promise.all([
      permissions.includes("dashboard.atto.chamadas") ? serverApi<ChamadasResponse>(`/dashboard/atto/chamadas?${query}`) : Promise.resolve(null),
      permissions.includes("dashboard.atto.agentes") ? serverApi<AgentesResponse>(`/dashboard/atto/agentes?${simpleQuery}`) : Promise.resolve(null),
      permissions.includes("dashboard.atto.tempo") ? serverApi<TempoResponse>(`/dashboard/atto/tempo?${query}`) : Promise.resolve(null),
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
            ? `Atualizado em ${new Date(meta.updatedAt).toLocaleString("pt-BR")}`
            : "Ainda sem coleta registrada."}
        </p>
      </div>

      <DashboardFilters from={from} to={to} campaignId={campaignId} campaigns={meta.campaigns} />

      {rangeError && (
        <p className="text-sm text-destructive" role="alert">
          {rangeError}
        </p>
      )}

      {!rangeError && permissions.includes("dashboard.atto.chamadas") && chamadas && (
        <Card>
          <CardHeader>
            <CardTitle>Chamadas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-sm text-muted-foreground">Tentativas</p>
                <p className="text-2xl font-semibold">{chamadas.attempts}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Atendidas</p>
                <p className="text-2xl font-semibold">{chamadas.answered}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Taxa de atendimento</p>
                <p className="text-2xl font-semibold">{(chamadas.answerRate * 100).toFixed(1)}%</p>
              </div>
            </div>
            {chamadas.attempts === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados no período.</p>
            ) : (
              <CallsByHourChart data={chamadas.byHour} />
            )}
          </CardContent>
        </Card>
      )}

      {!rangeError && permissions.includes("dashboard.atto.agentes") && agentes && (
        <Card>
          <CardHeader>
            <CardTitle>Agentes</CardTitle>
            {!agentes.campaignFilterSupported && (
              <p className="text-xs text-muted-foreground">
                Este bloco não pode ser filtrado por campanha.
              </p>
            )}
          </CardHeader>
          <CardContent>
            {agentes.ranking.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados no período.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agente</TableHead>
                    <TableHead>Atendimentos</TableHead>
                    <TableHead>Tempo médio de conversação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agentes.ranking.map((row) => (
                    <TableRow key={row.agentLogin}>
                      <TableCell>{row.agentLogin}</TableCell>
                      <TableCell>{row.answeredCalls}</TableCell>
                      <TableCell>{formatHMS(Math.round(row.avgTalkSeconds))}</TableCell>
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
            <CardTitle>Tempo logado e pausas</CardTitle>
          </CardHeader>
          <CardContent>
            {tempo.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados no período.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agente</TableHead>
                    <TableHead>Tempo logado</TableHead>
                    <TableHead>Tempo em pausa</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tempo.items.map((row) => (
                    <TableRow key={row.agentLogin}>
                      <TableCell>{row.agentLogin}</TableCell>
                      <TableCell>{formatHMS(row.loggedSeconds)}</TableCell>
                      <TableCell>{formatHMS(row.pausedSeconds)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {!chamadas && !agentes && !tempo && !rangeError && (
        <p className="text-sm text-muted-foreground">
          Você não tem acesso a nenhum bloco do dashboard.
        </p>
      )}
    </div>
  )
}
