# Masterpiece — HD Painting Wallpapers

> **Every wallpaper is a real painting.** No AI, no stock — just famous masterpieces in HD/4K, free & public domain, for laptop/PC/mobile.

Live: `npm run dev` → http://localhost:5173 • Repo: https://github.com/asliashutosh/Wallpaper

---

## ✨ Features — Production Ready

**Gallery & Discovery**
- **60 curated masterpieces** in `src/data/paintings.ts:1` — Van Gogh (8), Monet (5), da Vinci (4), Rembrandt, Vermeer (3), Hokusai (3), Klimt (2), Picasso (2), Degas (2), Cezanne, Renoir, Manet, Turner, Friedrich, Constable, Géricault, Goya (2), Bruegel (2), Bosch, Botticelli (2), Michelangelo, Raphael, Velázquez, van Eyck, Delacroix, David, Fragonard, Lautrec — all 2560/1280px Wikimedia, CC0
- **Infinite live** via `src/App.tsx:110` — Art Institute of Chicago (30/canvas, `is_public_domain` + `artwork_type_title=Painting`, preload-verified) → fallback The Met (18 IDs, `primaryImage`). Modes: **Famous / Latest / Random**
- **Filters**: search (title/artist/style/museum/year), artist (22), style (10), museum (15), sort (shuffle/artist/year), favorites-only
- **History** (last 10) + **Favorites** (localStorage `mw_favs`/`mw_history`)

**Wallpaper Engine**
- **Resolution engine** `getResizedUrl()` at `src/App.tsx:6` — HD 1920, 4K 2560, Mobile 1080, Ultrawide 2560, Original. Correct thumb/IIIF/Met URL, not just UI.
- **One-tap Download** blob fetch + fallback `window.open()`, filename `{title}-{artist}-{res}.jpg`, CORS-aware, toast `src/App.tsx:64`
- **Crop preview**: Fill (cover, wallpaper) ↔ Fit (contain, full painting) toggle
- **Daily lock** `mw_autodaily` — deterministic dayIndex; **Live mode** shows API painting; **Share** via Web Share API + clipboard at `src/App.tsx:44`

**UI/PWA**
- Dark museum theme, Playfair Display + Inter, responsive (mobile-filters sheet), a11y (skip link, aria-pressed), gradients, animations, empty states
- PWA at `vite.config.ts:6` — `vite-plugin-pwa` autoUpdate, Workbox cache (Wikimedia `CacheFirst` 30d, ArtIC `CacheFirst` 7d, Met `NetworkFirst`), `public/manifest.json:1` + `manifest.webmanifest`, icons 192/512 `public/icon-*.png`, theme `#0a0a0b`, standalone, offline precache 8 entries (~274 KiB)
- Build: Vite 8 + React 19 + TS, Tailwind 3, bundle 257 KiB / 75.9 KiB gzip at `dist/assets/index-*.js`

**Mobile**
- **PWA**: Chrome → ⋮ → Add to Home Screen → fullscreen, offline
- **Capacitor** native wrapper at `capacitor.config.ts:1` — `ios/` and `android/` added, `npm run cap:copy` syncs `dist` to native, `cap:open:ios/android` builds in Xcode/Android Studio. No extra native wallpaper plugin needed for download; for direct set-wallpaper use `capacitor-wallpaper` on Android if desired.

---

## 🗂 Tech Stack

- Vite 8, React 19, TypeScript 6, Tailwind 3, PostCSS
- APIs: **Art Institute of Chicago** + **Met Museum** (free, no key, CC0). See comparison below.
- PWA: vite-plugin-pwa + Workbox, Capacitor 8 for iOS/Android
- Test: Vitest 5 + jsdom + Testing Library (6 tests at `src/test/paintings.test.ts:1`)

## 🔌 API Comparison

| API | Key? | License | Max Res | Rate | Notes |
|-----|------|---------|---------|------|-------|
| **Art Institute of Chicago** `api.artic.edu` | No | CC0 | IIIF 843–3000px (`/iiif/2/{id}/full/...,/0/default.jpg`) | ~60/min, CORS OK | Used for live famous/latest, filters `is_public_domain`+`artwork_type_title=Painting` |
| **Met Museum** `collectionapi.metmuseum.org` | No | CC0 | `primaryImage` ~2500–4000px | unlimited | 18 curated IDs, fallback when ArtIC blocked (Cloudflare 403) |
| **Wikimedia Commons** `upload.wikimedia.org` | No | Public domain | thumb 2560px + original | unlimited | Curated 60 — most reliable for HD |
| Rijksmuseum | Yes (free) | CC0 | tiered |  RATE | Optional via `VITE_RIJKSMUSEUM_API_KEY` in `.env.example:1` — not enabled by default |
| Europeana / WikiArt | Mixed | Mixed | — | — | Not used — licensing uneven |

All live images preload-verified at `src/App.tsx:66` (`new Image()` + 5.5s timeout) before `setActive()`. Failed IIIF auto-retries 6 candidates then Met 4 candidates then curated.

## 🚀 Quick Start

```bash
cd /Users/ashutoshsingh/codeBase/masterpiece-wallpapers
npm install          # 422 packages
npm test             # vitest — 6 tests pass
npm run build        # tsc -b && vite build → dist + sw.js
npm run dev          # http://localhost:5173
npm run preview      # preview dist
```

## 📱 Mobile & Desktop Wallpaper

**Desktop (Windows/Mac/Linux):** Download HD/4K → right-click image → Set as desktop background (or use Ultrawide for 21:9).

**Mobile PWA (fastest, no store):**
1. Open on phone → Chrome/Safari → Share → Add to Home Screen
2. App opens standalone, offline. Shuffle → Download → Photos → Share → Use as Wallpaper

**Native (Capacitor):**
```bash
npm run build
npm run cap:copy          # sync dist → ios/android
npm run cap:open:ios      # Xcode → run on simulator/device
npm run cap:open:android  # Android Studio → run
# to add live wallpaper bridge on Android: npm i capacitor-wallpaper && npx cap sync
```

## 📂 Structure

```
src/data/paintings.ts   60 paintings + artists/styles/museums exports
src/App.tsx             Hero, filters, gallery, detail, download, live fetch, history, daily
src/index.css           Tailwind + Playfair/Inter
src/test/paintings.test.ts  Vitest
public/{manifest.json,icon-*.png,favicon.svg}
capacitor.config.ts     appId com.masterpiece.wallpapers, webDir dist
ios/ android/           Capacitor native projects (generated)
vite.config.ts          vite-plugin-pwa + vitest env
vercel.json / public/_headers  Deploy + security headers
```

## 🎨 Add Paintings

Edit `src/data/paintings.ts` — add `{id,title,artist,year,style,museum,image,thumb,colors,description,aspect,license}`. Use Wikimedia 2560px thumb: right-click → copy 2560px link, thumb 600px, or use `getResizedUrl()` pattern.

## ✅ Verification

```bash
npm test        # 6 passed
npm run build   # ✓ 17 modules, 75.9kB gzip, sw.js + workbox
# Manual QA: hero loads, ↻ Shuffle, ✨ Live famous/latest/random preload OK, download HD/4K/Mobile, filters, fav, history, daily lock, share, offline
```

Build log: `PWA v1.3.0 precache 8 entries (274 KiB)`.

## 📄 License

MIT at `LICENSE:1` — code MIT, artworks public domain/CC0 (Wikimedia/Met/ArtIC). Attribution in footer.

---

Built for art lovers — every wallpaper tells a story. PRs welcome.
