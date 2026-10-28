"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  ChevronsUpDown,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  ShieldCheck,
  Users,
} from "lucide-react"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useLogout } from "@/components/logout-button"

const MAIN_ITEMS = [{ href: "/dashboard", label: "Dashboard", node: "dashboard", icon: LayoutDashboard }]
const ADMIN_ITEMS = [
  { href: "/admin/usuarios", label: "Usuários", node: "admin.usuarios", icon: Users },
  { href: "/admin/perfis", label: "Perfis", node: "admin.perfis", icon: ShieldCheck },
]

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1]![0] : "")).toUpperCase()
}

function hasAccess(permissions: string[], node: string): boolean {
  return permissions.some((p) => p === node || p.startsWith(`${node}.`))
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
  const mainItems = MAIN_ITEMS.filter((item) => hasAccess(permissions, item.node))
  const adminItems = ADMIN_ITEMS.filter((item) => hasAccess(permissions, item.node))
  const { logout, loading } = useLogout()

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
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <SidebarMenuButton
                size="lg"
                className="data-[popup-open]:bg-sidebar-accent data-[popup-open]:text-sidebar-accent-foreground"
                render={
                  <DropdownMenuTrigger>
                    <Avatar className="size-7 shrink-0">
                      <AvatarFallback className="text-xs">{initials(name)}</AvatarFallback>
                    </Avatar>
                    <div className="flex min-w-0 flex-col text-xs">
                      <span className="truncate font-medium">{name}</span>
                      <span className="truncate text-muted-foreground">{attoLogin}</span>
                    </div>
                    <ChevronsUpDown className="ml-auto size-4 shrink-0 text-muted-foreground" />
                  </DropdownMenuTrigger>
                }
              />
              <DropdownMenuContent side="top" align="end" sideOffset={4} className="min-w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{name}</span>
                      <span className="truncate text-muted-foreground">{attoLogin}</span>
                    </div>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={loading} onClick={logout} variant="destructive">
                  {loading ? <LoaderCircle className="animate-spin" /> : <LogOut />}
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
