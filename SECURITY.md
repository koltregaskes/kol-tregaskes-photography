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

The exit codes reuse PR #39's `link-crawl-acceptance.mjs`: **0** means non-empty, complete coverage that is reachable or accepted by a valid reviewed disposition; **1** means a confirmed 404/410 or unsafe destination; **2** means empty, incomplete or unresolved unverified coverage, or an invalid disposition list. Observed reachable and dispositioned counts stay separate; only the internal acceptance calculation combines them. Other HTTP/network failures remain unverified.

HTML collection uses `scripts/external-html-references.py`, a Python standard-library `HTMLParser` helper, followed by Node's WHATWG URL parser. It handles quoted/unquoted attributes, the full HTML character-reference table in attribute context, every duplicate href/src attribute conservatively, and srcset/imagesrcset candidates. Only actual link elements whose rel tokens are resource hints (preconnect, dns-prefetch or preload) exclude their href. Local routes/fragments and mailto/tel hrefs stay outside the external HTTP crawl. Unparseable URLs, other unsupported schemes/descriptors and incomplete markup count as unverified destinations, so they force exit 2 unless a confirmed failure takes precedence. Known unsafe javascript/data/file targets retain exit 1. Python 3 must be available (`python` on Windows, `python3` elsewhere); an unavailable helper or invalid helper output fails collection with exit 2 before any crawl.

Decoded iframe srcdoc documents are collected recursively with the enclosing document's base URL. A child base applies only within that child and its descendants. Four nested srcdoc levels are inspected (outer document is level zero); a fifth level is counted as unverified coverage and forces exit 2 unless a confirmed failure takes precedence. Links wholly inside comments remain inert; template links remain conservatively counted, including within srcdoc.

### Reviewed manual link dispositions

`launch/link-dispositions.json` is a reviewed JSON array. Each entry has exactly five string fields: `destination` (the exact WHATWG-normalised HTTP(S) URL, including query, without credentials or fragment), `disposition` (`manually-verified-live`), `evidence` (who checked, how and what they saw), `verifiedOn` and `expiresOn` (real YYYY-MM-DD dates). Evidence must be non-empty and reviewed with the PR; code cannot establish that a human actually performed the check. No hostname wildcards, path prefixes or redacted-URL matches are used.

The verification date cannot be in the future. Expiry must be 1 to 30 days later; `expiresOn` is the first invalid UTC date, so the current entries expire at 00:00 UTC on 16 December 2026 and need re-verification before launch. A missing/unreadable file, invalid JSON, missing/extra fields, duplicate/non-normalised destinations, invalid dates, empty evidence or any expired entry fails the list closed with exit 2 (unless a confirmed broken/unsafe result requires exit 1).

The crawler still checks every destination normally. Only an observed unverified HTTP 401, 402, 403 or 429, or a timed-out check, can use a matching current entry. HTTP 404/410 and unsafe destinations/redirects can never use one. Ordinary network/DNS failures, other HTTP errors, malformed HTML, unsupported references and skipped crawl coverage remain unverified. An entry not actually used for an eligible unverified result fails as unused, including when a page becomes automatically reachable; remove that stale entry through review.

JSON reports retain `reachable`, `observedUnverified`, unresolved `unverified`, `acceptedByDisposition`, `dispositionedDestinations`, `dispositionErrors` and per-item observed status/HTTP details. Each accepted disposition also prints a separate `ACCEPTED BY DISPOSITION` console line with its destination and verification/expiry dates. Report URLs keep the existing query/credential redaction; matching uses the full normalised destination before redaction. There is no CLI flag to bypass expiry or disposition validation.

The seeded Redbubble and X entries record the supplied Claude browser checks. They are attributed manual evidence, not a fresh automated reachability claim, and they expire rather than accepting bot denials indefinitely.

CI's **External link launch acceptance** job fails on either non-zero outcome. The newer digest/routed-news crawl remains explicitly report-only, pending the separate news-link acceptance work in PR #39. The deterministic planted-404 check still records the expected failure outcome and success conclusion and verifies the saved 404 proof, even when external acceptance fails. These reports do not accept news destinations or prove live conversions. `npm audit --audit-level=moderate` remains the separate dependency gate.

## Launch public boundary

The host remains legacy GitHub Pages, source main at /. Repo code can provide the existing CSP/referrer meta mitigations, but the response headers named above remain a hosting-owner decision under rooms-os-hub#1413 and #1507. No approval of those gaps is implied here. Do not add ineffective _headers files or pretend frame-ancestors meta prevents framing.

CI rejects missing/weakened meta policy, ignored header-only meta protection, remote executable scripts, new collection forms/password inputs and obvious write/telemetry APIs. Browser checks fail on application CSP violation events before axe is injected; axe's own cross-origin stylesheet fetch is outside the application observation window. This is a guard on the current interface, not comprehensive source-code security analysis.

The one contact form prepares a local mailto draft; there is no receiving API, server-side inbox, newsletter sender, payment processing or analytics collector in this repo. Redbubble is an external storefront. No receipt, conversion, delivery, anti-spam service or analytics event is proved by those links. Contact must stay on site-config.json's working address until Kol confirms routing. The mail helper is covered by scripts/check-contact-browser.mjs: disabled controls and a mailto fallback without JavaScript, plus local validation, accessibility and overflow at 320 and 390 px. This does not prove email delivery. Collector, newsletter and support decisions remain with #367/#1498, #1495/#1496 and #1502. The existing CI signature scanner reports redacted counts only and is not expanded or run locally by this change.
