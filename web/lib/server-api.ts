import "server-only"
import { cookies } from "next/headers"

export class ServerApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message)
  }
}

export async function serverApi<T>(path: string): Promise<T> {
  const cookieStore = await cookies()
  const cookie = cookieStore.get("sid")
  const response = await fetch(`${process.env.API_INTERNAL_URL}${path}`, {
    headers: cookie ? { cookie: `${cookie.name}=${cookie.value}` } : {},
    cache: "no-store",
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      data && typeof data.message === "string"
        ? data.message
        : "Não foi possível carregar os dados."
    throw new ServerApiError(response.status, message)
  }
  return data as T
}
