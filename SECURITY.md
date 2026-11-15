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

`node scripts/security-meta.mjs` adds a CSP meta policy using external same-origin scripts only, plus a referrer meta policy. Framing, HSTS and MIME sniffing need response headers and remain a hosting-owner mitigation decision before launch. A `_headers` file would have no effect on this host.

`node scripts/security-check.mjs` scans tracked text for common private-key/token signatures and reports only counts. It skips .env paths and never prints matches. This bounded pattern scan is not a history scan or a comprehensive secret-detection service. It also rejects EXIF on raster images, preventing GPS EXIF publication. New image imports must strip metadata before entering this branch publishing pipeline.

`node scripts/check-external-links.mjs` is the external-link launch acceptance command. `node scripts/security-check.mjs --external` also uses that crawler after the existing signature/image checks. Tracked HTML destinations are checked with manual redirects, a maximum of eight redirects, loop detection and per-destination/crawl deadlines. Every start and hop rejects non-HTTP(S) schemes, URL credentials, local/private IP literals and hosts resolving to non-public addresses. An initial HTTP URL may upgrade to HTTPS; a final HTTP destination or any HTTPS-to-HTTP hop is unsafe. DNS lookup checks do not pin the subsequent fetch connection, so this is not a DNS-rebinding isolation boundary.

The exit codes mirror PR #39's `link-crawl-acceptance.mjs`: **0** means non-empty, complete reachable coverage; **1** means a confirmed 404/410 or unsafe destination; **2** means empty, incomplete or unverified coverage. Bot denials, timeouts and other HTTP/network failures remain unverified and require further verification. They cannot accept a launch crawl. The gate has no manual-override input.

CI's **External link launch acceptance** job fails on either non-zero outcome. The newer digest/routed-news crawl remains explicitly report-only, pending the separate news-link acceptance work in PR #39. The deterministic planted-404 check still records the expected failure outcome and success conclusion and verifies the saved 404 proof, even when external acceptance fails. These reports do not accept news destinations or prove live conversions. `npm audit --audit-level=moderate` remains the separate dependency gate.

## Launch public boundary

The host remains legacy GitHub Pages, source main at /. Repo code can provide the existing CSP/referrer meta mitigations, but the response headers named above remain a hosting-owner decision under rooms-os-hub#1413 and #1507. No approval of those gaps is implied here. Do not add ineffective _headers files or pretend frame-ancestors meta prevents framing.

CI rejects missing/weakened meta policy, ignored header-only meta protection, remote executable scripts, new collection forms/password inputs and obvious write/telemetry APIs. Browser checks fail on application CSP violation events before axe is injected; axe's own cross-origin stylesheet fetch is outside the application observation window. This is a guard on the current interface, not comprehensive source-code security analysis.

The one contact form prepares a local mailto draft; there is no receiving API, server-side inbox, newsletter sender, payment processing or analytics collector in this repo. Redbubble is an external storefront. No receipt, conversion, delivery, anti-spam service or analytics event is proved by those links. Contact must stay on site-config.json's working address until Kol confirms routing. The mail helper is covered by scripts/check-contact-browser.mjs: disabled controls and a mailto fallback without JavaScript, plus local validation, accessibility and overflow at 320 and 390 px. This does not prove email delivery. Collector, newsletter and support decisions remain with #367/#1498, #1495/#1496 and #1502. The existing CI signature scanner reports redacted counts only and is not expanded or run locally by this change.
