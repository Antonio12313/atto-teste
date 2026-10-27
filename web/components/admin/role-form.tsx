"use client"
import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { LoaderCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  PermissionTreeView,
  buildParentMap,
  getAncestors,
  type PermissionNode,
} from "@/components/permission-tree"
import { api, ApiError } from "@/lib/api"

interface InitialRole {
  id: string
  name: string
  description: string | null
  nodes: string[]
}

export function RoleForm({
  tree,
  initialRole,
}: {
  tree: PermissionNode[]
  initialRole?: InitialRole
}) {
  const router = useRouter()
  const [name, setName] = useState(initialRole?.name ?? "")
  const [description, setDescription] = useState(initialRole?.description ?? "")
  const [selected, setSelected] = useState<Set<string>>(
    new Set(initialRole?.nodes ?? [])
  )
  const [saving, setSaving] = useState(false)
  const parentMap = useMemo(() => buildParentMap(tree), [tree])

  function toggle(nodeId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return next
    })
  }
  function isInherited(nodeId: string) {
    return getAncestors(nodeId, parentMap)
      .slice(1)
      .some((ancestor) => selected.has(ancestor))
  }

  async function save() {
    setSaving(true)
    try {
      const body = { name, description: description.trim() || null, nodes: [...selected] }
      if (initialRole) {
        await api(`/admin/roles/${initialRole.id}`, { method: "PATCH", body })
        toast.success("Perfil atualizado.")
      } else {
        await api("/admin/roles", { body })
        toast.success("Perfil criado.")
      }
      router.push("/admin/perfis")
      router.refresh()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Não foi possível salvar.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="role-name">Nome</Label>
          <Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="role-description">Descrição</Label>
          <Input
            id="role-description"
            value={description ?? ""}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Permissões liberadas</Label>
        <div className="rounded-md border p-4">
          <PermissionTreeView
            tree={tree}
            renderControl={(node) => {
              const explicit = selected.has(node.id)
              const inherited = !explicit && isInherited(node.id)
              return (
                <Checkbox
                  checked={explicit || inherited}
                  disabled={inherited}
                  onCheckedChange={() => toggle(node.id)}
                />
              )
            }}
            renderExtra={(node) => {
              const explicit = selected.has(node.id)
              const inherited = !explicit && isInherited(node.id)
              return inherited ? <Badge variant="secondary">Herdado</Badge> : null
            }}
          />
        </div>
      </div>
      <Button onClick={save} disabled={saving || !name.trim()}>
        {saving ? <LoaderCircle className="animate-spin" /> : null} Salvar
      </Button>
    </div>
  )
}
