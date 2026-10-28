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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PermissionTreeView, flattenTree, type PermissionNode } from "@/components/permission-tree"
import { api, ApiError } from "@/lib/api"

type Effect = "allow" | "deny"
const RULE_LABELS: Record<"none" | Effect, string> = { none: "Sem regra", allow: "Conceder", deny: "Negar" }
export interface EffectiveEntry {
  node: string
  allowed: boolean
  source: "individual" | "role" | "none"
  fromNode: string
  roleNames?: string[]
}
export interface UserDetail {
  user: {
    id: string
    attoLogin: string
    name: string
    isActive: boolean
    isLocal: boolean
    isRoot: boolean
    lastLoginAt: string | null
    createdAt: string
  }
  roleIds: string[]
  individual: Array<{ node: string; effect: Effect }>
  effective: EffectiveEntry[]
}

export function UserForm({
  tree,
  roleOptions,
  initial,
}: {
  tree: PermissionNode[]
  roleOptions: Array<{ id: string; name: string }>
  initial: UserDetail
}) {
  const router = useRouter()
  const [name, setName] = useState(initial.user.name)
  const [isActive, setIsActive] = useState(initial.user.isActive)
  const [roleIds, setRoleIds] = useState<Set<string>>(new Set(initial.roleIds))
  const [individual, setIndividual] = useState<Map<string, Effect>>(
    new Map(initial.individual.map((rule) => [rule.node, rule.effect]))
  )
  const [effective, setEffective] = useState(initial.effective)
  const [newPassword, setNewPassword] = useState("")
  const [saving, setSaving] = useState(false)

  const effectiveByNode = useMemo(() => new Map(effective.map((entry) => [entry.node, entry])), [effective])
  const labelByNode = useMemo(() => new Map(flattenTree(tree).map((node) => [node.id, node.label])), [tree])

  function toggleRole(roleId: string) {
    setRoleIds((prev) => {
      const next = new Set(prev)
      if (next.has(roleId)) next.delete(roleId)
      else next.add(roleId)
      return next
    })
  }
  function setRule(node: string, value: "none" | Effect) {
    setIndividual((prev) => {
      const next = new Map(prev)
      if (value === "none") next.delete(node)
      else next.set(node, value)
      return next
    })
  }
  function originLabel(entry: EffectiveEntry): string {
    const fromLabel = labelByNode.get(entry.fromNode) ?? entry.fromNode
    if (entry.source === "none") return "Sem regra (bloqueado)"
    if (entry.source === "individual") {
      return entry.fromNode === entry.node ? "Individual" : `Individual herdado de ${fromLabel}`
    }
    const roles = entry.roleNames?.join(", ") ?? ""
    return entry.fromNode === entry.node
      ? `Perfil ${roles}`
      : `Herdado de ${fromLabel} (perfil ${roles})`
  }

  async function save() {
    setSaving(true)
    try {
      const body = {
        name,
        isActive,
        roleIds: [...roleIds],
        individual: [...individual.entries()].map(([node, effect]) => ({ node, effect })),
        ...(initial.user.isLocal && newPassword ? { password: newPassword } : {}),
      }
      const updated = await api<UserDetail>(`/admin/users/${initial.user.id}`, { method: "PATCH", body })
      setEffective(updated.effective)
      setNewPassword("")
      toast.success("Usuário atualizado.")
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
          <Label>Login</Label>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            {initial.user.attoLogin}
            <Badge variant="outline">{initial.user.isLocal ? "Local" : "Atto"}</Badge>
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="user-name">Nome</Label>
          <Input id="user-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
      </div>

      {initial.user.isLocal && (
        <div className="space-y-2">
          <Label htmlFor="user-new-password">Nova senha</Label>
          <Input
            id="user-new-password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Deixe em branco para manter a atual"
            className="max-w-sm"
          />
        </div>
      )}

      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={isActive} onCheckedChange={(checked) => setIsActive(checked === true)} />
        Ativo
      </label>

      <div className="space-y-2">
        <Label>Perfis</Label>
        <div className="flex flex-wrap gap-4 rounded-md border p-4">
          {roleOptions.map((role) => (
            <label key={role.id} className="flex items-center gap-2 text-sm">
              <Checkbox checked={roleIds.has(role.id)} onCheckedChange={() => toggleRole(role.id)} />
              {role.name}
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Permissões individuais</Label>
        <div className="rounded-md border p-4">
          <PermissionTreeView
            tree={tree}
            renderControl={(node) => {
              const value = individual.get(node.id) ?? "none"
              return (
                <Select value={value} onValueChange={(v) => setRule(node.id, v as "none" | Effect)}>
                  <SelectTrigger size="sm" className="w-32">
                    <SelectValue>{(v: string) => RULE_LABELS[v as "none" | Effect]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem regra</SelectItem>
                    <SelectItem value="allow">Conceder</SelectItem>
                    <SelectItem value="deny">Negar</SelectItem>
                  </SelectContent>
                </Select>
              )
            }}
            renderExtra={(node) => {
              const entry = effectiveByNode.get(node.id)
              if (!entry) return null
              return (
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant={entry.allowed ? "default" : "secondary"}>
                    {entry.allowed ? "Liberado" : "Bloqueado"}
                  </Badge>
                  {originLabel(entry)}
                </span>
              )
            }}
          />
        </div>
      </div>

      <Button onClick={save} disabled={saving}>
        {saving ? <LoaderCircle className="animate-spin" /> : null} Salvar
      </Button>
    </div>
  )
}
