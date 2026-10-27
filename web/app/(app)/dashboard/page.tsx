import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default async function DashboardPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      {/* Blocos com dados reais da Atto são adicionados em uma próxima etapa. */}
      <Card>
        <CardHeader>
          <CardTitle>Seu dashboard</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground">
          As métricas estarão disponíveis em uma próxima etapa.
        </CardContent>
      </Card>
    </>
  )
}
