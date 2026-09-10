import type { Painting } from "../data/paintings"
import { aspectLabelFor, fallbackColors, fetchWithTimeout, periodForYear, preloadImage } from "./wallpapers"

export type LiveMode = "popular" | "latest" | "random"

type ArticArtwork = {
  id: number
  title?: string
  artist_title?: string
  date_display?: string
  style_title?: string
  image_id?: string
  artwork_type_title?: string
  is_public_domain?: boolean
  date_start?: number
}

type MetObject = {
  objectID: number
  title?: string
  artistDisplayName?: string
  artistDisplayBio?: string
  objectDate?: string
  medium?: string
  primaryImage?: string
  primaryImageSmall?: string
  isPublicDomain?: boolean
  objectURL?: string
}

type WikimediaPage = {
  title?: string
  imageinfo?: Array<{
    url?: string
    thumburl?: string
    descriptionurl?: string
    extmetadata?: { Artist?: { value?: string }; DateTimeOriginal?: { value?: string }; LicenseShortName?: { value?: string } }
  }>
}

const cache = new Map<LiveMode, { expiresAt: number; painting: Painting }>()
const famousTerms = ["Monet", "van Gogh", "Rembrandt", "Vermeer", "Hokusai", "Turner", "Renoir", "Cézanne", "Degas", "Munch"]
const latestTerms = ["painting", "modern painting", "portrait", "landscape"]
/** Matches the app-wide preload budget: a slow source is skipped, never shown broken. */
const LIVE_PRELOAD_MS = 1_500
const metIds = [436535, 437133, 437853, 438012, 436121, 436105, 459055, 459080, 459193, 544525, 544228, 337347]

function randomItem<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

function makeArticPainting(artwork: ArticArtwork): Painting {
  const year = artwork.date_display || String(artwork.date_start || "Unknown")
  return {
    id: `artic-${artwork.id}`,
    title: artwork.title || "Untitled",
    artist: artwork.artist_title || "Unknown artist",
    year,
    period: periodForYear(year),
    style: artwork.style_title || "Painting",
    museum: "Art Institute of Chicago",
    museumUrl: `https://www.artic.edu/artworks/${artwork.id}`,
    image: `https://www.artic.edu/iiif/2/${artwork.image_id}/full/1686,/0/default.jpg`,
    thumb: `https://www.artic.edu/iiif/2/${artwork.image_id}/full/600,/0/default.jpg`,
    colors: fallbackColors,
    description: "Public-domain artwork from the Art Institute of Chicago Open Access collection.",
    aspect: "4:3",
    license: "Public domain — Art Institute of Chicago Open Access",
    sourceUrl: `https://www.artic.edu/artworks/${artwork.id}`,
  }
}

function makeMetPainting(item: MetObject): Painting {
  const year = item.objectDate || "Unknown"
  return {
    id: `met-${item.objectID}`,
    title: item.title || "Untitled",
    artist: item.artistDisplayName || item.artistDisplayBio || "Unknown artist",
    year,
    period: periodForYear(year),
    style: item.medium?.split(",")[0] || "Painting",
    museum: "The Metropolitan Museum of Art",
    museumUrl: item.objectURL || `https://www.metmuseum.org/art/collection/search/${item.objectID}`,
    image: item.primaryImage || "",
    thumb: item.primaryImageSmall || item.primaryImage || "",
    colors: fallbackColors,
    description: item.artistDisplayBio || item.medium || "Public-domain artwork from The Met Open Access collection.",
    aspect: "4:3",
    license: "Public domain — The Met Open Access",
    sourceUrl: item.objectURL || `https://www.metmuseum.org/art/collection/search/${item.objectID}`,
  }
}

/**
 * Screen a candidate before it is offered as a wallpaper, and fill in the aspect that
 * only a decoded image can supply. The thumbnail is used deliberately: an original from
 * the Met can be tens of megabytes, which would never decode inside the preload budget,
 * and every source derives its thumbnail from the same file at the same ratio. The hero
 * URL itself is preloaded again by the app before it is ever displayed.
 * Returns null instead of throwing so callers can simply move to the next candidate.
 */
async function verify(painting: Painting): Promise<Painting | null> {
  if (!painting.image || !painting.thumb) return null
  try {
    const loaded = await preloadImage(painting.thumb, LIVE_PRELOAD_MS)
    return { ...painting, aspect: aspectLabelFor(loaded.naturalWidth, loaded.naturalHeight) }
  } catch {
    return null
  }
}

async function fromArtic(mode: LiveMode, excluded: Set<string>): Promise<Painting> {
  const terms = mode === "latest" ? latestTerms : famousTerms
  const params = new URLSearchParams({
    q: randomItem(terms),
    limit: "25",
    "query[term][is_public_domain]": "true",
    "query[term][artwork_type_title]": "Painting",
    fields: "id,title,artist_title,date_display,style_title,image_id,artwork_type_title,is_public_domain,date_start",
  })
  const response = await fetchWithTimeout(`https://api.artic.edu/api/v1/artworks/search?${params}`, 5_000)
  if (response.status === 429) throw new Error("Art Institute rate limit reached")
  if (!response.ok) throw new Error(`Art Institute returned ${response.status}`)
  const payload = await response.json() as { data?: ArticArtwork[] }
  let candidates = (payload.data || []).filter((item) =>
    item.image_id && item.is_public_domain && item.artwork_type_title === "Painting" && !excluded.has(`artic-${item.id}`),
  )
  if (mode === "latest") candidates = candidates.sort((a, b) => (b.date_start || 0) - (a.date_start || 0))
  else candidates = candidates.sort(() => Math.random() - 0.5)

  for (const candidate of candidates.slice(0, 3)) {
    const verified = await verify(makeArticPainting(candidate))
    // The IIIF CDN can intermittently reject a browser request. Try another work.
    if (verified) return verified
  }
  throw new Error("No loadable Art Institute image")
}

async function fromMet(excluded: Set<string>): Promise<Painting> {
  const ids = [...metIds].sort(() => Math.random() - 0.5)
  for (const id of ids.slice(0, 3)) {
    const response = await fetchWithTimeout(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`, 5_000)
    if (!response.ok) continue
    const item = await response.json() as MetObject
    if (!item.isPublicDomain || !item.primaryImage || excluded.has(`met-${item.objectID}`)) continue
    // Continue to a verified image rather than exposing a broken hero.
    const verified = await verify(makeMetPainting(item))
    if (verified) return verified
  }
  throw new Error("No loadable Met image")
}

async function fromWikimedia(mode: LiveMode, excluded: Set<string>): Promise<Painting> {
  const term = randomItem(mode === "latest" ? latestTerms : famousTerms)
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: `${term} painting`,
    gsrnamespace: "6",
    gsrlimit: "10",
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "600",
    format: "json",
    origin: "*",
  })
  const response = await fetchWithTimeout(`https://commons.wikimedia.org/w/api.php?${params}`, 5_000)
  if (!response.ok) throw new Error(`Wikimedia returned ${response.status}`)
  const payload = await response.json() as { query?: { pages?: Record<string, WikimediaPage> } }
  const pages = Object.values(payload.query?.pages || {})
  for (const page of pages) {
    const info = page.imageinfo?.[0]
    if (!info?.url || !info.thumburl) continue
    const id = `commons-${info.url}`
    if (excluded.has(id)) continue
    const artist = info.extmetadata?.Artist?.value?.replace(/<[^>]*>/g, "").trim() || "Unknown artist"
    const year = info.extmetadata?.DateTimeOriginal?.value?.match(/\d{4}/)?.[0] || "Unknown"
    const painting: Painting = {
      id,
      title: page.title?.replace(/^File:/, "").replace(/\.[^.]+$/, "") || "Untitled",
      artist,
      year,
      period: periodForYear(year),
      style: "Painting",
      museum: "Wikimedia Commons",
      museumUrl: info.descriptionurl || "https://commons.wikimedia.org",
      image: info.url,
      thumb: info.thumburl,
      colors: fallbackColors,
      description: "Public-domain or openly licensed image discovered through Wikimedia Commons. Confirm the file page before commercial reuse.",
      aspect: "4:3",
      license: info.extmetadata?.LicenseShortName?.value || "See Wikimedia file page",
      sourceUrl: info.descriptionurl || info.url,
    }
    // Try another Commons file if this one will not load.
    const verified = await verify(painting)
    if (verified) return verified
  }
  throw new Error("No loadable Wikimedia image")
}

/**
 * Resolve a verified public-domain live artwork with short, bounded fallbacks.
 * Cache is intentionally in-memory: it prevents repeat clicks from hammering APIs
 * without persisting third-party content into local storage.
 */
export async function fetchLivePainting(mode: LiveMode, excludedIds: Iterable<string> = []): Promise<Painting> {
  const excluded = new Set(excludedIds)
  const cached = cache.get(mode)
  if (cached && cached.expiresAt > Date.now() && !excluded.has(cached.painting.id)) return cached.painting

  const loaders = [() => fromArtic(mode, excluded), () => fromMet(excluded), () => fromWikimedia(mode, excluded)]
  let lastError: unknown
  for (const load of loaders) {
    try {
      const painting = await load()
      cache.set(mode, { painting, expiresAt: Date.now() + 5 * 60_000 })
      return painting
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error("No live source is available")
}
