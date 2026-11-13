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
