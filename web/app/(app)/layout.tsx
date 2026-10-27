import { redirect } from "next/navigation"
import { getSession } from "@/lib/session"
export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  if (!(await getSession())) redirect("/login")
  return <>{children}</>
}
