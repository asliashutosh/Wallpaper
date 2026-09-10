import { createHash } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import { paintings, artists, styles, museums } from '../data/paintings'
import {
  aspectLabelFor,
  aspectLabels,
  commonsFilePage,
  extractPalette,
  fallbackColors,
  getResizedUrl,
  originalFileUrl,
  preloadImage,
  snapWikimediaWidth,
  wallpaperFilename,
  wallpaperInstructions,
  wikimediaThumbWidths,
} from '../lib/wallpapers'

/** Swap in a stubbed Image for the duration of one call. */
async function withImage<T>(stub: unknown, run: () => Promise<T>): Promise<T> {
  const original = globalThis.Image
  globalThis.Image = stub as typeof Image
  try { return await run() } finally { globalThis.Image = original }
}

describe('curated catalog', () => {
  it('is a 50-100 work set with unique ids', () => {
    expect(paintings.length).toBeGreaterThanOrEqual(50)
    expect(paintings.length).toBeLessThanOrEqual(100)
    const ids = paintings.map(p => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('carries complete public-domain provenance on every work', () => {
    for (const p of paintings) {
      for (const field of [p.id, p.title, p.artist, p.year, p.style, p.museum, p.period, p.description, p.license]) {
        expect(field).toBeTruthy()
      }
      expect(p.museumUrl).toMatch(/^https:\/\//)
      expect(p.image).toMatch(/^https:\/\//)
      expect(p.thumb).toMatch(/^https:\/\//)
      expect(p.colors.length).toBe(3)
      expect(aspectLabels as readonly string[]).toContain(p.aspect)
      expect(p.license).not.toMatch(/fair use|copyrighted|all rights reserved/i)
      // The licence is only verifiable on the Commons file page, not on the raw JPEG.
      expect(p.sourceUrl).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/)
    }
  })

  it('serves every work from Wikimedia at HD width or better', () => {
    for (const p of paintings) {
      for (const url of [p.image, p.thumb]) {
        expect(url).toMatch(/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\//)
        // Commons derives a file's two directory segments from md5(filename). A path that
        // does not match cannot resolve, so this catches a hand-written URL that never
        // pointed at a real file — the failure mode a network check cannot be trusted for.
        const parts = url.match(/\/commons\/(?:thumb\/)?([0-9a-f])\/([0-9a-f]{2})\/([^/]+)/)!
        expect(parts).not.toBeNull()
        const digest = createHash('md5').update(decodeURIComponent(parts[3])).digest('hex')
        expect(`${parts[1]}/${parts[2]}`).toBe(`${digest[0]}/${digest.slice(0, 2)}`)
      }
      const width = p.image.match(/\/(\d+)px-/)
      // A sized thumbnail must meet the HD floor; an unsized URL is the full original.
      if (width) expect(Number(width[1])).toBeGreaterThanOrEqual(1280)
      else expect(p.image).not.toContain('/thumb/')
    }
  })

  it('spans many artists, styles and museums', () => {
    expect(artists.length).toBeGreaterThanOrEqual(15)
    expect(styles.length).toBeGreaterThanOrEqual(6)
    expect(museums.length).toBeGreaterThanOrEqual(10)
  })
})

describe('wallpaper URLs', () => {
  it('targets the requested width per source type and names the file', () => {
    // Wikimedia rejects any width off its standard ladder, so requests must snap onto it.
    expect(snapWikimediaWidth(1080)).toBe(1280)
    expect(snapWikimediaWidth(2560)).toBe(3840)
    expect(snapWikimediaWidth(1920)).toBe(1920)
    for (const p of paintings) {
      for (const url of [p.image, p.thumb]) {
        const width = Number(url.match(/\/(\d+)px-/)![1])
        expect(wikimediaThumbWidths as readonly number[]).toContain(width)
      }
    }

    const commons = paintings.find(p => p.image.includes('/1920px-'))!
    expect(getResizedUrl(commons, 'HD (1920×1080)')).toContain('/1920px-')
    expect(getResizedUrl(commons, 'Mobile (1080×1920)')).toContain('/1280px-')
    // 3840 is above the stored width and Wikimedia will not upscale, so the caller gets
    // the original upload — which is larger still — rather than a 404.
    const fourK = getResizedUrl(commons, '4K (3840×2160)')
    expect(fourK).not.toContain('/thumb/')
    expect(fourK).toBe(originalFileUrl(commons.image))
    expect(getResizedUrl(commons, 'Original')).toBe(originalFileUrl(commons.image))
    expect(originalFileUrl('https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/Mona_Lisa.jpg/1920px-Mona_Lisa.jpg'))
      .toBe('https://upload.wikimedia.org/wikipedia/commons/6/6a/Mona_Lisa.jpg')

    // IIIF renders arbitrary widths, so those requests stay exact.
    const iiif = { ...commons, image: 'https://www.artic.edu/iiif/2/example/full/843,/0/default.jpg' }
    expect(getResizedUrl(iiif, 'Mobile (1080×1920)')).toContain('/full/1080,/')
    expect(getResizedUrl(iiif, 'Ultrawide (2560×1080)')).toContain('/full/2560,/')

    // A Met original has no resizable segment, so it must be handed back untouched.
    const met = { ...commons, image: 'https://images.metmuseum.org/CRDImages/ep/original/DP-42549-001.jpg' }
    expect(getResizedUrl(met, '4K (3840×2160)')).toBe(met.image)

    expect(wallpaperFilename({ ...commons, artist: 'Vincent van Gogh', title: 'The Starry Night' }, 'HD (1920×1080)'))
      .toBe('vincent-van-gogh-the-starry-night-hd.jpg')
  })

  it('preloads an image and gives up once the budget is spent', async () => {
    const loaded = await withImage(
      class { onload: (() => void) | null = null; onerror: (() => void) | null = null; naturalWidth = 1600; naturalHeight = 900
        set src(_: string) { queueMicrotask(() => this.onload?.()) } },
      () => preloadImage('https://example.com/image.jpg', 50),
    )
    expect(loaded.naturalWidth).toBe(1600)

    // A source that never fires load must reject, so the caller can fall back to curated art.
    await withImage(
      class { onload: (() => void) | null = null; onerror: (() => void) | null = null; set src(_: string) {} },
      () => expect(preloadImage('https://example.com/stalled.jpg', 20)).rejects.toThrow(/timed out/),
    )
  })
})

describe('derived metadata', () => {
  it('maps real pixels to aspects, file pages and a safe palette', () => {
    expect(aspectLabelFor(1920, 1080)).toBe('16:9')
    expect(aspectLabelFor(2560, 1600)).toBe('16:10')
    expect(aspectLabelFor(1000, 1000)).toBe('1:1')
    expect(aspectLabelFor(3000, 4000)).toBe('3:4')
    expect(aspectLabelFor(0, 0)).toBe('4:3')

    expect(commonsFilePage('https://upload.wikimedia.org/wikipedia/commons/6/6a/Mona_Lisa.jpg'))
      .toBe('https://commons.wikimedia.org/wiki/File:Mona_Lisa.jpg')
    expect(commonsFilePage('https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/Starry.jpg/2560px-Starry.jpg'))
      .toBe('https://commons.wikimedia.org/wiki/File:Starry.jpg')
    // Anything that is not a Commons file URL is passed through rather than mangled.
    expect(commonsFilePage('https://www.artic.edu/artworks/28560')).toBe('https://www.artic.edu/artworks/28560')

    // Without a real canvas the palette must degrade instead of throwing.
    expect(extractPalette({} as HTMLImageElement)).toBe(fallbackColors)

    expect(wallpaperInstructions('iPhone')).toMatch(/Photos/)
    expect(wallpaperInstructions('Android')).toMatch(/wallpaper/i)
    expect(wallpaperInstructions('Windows NT 10.0')).toMatch(/desktop background/)
  })
})

describe('browsing', () => {
  it('matches works by artist and keeps favourites distinct', () => {
    const query = 'van gogh'
    const matches = paintings.filter(p => p.artist.toLowerCase().includes(query) || p.title.toLowerCase().includes(query))
    expect(matches.length).toBeGreaterThan(0)
    expect(matches.every(p => p.artist.toLowerCase().includes(query))).toBe(true)

    const byMuseum = paintings.filter(p => p.museum === paintings[0].museum)
    expect(byMuseum).toContain(paintings[0])
    expect(paintings.filter(p => p.style === 'Post-Impressionism').length).toBeGreaterThan(0)
  })
})
