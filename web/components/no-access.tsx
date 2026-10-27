import { ShieldAlert } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function NoAccess() {
  return (
    <Card className="mx-auto max-w-md">
      <CardHeader className="items-center text-center">
        <ShieldAlert className="size-8 text-muted-foreground" />
        <CardTitle>Sem acesso</CardTitle>
      </CardHeader>
      <CardContent className="text-center text-muted-foreground">
        Você não tem permissão para acessar esta página. Fale com um
        administrador se achar que isso é um engano.
      </CardContent>
    </Card>
  )
}
