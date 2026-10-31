#!/usr/bin/env node
// HTML validity check for every published page, using html-validate and
// the rules in .htmlvalidate.json.
//
// Problems that already exist are recorded in .htmlvalidate-baseline.json
// (count per page per rule). The check fails when a page gains a problem
// that is not in the baseline, so CI stays green on today's pages but
// catches anything new. When pages are fixed, tighten the baseline with:
//
//   npm run html:baseline
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FileSystemConfigLoader, HtmlValidate } from 'html-validate';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const baselinePath = path.join(repoRoot, '.htmlvalidate-baseline.json');
const updateBaseline = process.argv.includes('--update-baseline');
const skipDirs = new Set(['.git', '.local', '.playwright-cli', 'design', 'node_modules']);

async function findPages(dir, out = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (skipDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await findPages(fullPath, out);
    } else if (entry.name.toLowerCase().endsWith('.html')) {
      out.push(fullPath);
    }
  }
  return out.sort();
}

function toRelative(filePath) {
  return path.relative(repoRoot, filePath).split(path.sep).join('/');
}

async function readBaseline() {
  try {
    return JSON.parse(await fs.readFile(baselinePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw new Error(`Could not read ${toRelative(baselinePath)}: ${error.message}`);
  }
}

async function main() {
  const htmlvalidate = new HtmlValidate(new FileSystemConfigLoader());
  const pages = await findPages(repoRoot);
  const counts = {};
  const messagesByKey = {};

  for (const page of pages) {
    const relative = toRelative(page);
    const report = await htmlvalidate.validateFile(page);
    for (const result of report.results) {
      for (const message of result.messages) {
        const key = `${relative} ${message.ruleId}`;
        counts[relative] ??= {};
        counts[relative][message.ruleId] = (counts[relative][message.ruleId] || 0) + 1;
        (messagesByKey[key] ??= []).push(`${relative}:${message.line}:${message.column} ${message.ruleId} ${message.message}`);
      }
    }
  }

  if (updateBaseline) {
    const sorted = Object.fromEntries(
      Object.keys(counts).sort().map((file) => [
        file,
        Object.fromEntries(Object.keys(counts[file]).sort().map((rule) => [rule, counts[file][rule]]))
      ])
    );
    await fs.writeFile(baselinePath, `${JSON.stringify(sorted, null, 2)}\n`);
    const total = Object.values(counts).reduce((sum, rules) => sum + Object.values(rules).reduce((a, b) => a + b, 0), 0);
    console.log(`Wrote ${toRelative(baselinePath)} with ${total} known problem(s) across ${Object.keys(counts).length} page(s).`);
    return;
  }

  const baseline = await readBaseline();
  const failures = [];
  const improvements = [];

  for (const [file, rules] of Object.entries(counts)) {
    for (const [rule, count] of Object.entries(rules)) {
      const allowed = baseline[file]?.[rule] || 0;
      if (count > allowed) {
        failures.push(`${file}: ${rule} has ${count} problem(s), baseline allows ${allowed}`);
        failures.push(...messagesByKey[`${file} ${rule}`].map((line) => `    ${line}`));
      }
    }
  }

  for (const [file, rules] of Object.entries(baseline)) {
    for (const [rule, allowed] of Object.entries(rules)) {
      const count = counts[file]?.[rule] || 0;
      if (count < allowed) improvements.push(`${file}: ${rule} now ${count}, baseline ${allowed}`);
    }
  }

  if (improvements.length > 0) {
    console.log(`HTML baseline can be tightened (run \`npm run html:baseline\`):\n${improvements.map((line) => `- ${line}`).join('\n')}`);
  }

  if (failures.length > 0) {
    console.error(`New HTML validation problems (not in ${toRelative(baselinePath)}):\n${failures.join('\n')}`);
    process.exit(1);
  }

  console.log(`HTML validation passed for ${pages.length} page(s).`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
