#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const digestDir = path.join(repoRoot, 'news-digests');
const manifestPath = path.join(digestDir, 'index.json');
const checkOnly = process.argv.includes('--check');

const digestPattern = /^digest-\d{4}-\d{2}-\d{2}\.md$/;

async function buildManifest() {
  const entries = await fs.readdir(digestDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && digestPattern.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left));

  return `${JSON.stringify({ files }, null, 2)}\n`;
}

async function main() {
  const manifest = await buildManifest();

  if (checkOnly) {
    const current = await fs.readFile(manifestPath, 'utf8');
    if (current.trim() !== manifest.trim()) {
      throw new Error('news-digests/index.json is out of date. Run `npm run manifest:update`.');
    }
    return;
  }

  await fs.writeFile(manifestPath, manifest, 'utf8');
  console.log(`Updated ${manifestPath}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
