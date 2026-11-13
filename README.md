# Kol Tregaskes Photography

Static portfolio site for Kol Tregaskes Photography.

## Deployment and rollback rehearsal

The existing successful main deployment [run 43395758542](https://github.com/koltregaskes/kol-tregaskes-photography/actions/runs/43395758542) at 9573e3b is the baseline. Its github-pages artifact was restored into a new isolated candidate directory. A deliberate homepage-byte change was detected, then re-extracting the retained artifact restored all 386 file hashes. This is an offline artifact-restoration rehearsal, not a production rollback or a data-recovery claim.

For a live rehearsal, record a known-good successful main deployment run and immutable commit before deploying the reviewed release. If rollback is needed, rerun that known-good Pages deployment through the existing pipeline, then verify every public artifact file over HTTPS. Restore the latest reviewed release through its deployment run and repeat the byte readback. Do not force-push main, alter hosting/DNS, restart a legacy writer, or treat a green job as destination proof. If the historical run cannot be rerun, prepare a narrowly scoped revert PR, obtain review and green checks, then use the normal pipeline.

Keep dynamic news/calendar data and source timestamps under the existing writer: reverting the site is not permission to roll back fresh data blindly. Record the run URLs, exact commits, observed public hashes, failures and recovery on the owning launch issue. The source maintainer retains post-launch follow-through; a named operational owner and actual live rollback/failure-alert acceptance remain required.


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
