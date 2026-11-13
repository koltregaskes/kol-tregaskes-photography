#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const requiredFiles = [
  'package.json',
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
  'news-app.js',
  'scripts/update-news-manifest.mjs',
  'scripts/generate-sitemap.mjs',
  'scripts/validate-site.mjs',
  'scripts/check-html.mjs'
];
const inspectExtensions = new Set(['.html', '.css', '.xml', '.txt', '.md', '.json', '.webmanifest']);
// Anchors known to be broken today. Each entry is "source page -> link".
// The pages are being edited in another PR, so these are allowed for now;
// fix the page (add the id, or drop the #fragment) and remove the entry.
const knownBrokenAnchors = new Set([
  'index.html -> gallery.html#landscape',
  'index.html -> gallery.html#architecture',
  'index.html -> gallery.html#documentary'
]);

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
    if (entry.name === '.git' || entry.name === '.local' || entry.name === '.playwright-cli' || entry.name === 'design' || entry.name === 'node_modules') {
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
  const relativePath = path.relative(repoRoot, filePath).split(path.sep).join('/');

  if (relativePath === 'news-digests/index.json') {
    try {
      const payload = JSON.parse(content);
      if (Array.isArray(payload.files)) {
        refs.push(...payload.files);
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
  const cnamePath = path.join(repoRoot, 'CNAME');

  try {
    await fs.access(cnamePath);
  } catch {
    return;
  }

  const cname = (await fs.readFile(cnamePath, 'utf8')).trim();
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
        const stat = await fs.stat(resolved.resolved);
        // A link to a folder only works on GitHub Pages if the folder has an index.html.
        if (stat.isDirectory()) {
          await fs.access(path.join(resolved.resolved, 'index.html'));
        }
      } catch {
        missing.push(`${path.relative(repoRoot, filePath)} -> ${resolved.ref}`);
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing internal files:\n${missing.map((entry) => `- ${entry}`).join('\n')}`);
  }
}

function extractIds(content) {
  const ids = new Set();
  const pattern = /\s(?:id|name)\s*=\s*["']([^"']+)["']/gi;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    ids.add(match[1]);
  }
  return ids;
}

// Every in-page anchor (href="#x" or href="page.html#x") on every HTML page
// must point at an element with that id (or name) in the target page.
async function ensureFragmentTargets() {
  const files = (await walkFiles(repoRoot)).filter((filePath) => filePath.toLowerCase().endsWith('.html'));
  const idCache = new Map();
  const broken = [];
  const stillBroken = new Set();
  const fixedAnchors = new Set();

  async function idsFor(filePath) {
    if (!idCache.has(filePath)) {
      idCache.set(filePath, extractIds(await fs.readFile(filePath, 'utf8')));
    }
    return idCache.get(filePath);
  }

  for (const filePath of files) {
    const content = await fs.readFile(filePath, 'utf8');
    const pattern = /\shref\s*=\s*["']([^"']*#[^"']*)["']/gi;
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const ref = normalizeReference(match[1]);
      if (isExternalReference(ref)) continue;

      const [pagePart, fragment] = ref.split('#');
      if (!fragment) continue;

      const page = pagePart.split('?')[0];
      let target = filePath;
      if (page) {
        if (!/\.html?$/i.test(page)) continue;
        target = page.startsWith('/') ? path.join(repoRoot, page.slice(1)) : path.resolve(path.dirname(filePath), page);
      }

      const label = `${path.relative(repoRoot, filePath).split(path.sep).join('/')} -> ${ref}`;
      try {
        const ids = await idsFor(target);
        if (ids.has(decodeURIComponent(fragment))) {
          if (knownBrokenAnchors.has(label)) fixedAnchors.add(label);
        } else if (knownBrokenAnchors.has(label)) {
          stillBroken.add(label);
        } else {
          broken.push(`${label} (no id="${fragment}")`);
        }
      } catch {
        // A missing target page is already reported by ensureInternalReferences.
      }
    }
  }

  if (stillBroken.size > 0) {
    console.log(`Known broken anchors (allowed for now):\n${[...stillBroken].map((entry) => `- ${entry}`).join('\n')}`);
  }
  if (fixedAnchors.size > 0) {
    console.log(`These anchors now work; remove them from knownBrokenAnchors:\n${[...fixedAnchors].map((entry) => `- ${entry}`).join('\n')}`);
  }

  if (broken.length > 0) {
    throw new Error(`Broken in-page anchors:\n${broken.map((entry) => `- ${entry}`).join('\n')}`);
  }
}

async function main() {
  await ensureRequiredFiles();
  await ensureCname();
  await ensureGeneratedArtifacts();
  await ensureJsSyntax();
  await ensureInternalReferences();
  await ensureFragmentTargets();
  console.log('Site validation passed.');
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
