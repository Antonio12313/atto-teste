import Link from "next/link"
import { getSession } from "@/lib/session"
import { serverApi } from "@/lib/server-api"
import { NoAccess } from "@/components/no-access"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface Role {
  id: string
  name: string
  description: string | null
  nodes: string[]
}

export default async function RolesPage() {
  const session = await getSession()
  if (!session?.permissions.includes("admin.perfis")) return <NoAccess />
  const { roles } = await serverApi<{ roles: Role[] }>("/admin/roles")

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Perfis</h1>
        <Button render={<Link href="/admin/perfis/novo">Novo perfil</Link>} />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Descrição</TableHead>
            <TableHead>Permissões</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {roles.map((role) => (
            <TableRow key={role.id}>
              <TableCell className="font-medium">{role.name}</TableCell>
              <TableCell className="text-muted-foreground">
                {role.description ?? "—"}
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {role.nodes.map((node) => (
                    <Badge key={node} variant="secondary">
                      {node}
                    </Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell>
                <Button
                  variant="outline"
                  size="sm"
                  render={<Link href={`/admin/perfis/${role.id}`}>Editar</Link>}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
