import Link from "next/link"
import { getSession } from "@/lib/session"
import { serverApi } from "@/lib/server-api"
import { formatDateTime } from "@/lib/format"
import { NoAccess } from "@/components/no-access"
import { UserCreateDialog } from "@/components/admin/user-create-dialog"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface UserRow {
  id: string
  attoLogin: string
  name: string
  isActive: boolean
  isLocal: boolean
  roles: string[]
  lastLoginAt: string | null
}

export default async function UsersPage() {
  const session = await getSession()
  if (!session?.permissions.includes("admin.usuarios")) return <NoAccess />
  const { users } = await serverApi<{ users: UserRow[] }>("/admin/users")

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Usuários</h1>
        <UserCreateDialog />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Login</TableHead>
            <TableHead>Conta</TableHead>
            <TableHead>Perfis</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Último login</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="font-medium">{user.name}</TableCell>
              <TableCell className="text-muted-foreground">{user.attoLogin}</TableCell>
              <TableCell>
                <Badge variant="outline">{user.isLocal ? "Local" : "Atto"}</Badge>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {user.roles.length
                    ? user.roles.map((role) => <Badge key={role} variant="secondary">{role}</Badge>)
                    : <span className="text-muted-foreground">—</span>}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={user.isActive ? "default" : "secondary"}>
                  {user.isActive ? "Ativo" : "Inativo"}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "Nunca"}
              </TableCell>
              <TableCell>
                <Link href={`/admin/usuarios/${user.id}`} className="text-sm underline-offset-4 hover:underline">
                  Editar
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
