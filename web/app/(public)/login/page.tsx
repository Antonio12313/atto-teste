import { redirect } from "next/navigation"
import { LockKeyhole } from "lucide-react"
import { getSession } from "@/lib/session"
import { safeNext } from "@/lib/safe-next"
import { LoginForm } from "@/components/login-form"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  if (await getSession()) redirect("/dashboard")
  const next = safeNext((await searchParams).next)
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center justify-center gap-2 text-sm font-semibold tracking-wide">
          <LockKeyhole className="size-5" /> Rede Fácil
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Acesse sua conta</CardTitle>
            <CardDescription>
              Entre com seu e-mail e senha para continuar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm next={next} />
          </CardContent>
        </Card>
        <p className="text-center text-xs text-muted-foreground">
          Acesso restrito a usuários autorizados.
        </p>
      </div>
    </main>
  )
}
