#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const digestDir = path.join(repoRoot, 'news-digests');
const manifestPath = path.join(digestDir, 'index.json');

const digestPattern = /^digest-\d{4}-\d{2}-\d{2}\.md$/;

async function main() {
  const entries = await fs.readdir(digestDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && digestPattern.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left));

  const manifest = {
    files
  };

  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`Updated ${manifestPath} with ${files.length} digest file(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
