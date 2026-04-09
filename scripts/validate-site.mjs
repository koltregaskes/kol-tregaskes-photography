#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const requiredFiles = [
  'package.json',
  'CNAME',
  'sitemap.xml',
  'site.webmanifest',
  'robots.txt',
  'news-digests/index.json',
  'favicon.svg',
  'favicon.ico',
  'apple-touch-icon.png',
  'favicon-192.png',
  'favicon-512.png',
  'social-preview.png'
];
const jsSyntaxTargets = [
  'site.js',
  'cross-site-nav.js',
  'news-app.js',
  'scripts/update-news-manifest.mjs',
  'scripts/generate-sitemap.mjs',
  'scripts/validate-site.mjs'
];
const inspectExtensions = new Set(['.html', '.css', '.xml', '.txt', '.md', '.json', '.webmanifest']);

function isExternalReference(ref) {
  return /^(?:[a-zA-Z][a-zA-Z0-9+.-]*:|\/\/)/.test(ref);
}

function normalizeReference(rawRef) {
  let ref = String(rawRef || '').trim();
  if (!ref) return '';
  ref = ref.replace(/^['"]|['"]$/g, '');
  ref = ref.replace(/&amp;/g, '&');
  return ref.trim();
}

function shouldInspectReference(ref) {
  if (!ref || ref.startsWith('#')) return false;
  if (isExternalReference(ref)) return false;
  if (ref.startsWith('mailto:') || ref.startsWith('tel:') || ref.startsWith('javascript:') || ref.startsWith('data:')) {
    return false;
  }

  return ref.startsWith('/')
    || ref.includes('/')
    || /\.(?:html?|css|js|xml|txt|md|json|png|jpe?g|gif|webp|avif|ico|svg|webmanifest)(?:[?#]|$)/i.test(ref);
}

function resolveReference(sourceFile, rawRef) {
  const ref = normalizeReference(rawRef).split('#')[0].split('?')[0];
  if (!shouldInspectReference(ref)) return null;

  const resolved = ref.startsWith('/')
    ? path.join(repoRoot, ref.slice(1))
    : path.resolve(path.dirname(sourceFile), ref);

  return { ref, resolved };
}

async function walkFiles(dir, out = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === '.local' || entry.name === '.playwright-cli') {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(fullPath, out);
      continue;
    }

    if (inspectExtensions.has(path.extname(entry.name).toLowerCase())) {
      out.push(fullPath);
    }
  }

  return out;
}

function extractReferences(filePath, content) {
  const refs = [];

  if (filePath.endsWith('news-digests/index.json')) {
    try {
      const payload = JSON.parse(content);
      if (Array.isArray(payload.files)) {
        refs.push(...payload.files.map((file) => `news-digests/${file}`));
      }
    } catch {
      refs.push('__INVALID_JSON__');
    }

    return refs;
  }

  const patterns = [
    /(?:src|href|content)\s*=\s*["']([^"']+)["']/gi,
    /url\(\s*(['"]?)([^)'"]+)\1\s*\)/gi,
    /@import\s+url\(\s*(['"]?)([^)'"]+)\1\s*\)/gi
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      refs.push(match[2] || match[1] || match[0]);
    }
  }

  return refs;
}

async function ensureJsSyntax() {
  for (const relativePath of jsSyntaxTargets) {
    const absolutePath = path.join(repoRoot, relativePath);
    const result = spawnSync(process.execPath, ['--check', absolutePath], {
      encoding: 'utf8'
    });

    if (result.status !== 0) {
      throw new Error(`JavaScript syntax check failed for ${relativePath}\n${result.stderr || result.stdout}`);
    }
  }
}

async function ensureRequiredFiles() {
  const missing = [];

  for (const relativePath of requiredFiles) {
    try {
      await fs.access(path.join(repoRoot, relativePath));
    } catch {
      missing.push(relativePath);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required files: ${missing.join(', ')}`);
  }
}

async function ensureCname() {
  const cname = (await fs.readFile(path.join(repoRoot, 'CNAME'), 'utf8')).trim();
  if (cname !== 'koltregaskesphotography.com') {
    throw new Error(`CNAME must contain koltregaskesphotography.com, found: ${cname || '(empty)'}`);
  }
}

async function ensureGeneratedArtifacts() {
  const manifestResult = spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'update-news-manifest.mjs'), '--check'], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  if (manifestResult.status !== 0) {
    throw new Error(manifestResult.stderr || manifestResult.stdout || 'news manifest is out of date');
  }

  const sitemapResult = spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'generate-sitemap.mjs'), '--check'], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  if (sitemapResult.status !== 0) {
    throw new Error(sitemapResult.stderr || sitemapResult.stdout || 'sitemap is out of date');
  }
}

async function ensureInternalReferences() {
  const files = await walkFiles(repoRoot);
  const missing = [];

  for (const filePath of files) {
    const content = await fs.readFile(filePath, 'utf8');
    const refs = extractReferences(filePath, content);

    for (const rawRef of refs) {
      const resolved = resolveReference(filePath, rawRef);
      if (!resolved) continue;

      try {
        await fs.access(resolved.resolved);
      } catch {
        missing.push(`${path.relative(repoRoot, filePath)} -> ${resolved.ref}`);
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing internal files:\n${missing.map((entry) => `- ${entry}`).join('\n')}`);
  }
}

async function main() {
  await ensureRequiredFiles();
  await ensureCname();
  await ensureGeneratedArtifacts();
  await ensureJsSyntax();
  await ensureInternalReferences();
  console.log('Site validation passed.');
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
