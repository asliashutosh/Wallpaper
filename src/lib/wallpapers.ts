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

/** Return the largest source URL that matches a requested wallpaper width. */
export function getResizedUrl(painting: Painting, resolution: Resolution): string {
  if (resolution === "Original") return painting.image

  const width = widths[resolution]
  if (painting.image.includes("/iiif/2/")) {
    return painting.image.replace(/\/full\/[^/]+\//, `/full/${width},/`)
  }

  // A Wikimedia thumbnail URL retains its source hash and filename, so its size
  // segment can safely be replaced. Wikimedia returns the source when it is smaller.
  if (painting.image.includes("/thumb/")) {
    return painting.image.replace(/\/\d+px-/, `/${width}px-`)
  }

  // Met and non-thumbnail Commons URLs are original files; requesting a fake
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

export function preloadImage(url: string, timeoutMs = 5_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image()
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
      resolve()
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
