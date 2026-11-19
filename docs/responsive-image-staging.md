# Responsive gallery image staging

Launch work: rooms-os-hub #1507 / #638. Photo selection and approval remain #1544 / #485.

The public gallery intentionally stays unpublished and noindex until the approved photo set arrives. Do not restore placeholder photos as finished work.

## Prepare one approved repo image

Run from the repository root:

```powershell
node scripts/prepare-gallery-image.mjs images/<approved-file>.jpg .local/image-staging/<new-name>
```

The command accepts an explicit file inside the repo images directory. It does not scan photo libraries or access Drive. Output must be a new directory under ignored local staging; reruns refuse to overwrite it. Originals remain untouched. Partial outputs after an encoder failure stay available for inspection; use a new output directory when retrying.

Each image produces 800, 1600 and 2400px widths, capped at its oriented source width with duplicate sizes removed. AVIF, WebP and JPEG variants use sRGB with source metadata removed. EXIF orientation is applied before resizing. The manifest records actual dimensions, byte sizes and srcset candidates for each format.

## Import after selection approval

Review the derivatives and confirm source rights/selection approval. Copy only approved derivatives into a dedicated public images subdirectory in a separate PR. Resolve manifest paths relative to that public subdirectory. Use AVIF and WebP picture sources, a JPEG img fallback, actual width/height, a reviewed descriptive alt, and sizes matching the gallery grid. Lazy-load below-fold images; the principal above-fold image should load eagerly. Originals stay outside derivative output.

Run npm run build, node scripts/check-images.mjs and npm run test:launch. Compare actual gallery bytes against the original baseline before claiming the 40% reduction required by #638. The current empty public gallery cannot establish that comparison.

## Verification, 14 November 2026

The synthetic regression fixture checks orientation, all three formats, actual responsive widths, no upscaling, original byte preservation, metadata removal, sRGB and overwrite refusal. No personal photos are chosen or published by this batch. Browser gallery layout, final captions/alt approval, srcset integration and measured real-photo savings remain blocked on approved selection. About/contact source and SEO build checks already pass; contact receipt and final-domain live SEO still need their launch evidence. No DNS, mail, first-public-deploy or launch approval action is included.
