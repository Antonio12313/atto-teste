import { redirect } from "next/navigation"
import { getSession } from "@/lib/session"
import { LogoutButton } from "@/components/logout-button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
export default async function DashboardPage() {
  const user = await getSession()
  if (!user) redirect("/login")
  return (
    <main className="mx-auto max-w-5xl space-y-8 p-6 md:p-12">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Olá, {user.name}</h1>
        <LogoutButton />
      </header>
      {/* As métricas da Atto serão adicionadas na próxima etapa. */}
      <Card>
        <CardHeader>
          <CardTitle>Seu dashboard</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground">
          Você está conectado. As métricas estarão disponíveis em uma próxima
          etapa.
        </CardContent>
      </Card>
    </main>
  )
}
