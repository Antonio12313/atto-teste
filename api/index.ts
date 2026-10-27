import fastify from 'fastify'

const server = fastify()

server.get('/', async (request, reply) => {
  return { message: 'API funcionando!' }
})


const port = Number(process.env.PORT)
const host = process.env.HOST

if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('Configure HOST e PORT (1–65535) nas variáveis de ambiente.')
}

server.listen({ port, host }, (err, address) => {
  if (err) {
    console.error(err)
    process.exit(1)
  }
  console.log(`Server listening at ${address}`)
})
