import { redirect } from "next/navigation"
import { getSession } from "@/lib/session"
import { AppHeader } from "@/components/app-header"
import { LogoutButton } from "@/components/logout-button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()
  if (!session) redirect("/login")
  return (
    <div className="min-h-svh">
      <AppHeader name={session.name} permissions={session.permissions} />
      <main className="mx-auto max-w-6xl space-y-8 p-6 md:p-12">
        {session.permissions.length === 0 ? (
          <Card className="mx-auto max-w-md">
            <CardHeader className="text-center">
              <CardTitle>Nenhum acesso liberado</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-center text-muted-foreground">
              <p>
                Sua conta ainda não tem nenhuma permissão. Fale com um
                administrador para liberar o acesso.
              </p>
              <LogoutButton />
            </CardContent>
          </Card>
        ) : (
          children
        )}
      </main>
    </div>
  )
}
