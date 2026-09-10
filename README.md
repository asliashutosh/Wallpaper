# Masterpiece — public-domain painting wallpapers

Masterpiece is a Vite + React PWA for finding real paintings and saving them as laptop, desktop, ultrawide, or mobile wallpapers. It intentionally contains no AI or stock imagery.

## What ships

- 56 curated public-domain paintings from Wikimedia Commons, spanning Renaissance, Baroque, Impressionism, Ukiyo-e, Romanticism, and more. Every file is served at 1920px where the source allows and never below the 1280px HD floor.
- Live discovery with a short, verified fallback chain: Art Institute of Chicago → The Met → Wikimedia Commons.
- Public-domain and painting filters are applied before an Art Institute result is used.
- Nothing reaches the hero unverified: every selection — curated, live, daily or shuffled — is decoded with a 1.5s budget first, and a source that fails or stalls falls back to curated art instead of showing a broken image.
- Resolution-aware download URLs: HD/FHD 1920px, 4K 3840px, ultrawide 2560px, mobile 1080px, or the untouched original.
- Blob download with a browser-tab fallback for cross-origin servers; filenames are normalized as artist-title-resolution.jpg.
- Favorite, history, daily wallpaper selection, search, artist/style/museum/period/color filters, popular/latest/random order, details, share, and progressive gallery rendering.
- Installable offline PWA with Workbox image/API caches and a native install prompt where the browser supports it.

“Popular” is famous-artist discovery because the public APIs do not expose trustworthy view/like scores. “Latest” is newest artwork date—not acquisition date—because neither source exposes an acquisition-date sort. The UI states this distinction.

## Rights policy

Only public-domain curated works are included. Every curated entry links both its holding museum and its Commons **file page** — the page that actually states the licence and author, which a raw `upload.wikimedia.org` JPEG does not. Live results preserve the provider’s licence metadata; verify a live Commons file page before use beyond personal wallpaper.

### Catalogue audit

The curated set was audited against the Commons API rather than trusted as written, because a Commons URL that looks plausible can still point at nothing. Commons derives a file's two path segments from `md5(filename)`, so a hand-written path is verifiable offline — and 29 of the previous 57 entries had paths that could not resolve, 23 of them naming files that do not exist on Commons at all. Those were re-sourced from verified public-domain files; one entry (*Plum Blossom in Kameido*) had no public-domain Commons file at HD and was dropped; and *Water Lilies* was replaced because the file in use was CC BY-SA 2.5, not public domain, and below the HD floor.

`npm test` now recomputes every path hash offline, so a broken or invented URL fails the suite instead of reaching a user.

### Wikimedia thumbnail widths

Wikimedia renders only a fixed ladder of widths — 20, 40, 60, 120, 250, 330, 500, 960, 1280, 1920, 3840 — and since [T414805](https://phabricator.wikimedia.org/T414805) it **rejects** a direct request for any other size. An app that asks for 600px, 1080px or 2560px therefore gets an error page, not an image. `getResizedUrl` snaps every Wikimedia request onto that ladder, and when the requested size exceeds the width stored for a work it serves the original upload — always larger, and never a 404, since Wikimedia will not upscale. The Art Institute's IIIF endpoint has no such restriction, so those requests stay exact.

## Data sources

| Source | Key | Why it is used | Rights / delivery |
| --- | --- | --- | --- |
| [Art Institute of Chicago](https://api.artic.edu/docs/) | No | Primary live search. Supports public-domain and painting filters. | IIIF image URLs; use only records marked public domain. |
| [The Met Collection API](https://metmuseum.github.io/) | No | Failover source with explicit isPublicDomain field. | Open Access records and original image URLs. |
| [Wikimedia Commons](https://www.mediawiki.org/wiki/API:Imageinfo) | No | Curated files and final live fallback. | Per-file licenses; public-domain curation is reviewed manually. |

No source needs an API key, and none is configured. The Rijksmuseum and Europeana were evaluated and are deliberately not wired up: Europeana previews carry record-level rights that would risk showing non-public-domain images, and the Rijksmuseum Search API needs object-level rights handling first.

## Run locally

```bash
npm install
npm test
npm run build
npm run dev
```

Open http://localhost:5173. The production build is written to `dist`.

## Install and wallpaper use

On Android/desktop Chromium, use the in-app **Install Masterpiece** button when it appears or the browser’s install menu. On Safari iOS/iPadOS, use Share → Add to Home Screen. The installed app keeps the shell and recently requested images available offline.

No browser can change an operating-system wallpaper, and iOS exposes no native API for it either. **Set as wallpaper** therefore downloads the image at the chosen resolution and then tells you where your platform’s own control lives — Photos → Share → Use as Wallpaper on iOS, the gallery’s ⋮ menu on Android, and the desktop right-click menu otherwise.

## Deployment

Vercel uses `npm run build` and serves `dist` through `vercel.json`. Netlify can use the same build command and `dist` publish directory; `public/_headers` supplies baseline static-security headers.

## Verification

```bash
npm test       # 8 unit tests: catalogue integrity, md5 path validation, HD floor,
               # resolution URLs, preload + timeout, aspect/palette helpers, search
npm run build  # TypeScript + Vite + PWA service worker
npm run lint
```

The current production build is about 80 kB gzipped JavaScript, below the 250 kB budget, and the service worker precaches 8 entries. Run a deployed Lighthouse audit for environment-specific PWA, performance, and accessibility scores; scores cannot be meaningfully guaranteed from a local static build alone.

## License

Code is [MIT](LICENSE). Artwork rights are stated per item and remain with their relevant public-domain or open-access source.
