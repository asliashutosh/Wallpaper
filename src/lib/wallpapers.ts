import type { Painting } from "../data/paintings"

export const resolutionOptions = [
  "HD (1920×1080)",
  "FHD (1920×1080)",
  "4K (3840×2160)",
  "Ultrawide (2560×1080)",
  "Mobile (1080×1920)",
  "Original",
] as const

export type Resolution = (typeof resolutionOptions)[number]

const widths: Record<Exclude<Resolution, "Original">, number> = {
  "HD (1920×1080)": 1920,
  "FHD (1920×1080)": 1920,
  "4K (3840×2160)": 3840,
  "Ultrawide (2560×1080)": 2560,
  "Mobile (1080×1920)": 1080,
}

/**
 * Widths Wikimedia actually renders. Since T414805 a direct request for any other
 * width is rejected outright, so an arbitrary size such as 1080 or 2560 must be
 * snapped onto this ladder rather than passed through.
 * https://www.mediawiki.org/wiki/Common_thumbnail_sizes
 */
export const wikimediaThumbWidths = [20, 40, 60, 120, 250, 330, 500, 960, 1280, 1920, 3840] as const

/** Smallest standard width that is at least `width`, or the largest one available. */
export function snapWikimediaWidth(width: number): number {
  return wikimediaThumbWidths.find(step => step >= width) ?? wikimediaThumbWidths[wikimediaThumbWidths.length - 1]
}

/**
 * The full-resolution file behind a Wikimedia thumbnail. Dropping the `/thumb` segment
 * and the trailing size component yields the original upload, which is always available
 * and always at least as large as any thumbnail of it.
 */
export function originalFileUrl(url: string): string {
  const match = url.match(/^(https:\/\/upload\.wikimedia\.org\/wikipedia\/commons)\/thumb\/([0-9a-f]\/[0-9a-f]{2}\/[^/]+)\/\d+px-/)
  return match ? `${match[1]}/${match[2]}` : url
}

/** Return the source URL that best matches a requested wallpaper width. */
export function getResizedUrl(painting: Painting, resolution: Resolution): string {
  if (resolution === "Original") return originalFileUrl(painting.image)

  const width = widths[resolution]
  if (painting.image.includes("/iiif/2/")) {
    // IIIF renders any width on demand, so the request can be exact.
    return painting.image.replace(/\/full\/[^/]+\//, `/full/${width},/`)
  }

  const stored = painting.image.match(/\/(\d+)px-/)
  if (stored) {
    const target = snapWikimediaWidth(width)
    // The stored width is known to exist for this file. Anything larger might not,
    // and Wikimedia will not upscale, so serve the original instead of risking a 404.
    return target <= Number(stored[1])
      ? painting.image.replace(/\/\d+px-/, `/${target}px-`)
      : originalFileUrl(painting.image)
  }

  // Met and non-thumbnail Commons URLs are original files already; requesting a fake
  // thumbnail path would lose the required hash, so preserve the source URL.
  return painting.image
}

export function wallpaperFilename(painting: Painting, resolution: Resolution): string {
  const clean = (value: string) => value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/(^-|-$)/g, "")
    .toLowerCase()
  const label = resolution === "Original" ? "original" : resolution.split(" ")[0].toLowerCase()
  return `${clean(painting.artist)}-${clean(painting.title)}-${label}.jpg`
}

export function yearSortValue(year: string): number {
  const match = year.match(/\d{3,4}/)
  return match ? Number(match[0]) : Number.POSITIVE_INFINITY
}

export function periodForYear(year: string): string {
  const date = yearSortValue(year)
  if (!Number.isFinite(date)) return "Unknown period"
  if (date < 1500) return "Before 1500"
  if (date < 1600) return "1500s"
  if (date < 1700) return "1600s"
  if (date < 1800) return "1700s"
  if (date < 1900) return "1800s"
  return "1900s"
}

export function formatResolution(resolution: Resolution): string {
  return resolution === "Original" ? "Original source" : resolution
}

/**
 * Per-platform guidance for actually applying a downloaded image.
 * No browser API can set an OS wallpaper, and iOS offers no native one either, so the
 * honest answer is to say where the control lives rather than to imply the app can do it.
 */
export function wallpaperInstructions(userAgent = navigator.userAgent): string {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "Saved to Photos — open it, tap Share, then “Use as Wallpaper”."
  if (/Android/i.test(userAgent)) return "Saved to your gallery — open it, tap ⋮, then “Set as wallpaper”."
  if (/Macintosh|Mac OS X/i.test(userAgent)) return "Downloaded — right-click the file and choose “Set Desktop Picture”."
  return "Downloaded — right-click the file and choose “Set as desktop background”."
}

/** The aspect vocabulary shared by curated entries and live API results. */
export const aspectLabels = ["1:2", "3:4", "1:1", "4:3", "16:10", "16:9", "2:1"] as const

const aspectRatios: Array<[string, number]> = [
  ["1:2", 1 / 2],
  ["3:4", 3 / 4],
  ["1:1", 1],
  ["4:3", 4 / 3],
  ["16:10", 16 / 10],
  ["16:9", 16 / 9],
  ["2:1", 2],
]

/**
 * Map real pixel dimensions onto the same aspect vocabulary the curated set uses,
 * so a live result never renders a placeholder in the aspect badge. Comparison is
 * logarithmic because ratio error is proportional, not absolute.
 */
export function aspectLabelFor(width: number, height: number): string {
  if (!width || !height) return "4:3"
  const ratio = width / height
  let best = aspectRatios[0]
  let bestDistance = Number.POSITIVE_INFINITY
  for (const candidate of aspectRatios) {
    const distance = Math.abs(Math.log(ratio / candidate[1]))
    if (distance < bestDistance) {
      bestDistance = distance
      best = candidate
    }
  }
  return best[0]
}

/** Neutral tones used whenever a real palette cannot be read from an image. */
export const fallbackColors = ["#1c1917", "#c9a86a", "#6b7a8a"]

function toHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`
}

/**
 * Read three representative tones out of an already-loaded image.
 * Pixels are bucketed into a coarse RGB grid so near-identical shades collapse into
 * one entry, then the three most common buckets are averaged back to a real colour.
 * Returns the neutral fallback if the canvas is tainted or unavailable.
 */
export function extractPalette(image: HTMLImageElement, sampleSize = 48): string[] {
  try {
    const canvas = document.createElement("canvas")
    canvas.width = sampleSize
    canvas.height = sampleSize
    const context = canvas.getContext("2d", { willReadFrequently: true })
    if (!context) return fallbackColors
    context.drawImage(image, 0, 0, sampleSize, sampleSize)
    const { data } = context.getImageData(0, 0, sampleSize, sampleSize)

    const buckets = new Map<number, { count: number; red: number; green: number; blue: number }>()
    for (let index = 0; index < data.length; index += 4) {
      if (data[index + 3] < 128) continue
      const red = data[index]
      const green = data[index + 1]
      const blue = data[index + 2]
      const key = ((red >> 5) << 6) | ((green >> 5) << 3) | (blue >> 5)
      const bucket = buckets.get(key)
      if (bucket) {
        bucket.count += 1
        bucket.red += red
        bucket.green += green
        bucket.blue += blue
      } else {
        buckets.set(key, { count: 1, red, green, blue })
      }
    }

    const top = [...buckets.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map((bucket) => toHex(
        Math.round(bucket.red / bucket.count),
        Math.round(bucket.green / bucket.count),
        Math.round(bucket.blue / bucket.count),
      ))

    if (top.length === 0) return fallbackColors
    while (top.length < 3) top.push(fallbackColors[top.length])
    return top
  } catch {
    // A cross-origin image without CORS headers taints the canvas. Palette is cosmetic.
    return fallbackColors
  }
}

/**
 * Turn a Wikimedia file URL into its Commons description page, which is where the
 * licence and author actually live. A bare upload.wikimedia.org URL shows only the JPEG.
 */
export function commonsFilePage(url: string): string {
  const match = url.match(/upload\.wikimedia\.org\/wikipedia\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/]+)/)
  if (!match) return url
  return `https://commons.wikimedia.org/wiki/File:${match[1]}`
}

/**
 * Resolve once the browser has actually decoded the image, so a caller can size and
 * sample it. Rejects on error or after `timeoutMs` — callers use that to keep a
 * verified image on screen instead of a broken one.
 */
export function preloadImage(url: string, timeoutMs = 5_000, crossOrigin?: "anonymous"): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    if (crossOrigin) image.crossOrigin = crossOrigin
    const timeout = window.setTimeout(() => {
      cleanup()
      reject(new Error("Image preload timed out"))
    }, timeoutMs)

    const cleanup = () => {
      window.clearTimeout(timeout)
      image.onload = null
      image.onerror = null
    }

    image.onload = () => {
      cleanup()
      resolve(image)
    }
    image.onerror = () => {
      cleanup()
      reject(new Error("Image could not be loaded"))
    }
    image.src = url
  })
}

export async function fetchWithTimeout(input: RequestInfo | URL, timeoutMs = 5_000): Promise<Response> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, { signal: controller.signal })
  } finally {
    window.clearTimeout(timeout)
  }
}
