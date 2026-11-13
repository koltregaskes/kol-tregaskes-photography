# KT Photography: design system

**Version:** 4, adopted 10 November 2026 (hub issue koltregaskes/rooms-os-hub#1404).
**Live:** https://koltregaskesphotography.com (GitHub Pages, CNAME)
**Source of truth for values:** `styles.css`. This file sets the direction and the rules.
**Supersedes:** `design/archive/DESIGN-v3-slate-blue-2026-05-17.md`. Keeps its slate-blue direction; fixes contrast, fonts and small text.
**Shared estate rules:** accessibility and performance follow the estate base (WCAG 2.2 AA, 4.5:1 text, 12px floor, skip link, visible focus, reduced motion).

---

## 0. Concept

A darkroom by night and a light table by day. The site is a quiet archive: the photograph is always the loudest thing on the page, and everything else steps back. Type is a thin, elegant serif for titles with a calm grotesque underneath, and a small mono line for camera data, like the notes on a contact sheet. One cool slate-blue accent, used sparingly for links and the active filter. Frames are square-cornered like prints. No warm browns, no cream, no glow.

---

## 1. Purpose and audience

- **What it is:** Kol's photography portfolio and archive (landscape, architecture, documentary), plus a small blog and a photography news page.
- **Who it is for:** people who found a photo and want to see more; editors or clients checking his eye; fellow photographers.
- **The job:** show the pictures well, then make it easy to browse by subject and get in touch.
- **Not:** a gear blog, a marketplace or a social feed.

## 2. Brand voice

- Quiet, precise, first person. Short captions. Place, date, one line of context.
- UK English. Plain words. No "stunning", "breathtaking" or "capturing moments".
- Honest about what is staged: while real photographs are still being added, say so on the page.
- Example caption: *Severn Bridge, January 2025. Fog lifted for about four minutes.*

## 3. Colour tokens

One accent: **slate blue**. Neutrals are cool and nearly colourless so they never tint the photographs.

```css
:root {                       /* dark: the darkroom (default) */
  color-scheme: dark;
  --bg:            oklch(14% 0.006 255);   /* #08090c */
  --surface:       oklch(18% 0.008 255);   /* #0f1215 */
  --surface-2:     oklch(22% 0.01 255);    /* #181b1f */
  --text:          oklch(93% 0.006 255);   /* #e5e8ec */
  --text-2:        oklch(76% 0.012 255);   /* #acb2b9 */
  --text-3:        oklch(65% 0.014 255);   /* #8a9098, was #555a66 at 2.9:1 */
  --line:          oklch(28% 0.01 255);
  --line-strong:   oklch(48% 0.012 255);
  --accent:        oklch(70% 0.075 248);   /* #79a3cb */
  --accent-strong: oklch(78% 0.065 248);   /* hover */
  --accent-ink:    oklch(14% 0.006 255);
  --accent-soft:   color-mix(in oklch, var(--accent) 14%, transparent);
  --focus:         var(--accent);
  --mat:           oklch(11% 0.004 255);   /* behind photos in the lightbox */
}
/* Reserved, not shipped: the site is dark-only for now (see section 12). */
[data-theme="light"] {        /* light: the light table */
  color-scheme: light;
  --bg:            oklch(97% 0.003 250);   /* #f4f5f7 */
  --surface:       oklch(100% 0 0);
  --surface-2:     oklch(93.5% 0.005 250);
  --text:          oklch(20% 0.01 255);
  --text-2:        oklch(38% 0.015 255);
  --text-3:        oklch(48% 0.015 255);
  --line:          oklch(88% 0.006 250);
  --line-strong:   oklch(62% 0.01 250);
  --accent:        oklch(48% 0.09 250);    /* #32618e */
  --accent-strong: oklch(40% 0.09 250);
  --accent-ink:    oklch(98% 0.003 250);
  --mat:           oklch(99% 0 0);
}
```

All pairs checked: lowest text ratio 5.99:1 (light muted), accent links 5.97:1 light, 7.5:1 dark.

**What `styles.css` ships today (v3 token names, v4 values).** The OKLCH set above is the target; the stylesheet still uses the v3 names. Checked on every surface (`--bg` #08090c, `--bg-elevated` #11131a, `--bg-card` #161922, `--bg-card-soft` #1c2029):

| Token | Value | Lowest ratio |
|---|---|---|
| `--text` | #e6e8ec | 13.29:1 |
| `--text-secondary` | #8a8f9a | 5.03:1 |
| `--text-muted` | #8a9098 (was #555a66 at 2.88:1) | 5.06:1 |
| `--accent` | #6b8db5 | 4.74:1 |
| `--accent-hover` | #8aa7c8 | 6.55:1 |

Renaming to the v4 tokens (`--surface`, `--text-2`, `--text-3`) is a later tidy-up, not a visual change.

**Atmosphere:** flat. No noise overlay on this site (an estate exception, on purpose: grain fights real photographs). No gradients except the bottom caption scrim on doorway tiles.

## 4. Typography

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Hanken+Grotesk:wght@300..600&family=DM+Mono:wght@400&display=swap" rel="stylesheet">
```

| Voice | Family | Weights | Use |
|---|---|---|---|
| Display | Cormorant Garamond | 300, 400, 500, italic 300/400 | Page titles, doorway names, image titles |
| Body | Hanken Grotesk | 300 to 600 (variable) | Paragraphs, nav, captions, forms. Replaces Inter |
| Mono | DM Mono | 400 | Camera data (lens, shutter, ISO), dates, frame numbers |

Fallbacks: `Georgia, serif` / `system-ui, sans-serif` / `ui-monospace, monospace`.

**Scale** (perfect fourth, 1.333, airy):

| Token | Size | Line height | Notes |
|---|---|---|---|
| `--step-5` | `clamp(3rem, 2rem + 4vw, 5.25rem)` | 1.0 | Hero title. Cormorant 300, letter-spacing -0.01em |
| `--step-4` | `clamp(2.25rem, 1.7rem + 2.4vw, 3.5rem)` | 1.05 | Page H1 |
| `--step-3` | `clamp(1.75rem, 1.4rem + 1.4vw, 2.375rem)` | 1.15 | Doorway names, H2 |
| `--step-2` | 1.333rem | 1.3 | H3, image titles in lightbox |
| `--step-1` | 1.125rem | 1.6 | Lead paragraph |
| `--step-0` | 1rem | 1.7 | Body (Hanken 300 on dark, 400 on light: thin type on light paper looks grey) |
| `--step--1` | 0.875rem | 1.5 | Captions, nav (uppercase, letter-spacing 0.14em) |
| `--step--2` | 0.75rem | 1.4 | Mono camera data. Never smaller |

## 5. Spacing and radius

- Base unit 8px. Scale: `--space-1` 4px, `-2` 8px, `-3` 12px, `-4` 16px, `-5` 24px, `-6` 32px, `-7` 48px, `-8` 72px, `-9` 112px.
- Page side padding `clamp(20px, 5vw, 80px)`. Content max 1400px; reading text max 64ch.
- Section rhythm: `--space-8` desktop, `--space-7` mobile.
- **Gallery gutter is 6px**, kept from v3. Photos sit close like a contact sheet.
- Radius: `--radius-0` 0 for every photograph and tile (prints have square corners). `--radius-1` 2px for inputs and buttons. `--radius-pill` 999px for filter chips only.

## 6. Core components

**Header.** Fixed. Transparent over the hero, then a solid `--bg` bar once scrolled (no blur). Left: "Kol Tregaskes" in Cormorant 400 with "Photography" in small caps Hanken beneath. Right: nav. Height 64px desktop, 56px mobile.

**Nav.** Gallery, Landscape, Architecture, Documentary, Journal, About, Contact. Hanken 500, 0.875rem, uppercase, 0.14em tracking. Active page: `--text` with a 1px `--accent` underline 6px below. Mobile: a "Menu" text button opening a full-screen list in Cormorant `--step-3`.

**Card (photo tile).** The photo, nothing else, at its true ratio (3:2, 2:3, 4:5 or 1:1; never cropped to force a grid). Hover or focus: caption slides up on a scrim (`linear-gradient(to top, oklch(0% 0 0 / 0.65), transparent)`) showing title and place. Whole tile is one link to the lightbox or photo page.

**Doorway tile.** Three on the home page (Landscape, Architecture, Documentary). 4:5, best photo from that set, title in Cormorant `--step-3` bottom-left, count of photos in DM Mono.

**Article (journal post).** Single column, 64ch. Title Cormorant `--step-4`, date and place in DM Mono above it. Photos break out to full content width (1400px) with captions underneath, not over. Pull quotes in Cormorant italic `--step-2`.

**Button.** Primary: `--accent` fill, `--accent-ink` text, Hanken 500 uppercase 0.875rem, 0.12em tracking, 12px by 24px padding, 2px radius. Secondary: transparent with 1px `--line-strong` border. Hover: `--accent-strong`. Text links: `--accent`, underline offset 0.2em.

**Lightbox.** Full screen on `--mat`. Photo fitted with 4vh margin. Below: title, place, date, then camera data in DM Mono. Arrow keys and swipe to move, Escape to close, focus trapped and returned on close.

**Footer.** Two bands. "Find the work" (subject links, Instagram, contact). Then the estate strip "More from Kol" in `--text-3`. Hanken 0.875rem.

## 7. Imagery rules

- Real photographs only. No AI imagery on this site, ever, and no stock.
- Never crop for layout. Keep the photographer's ratio.
- No filters, overlays, duotones or hover zoom on the photo itself. The only overlay allowed is the caption scrim.
- Export long edge 2400px for lightbox, 1200px and 800px for the grid; AVIF with JPEG fallback; sRGB; strip GPS from metadata.
- Every photo has alt text describing the scene ("Fog over the Severn Bridge towers at dawn"), not the feeling.
- Until real photos land, placeholder tiles are flat `--surface-2` with the subject name. Say "Photographs being added" in plain view.

## 8. Homepage shape

The best single photograph, full width and nearly full height, with a one-line title bottom-left ("An archive, kept quietly." stays). Directly under it, the three doorway tiles. Then the newest six photos as a contact strip. No stats, no marketing copy, no "Get in touch" hero button.

## 9. Accessibility checks (on top of the base)

- [ ] Caption on hover is also shown on keyboard focus, and always shown on touch devices.
- [ ] Lightbox: focus trap, Escape closes, focus returns to the tile, arrow keys announced ("Photo 4 of 18").
- [ ] Filter chips are real buttons with `aria-pressed`.
- [ ] Contact form: visible labels, the honeypot hidden from assistive tech (`aria-hidden`, `tabindex="-1"`).
- [ ] Mono camera data is never below 0.75rem.

## 10. Do and don't

**Do**
- Let the photo be the largest thing on every page.
- Use the accent only for links, the active filter and the primary button.
- Keep generous space around images; keep the gallery gutter tight.

**Don't**
- Bring back brass, cream, tobacco or any warm neutral.
- Round the corners of photographs.
- Add grain, glow or aurora atmosphere. This is the one estate site that stays flat.
- Use the custom cursor or tilt effects from Elusion Works.
- Put text over a photograph except the bottom scrim caption.

## 11. Audit: v3 versus v4

| Area | v3 (live, 8 Nov) | v4 |
|---|---|---|
| Accent | `#6b8db5` slate | Same hue. Passes 4.5:1 on every surface |
| Muted text | `#555a66` on `#08090c` = **2.88:1, fails** | `#8a9098`, at least 5.06:1 |
| Fonts | Cormorant Garamond + Inter 300, loaded by CSS `@import` | Inter replaced by Hanken Grotesk; DM Mono added for camera data; loaded by `<link>` in each page head |
| Theme | Dark only | Dark only, `color-scheme: dark`. Light table reserved |
| Reduced motion | No `prefers-reduced-motion` rules | Animations and transitions switched off when the visitor asks |
| Small text | 22 declarations below 12px (down to 0.62rem) | 12px floor (`0.75rem`) everywhere |
| Skip link, `main`, focus | Skip link on 1 of 10 pages | Skip link and `main#main-content` on every page; 2px accent focus ring on every control |
| Tickers | None | None. Any future ticker or auto-scrolling strip needs a visible pause button (WCAG 2.2.2) |
| Radius | Mostly square already | Formalised as 0 for photos |
| Content | One image on the home page; gallery staged | Unchanged; keep the honest "being added" copy |

## 12. Decisions (10 November 2026)

Kol said on 8 November he would go with Claude's calls on design. These were the open questions in the draft:

1. **Hanken Grotesk replaces Inter.** Done in v4.
2. **Camera data** (lens, shutter, ISO) is shown in DM Mono where it is known, and left out where it is not. Never guessed.
3. **Light mode: not shipped.** Kol asked for dark-first with at most a subtle light variant, and photographs are judged on dark. The light-table tokens stay in section 3 so a light variant can be added later without a redesign; when it is, it must follow the visitor's device setting and pass 4.5:1 throughout.
