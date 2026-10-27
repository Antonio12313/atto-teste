import { z } from 'zod'

const positive = z.coerce.number().int().positive()
const optionalSecret = z.string().default('')
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  API_PORT: positive.max(65535),
  API_HOST: z.string().min(1),
  POSTGRES_USER: z.string().min(1),
  POSTGRES_PASSWORD: z.string().min(1),
  POSTGRES_DB: z.string().min(1),
  DATABASE_URL: z.url().refine(v => /^postgres(ql)?:/.test(v)),
  DATABASE_URL_TEST: z.url().optional(),
  WEB_ORIGIN: z.url().refine(v => new URL(v).origin === v, 'Use somente a origem, sem caminho'),
  SESSION_TTL_HOURS: positive.max(720),
  COOKIE_SECURE: z.enum(['true', 'false']).transform(v => v === 'true'),
  LOGIN_RATE_LIMIT_MAX: positive,
  LOGIN_RATE_LIMIT_WINDOW: z.string().regex(/^\d+ (second|minute|hour)s?$/),
  ADMIN_NAME: z.string().trim().min(1),
  ADMIN_EMAIL: z.email().transform(v => v.trim().toLowerCase()),
  ADMIN_PASSWORD: z.string().min(12).max(128),
  API_INTERNAL_URL: z.url(),
  WEB_PORT: positive.max(65535),
  WEB_HOST: z.string().min(1),
  DB_PORT: positive.max(65535),
  ATTO_ADMIN_URL: z.url().default('https://cloud.attodigital.com/AttoSolution/WebAdmin/Services/AdminService.svc'),
  ATTO_SUPERVISION_URL: z.url().default('https://cloud.attodigital.com/AttoSolution/WebSupervision/Services/SupService.svc'),
  ATTO_LOGIN: optionalSecret,
  ATTO_PASSWORD: optionalSecret,
  ATTO_CUSTOMER_SID: optionalSecret,
  ATTO_TOKEN_ENC_KEY: optionalSecret,
  ATTO_TOKEN_TTL_HOURS: positive.default(23),
  ATTO_LOGIN_MIN_INTERVAL_MINUTES: positive.min(60).default(60),
  ATTO_REQUEST_TIMEOUT_MS: positive.max(120000).default(15000),
}).superRefine((env, ctx) => {
  const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message })
  if (env.NODE_ENV === 'production' && !env.COOKIE_SECURE) issue('COOKIE_SECURE', 'Produção exige HTTPS e COOKIE_SECURE=true')
  const key = env.ATTO_TOKEN_ENC_KEY
  if (key && (!/^[A-Za-z0-9+/]{43}=$/.test(key) || Buffer.from(key, 'base64').length !== 32)) issue('ATTO_TOKEN_ENC_KEY', 'Informe 32 bytes em base64')
  if (env.ATTO_LOGIN) {
    for (const name of ['ATTO_PASSWORD', 'ATTO_CUSTOMER_SID', 'ATTO_TOKEN_ENC_KEY'] as const) {
      if (!env[name]) issue(name, 'Obrigatório quando ATTO_LOGIN está preenchido')
    }
  }
})
export type Env = z.infer<typeof envSchema>
export function readEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source)
  if (!result.success) {
    throw new Error(`Configuração inválida. Confira: ${[...new Set(result.error.issues.map(i => i.path.join('.')))].join(', ')}`)
  }
  return result.data
}
