#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const sitemapPath = path.join(repoRoot, 'sitemap.xml');
const baseUrl = 'https://koltregaskesphotography.com';
const checkOnly = process.argv.includes('--check');

const pages = [
  { file: 'index.html', loc: '/' },
  { file: 'gallery.html', loc: '/gallery.html' },
  { file: 'news.html', loc: '/news.html' },
  { file: 'blog.html', loc: '/blog.html' },
  { file: 'blog-welcome.html', loc: '/blog-welcome.html' },
  { file: 'about.html', loc: '/about.html' },
  { file: 'contact.html', loc: '/contact.html' }
];

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

async function getLastModified(filePath) {
  const result = spawnSync('git', ['log', '-1', '--format=%cs', '--', path.relative(repoRoot, filePath)], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  if (result.status === 0) {
    const value = result.stdout.trim();
    if (value) return value;
  }

  const stats = await fs.stat(filePath);
  return formatDate(stats.mtime);
}

async function buildSitemap() {
  const urlBlocks = await Promise.all(pages.map(async (page) => {
    const lastmod = await getLastModified(path.join(repoRoot, page.file));
    return [
      '  <url>',
      `    <loc>${baseUrl}${page.loc}</loc>`,
      `    <lastmod>${lastmod}</lastmod>`,
      '  </url>'
    ].join('\n');
  }));

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urlBlocks,
    '</urlset>',
    ''
  ].join('\n');
}

async function main() {
  const sitemap = await buildSitemap();

  if (checkOnly) {
    const current = await fs.readFile(sitemapPath, 'utf8');
    if (current.trim() !== sitemap.trim()) {
      throw new Error('sitemap.xml is out of date. Run `npm run sitemap:update`.');
    }
    return;
  }

  await fs.writeFile(sitemapPath, sitemap, 'utf8');
  console.log(`Updated ${sitemapPath}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
