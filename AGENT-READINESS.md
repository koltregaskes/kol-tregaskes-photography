# Kol Tregaskes Photography — Agent Readiness

**Status:** DRAFT — awaiting Kol's sign-off. Not yet committed.
**Last updated:** 2026-05-16
**Estate-wide policy:** `W:\Websites\AGENT-READINESS-ESTATE.md`
**Repo:** `W:\Websites\sites\kol-tregaskes-photography`
**Domain:** koltregaskesphotography.com
**Stack:** Static HTML + vanilla CSS/JS
**Social handle (found in repo):** `x.com/koltregaskespho`

---

## ⚠️ Interlock: real photos needed

Per estate memory: "Photography NEW as of April 2026. Cormorant Garamond + Inter design. 6 pages. Needs Kol's actual photos."

`ImageGallery`, `ImageObject`, and `Photograph` schema all reference image URLs. **Without real photos, the schema points at placeholders or doesn't ship.**

Codex's options:
1. Ship schema STUBS now, fill in image URLs as photos land (recommended)
2. Wait for photos before any schema work

Recommendation: ship the structure stubs now (`Person`, `Organization`, `WebSite`, chrome schema). Hold the `ImageGallery` + `Photograph` blocks until real photos exist. The site is otherwise low-traffic for now, so structured-data ROI on the gallery alone is small until there's actual gallery content.

---

## 1. Schema strategy

### 1.1 Home page (`index.html`)

**`Person`** (this is a portfolio site — the entity IS Kol):

```json
{
  "@context": "https://schema.org",
  "@type": "Person",
  "@id": "https://koltregaskesphotography.com/#person-kol",
  "name": "Kol Tregaskes",
  "alternateName": "Kol Tregaskes Photography",
  "url": "https://koltregaskesphotography.com",
  "image": "<headshot URL — Kol to provide>",
  "description": "<KOL'S CANONICAL PHOTOGRAPHER BIO — placeholder>",
  "jobTitle": "Photographer",
  "knowsAbout": ["Photography", "Landscape photography", "<add specialties>"],
  "sameAs": [
    "https://x.com/koltregaskespho",
    "https://github.com/koltregaskes",
    "<LinkedIn URL — Kol to provide>"
  ],
  "email": "kol@koltregaskes.com"
}
```

**`Organization`** (the photography brand):

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "https://koltregaskesphotography.com/#organization",
  "name": "Kol Tregaskes Photography",
  "url": "https://koltregaskesphotography.com",
  "logo": "https://koltregaskesphotography.com/favicon.svg",
  "founder": { "@id": "https://koltregaskesphotography.com/#person-kol" },
  "parentOrganization": { "@id": "https://koltregaskes.com/#organization" },
  "sameAs": ["https://x.com/koltregaskespho"]
}
```

**`WebSite`**:

```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": "https://koltregaskesphotography.com/#website",
  "name": "Kol Tregaskes Photography",
  "url": "https://koltregaskesphotography.com",
  "publisher": { "@id": "https://koltregaskesphotography.com/#organization" }
}
```

### 1.2 Gallery page (when photos land)

`ImageGallery` with `Photograph` items:

```json
{
  "@context": "https://schema.org",
  "@type": "ImageGallery",
  "@id": "https://koltregaskesphotography.com/<gallery-page>#gallery",
  "name": "Portfolio",
  "creator": { "@id": "https://koltregaskesphotography.com/#person-kol" },
  "image": [
    {
      "@type": "Photograph",
      "@id": "https://koltregaskesphotography.com/<gallery-page>#photo-<slug>",
      "name": "<photo title>",
      "description": "<photo description / location / context>",
      "creator": { "@id": "https://koltregaskesphotography.com/#person-kol" },
      "contentUrl": "<full-size image URL>",
      "thumbnailUrl": "<thumbnail URL>",
      "dateCreated": "<YYYY-MM-DD>",
      "contentLocation": {
        "@type": "Place",
        "name": "<location>",
        "geo": { "@type": "GeoCoordinates", "latitude": 0, "longitude": 0 }
      },
      "license": "<license URL — Kol to confirm>",
      "copyrightHolder": { "@id": "https://koltregaskesphotography.com/#person-kol" },
      "isPartOf": { "@id": "https://koltregaskesphotography.com/<gallery-page>#gallery" }
    }
  ]
}
```

**EXIF data** (camera, lens, ISO, shutter speed) can be folded into the `Photograph` via `additionalProperty`:

```json
{
  "additionalProperty": [
    { "@type": "PropertyValue", "name": "camera", "value": "Sony A7 IV" },
    { "@type": "PropertyValue", "name": "lens", "value": "FE 24-70mm f/2.8" },
    { "@type": "PropertyValue", "name": "iso", "value": "200" },
    { "@type": "PropertyValue", "name": "shutterSpeed", "value": "1/250" },
    { "@type": "PropertyValue", "name": "aperture", "value": "f/4.0" }
  ]
}
```

Highly recommended — this is the kind of "first-hand experience" signal Google explicitly rewards, and AI agents/search will use it for "show me Sony A7 IV portraits at f/4" queries.

### 1.3 About page (`about.html`)

`AboutPage` referencing the Person.

### 1.4 Blog pages (`blog-welcome.html`, `blog-portfolio-sync-note.html`, `blog.html`)

`Article` per post + `Blog` on the index.

### 1.5 Contact page (`contact.html`)

`ContactPage` with the Person + email.

### 1.6 Implementation pattern (for Codex)

Static HTML, inline JSON-LD. The 6 pages mean schema can be hand-templated initially. When the photo set grows, Codex extends `scripts/publish-digests.ps1` or adds a new `scripts/generate-gallery-schema.ps1` that walks the image directory and emits the gallery JSON-LD from EXIF + an accompanying `<slug>.json` metadata file per image.

---

## 2. Robots.txt and sitemap

### Robots.txt

Verify exists at repo root. Align to estate baseline.

### Sitemap.xml

Verify lists all 6 pages: home, about, gallery, blog, contact, 404.

---

## 3. Browser-agent UX audit (web.dev spec)

Photography sites typically have:
- A lightbox / modal for image viewing — must have `role="dialog"`, `aria-modal="true"`, focus trap, keyboard close
- Image lazy-load — must include proper `<img>` with `alt` text (essential for AI agents that can't see pixels but can read text)
- Contact form — already a `contact.html` page; verify `<label for=…>` on each input

Check the existing `scripts/validate-site.mjs` for what it already audits and extend.

---

## 4. Content cadence — non-commodity check

Photography portfolios are inherently unique (Kol's photos, his eye, his locations). Low commodity risk.

What could go wrong:
- Generic alt text ("photo", "image") — fails accessibility AND Google's content depth signal
- No story / location / context per image
- Gallery without categorisation

Each `Photograph` schema entry should have:
- `name` (1-line title)
- `description` (1 paragraph — where, why, the moment)
- `contentLocation` (place name + optional GPS)
- `dateCreated`

Without these, the schema works but the AI agent extracting "Kol's landscape photos from Devon, taken in March" can't surface relevant images.

---

## 5. Crawl budget

Tiny site (6 pages + gallery). No concerns.

---

## 6. Open items and dependencies

- **Real photos.** Schema for `ImageGallery` is stubbed; ship Phase 2 when photos land.
- **EXIF inclusion decision.** Privacy concern: GPS coordinates in some shots may be sensitive. Default: omit `geo` from `contentLocation` unless Kol explicitly opts in per image.
- **Bio + headshot for `Person`.** Kol provides.
- **License decision** for portfolio images.

---

## 7. Definition of done for Codex

Phase 1 (now):

- [ ] `Person` + `Organization` + `WebSite` JSON-LD on home + every page
- [ ] `AboutPage` on about
- [ ] `ContactPage` on contact
- [ ] `Blog` + `Article` on blog pages
- [ ] `BreadcrumbList` on deep pages
- [ ] `robots.txt` matches estate baseline
- [ ] All `<img>` have meaningful `alt` text (not "image" or empty)
- [ ] Contact form has `<label for=…>` on every input
- [ ] `audit-agent-ready.py` passes
- [ ] `validate-site.mjs` still passes

Phase 2 (when photos land):

- [ ] `ImageGallery` JSON-LD on gallery
- [ ] `Photograph` JSON-LD per image
- [ ] EXIF additionalProperty per image (optional, opt-in)
- [ ] All image URLs resolve
