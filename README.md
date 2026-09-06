# Masterpiece — HD Painting Wallpapers

> A web app (PWA) where every wallpaper is a **famous painting**. No AI, no stock — just real masterpieces in HD, free & public domain.

**Live at:** `http://localhost:5173` after `npm run dev`

---

## ✨ Features

- **Hero Wallpaper Viewer** — fullscreen HD painting with artist, year, museum & story. “Wallpaper of the Day” deterministic by date.
- **Shuffle / New Wallpaper** — one tap to get a new masterpiece (curated 20 + infinite live).
- **20 Curated Masterpieces** — Van Gogh, Monet, da Vinci, Hokusai, Vermeer, Klimt, Picasso, Rembrandt, Dalí, Munch… all from Wikimedia Commons in 2500–4000px.
- **Live API Mode** — `✨ Live API` button fetches a random public-domain painting from **Art Institute of Chicago** (IIIF) and fallback **The Met** — no API key needed, unlimited.
- **Filters** — by artist, style (Impressionism, Renaissance, Baroque…), search, Favorites-only.
- **Favorites** — heart to save, persisted in localStorage.
- **HD Download** — real download (blob) with proper filename; fallback opens in new tab. Supports `HD / 4K / Mobile / Original` selector.
- **Detail Modal** — palette, resolution, backstory, “Use as wallpaper” + share.
- **PWA + Mobile Ready** — responsive, `manifest.json`, icons, Add to Home Screen → works like a native app. Instructions for iPhone/Android wallpaper set.
- **Free & Legal** — public domain sources only (Wikimedia Commons, ArtIC, Met).

## 🗂 Tech Stack

- Vite + React 19 + TypeScript
- Tailwind CSS 3
- Art Institute of Chicago API + Met Museum API (both free, no key)
- PWA (manifest + icons generated via `sharp`)

## 🚀 Quick Start

```bash
cd /Users/ashutoshsingh/codeBase/masterpiece-wallpapers
npm install
npm run dev        # http://localhost:5173
npm run build      # production
npm run preview
```

## 📱 Use as Mobile App

**Option A — PWA (fastest, no store):**
1. Open site on phone → Chrome menu → *Add to Home Screen* → opens fullscreen, offline-capable.

**Option B — Wrap as native:**
```bash
# Capacitor (iOS/Android)
npm i @capacitor/core @capacitor/cli
npx cap init Masterpiece com.masterpiece.wallpapers
npm run build
npx cap add ios
npx cap add android
npx cap copy
# open in Xcode / Android Studio
npx cap open ios
```

**Option C — Expo (if you want React Native):** tell me and I’ll scaffold `masterpiece-mobile` with same API/data.

## 🔌 APIs Used

- `https://api.artic.edu/api/v1/artworks/search?q=monet&query[term][is_public_domain]=true` → IIIF image `https://www.artic.edu/iiif/2/{image_id}/full/843,/0/default.jpg`
- `https://collectionapi.metmuseum.org/public/collection/v1/objects/{id}` → `primaryImage`

All images are served in high-res (Wikimedia `2560px`, IIIF `843,` or `full`).

## 📂 Project Structure

```
src/
  data/paintings.ts   — 20 curated paintings (HD URLs, artists, styles)
  App.tsx             — full UI: hero, filters, gallery, modal, download, live fetch
  index.css           — Tailwind + fonts (Playfair + Inter)
  main.tsx
public/
  manifest.json
  icon-192.png / icon-512.png
```

## 🎨 Adding More Paintings

Edit `src/data/paintings.ts` — add entry with Wikimedia `2560px` URL (right-click image → copy 2560px link). Or use Live API which is infinite.

## 📄 License

Public domain artworks. Code MIT.

---

Built with ❤️ for art lovers — every wallpaper tells a story.
