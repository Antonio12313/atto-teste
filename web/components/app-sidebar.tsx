"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, LockKeyhole, ShieldCheck, Users } from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { LogoutButton } from "@/components/logout-button"

const MAIN_ITEMS = [{ href: "/dashboard", label: "Dashboard", node: "dashboard", icon: LayoutDashboard }]
const ADMIN_ITEMS = [
  { href: "/admin/usuarios", label: "Usuários", node: "admin.usuarios", icon: Users },
  { href: "/admin/perfis", label: "Perfis", node: "admin.perfis", icon: ShieldCheck },
]

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1]![0] : "")).toUpperCase()
}

export function AppSidebar({
  name,
  attoLogin,
  permissions,
}: {
  name: string
  attoLogin: string
  permissions: string[]
}) {
  const pathname = usePathname()
  const mainItems = MAIN_ITEMS.filter((item) => permissions.includes(item.node))
  const adminItems = ADMIN_ITEMS.filter((item) => permissions.includes(item.node))

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <LockKeyhole className="size-5 shrink-0" />
          <span className="truncate text-sm font-semibold tracking-wide">Rede Fácil</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {mainItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Principal</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {mainItems.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={pathname === item.href}
                      render={
                        <Link href={item.href}>
                          <item.icon />
                          <span>{item.label}</span>
                        </Link>
                      }
                    />
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        {adminItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Administração</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminItems.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={pathname.startsWith(item.href)}
                      render={
                        <Link href={item.href}>
                          <item.icon />
                          <span>{item.label}</span>
                        </Link>
                      }
                    />
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center gap-2 overflow-hidden px-2 py-1.5">
          <Avatar className="size-7 shrink-0">
            <AvatarFallback className="text-xs">{initials(name)}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col text-xs">
            <span className="truncate font-medium">{name}</span>
            <span className="truncate text-muted-foreground">{attoLogin}</span>
          </div>
        </div>
        <LogoutButton />
      </SidebarFooter>
    </Sidebar>
  )
}
