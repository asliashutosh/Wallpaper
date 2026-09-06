import { describe, it, expect } from 'vitest'
import { paintings } from '../data/paintings'

describe('paintings data', () => {
  it('has at least 60 items', () => {
    expect(paintings.length).toBeGreaterThanOrEqual(60)
  })
  it('every painting has required fields and valid URLs', () => {
    for (const p of paintings) {
      expect(p.id).toBeTruthy()
      expect(p.title).toBeTruthy()
      expect(p.artist).toBeTruthy()
      expect(p.year).toBeTruthy()
      expect(p.style).toBeTruthy()
      expect(p.museum).toBeTruthy()
      expect(p.image).toMatch(/^https:\/\//)
      expect(p.thumb).toMatch(/^https:\/\//)
      expect(p.colors.length).toBeGreaterThan(0)
      expect(p.license).toBeTruthy()
      expect(['3:4','4:3','16:10','16:9','1:1']).toContain(p.aspect)
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

describe('filter logic', () => {
  it('search matches title/artist', () => {
    const q = 'van gogh'
    const res = paintings.filter(p=> p.artist.toLowerCase().includes(q) || p.title.toLowerCase().includes(q))
    expect(res.length).toBeGreaterThan(0)
    expect(res.every(p=>p.artist.toLowerCase().includes(q))).toBe(true)
  })
})
