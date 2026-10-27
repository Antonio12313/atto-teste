import Fastify from 'fastify'
import type { FastifyServerOptions } from 'fastify'
import cookie from '@fastify/cookie'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import type { Database } from './db/client.js'
import type { Env } from './config/env.js'
import { registerAuth } from './plugins/auth.js'
import { authRoutes } from './modules/auth/routes.js'

export const redactPaths = ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]', '*.password', '*.token', 'password', 'token', 'jwt', '*.jwt', 'Authorization', '*.Authorization', 'Login', 'Password', '*.Password']
export async function buildApp({ db, env, logger = true }: { db: Database; env: Env; logger?: FastifyServerOptions['logger'] }) {
  const app = Fastify({
    trustProxy: false, bodyLimit: 16384,
    logger: logger === false ? false : { ...(typeof logger === 'object' ? logger : {}), redact: redactPaths },
  })
  await app.register(cookie)
  await app.register(helmet)
  await app.register(rateLimit, { global: false })
  app.addHook('onRequest', async (request, reply) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
      if (request.headers.origin && request.headers.origin !== env.WEB_ORIGIN) {
        return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Origem não permitida.' })
      }
      if (request.headers['content-type']?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
        return reply.code(415).send({ statusCode: 415, error: 'Unsupported Media Type', message: 'Use Content-Type: application/json.' })
      }
    }
  })
  app.addHook('onSend', async (request, reply) => {
    if (request.url.startsWith('/auth/')) reply.header('Cache-Control', 'no-store')
  })
  app.setErrorHandler((error, request, reply) => {
    const e = error as { statusCode?: number; validation?: unknown }
    const status = e.validation ? 400 : (e.statusCode && e.statusCode >= 400 && e.statusCode < 500 ? e.statusCode : 500)
    const messages: Record<number, [string, string]> = {
      400: ['Bad Request', 'Dados inválidos.'], 401: ['Unauthorized', 'Autenticação necessária.'],
      403: ['Forbidden', 'Acesso negado.'], 429: ['Too Many Requests', 'Muitas tentativas. Tente novamente em instantes.'],
      415: ['Unsupported Media Type', 'Use Content-Type: application/json.'],
    }
    const [name, message] = messages[status] ?? ['Internal Server Error', 'Não foi possível processar a solicitação.']
    if (status >= 500) request.log.error({ event: 'request_failed', requestId: request.id }, 'Falha interna')
    reply.code(status).send({ statusCode: status, error: name, message })
  })
  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Rota não encontrada.' }))
  registerAuth(app, db, env)
  await authRoutes(app, db, env)
  app.get('/health', async () => ({ status: 'ok' }))
  return app
}
