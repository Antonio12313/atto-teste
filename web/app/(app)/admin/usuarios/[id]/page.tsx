import { getSession } from "@/lib/session"
import { serverApi, ServerApiError } from "@/lib/server-api"
import { NoAccess } from "@/components/no-access"
import { UserForm, type UserDetail } from "@/components/admin/user-form"
import type { PermissionNode } from "@/components/permission-tree"

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getSession()
  if (!session?.permissions.includes("admin.usuarios")) return <NoAccess />
  const { id } = await params

  let data: { tree: PermissionNode[]; roles: Array<{ id: string; name: string }>; detail: UserDetail } | null = null
  try {
    const [{ tree }, { roles }, detail] = await Promise.all([
      serverApi<{ tree: PermissionNode[] }>("/admin/permissions/tree"),
      serverApi<{ roles: Array<{ id: string; name: string }> }>("/admin/roles/options"),
      serverApi<UserDetail>(`/admin/users/${id}`),
    ])
    data = { tree, roles, detail }
  } catch (error) {
    if (!(error instanceof ServerApiError && error.status === 404)) throw error
  }

  if (!data) return <p className="text-muted-foreground">Usuário não encontrado.</p>
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Editar usuário</h1>
      <UserForm tree={data.tree} roleOptions={data.roles} initial={data.detail} />
    </div>
  )
}
