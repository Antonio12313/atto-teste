export class AttoInvalidCredentialsError extends Error {
  constructor() { super('Credenciais recusadas pela Atto.') }
}
export class AttoRateLimitedError extends Error {
  constructor() { super('Atto sinalizou limite de requisições de login.') }
}
export class AttoServiceUnavailableError extends Error {
  constructor() { super('Falha ao contatar o serviço da Atto.') }
}

export interface AttoSignInResult {
  sid: string
  customerSid: string
  login: string
  name: string
  surname: string
  isRoot: boolean
  roles: string[]
  jwt: string
}

export async function signIn(login: string, password: string, options: {
  adminUrl: string
  timeoutMs: number
  fetch?: typeof globalThis.fetch
}): Promise<AttoSignInResult> {
  const request = options.fetch ?? globalThis.fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs)
  let response: Response
  try {
    response = await request(`${options.adminUrl.replace(/\/$/, '')}/Login/SignIn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Login: login, Password: password }),
      signal: controller.signal,
      redirect: 'error',
    })
  } catch {
    throw new AttoServiceUnavailableError()
  } finally {
    clearTimeout(timer)
  }
  if (response.status === 429) throw new AttoRateLimitedError()
  if (response.status >= 500) throw new AttoServiceUnavailableError()
  if (response.status !== 200) throw new AttoInvalidCredentialsError()

  let body: unknown
  try { body = await response.json() } catch { throw new AttoServiceUnavailableError() }
  if (!body || typeof body !== 'object') throw new AttoServiceUnavailableError()
  const payload = body as Record<string, unknown>
  if (payload.Error != null) throw new AttoInvalidCredentialsError()
  if (typeof payload.jwt !== 'string' || !payload.jwt || typeof payload.CustomerSid !== 'string') {
    throw new AttoServiceUnavailableError()
  }
  return {
    sid: typeof payload.Sid === 'string' ? payload.Sid : '',
    customerSid: payload.CustomerSid,
    login: typeof payload.Login === 'string' ? payload.Login : login,
    name: typeof payload.Name === 'string' ? payload.Name : '',
    surname: typeof payload.Surname === 'string' ? payload.Surname : '',
    isRoot: payload.ROOT === true,
    roles: Array.isArray(payload.Roles) ? payload.Roles.map(String) : [],
    jwt: payload.jwt,
  }
}
