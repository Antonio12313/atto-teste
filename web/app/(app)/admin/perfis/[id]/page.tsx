import { getSession } from "@/lib/session"
import { serverApi } from "@/lib/server-api"
import { NoAccess } from "@/components/no-access"
import { RoleForm } from "@/components/admin/role-form"
import type { PermissionNode } from "@/components/permission-tree"

interface Role {
  id: string
  name: string
  description: string | null
  nodes: string[]
}

export default async function EditRolePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getSession()
  if (!session?.permissions.includes("admin.perfis")) return <NoAccess />
  const { id } = await params
  const [{ tree }, { roles }] = await Promise.all([
    serverApi<{ tree: PermissionNode[] }>("/admin/permissions/tree"),
    serverApi<{ roles: Role[] }>("/admin/roles"),
  ])
  const role = roles.find((r) => r.id === id)
  if (!role) return <p className="text-muted-foreground">Perfil não encontrado.</p>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Editar perfil</h1>
      <RoleForm tree={tree} initialRole={role} />
    </div>
  )
}
