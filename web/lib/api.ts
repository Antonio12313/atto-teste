export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message)
  }
}

export async function api<T = undefined>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const method = options.method ?? "POST"
  const isMutating = method !== "GET"
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: isMutating ? { "Content-Type": "application/json" } : {},
      body: isMutating ? JSON.stringify(options.body ?? {}) : undefined,
    })
  } catch {
    throw new ApiError(
      0,
      "Não foi possível conectar. Verifique sua conexão e tente novamente."
    )
  }
  if (response.status === 204) return undefined as T
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      data && typeof data.message === "string"
        ? data.message
        : "Não foi possível concluir. Tente novamente em instantes."
    throw new ApiError(response.status, message)
  }
  return data as T
}
