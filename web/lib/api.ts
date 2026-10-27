export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message)
  }
}
export async function api(path: string, body: unknown) {
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  } catch {
    throw new ApiError(
      0,
      "Não foi possível conectar. Verifique sua conexão e tente novamente."
    )
  }
  if (!response.ok) {
    const messages: Record<number, string> = {
      401: "Usuário ou senha inválidos.",
      429: "Muitas tentativas. Tente novamente mais tarde.",
      503: "Serviço de autenticação indisponível. Tente novamente em instantes.",
    }
    throw new ApiError(
      response.status,
      messages[response.status] ??
        "Não foi possível concluir. Tente novamente em instantes."
    )
  }
}
