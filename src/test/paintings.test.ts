import { describe, it, expect } from 'vitest'
import { paintings } from '../data/paintings'
import { getResizedUrl, preloadImage } from '../lib/wallpapers'

describe('paintings data', () => {
  it('has a diverse 50–100 item public-domain curated set', () => {
    expect(paintings.length).toBeGreaterThanOrEqual(50)
    expect(paintings.length).toBeLessThanOrEqual(100)
  })
  it('every painting has required fields and valid URLs', () => {
    for (const p of paintings) {
      expect(p.id).toBeTruthy()
      expect(p.title).toBeTruthy()
      expect(p.artist).toBeTruthy()
      expect(p.year).toBeTruthy()
      expect(p.style).toBeTruthy()
      expect(p.museum).toBeTruthy()
      expect(p.period).toBeTruthy()
      expect(p.museumUrl).toMatch(/^https:\/\//)
      expect(p.sourceUrl).toMatch(/^https:\/\//)
      expect(p.image).toMatch(/^https:\/\//)
      expect(p.thumb).toMatch(/^https:\/\//)
      expect(p.colors.length).toBeGreaterThan(0)
      expect(p.license).toBeTruthy()
      expect(['3:4','4:3','16:10','16:9','1:1']).toContain(p.aspect)
      expect(p.license).not.toMatch(/fair use|copyrighted/i)
    }
  })
  it('has diverse artists and styles', () => {
    const artists = new Set(paintings.map(p=>p.artist))
    const styles = new Set(paintings.map(p=>p.style))
    expect(artists.size).toBeGreaterThanOrEqual(15)
    expect(styles.size).toBeGreaterThanOrEqual(6)
  })
  it('ids are unique', () => {
    const ids = paintings.map(p=>p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('images are wikimedia or known domain', () => {
    for (const p of paintings.slice(0,5)) {
      expect(p.image.includes('wikimedia.org') || p.image.includes('upload.wikimedia')).toBe(true)
    }
  })
})

describe('wallpaper URLs', () => {
  it('uses target widths for Wikimedia and IIIF sources', () => {
    const commons = paintings.find(p => p.image.includes('/thumb/'))!
    expect(getResizedUrl(commons, '4K (3840×2160)')).toContain('/3840px-')
    const iiif = { ...commons, image: 'https://www.artic.edu/iiif/2/example/full/843,/0/default.jpg' }
    expect(getResizedUrl(iiif, 'Mobile (1080×1920)')).toContain('/full/1080,/')
  })

  it('preload resolves when an image fires load', async () => {
    const OriginalImage = globalThis.Image
    class SuccessfulImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_: string) { queueMicrotask(() => this.onload?.()) }
    }
    globalThis.Image = SuccessfulImage as unknown as typeof Image
    await expect(preloadImage('https://example.com/image.jpg', 50)).resolves.toBeUndefined()
    globalThis.Image = OriginalImage
  })
})

describe('filter logic', () => {
  it('search matches title/artist', () => {
    const q = 'van gogh'
    const res = paintings.filter(p=> p.artist.toLowerCase().includes(q) || p.title.toLowerCase().includes(q))
    expect(res.length).toBeGreaterThan(0)
    expect(res.every(p=>p.artist.toLowerCase().includes(q))).toBe(true)
  })
})
