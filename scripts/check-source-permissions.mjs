import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { compileRegistry, assertPublishedItem } from '../source-permissions.mjs'

export function checkSourcePermissions(root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')) {
  const registry = compileRegistry(JSON.parse(fs.readFileSync(path.join(root, 'launch/source-permissions.json'), 'utf8')))
  const feed = JSON.parse(fs.readFileSync(path.join(root, 'news-digests/news-feed-latest.json'), 'utf8'))
  if (!Array.isArray(feed.articles)) throw new Error('Published routed feed is missing articles.')
  for (const article of feed.articles) assertPublishedItem(article, registry)
  let archived = 0
  for (const file of fs.readdirSync(path.join(root, 'news-digests')).filter(file => /^digest-.*\.md$/.test(file))) {
    const markdown = fs.readFileSync(path.join(root, 'news-digests', file), 'utf8')
    for (const match of markdown.matchAll(/^\*([^*\r\n]+)\*\s+\|.*Score:/gm)) {
      if (!registry.has(match[1])) throw new Error(`Archive source missing from registry: ${match[1]} (${file}).`)
      archived++
    }
  }
  console.log(`Source permissions passed: ${registry.size} labels, ${feed.articles.length} routed items, ${archived} archive records checked. Archive cards apply the same field rules at render time.`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { checkSourcePermissions() } catch (error) { console.error(error.message); process.exitCode = 1 }
}
