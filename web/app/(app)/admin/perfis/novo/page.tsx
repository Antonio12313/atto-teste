import { getSession } from "@/lib/session"
import { serverApi } from "@/lib/server-api"
import { NoAccess } from "@/components/no-access"
import { RoleForm } from "@/components/admin/role-form"
import type { PermissionNode } from "@/components/permission-tree"

export default async function NewRolePage() {
  const session = await getSession()
  if (!session?.permissions.includes("admin.perfis")) return <NoAccess />
  const { tree } = await serverApi<{ tree: PermissionNode[] }>(
    "/admin/permissions/tree"
  )
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Novo perfil</h1>
      <RoleForm tree={tree} />
    </div>
  )
}
