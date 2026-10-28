import { z } from 'zod'

const positive = z.coerce.number().int().positive()
const optionalSecret = z.string().default('')
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production']),
  API_PORT: positive.max(65535),
  API_HOST: z.string().min(1),
  POSTGRES_USER: z.string().min(1),
  POSTGRES_PASSWORD: z.string().min(1),
  POSTGRES_DB: z.string().min(1),
  DATABASE_URL: z.url().refine(v => /^postgres(ql)?:/.test(v)),
  WEB_ORIGIN: z.url().refine(v => new URL(v).origin === v, 'Use somente a origem, sem caminho'),
  SESSION_TTL_HOURS: positive.max(720),
  COOKIE_SECURE: z.enum(['true', 'false']).transform(v => v === 'true'),
  LOGIN_RATE_LIMIT_MAX: positive,
  LOGIN_RATE_LIMIT_WINDOW: z.string().regex(/^\d+ (second|minute|hour)s?$/),
  API_INTERNAL_URL: z.url(),
  WEB_PORT: positive.max(65535),
  WEB_HOST: z.string().min(1),
  DB_PORT: positive.max(65535),
  ATTO_ADMIN_URL: z.url().default('https://cloud.attodigital.com/AttoSolution/WebAdmin/Services/AdminService.svc'),
  ATTO_SUPERVISION_URL: z.url().default('https://cloud.attodigital.com/AttoSolution/WebSupervision/Services/SupService.svc'),
  ATTO_LOGIN: optionalSecret,
  ATTO_PASSWORD: optionalSecret,
  ATTO_CUSTOMER_SID: z.string().trim().min(1),
  ATTO_TOKEN_ENC_KEY: z.string().min(1),
  ATTO_TOKEN_TTL_HOURS: positive.default(23),
  ATTO_LOGIN_MIN_INTERVAL_MINUTES: positive.min(60).default(60),
  ATTO_REQUEST_TIMEOUT_MS: positive.max(120000).default(15000),
  COLLECT_INTERVAL_MINUTES: positive.default(15),
  COLLECT_BACKFILL_DAYS: positive.default(7),
  COLLECT_CALLS_LOOKBACK_HOURS: positive.default(24),
  COLLECT_DELAY_AGENTS_MS: positive.min(6000).default(6000),
  COLLECT_DELAY_OTHERS_MS: positive.default(6000),
  COLLECT_DELAY_CALLS_MS: positive.min(15000).default(15000),
  APP_TIMEZONE: z.string().min(1).default('America/Sao_Paulo'),
  SEED_ADMIN_LOGIN: z.string().trim().min(1).default('admin'),
  SEED_ADMIN_PASSWORD: z.string().min(8).max(128).default('admin1234'),
}).superRefine((env, ctx) => {
  const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message })
  if (env.NODE_ENV === 'production' && !env.COOKIE_SECURE) issue('COOKIE_SECURE', 'Produção exige HTTPS e COOKIE_SECURE=true')
  if (!/^[A-Za-z0-9+/]{43}=$/.test(env.ATTO_TOKEN_ENC_KEY) || Buffer.from(env.ATTO_TOKEN_ENC_KEY, 'base64').length !== 32) {
    issue('ATTO_TOKEN_ENC_KEY', 'Informe 32 bytes em base64')
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
