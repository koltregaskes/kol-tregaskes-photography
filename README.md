# Kol Tregaskes Photography

Static portfolio site for Kol Tregaskes Photography.

## Structure

- `index.html` - homepage and featured work
- `gallery.html` - gallery grid with category filters
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
- Known photography image placeholders are intentionally ignored for now while the real photo set is being synced in.

## Automation

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
