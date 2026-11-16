import fs from 'node:fs'
import { reportSourceStatus } from './source-coverage.mjs'
try {
  const status = JSON.parse(fs.readFileSync(process.argv[2] || '.local/routed-feed-status.json', 'utf8'))
  if (!Number.isFinite(Date.parse(status.attemptedAt))) throw new Error('Missing attempt timestamp')
  process.exitCode = reportSourceStatus(status.coverage).exitCode
} catch {
  console.error('::error title=Routed feed source coverage::Source status is missing or invalid; coverage cannot be confirmed.')
  process.exitCode = 1
}
