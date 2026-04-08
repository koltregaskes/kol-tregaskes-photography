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

- `sitemap.xml` - search engine sitemap
- `site.webmanifest` - installable metadata and icon references
- `favicon.svg`, `favicon.ico`, `apple-touch-icon.png` - browser and device icons
- `social-preview.png` - default social sharing image

## News Digest Manifest

The news page reads `news-digests/index.json` first. Keep that file in sync whenever new digest markdown files are added.

Update it with:

```powershell
node scripts/update-news-manifest.mjs
```

That script scans `news-digests/` for `digest-YYYY-MM-DD.md` files and rewrites the manifest in newest-first order.

## Local Preview

```powershell
python -m http.server 4285
```

Then open `http://127.0.0.1:4285/`.

## Current Known Blocker

The only intentional launch blocker left outside code is the real photography set. The site will gracefully fall back while final image assets are being synced in.
