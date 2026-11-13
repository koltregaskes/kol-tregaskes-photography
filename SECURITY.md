# Security Policy

## Reporting

If you discover a security issue in `kol-tregaskes-photography`, please report it privately first.

Until a dedicated security inbox is published, do not open a public issue containing:

- secrets
- private workspace paths
- internal operational notes
- unpublished drafts or manager-only data

## Scope

The most important security rule in this project is data separation:

- public output must only come from intentionally published content
- private drafts, archived design work, and local-only notes must not leak into committed public assets

## GitHub Pages security limits

The current host is GitHub Pages, publishing from the main branch. The public endpoint returns Server: GitHub.com. It currently does not send CSP, HSTS, X-Frame-Options, X-Content-Type-Options or Referrer-Policy headers. GitHub Pages does not expose arbitrary response-header configuration. No hosting or DNS change is made here.

`node scripts/security-meta.mjs` adds a page-specific CSP meta policy with hashes for inline scripts, plus a referrer meta policy. Framing, HSTS and MIME sniffing need response headers and remain a hosting-owner mitigation decision before launch. A `_headers` file would have no effect on this host.

`node scripts/security-check.mjs` scans tracked text for common private-key/token signatures and reports only counts. It skips .env paths and never prints matches. This bounded pattern scan is not a history scan or a comprehensive secret-detection service. It also rejects EXIF on raster images, preventing GPS EXIF publication. Existing 13 raster files contain no EXIF. New image imports must strip metadata before entering this branch publishing pipeline.

`node scripts/security-check.mjs --external` crawls external destinations and reports HTTP failures, network failures and HTTPS downgrades. Bot-denied destinations require human verification; they are not silently allowed. `npm audit --audit-level=moderate` is the dependency gate.
