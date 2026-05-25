# Kol Tregaskes Photography - Design Specification v3

**Last updated:** 2026-05-17
**Stack:** Static HTML + vanilla CSS/JS
**Source of truth:** `styles.css`
**Supersedes:** `design/archive/DESIGN-warm-brass-2026-05-02.md`

## Direction

The v3 refresh is a patch on the existing photography site, not a rebuild. The core portfolio voice stays quiet and restrained, but the old warm brass system is replaced by a cool slate-blue palette that feels darker, more neutral, and more photographic.

The homepage no longer presents launch-status placeholder tiles. It now opens with the hero and then routes visitors into three clear archive doorways: Landscape, Architecture, and Documentary.

## Palette

- `--bg`: `#08090c`
- `--bg-elevated`: `#11131a`
- `--bg-card`: `#161922`
- `--bg-card-soft`: `#1c2029`
- `--text`: `#e6e8ec`
- `--text-secondary`: `#8a8f9a`
- `--text-muted`: `#555a66`
- `--accent`: `#6b8db5`
- `--accent-hover`: `#8aa7c8`
- `--accent-soft`: `rgba(107, 141, 181, 0.14)`

No warm browns, tobacco tones, cream backgrounds, or brass accents should be reintroduced.

## Typography

- Display: Cormorant Garamond, 300/400.
- Body: Inter, 300.
- Body line-height: 1.7.
- Navigation remains small, uppercase, and letter-spaced.

## Components

- Header: fixed, solid cool-black when scrolled. Sticky elements use solid backgrounds, not blur effects.
- Hero: bottom-anchored copy, slate-accent gallery CTA.
- Doorways: three large 4:5 tiles with photographic gradients and typographic overlays.
- Gallery: tight 6px rhythm, slate active filters, staged ImageGallery schema until real photos land.
- Blog: date/title/tag grid rows with hairline separators, no card chrome.
- News: archive/dashboard language, slate chips, visible source-of-truth copy.
- About: rectangular 4:5 portrait tile with KT fallback.
- Contact: left-hand intent cards, right-hand form, hidden honeypot, visible "I'm a human" checkbox.
- Footer: shared estate strip labelled "More from Kol" plus a local "Find the work" section.

## Agent Notes

- Keep public copy honest about the staged gallery until Kol supplies final photographs.
- Do not ship full Photograph/ImageObject schema until real images and metadata exist.
- Preserve static HTML, semantic controls, form labels, visible focus states, and the cross-site footer pattern.
