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
npm run validate
```

What they do:

- `manifest:update` scans `news-digests/` for `digest-YYYY-MM-DD.md` files and rewrites `news-digests/index.json` in newest-first order.
- `sitemap:update` rebuilds `sitemap.xml` from the current page list and tracked page dates.
- `validate` checks the generated files, runs JavaScript syntax checks, verifies `CNAME`, and confirms internal file references exist.
- Known photography image placeholders are intentionally ignored for now while the real photo set is being synced in.

## Local Preview

```powershell
python -m http.server 4285
```

Then open `http://127.0.0.1:4285/`.

## CI

GitHub Actions runs the same validation on push and pull request via `.github/workflows/site-validation.yml`.
