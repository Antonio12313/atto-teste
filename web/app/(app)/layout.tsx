import { redirect } from "next/navigation"
import { getSession } from "@/lib/session"
import { AppSidebar } from "@/components/app-sidebar"
import { LogoutButton } from "@/components/logout-button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()
  if (!session) redirect("/login")

  if (session.permissions.length === 0) {
    return (
      <main className="flex min-h-svh items-center justify-center p-6">
        <Card className="w-full max-w-md">
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
      </main>
    )
  }

  return (
    <SidebarProvider>
      <AppSidebar
        name={session.name}
        attoLogin={session.atto_login}
        permissions={session.permissions}
      />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-5" />
          <span className="text-sm font-medium text-muted-foreground">
            Rede Fácil
          </span>
        </header>
        <main className="flex-1 space-y-6 p-6 md:p-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
