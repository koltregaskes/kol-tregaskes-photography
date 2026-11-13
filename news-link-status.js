// Confirmed 404/410 original source pages. Keep archive provenance unchanged.
// Cards label these sources unavailable instead of publishing a broken link.
(() => {
 const unavailable = new Set([
  "https://camerajabber.com/photography-news/canons-new-sweet-spot-how-much-resolution-do-hybrid-shooters-really-need/",
  "https://github.com/fikrikarim/p",
  "https://photofocus.com/news/luminar-neo-summer-sale-2026-save-on-ai-photo-editing-software/",
  "https://photofocus.com/photography/chasing-waterfalls-with-long-exposure-photography/",
  "https://photofocus.com/photography/godox-im30pro-camera-flash-announced/",
  "https://photofocus.com/photography/lighting-photography/godox-it32-mini-flash-review-modular-game-changer/",
  "https://photofocus.com/reviews/aftershoot-2026-review-more-than-just-a-culling-tool/",
  "https://photofocus.com/reviews/aiarty-image-enhancer-review-can-it-compete-with-lightroom-dxo-topaz/",
  "https://photofocus.com/reviews/flexispot-motionx-pro-2-in-1-under-desk-walking-pad-treadmill-review-perfect-for-photo-editing-workstations/",
  "https://photofocus.com/reviews/sjcam-c400-action-camera-review/",
  "https://photofocus.com/reviews/tourbox-elite-plus-review-a-photographers-honest-first-impressions/",
  "https://photofocus.com/reviews/viltrox-af-75mm-f-1-8-evo-review/",
  "https://photofocus.com/software/adding-dodge-burn-to-bw-photos-for-impact/",
  "https://photofocus.com/software/adding-smoke-back-into-your-images-in-photoshop/",
  "https://photofocus.com/software/how-to-clean-up-messy-backgrounds-in-photoshop/"
]);
 globalThis.KTPSourceStatus = Object.freeze({isUnavailable(value) { try { const u = new URL(value); return unavailable.has(u.origin + u.pathname); } catch { return false; } }});
})();
