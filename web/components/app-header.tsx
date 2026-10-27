import Link from "next/link"
import { LockKeyhole } from "lucide-react"
import { LogoutButton } from "@/components/logout-button"

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", node: "dashboard" },
  { href: "/admin/usuarios", label: "Usuários", node: "admin.usuarios" },
  { href: "/admin/perfis", label: "Perfis", node: "admin.perfis" },
]

export function AppHeader({
  name,
  permissions,
}: {
  name: string
  permissions: string[]
}) {
  const items = NAV_ITEMS.filter((item) => permissions.includes(item.node))
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b p-4 md:px-12">
      <div className="flex flex-wrap items-center gap-6">
        <span className="flex items-center gap-2 text-sm font-semibold tracking-wide">
          <LockKeyhole className="size-5" /> Rede Fácil
        </span>
        <nav className="flex items-center gap-4 text-sm text-muted-foreground">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm text-muted-foreground">Olá, {name}</span>
        <LogoutButton />
      </div>
    </header>
  )
}
