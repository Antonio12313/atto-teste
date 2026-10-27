"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { LoaderCircle, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  const [attoLogin, setAttoLogin] = useState("")
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)

  async function create() {
    setSaving(true)
    try {
      const created = await api<{ user: { id: string } }>("/admin/users", {
        body: { attoLogin, name: name.trim() || undefined },
      })
      toast.success("Usuário pré-cadastrado. A senha é a conta da Atto.")
      setOpen(false)
      setAttoLogin("")
      setName("")
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
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-user-login">Login da Atto</Label>
            <Input
              id="new-user-login"
              value={attoLogin}
              onChange={(e) => setAttoLogin(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-user-name">Nome (opcional)</Label>
            <Input id="new-user-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">
            Não há senha aqui: a senha é a da conta Atto. O primeiro login
            dessa pessoa completa os dados pelo que a Atto devolver.
          </p>
        </div>
        <DialogFooter>
          <Button onClick={create} disabled={saving || !attoLogin.trim()}>
            {saving ? <LoaderCircle className="animate-spin" /> : null} Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
