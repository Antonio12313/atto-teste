import "server-only"
import { cache } from "react"
import { cookies } from "next/headers"
import { z } from "zod"

const sessionSchema = z.object({
  user: z.object({ id: z.uuid(), name: z.string(), email: z.email() }),
})
export const getSession = cache(async () => {
  const cookieStore = await cookies()
  const cookie = cookieStore.get("sid")
  if (!cookie) return null
  const response = await fetch(`${process.env.API_INTERNAL_URL}/auth/me`, {
    headers: { cookie: `${cookie.name}=${cookie.value}` },
    cache: "no-store",
  })
  if (response.status === 401) return null
  if (!response.ok)
    throw new Error("Não foi possível validar sua sessão. Tente novamente.")
  return sessionSchema.parse(await response.json()).user
})
