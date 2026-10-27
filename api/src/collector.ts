import { readEnv } from './config/env.js'
import { createDatabase } from './db/client.js'
import { runCollection } from './collector/run.js'

const env = readEnv()
const { db, sql } = createDatabase(env.DATABASE_URL)
const once = process.argv.includes('--once')

let running = false
async function tick(trigger: 'scheduled' | 'once') {
  if (running) {
    console.log(JSON.stringify({ event: 'collect_overlap_skipped' }))
    return
  }
  running = true
  try {
    await runCollection(db, env, {}, trigger)
  } finally {
    running = false
  }
}

async function main() {
  await tick(once ? 'once' : 'scheduled')
  if (once) {
    await sql.end()
    return
  }
  const timer = setInterval(() => { void tick('scheduled') }, env.COLLECT_INTERVAL_MINUTES * 60_000)
  timer.unref()
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => { clearInterval(timer); void sql.end().then(() => process.exit(0)) })
  }
}

main().catch(error => {
  console.error('Coletor não iniciou.', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
