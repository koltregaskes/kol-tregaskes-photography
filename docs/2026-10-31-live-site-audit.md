# KT Photography: live site audit (31 Oct 2026)

Live URL: https://koltregaskesphotography.com/ (from `CNAME` and the GitHub Pages settings). HTTPS is enforced, and the certificate covers the bare domain and `www`, expiring 7 Jan 2027. `www.`, `http://` and `koltregaskes.github.io/kol-tregaskes-photography/` all redirect to the live URL. An unknown path returns 404 with the custom page.

The audit was run against GitHub `origin/main` and the live URL only. No W: or `#recycle` copies were used. It was read only: nothing was committed or pushed. Script: `D:\UserTemp\claude\W--\b7fe98cf-a1ee-4021-880a-b8f5849797d4\scratchpad\kt-audit\audit.mjs`. Raw results: `results.json` in the same folder.

## Deploy

| Item | Value |
|---|---|
| `main` HEAD | `7428665` "chore: refresh photography digests (2026-10-31)", 31 Oct 06:15 UTC |
| Last Pages build | built, commit `7428665`, 31 Oct 06:15:16 to 06:15:51 UTC (36 s) |
| Matches `main` HEAD | **Yes** |
| Recent runs | The last 10 workflow runs are all green (`pages-build-deployment` plus `Site Validation` on push and on schedule) |
| Build type | Legacy (Jekyll from `main` /), with no `.nojekyll` file |

## Pages: live and OK (10 of 10)

| Page | HTTP | Title | Live vs `main` |
|---|---|---|---|
| / (index.html) | 200 | Kol Tregaskes - Photography | byte-identical |
| gallery.html | 200 | Gallery - Kol Tregaskes Photography | byte-identical (content staged, see Stale) |
| news.html | 200 | Photography News - Kol Tregaskes Photography | byte-identical |
| topics.html | 200 | Photography Topics - Kol Tregaskes Photography | byte-identical |
| blog.html | 200 | Blog - Kol Tregaskes Photography | byte-identical |
| blog-welcome.html | 200 | Welcome to Kol Tregaskes Photography | byte-identical |
| blog-portfolio-sync-note.html | 200 | Why the Gallery Is Staged Before Launch | byte-identical |
| about.html | 200 | About - Kol Tregaskes Photography | byte-identical |
| contact.html | 200 | Contact - Kol Tregaskes Photography | byte-identical |
| 404.html | 200 (direct); 404 for unknown paths | Page not found - Kol Tregaskes Photography | byte-identical |

Links and assets: I checked **29 local URLs**. That covers every href, src and srcset on the 10 pages, plus CSS `url()` references, the manifest, robots.txt, sitemap.xml, llms.txt and the digest index. **28 return 200.** I checked **10 external URLs**. **9 return 200.**

News digests: `news-digests/index.json` is live and identical to `main`, listing 304 files. **All 304 return 200.** They run without a break from 1 Jan 2026 to **31 Oct 2026 (today)**, with no missing days. The newest digest matches `main`.

SEO (titles, descriptions, Open Graph, Twitter cards, JSON-LD, sitemap, robots) was already checked on all 10 pages under KOL-6835 on 31 Oct and passed. I did not repeat it here.

## Broken (1 confirmed, 1 unverified)

| Item | Status | Cause | Seen from |
|---|---|---|---|
| /.well-known/security.txt | **404** | The file is in `main`, but the legacy Jekyll build drops folders whose names start with a dot | support file (no page links to it) |
| https://www.redbubble.com/people/koltregaskes | 403 to an automated check | Probably Redbubble blocking bots. It needs one manual click in a browser to confirm. | footer of all 10 pages |

## Stale

| Item | Detail |
|---|---|
| Gallery | Shows 6 placeholder images (`images/placeholder-1..6.jpg`). The page and its JSON-LD both say the gallery is "staged" and that no real photos have been imported yet. |
| About portrait | Uses a portrait placeholder tile. `images/portrait.jpg` exists in the repo, but no page uses it. |
| Blog | 2 posts, the newest from 7 May 2026, so nearly 6 months without a post. |
| Unused images | `images/hero.jpg`, `images/portrait.jpg` and `images/placeholder-7.jpg` are deployed, but no page, CSS or JS file refers to them. |
| News digests | **Not stale.** They refresh daily at 06:15 UTC, and the newest is dated 31 Oct. |

## Not done in this pass

- **Lighthouse scores** (home, gallery and a detail page). Lighthouse is not installed on the Mini PC, and Google's free PageSpeed API returned 429 (daily quota used up). Note that there is no gallery detail page yet; the closest is `blog-welcome.html`.
- **Saving the findings to the repo docs folder** needs a commit to `main`, and any commit to `main` redeploys the site. This pass was read only.

## Fix next

1. Add an empty `.nojekyll` file at the repo root, or `include: [".well-known"]` in `_config.yml`, so `security.txt` gets served.
2. Import the real gallery photos and the About portrait, which ends the "staged" state. Then delete `placeholder-*.jpg` and decide whether to use or remove `hero.jpg`.
3. Run Lighthouse (`npx lighthouse` or PageSpeed with an API key) on /, gallery.html and blog-welcome.html, then commit this audit to `docs/` in the same PR.
