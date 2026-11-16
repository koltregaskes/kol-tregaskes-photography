# Kol Tregaskes Photography

Static portfolio site for Kol Tregaskes Photography.

## Deployment and rollback rehearsal

Record the current known-good commit, successful branch Pages build and rehearsal evidence on the [launch issue](https://github.com/koltregaskes/rooms-os-hub/issues/1507), rather than keeping a dated baseline in this README.

This site publishes directly from main through the legacy branch Pages builder. The primary rollback path is a narrowly scoped revert PR on main: obtain Claude approval and green checks, merge it, wait for the branch Pages build, then verify the public HTTPS bytes against the intended revision. Restore the desired reviewed release through a further reviewed PR and repeat the build and destination checks.

Do not assume rerunning an old pages-build-deployment run republishes its old commit; that behaviour has not been proved. Do not change the Pages source, force-push main, alter DNS or restart a legacy writer as part of a rollback. A Pages source change requires Kol's approval.

Keep fresh news data and source timestamps under the existing writer; revert only the faulty change rather than blindly restoring old data. Record build URLs, exact commits, public hashes, failures and recovery on the launch issue. Confirm the named operational owner and distinguish offline artifact restoration from a production rollback or data-recovery test.

## Structure

- `index.html` - homepage and featured work
- `gallery.html` - unpublished gallery page, omitted from navigation and the sitemap until real photographs are imported
- `news.html` - photography news feed sourced from `news-digests/`
- `blog.html` - blog landing page
- `blog-welcome.html` - first published post
- `about.html` - photographer bio
- `contact.html` - contact and social links
- `site.js` - shared client-side behavior for navigation, lightbox, and image fallbacks
- `news-app.js` - digest loading and rendering for the news page

## Launch Support Files

- `CNAME` - GitHub Pages custom-domain declaration
- `sitemap.xml` - generated search engine sitemap
- `site.webmanifest` - installable metadata and icon references
- `favicon.svg`, `favicon.ico`, `apple-touch-icon.png`, `favicon-192.png`, `favicon-512.png` - browser and device icons
- `social-preview.png` - default social sharing image

## Validation

The repo now ships a small validation layer so the derived files stay in sync and launch regressions are caught early.

Available commands:

```powershell
npm run manifest:update
npm run manifest:check
npm run sitemap:update
npm run sitemap:check
npm run refresh:news
npm run refresh:news:scrape
npm run publish:digests
npm run validate
```

What they do:

- `manifest:update` scans `news-digests/` for `digest-YYYY-MM-DD.md` files and rewrites `news-digests/index.json` in newest-first order.
- `sitemap:update` rebuilds `sitemap.xml` from the current page list and tracked page dates.
- `refresh:news` re-runs the per-site filter against the shared news database, then validates and publishes any new photography digests.
- `refresh:news:scrape` runs the estate-wide scrape first, then filters and publishes photography digests.
- `publish:digests` validates the site, stages `news-digests/` plus `sitemap.xml`, commits the refresh, and pushes to `main`.
- `validate` checks the generated files, runs JavaScript syntax checks, verifies `CNAME`, and confirms internal file references exist.
- `gallery.html` stays out of the navigation and sitemap until real photographs replace the unused placeholder files in `images/`.

## Privacy source guard

`npm run privacy:check` catches accidental or unreviewed third-party references in the site's own HTML, CSS and JavaScript. Structured extraction reads reference values, including nested HTML and template expressions. An independent backstop sweeps the entire text after HTML entity and JS/CSS escape normalisation, including comments and prose. Both use WHATWG URL parsing and the privacy page's declared hosts. Malformed references or helper output fail closed. Python 3 is required for the standard-library HTML parser/entity table; no extra Python packages are used.

HTML and SVG data: documents in iframe/frame, object and embed loading attributes are decoded and inspected recursively, including percent-encoded and base64 payloads. Unsupported encodings, malformed document bytes and excessive nesting fail closed. The independent sweep also inspects decoded data: text and percent escapes. Hosts marked `data-privacy-resource` in the notice permit automatic loads; navigation-only hosts cannot authorise SVG images, link resources, ping or direct fetch calls.
Document decoding supports UTF-8 and ASCII; non-ASCII HTML requires an explicit UTF-8 charset, and unsupported charset/XML encodings fail explicitly.

The HTML helper tracks SVG/MathML namespaces, integration points and breakout
elements, so foreign style/script markup cannot hide an image load. CDATA in HTML
is a bogus comment ending at the first `>`; in foreign content it remains text.
SVG set/animate href and xlink:href targets, including each semicolon-separated
values candidate, are resource loads. This is a bounded source grammar, not a
claim to implement every HTML5 tree-building rule; unsupported active contexts
fail closed.

Data CSS and JavaScript documents are rejected rather than executed or silently
skipped. A stylesheet link and a CSS import reject every data URL at the loading
boundary. Every script element rejects data URLs in src, href and xlink:href in
every namespace, including nested srcdoc, irrespective of MIME. Scheme checks
remove URL-parser-ignored tabs/newlines; MIME checks normalise case and whitespace
and cover JavaScript aliases. KT's existing 32-level document limit, 16 MiB byte
limit and explicit charset/base64 validation remain in force.

Each independent backstop hit needs structured evidence with the matching
resource, navigation or metadata role in its own source context. A declared or
own-origin host is not an automatic exemption; an unrelated anchor or metadata
reference cannot account for an unclassified active token. Helper source-context
records have an exact validated schema. The existing `data-privacy-resource`
declarations remain the authority for automatic loads; ordinary declarations do
not authorise them.

KT's literal-only JavaScript `new Set(["..."])` lists are parsed as comparison
metadata, preserving the source-suppression records without a file/host whitelist.
Expressions and templates do not acquire that status; other URL strings are
conservatively possible loads. The documented exclusion of indirect runtime URL
use still applies to subsequent uses of comparison data. JSON-LD and HTML
canonical/vocabulary references carry metadata roles separately from loads.

The guard is not a sandbox against deliberately obfuscated code, for example a host assembled from string fragments at runtime. Indirect JavaScript targets such as `fetch(u)` and `img.src = u` remain outside this static guard's scope. Runtime verification is the browser check's job. Passing this offline source guard is not a browser request trace.

Only reviewed, parser-proven inert text, lexer-proven comments or regexp literals
may use `privacy-non-request-mentions.json`: each entry needs `kind: "non-request
mention"`, an exact relative file, an exact hostname and a reason. Review the
source and reason in the PR. An entry never exempts an active or unclassified
reference, including one sharing a host with inert text. Unused entries fail.
Adjacent inert spans may be joined only across whitespace, so normalisation of
comment delimiters cannot hide intervening code. KT's existing two reviewed
normalisation-artefact entries remain subject to this proof. Do not use this file
to approve an active third-party resource: update the privacy notice and review
the integration instead.

The notice, declarations, helper and checker are trusted reviewed inputs.
Third-party response contents, HTTP redirects, deliberately assembled runtime
URLs, injected production content and provider-side behaviour are outside this
offline source check. Coverage remains the site's HTML/CSS/JS files, including
foreign markup and embedded documents within them. A successful check is neither
an access control for branch-root publication nor a live request trace.

## Automation

`.github/workflows/refresh-routed-feed.yml` fetches every entry in the shared `sources.json` at 05:15 UTC, applies the photography filter in `site-filters.json`, and commits `news-digests/news-feed-latest.json`. A successful fetch that matches nothing writes a fresh empty article list and exits 0. Partial source failures warn by name and the successful sources still write. All-source failure preserves the previous feed and fails. After validation and a push to main, the workflow explicitly requests the existing branch-based Pages build through the Pages API, because workflow-token pushes do not trigger it automatically. The first scheduled run must verify completed deployment and public feed readback. `news.html` reads that file when it has articles, and otherwise keeps the digest archive. This job does not run a second scraper. The 06:30 UTC freshness check alarms only on feed generation time; article dates are informational. It does not fetch articles.

The photography news loop now has both upstream generation and repo-local publication:

- `NewsPipeline-SourceScrape` and `NewsPipeline-SourceScrape-Evening` run at `07:00` and `19:00`.
- `NewsPipeline-SiteFilter` and `NewsPipeline-SiteFilter-Evening` run at `07:05` and `19:05`, writing `digest-YYYY-MM-DD.md` into `news-digests/`.
- `Websites-Photography-Digest-Publish` and `Websites-Photography-Digest-Publish-Evening` run at `07:15` and `19:15`, validating and publishing the repo updates to GitHub Pages.

If we ever need to catch up manually after a missed run, use:

```powershell
npm run refresh:news
```

or, to force a full scrape plus site refresh:

```powershell
npm run refresh:news:scrape
```

## Local Preview

```powershell
python -m http.server 4285
```

Then open `http://127.0.0.1:4285/`.

## CI

GitHub Actions runs the same validation on push and pull request via `.github/workflows/site-validation.yml`.

## SEO contract

Run `node scripts/seo.mjs` after public content changes and `node scripts/seo.mjs --check` before committing. CI checks page canonical URLs, PNG sharing cards, JSON-LD, RSS, sitemap routes, robots and llms.txt. RSS uses source publication dates, never the build clock. Search Console and Bing verification and sitemap submission require the site owner.

## Verify public deployment bytes

Download the github-pages artifact from the successful deployment run for the expected main commit, extract artifact.tar into an ignored local directory, then run:

```text
node scripts/check-live.mjs <extracted-directory> <https-site-base-url/>
```

Record the run URL and its head SHA alongside the result. This compares every public artifact file with the live HTTPS response, including downloads and discovery files. Mismatches, missing files, blocked responses, network errors and the four-minute crawl deadline prevent a passing result. It prints paths and counts, never response bodies. A passing crawl proves those deployed bytes at the time checked, not freshness, source truth or launch acceptance.

## Daily public freshness evidence

The existing 06:30 UTC canary retains its schedule and GitHub failed-run notification route. It rejects future generation/source timestamps (over five minutes ahead) and refresh generation at least 24 hours old. Source-story age remains informational: a successful empty photography refresh is valid and must not invent articles.

Run node scripts/check-public-feed-proof.mjs for a bounded read-only check of the existing HTTPS feed. A passing readback requires exact SHA-256 equality with the committed payload and successful freshness validation. Redirects, mismatches and network/HTTP failures remain unverified. Empty feeds have no invented newest-source timestamp. Each workflow run keeps a 30-day public-feed-proof artifact containing run/head, destination, generation/source-declared times and hashes.

For #1507, link each actual daily run/artifact during the planned December 4-10 window. Neither the script nor a single dispatch proves seven days, original-source authenticity, failure-notification recipient delivery, recovery or post-launch-owner acceptance. The publishing workflow is unchanged: main remains live under legacy Pages, and branch pushes here do not request a live build.
