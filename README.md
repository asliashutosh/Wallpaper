# Masterpiece — public-domain painting wallpapers

Masterpiece is a Vite + React PWA for finding real paintings and saving them as laptop, desktop, ultrawide, or mobile wallpapers. It intentionally contains no AI or stock imagery.

## What ships

- 57 curated public-domain paintings from Wikimedia Commons, spanning Renaissance, Baroque, Impressionism, Ukiyo-e, Romanticism, and more.
- Live discovery with a short, verified fallback chain: Art Institute of Chicago → The Met → Wikimedia Commons.
- Public-domain and painting filters are applied before an Art Institute result is used. A candidate image is preloaded before it becomes the hero.
- Resolution-aware download URLs: HD/FHD 1920px, 4K 3840px, ultrawide 2560px, mobile 1080px, or the untouched original.
- Blob download with a browser-tab fallback for cross-origin servers; filenames are normalized as artist-title-resolution.jpg.
- Favorite, history, daily wallpaper selection, search, artist/style/museum/period/color filters, popular/latest/random order, details, share, and progressive gallery rendering.
- Installable offline PWA with Workbox image/API caches and a native install prompt where the browser supports it.

“Popular” is famous-artist discovery because the public APIs do not expose trustworthy view/like scores. “Latest” is newest artwork date—not acquisition date—because neither source exposes an acquisition-date sort. The UI states this distinction.

## Rights policy

Only public-domain curated works are included. Fair-use image files (including the previously included Picasso and Dalí entries) were removed. Every curated detail view has a holding-museum link and the direct Commons source. Live results preserve the provider’s license metadata; verify a live Commons file page before use beyond personal wallpaper.

## Data sources

| Source | Key | Why it is used | Rights / delivery |
| --- | --- | --- | --- |
| [Art Institute of Chicago](https://api.artic.edu/docs/) | No | Primary live search. Supports public-domain and painting filters. | IIIF image URLs; use only records marked public domain. |
| [The Met Collection API](https://metmuseum.github.io/) | No | Failover source with explicit isPublicDomain field. | Open Access records and original image URLs. |
| [Wikimedia Commons](https://www.mediawiki.org/wiki/API:Imageinfo) | No | Curated files and final live fallback. | Per-file licenses; public-domain curation is reviewed manually. |
| [Rijksmuseum Data Services](https://data.rijksmuseum.nl/docs/search) | No for the current Search API | Good future metadata source. | Not enabled for live image fetching until object-level rights handling is added. |
| Europeana | API key | Broad discovery only. | Metadata is CC0 but previews have record-level rights, so it is not used by default. |

## Run locally

```bash
npm install
npm test
npm run build
npm run dev
```

Open http://localhost:5173. The production build is written to `dist`.

## Install and wallpaper use

### PWA

On Android/desktop Chromium, use the in-app **Install Masterpiece** button when it appears or the browser’s install menu. On Safari iOS/iPadOS, use Share → Add to Home Screen. The installed app keeps the shell and recently requested images available offline.

Browsers cannot change an operating-system wallpaper directly. Download the artwork, then choose **Set as wallpaper** from Photos or the system’s appearance/wallpaper settings.

### Capacitor wrapper

`capacitor.config.ts` is set up with `webDir: dist` and `appId: com.masterpiece.wallpapers`.

```bash
npm run build
npx cap add ios
npx cap add android
npm run cap:copy
npm run cap:open:ios
npm run cap:open:android
```

The web app detects an optional native `Wallpaper.setWallpaper({ url })` bridge. An Android host can implement that bridge with `WallpaperManager`; iOS does not provide a public API that allows an app to set the user’s home or lock wallpaper. The browser/PWA remains the baseline.

## Deployment

Vercel uses `npm run build` and serves `dist` through `vercel.json`. Netlify can use the same build command and `dist` publish directory; `public/_headers` supplies baseline static-security headers.

## Verification

```bash
npm test       # 8 unit tests: data shape, source URLs, search, URL sizing, image preload
npm run build  # TypeScript + Vite + PWA service worker
npm run lint
```

The current production build is about 81 kB gzipped JavaScript, below the 250 kB budget. Run a deployed Lighthouse audit for environment-specific PWA, performance, and accessibility scores; scores cannot be meaningfully guaranteed from a local static build alone.

## License

Code is [MIT](LICENSE). Artwork rights are stated per item and remain with their relevant public-domain or open-access source.
