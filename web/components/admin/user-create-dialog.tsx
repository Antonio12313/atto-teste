"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { LoaderCircle, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { api, ApiError } from "@/lib/api"

export function UserCreateDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<"atto" | "local">("atto")
  const [attoLogin, setAttoLogin] = useState("")
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [saving, setSaving] = useState(false)

  const isLocal = kind === "local"
  const canSave = attoLogin.trim().length > 0 && (!isLocal || password.length >= 8)

  async function create() {
    setSaving(true)
    try {
      const created = await api<{ user: { id: string } }>("/admin/users", {
        body: {
          attoLogin,
          name: name.trim() || undefined,
          password: isLocal ? password : undefined,
        },
      })
      toast.success(isLocal ? "Usuário local criado." : "Usuário pré-cadastrado. A senha é a da conta Atto.")
      setOpen(false)
      setAttoLogin("")
      setName("")
      setPassword("")
      router.push(`/admin/usuarios/${created.user.id}`)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Não foi possível criar o usuário.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button>
            <Plus /> Novo usuário
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo usuário</DialogTitle>
        </DialogHeader>
        <Tabs value={kind} onValueChange={(v) => setKind(v as "atto" | "local")}>
          <TabsList className="w-full">
            <TabsTrigger value="atto" className="flex-1">
              Conta Atto
            </TabsTrigger>
            <TabsTrigger value="local" className="flex-1">
              Conta local
            </TabsTrigger>
          </TabsList>
          <TabsContent value="atto" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="new-user-login">Login da Atto</Label>
              <Input id="new-user-login" value={attoLogin} onChange={(e) => setAttoLogin(e.target.value)} autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-user-name">Nome (opcional)</Label>
              <Input id="new-user-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              Sem senha aqui: a senha é a da conta Atto. O primeiro login dessa
              pessoa completa os dados com o que a Atto devolver.
            </p>
          </TabsContent>
          <TabsContent value="local" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="new-local-login">Login</Label>
              <Input id="new-local-login" value={attoLogin} onChange={(e) => setAttoLogin(e.target.value)} autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-local-name">Nome</Label>
              <Input id="new-local-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-local-password">Senha</Label>
              <Input
                id="new-local-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Conta própria do sistema, sem vínculo com a Atto — login e senha
              definidos aqui. Mínimo de 8 caracteres.
            </p>
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button onClick={create} disabled={saving || !canSave}>
            {saving ? <LoaderCircle className="animate-spin" /> : null} Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
