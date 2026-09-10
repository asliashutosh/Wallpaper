import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { paintings, artists, styles, museums, periods, type Painting } from "./data/paintings"
import { fetchLivePainting, type LiveMode } from "./lib/live"
import {
  extractPalette,
  fallbackColors,
  getResizedUrl,
  preloadImage,
  resolutionOptions,
  wallpaperFilename,
  wallpaperInstructions,
  yearSortValue,
  type Resolution,
} from "./lib/wallpapers"

type CoverMode = "cover" | "contain"
type SortMode = "popular" | "latest" | "random"
type Palette = "All colors" | "Blue" | "Gold" | "Green" | "Red" | "Monochrome"
type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }

const paletteOptions: Palette[] = ["All colors", "Blue", "Gold", "Green", "Red", "Monochrome"]

/** A wallpaper must be proven to render before it replaces the hero. */
const HERO_PRELOAD_MS = 1_500
const dayIndex = () => Math.floor(Date.now() / 86_400_000) % paintings.length

function hasPalette(colors: string[], palette: Palette) {
  if (palette === "All colors") return true
  return colors.some((hex) => {
    const value = Number.parseInt(hex.slice(1), 16)
    const red = (value >> 16) & 255
    const green = (value >> 8) & 255
    const blue = value & 255
    const max = Math.max(red, green, blue)
    const min = Math.min(red, green, blue)
    const saturation = max === 0 ? 0 : (max - min) / max
    let hue = 0
    if (max !== min) {
      if (max === red) hue = 60 * (((green - blue) / (max - min)) % 6)
      else if (max === green) hue = 60 * ((blue - red) / (max - min) + 2)
      else hue = 60 * ((red - green) / (max - min) + 4)
    }
    if (hue < 0) hue += 360
    if (palette === "Monochrome") return saturation < 0.14
    if (palette === "Blue") return hue >= 185 && hue <= 255 && saturation > 0.2
    if (palette === "Green") return hue >= 70 && hue <= 175 && saturation > 0.2
    if (palette === "Gold") return hue >= 32 && hue <= 65 && saturation > 0.25
    return (hue <= 20 || hue >= 340) && saturation > 0.25
  })
}

function safeExternalUrl(value: string): string | undefined {
  try { return new URL(value).protocol === "https:" ? value : undefined } catch { return undefined }
}

function App() {
  const [active, setActive] = useState<Painting>(() => paintings[dayIndex()])
  const [search, setSearch] = useState("")
  const [artistFilter, setArtistFilter] = useState("All artists")
  const [styleFilter, setStyleFilter] = useState("All styles")
  const [museumFilter, setMuseumFilter] = useState("All museums")
  const [periodFilter, setPeriodFilter] = useState("All periods")
  const [paletteFilter, setPaletteFilter] = useState<Palette>("All colors")
  const [sort, setSort] = useState<SortMode>("popular")
  const [randomSeed, setRandomSeed] = useState(() => Date.now())
  const [favs, setFavs] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("mw_favs") || "[]")) } catch { return new Set() }
  })
  const [history, setHistory] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("mw_history") || "[]") } catch { return [] }
  })
  const [showFavsOnly, setShowFavsOnly] = useState(false)
  const [resolution, setResolution] = useState<Resolution>("HD (1920×1080)")
  const [coverMode, setCoverMode] = useState<CoverMode>("cover")
  const [detail, setDetail] = useState<Painting | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  // Every live result found this session is kept, so the history strip and the gallery
  // do not lose earlier discoveries the moment a new one arrives.
  const [livePaintings, setLivePaintings] = useState<Painting[]>([])
  const [liveLoading, setLiveLoading] = useState(false)
  const [liveMode, setLiveMode] = useState<LiveMode>("popular")
  const [imgError, setImgError] = useState(false)
  const [autoDaily, setAutoDaily] = useState<boolean>(() => {
    try { return localStorage.getItem("mw_autodaily") === "1" } catch { return false }
  })
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [visibleCount, setVisibleCount] = useState(16)
  const [activating, setActivating] = useState(false)
  /** Palettes read back from live images, keyed by painting id. */
  const [derivedColors, setDerivedColors] = useState<Record<string, string[]>>({})
  const moreRef = useRef<HTMLDivElement>(null)
  /** Guards against a slow activation overwriting a newer one. */
  const activationRef = useRef(0)

  useEffect(() => { try { localStorage.setItem("mw_favs", JSON.stringify([...favs])) } catch {} }, [favs])
  useEffect(() => { try { localStorage.setItem("mw_history", JSON.stringify(history.slice(0, 30))) } catch {} }, [history])
  useEffect(() => { try { localStorage.setItem("mw_autodaily", autoDaily ? "1" : "0") } catch {} }, [autoDaily])
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 2400); return () => clearTimeout(t) } }, [toast])
  useEffect(() => {
    const onBeforeInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event as BeforeInstallPromptEvent) }
    const onInstalled = () => { setInstallPrompt(null); setToast("Masterpiece installed") }
    window.addEventListener("beforeinstallprompt", onBeforeInstall)
    window.addEventListener("appinstalled", onInstalled)
    return () => { window.removeEventListener("beforeinstallprompt", onBeforeInstall); window.removeEventListener("appinstalled", onInstalled) }
  }, [])
  useEffect(() => { setImgError(false) }, [active.id])
  useEffect(() => {
    // record history on active change
    setHistory(h => {
      const n = [active.id, ...h.filter(x => x !== active.id)].slice(0, 30)
      return n
    })
  }, [active.id])

  // Daily wallpaper: deterministic for the day, so every device shows the same work.
  useEffect(() => {
    if (!autoDaily) return
    const index = dayIndex()
    try { localStorage.setItem("mw_day_index", String(index)) } catch {}
    setActive(paintings[index])
  }, [autoDaily])
  useEffect(() => { setVisibleCount(16) }, [search, artistFilter, styleFilter, museumFilter, periodFilter, paletteFilter, showFavsOnly, sort])

  // Curated works carry a hand-picked palette; live results arrive with the neutral
  // placeholder, so read real tones off the thumbnail once. A CORS-enabled load is a
  // separate request from the display one and may fail — the palette is decorative,
  // so failure quietly leaves the placeholder in place.
  useEffect(() => {
    if (active.colors !== fallbackColors || derivedColors[active.id]) return
    let cancelled = false
    preloadImage(active.thumb, 4_000, "anonymous")
      .then(image => {
        if (cancelled) return
        const palette = extractPalette(image)
        if (palette !== fallbackColors) setDerivedColors(previous => ({ ...previous, [active.id]: palette }))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [active.id, active.colors, active.thumb, derivedColors])

  // Escape closes the detail dialog, which is the behaviour a modal is expected to have.
  useEffect(() => {
    if (!detail) return
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setDetail(null) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [detail])

  const catalog = useMemo(() => [...livePaintings, ...paintings], [livePaintings])
  /** Prefer a palette read from the real image over the neutral placeholder. */
  const colorsFor = useCallback((p: Painting) => derivedColors[p.id] || p.colors, [derivedColors])

  const filtered = useMemo(() => {
    let out = catalog.filter(p => {
      if (showFavsOnly && !favs.has(p.id)) return false
      if (artistFilter !== "All artists" && p.artist !== artistFilter) return false
      if (styleFilter !== "All styles" && p.style !== styleFilter) return false
      if (museumFilter !== "All museums" && p.museum !== museumFilter) return false
      if (periodFilter !== "All periods" && p.period !== periodFilter) return false
      if (!hasPalette(colorsFor(p), paletteFilter)) return false
      if (search) {
        const q = search.toLowerCase()
        return p.title.toLowerCase().includes(q) || p.artist.toLowerCase().includes(q) || p.style.toLowerCase().includes(q) || p.year.toLowerCase().includes(q) || p.museum.toLowerCase().includes(q) || p.period.toLowerCase().includes(q)
      }
      return true
    })
    if (sort === "latest") out = [...out].sort((a, b) => yearSortValue(b.year) - yearSortValue(a.year))
    else if (sort === "random") out = [...out].sort((a, b) => {
      const rank = (value: string) => [...value].reduce((total, char) => (total * 31 + char.charCodeAt(0)) >>> 0, randomSeed)
      return rank(a.id) - rank(b.id)
    })
    return out
  }, [catalog, colorsFor, search, artistFilter, styleFilter, museumFilter, periodFilter, paletteFilter, favs, showFavsOnly, sort, randomSeed])

  const historyPaintings = useMemo(
    () => history.map(id => catalog.find(p => p.id === id)).filter(Boolean).slice(0, 10) as Painting[],
    [history, catalog],
  )
  const visiblePaintings = filtered.slice(0, visibleCount)
  useEffect(() => {
    const target = moreRef.current
    if (!target || visibleCount >= filtered.length) return
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) setVisibleCount(count => Math.min(count + 16, filtered.length))
    }, { rootMargin: "480px" })
    observer.observe(target)
    return () => observer.disconnect()
  }, [filtered.length, visibleCount])

  /**
   * The single way a wallpaper reaches the hero. The image is decoded first and only
   * swapped in once it is known to render; a source that fails or exceeds the budget
   * falls back to curated art, so the hero is never broken.
   */
  const activate = useCallback(async (painting: Painting, options: { scroll?: boolean } = {}) => {
    const token = ++activationRef.current
    setActivating(true)
    try {
      await preloadImage(getResizedUrl(painting, resolution), HERO_PRELOAD_MS)
      if (token !== activationRef.current) return
      setActive(painting)
      setImgError(false)
    } catch {
      if (token !== activationRef.current) return
      const fallback = paintings.filter(p => p.id !== active.id && p.id !== painting.id)
      const rescue = fallback[Math.floor(Math.random() * fallback.length)]
      if (rescue) {
        setActive(rescue)
        setImgError(false)
      }
      setToast(`${painting.title} would not load — showing curated art`)
    } finally {
      if (token === activationRef.current) setActivating(false)
      if (options.scroll) window.scrollTo({ top: 0, behavior: "smooth" })
    }
  }, [resolution, active.id])

  const randomize = () => {
    const pool = (filtered.length > 1 ? filtered : catalog).filter(p => p.id !== active.id)
    const next = pool[Math.floor(Math.random() * pool.length)]
    if (!next) return
    void activate(next, { scroll: true })
  }

  /** One description of the filter set, so the sheet and the desktop bar stay in step. */
  const mobileFilterFields = [
    { label: "ARTIST", value: artistFilter, onChange: setArtistFilter, options: ["All artists", ...artists] },
    { label: "STYLE", value: styleFilter, onChange: setStyleFilter, options: ["All styles", ...styles] },
    { label: "MUSEUM", value: museumFilter, onChange: setMuseumFilter, options: ["All museums", ...museums] },
    { label: "PERIOD", value: periodFilter, onChange: setPeriodFilter, options: ["All periods", ...periods] },
    { label: "PALETTE", value: paletteFilter, onChange: (value: string) => setPaletteFilter(value as Palette), options: paletteOptions },
  ]

  const clearFilters = () => {
    setSearch("")
    setArtistFilter("All artists")
    setStyleFilter("All styles")
    setMuseumFilter("All museums")
    setPeriodFilter("All periods")
    setPaletteFilter("All colors")
    setShowFavsOnly(false)
  }

  const toggleFav = (id: string) => setFavs(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const sharePainting = async (p: Painting) => {
    const text = `${p.title} by ${p.artist} (${p.year}) — ${p.museum}\n${getResizedUrl(p, resolution)}`
    if (navigator.share) {
      try { await navigator.share({ title: `${p.title} — ${p.artist}`, text, url: p.image }); setToast("Shared") ; return } catch {}
    }
    try { await navigator.clipboard.writeText(text); setToast("Link copied") } catch { setToast("Copied") }
  }

  /**
   * Save at the selected resolution. A blob download gives the file a real name, but it
   * needs CORS, so a rejected fetch falls back to opening the image directly.
   * Returns whether the file actually reached the device.
   */
  const downloadHD = async (p: Painting): Promise<boolean> => {
    const url = getResizedUrl(p, resolution)
    try {
      setDownloading(true)
      const res = await fetch(url, { mode: "cors" })
      if (!res.ok) throw new Error(`http ${res.status}`)
      const blob = await res.blob()
      const objUrl = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = objUrl
      a.download = wallpaperFilename(p, resolution)
      document.body.appendChild(a); a.click(); a.remove(); window.setTimeout(() => URL.revokeObjectURL(objUrl), 1_000)
      setToast("Download started — check downloads")
      return true
    } catch {
      window.open(url, "_blank", "noopener,noreferrer")
      setToast("Image opened in a new tab — save it from there")
      return false
    } finally { setDownloading(false) }
  }

  /**
   * Browsers cannot set an OS wallpaper, so this fetches the image at the chosen size
   * and then says exactly where the platform's own control lives.
   */
  const setWallpaper = async (p: Painting) => {
    // Only claim the file is on the device once the download actually succeeded;
    // the fallback path leaves the image in a new tab instead.
    if (await downloadHD(p)) setToast(wallpaperInstructions())
  }

  const toggleDaily = async (enabled: boolean) => {
    setAutoDaily(enabled)
    if (!enabled) return
    const index = dayIndex()
    void activate(paintings[index], { scroll: true })
    try { localStorage.setItem("mw_day_index", String(index)) } catch {}
  }

  const installApp = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    setInstallPrompt(null)
    setToast(choice.outcome === "accepted" ? "Install started" : "Install dismissed")
  }

  const fetchLiveMasterpiece = async () => {
    setLiveLoading(true)
    try {
      const live = await fetchLivePainting(liveMode, [active.id, ...history])
      setLivePaintings(previous => previous.some(p => p.id === live.id) ? previous : [live, ...previous])
      await activate(live, { scroll: true })
      setToast(`Live ${liveMode}: ${live.title} — ${live.artist}`)
    } catch (error) {
      console.warn("Live artwork fetch failed", error)
      setToast("Live sources are unavailable — showing curated art")
      randomize()
    } finally {
      setLiveLoading(false)
    }
  }

  const activeUrl = getResizedUrl(active, resolution)

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-zinc-100 selection:bg-amber-500/30">
      <a href="#gallery" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 bg-white text-black px-3 py-2 rounded">Skip to gallery</a>
      {/* Nav */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#0a0a0b]/80 border-b border-zinc-800">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 py-3.5 flex items-center gap-3 justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 grid place-items-center font-serif font-bold text-black text-lg shrink-0">M</div>
            <div className="min-w-0">
              <h1 className="font-serif text-[17px] sm:text-[18px] leading-none font-bold tracking-tight truncate">MASTERPIECE</h1>
              <p className="text-[11px] tracking-[0.18em] text-zinc-400 font-medium truncate">WALLPAPERS • HD PAINTINGS</p>
            </div>
            <span className="hidden lg:inline-flex ml-2 text-[11px] px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400">{paintings.length} curated • ∞ live</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setShowFavsOnly(v => !v)} aria-pressed={showFavsOnly} className={`hidden sm:inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-sm font-medium border transition ${showFavsOnly ? "bg-amber-500 text-black border-amber-500" : "bg-zinc-900 border-zinc-800 hover:bg-zinc-800 text-zinc-300"}`}>♥ {favs.size} Favorites</button>
            <a href="#gallery" className="hidden md:inline-flex px-4 py-2 rounded-full bg-white text-black text-sm font-semibold hover:bg-zinc-200 transition">Browse</a>
            <button onClick={randomize} className="inline-flex items-center gap-2 px-4 sm:px-5 py-2 rounded-full bg-amber-500 text-black text-sm font-bold hover:bg-amber-400 transition shadow-[0_8px_24px_rgba(245,158,11,0.35)]"><span className="hidden sm:inline">Shuffle</span> ↻</button>
            <button onClick={() => setMobileFiltersOpen(v=>!v)} className="sm:hidden inline-flex px-3 py-2 rounded-full bg-zinc-800 border border-zinc-700 text-white text-sm">Filters</button>
          </div>
        </div>
      </header>

      {/* Mobile filter sheet — museum, period and palette have no desktop-free route otherwise */}
      {mobileFiltersOpen && (
        <div className="sm:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={()=>setMobileFiltersOpen(false)} />
          <div role="dialog" aria-modal="true" aria-label="Filter wallpapers" className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-auto rounded-t-[28px] border-t border-zinc-800 bg-zinc-900 p-5 pb-8">
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-zinc-700" />
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-xl font-bold">Filters</h2>
              <button onClick={()=>setMobileFiltersOpen(false)} aria-label="Close filters" className="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 grid place-items-center">✕</button>
            </div>
            <div className="mt-4 grid gap-3">
              {mobileFilterFields.map(field => (
                <label key={field.label} className="grid gap-1.5">
                  <span className="text-xs font-semibold tracking-widest text-zinc-400">{field.label}</span>
                  <select value={field.value} onChange={e=>field.onChange(e.target.value)} className="px-3 py-3 rounded-2xl bg-zinc-800 border border-zinc-700 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/30">
                    {field.options.map(option => <option key={option}>{option}</option>)}
                  </select>
                </label>
              ))}
              <label className="grid gap-1.5">
                <span className="text-xs font-semibold tracking-widest text-zinc-400">SORT</span>
                <select value={sort} onChange={e=>{ const value = e.target.value as SortMode; setSort(value); if (value === "random") setRandomSeed(Date.now()) }} className="px-3 py-3 rounded-2xl bg-zinc-800 border border-zinc-700 text-sm text-white focus:outline-none">
                  <option value="popular">Popular</option><option value="latest">Latest</option><option value="random">Random</option>
                </select>
              </label>
              <button onClick={()=>setShowFavsOnly(v=>!v)} aria-pressed={showFavsOnly} className={`py-3 rounded-2xl text-sm font-bold border transition ${showFavsOnly?"bg-amber-500 text-black border-amber-500":"bg-zinc-800 text-white border-zinc-700"}`}>♥ Favorites only ({favs.size})</button>
            </div>
            <div className="mt-5 flex gap-3">
              <button onClick={clearFilters} className="flex-1 py-3 rounded-2xl bg-zinc-800 border border-zinc-700 text-white font-semibold text-sm">Clear all</button>
              <a href="#gallery" onClick={()=>setMobileFiltersOpen(false)} className="flex-1 py-3 rounded-2xl bg-white text-black text-center font-bold text-sm">Show {filtered.length}</a>
            </div>
          </div>
        </div>
      )}

      {/* Hero */}
      <section className="mx-auto max-w-[1400px] px-4 sm:px-6 pt-5 pb-6">
        <div className="grid lg:grid-cols-[1.35fr_0.85fr] gap-5">
          <div className="relative group overflow-hidden rounded-[28px] bg-zinc-900 border border-zinc-800">
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent z-10 pointer-events-none" />
            {!imgError ? (
              <img key={active.id} src={activeUrl} alt={`${active.title} by ${active.artist}`} className={`w-full h-[500px] sm:h-[620px] lg:h-[700px] object-center transition duration-700 group-hover:scale-[1.02] ${coverMode==="cover"?"object-cover":"object-contain bg-zinc-800"}`} loading="eager"
                onError={() => { console.warn("hero image failed", activeUrl); setImgError(true); setToast("Image failed — trying another"); const pool = paintings.filter(p => p.id !== active.id); const rescue = pool[Math.floor(Math.random() * pool.length)]; if (rescue) setTimeout(() => { setActive(rescue); setImgError(false) }, 500) }}
                onLoad={()=>setImgError(false)} />
            ) : (
              <div className="w-full h-[500px] sm:h-[620px] lg:h-[700px] grid place-items-center bg-zinc-800 text-zinc-400 p-8 text-center">
                <div>
                  <p className="text-4xl mb-3">🖼️</p>
                  <p className="font-semibold text-white">Image unavailable</p>
                  <p className="text-sm mt-1 text-zinc-400">Museum image blocked — falling back…</p>
                  <button onClick={randomize} className="mt-4 px-5 py-2 rounded-full bg-amber-500 text-black font-bold text-sm">Shuffle curated</button>
                </div>
              </div>
            )}
            {activating && (
              <div className="absolute inset-x-0 top-0 z-30 h-1 overflow-hidden bg-white/10" role="status" aria-label="Loading wallpaper">
                <div className="h-full w-1/3 animate-[slide_1.1s_ease-in-out_infinite] bg-amber-400" />
              </div>
            )}
            <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-3 py-1.5 rounded-full bg-black/60 backdrop-blur border border-white/15 text-xs font-semibold tracking-wide text-white">HD • {active.license}</span>
                <span className="hidden sm:inline-flex px-3 py-1.5 rounded-full bg-white text-black text-xs font-bold">{active.style}</span>
                <span className="hidden md:inline-flex px-2.5 py-1 rounded-full bg-zinc-900/80 backdrop-blur border border-white/10 text-white text-xs">{active.aspect}</span>
              </div>
              <button onClick={()=>toggleFav(active.id)} aria-label={favs.has(active.id)?"remove favorite":"add favorite"} className={`w-10 h-10 rounded-full grid place-items-center backdrop-blur border transition ${favs.has(active.id)?"bg-amber-500 border-amber-400 text-black":"bg-black/50 border-white/20 text-white hover:bg-black/70"}`}>{favs.has(active.id)?"♥":"♡"}</button>
            </div>

            <div className="absolute bottom-0 inset-x-0 z-20 p-5 sm:p-7">
              <div className="flex flex-wrap gap-2 mb-3">
                <span className="px-2.5 py-1 rounded-full bg-amber-500 text-black text-[11px] font-bold tracking-widest">{autoDaily ? "WALLPAPER OF THE DAY" : "NOW SHOWING"}</span>
                <span className="px-2.5 py-1 rounded-full bg-zinc-900/80 backdrop-blur border border-white/10 text-white text-xs">{active.museum}</span>
                {livePaintings.some(p => p.id === active.id) && <span className="px-2.5 py-1 rounded-full bg-emerald-500 text-black text-xs font-bold">LIVE API</span>}
              </div>
              <h2 className="font-serif text-[28px] sm:text-4xl lg:text-[42px] leading-none font-bold text-white drop-shadow-xl line-clamp-2">{active.title}</h2>
              <p className="mt-2 text-zinc-200 text-[15px] sm:text-lg"><span className="font-semibold text-white">{active.artist}</span> <span className="text-zinc-400">• {active.year}</span></p>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-300 line-clamp-2 sm:line-clamp-none">{active.description}</p>
              <div className="mt-4 flex flex-wrap gap-2.5">
                <button onClick={()=>downloadHD(active)} disabled={downloading} className="inline-flex items-center gap-2 px-5 sm:px-6 py-3 rounded-full bg-white text-black font-bold text-sm hover:bg-zinc-100 transition disabled:opacity-60">{downloading?"Preparing…":"⬇ Download"} <span className="hidden sm:inline text-zinc-500 font-medium">• {resolution.split("(")[0].trim()}</span></button>
                <button onClick={()=>setWallpaper(active)} className="inline-flex items-center gap-2 px-5 sm:px-6 py-3 rounded-full bg-amber-500 text-black font-bold text-sm hover:bg-amber-400 transition">Set as wallpaper</button>
                <button onClick={()=>setDetail(active)} className="inline-flex items-center gap-2 px-4 sm:px-5 py-3 rounded-full bg-black/40 backdrop-blur border border-white/20 text-white font-semibold text-sm hover:bg-black/60 transition">Details</button>
                <button onClick={()=>sharePainting(active)} className="inline-flex items-center gap-2 px-4 py-3 rounded-full bg-zinc-800 border border-zinc-700 text-white font-semibold text-sm hover:bg-zinc-700 transition">Share ↗</button>
              </div>
              <div className="mt-3 flex items-center gap-3 text-[11px] tracking-wide text-zinc-400 flex-wrap">
                <span>Tip: {wallpaperInstructions()}</span>
                <span className="hidden sm:inline">•</span>
                <button onClick={()=>setCoverMode(m=>m==="cover"?"contain":"cover")} className="underline decoration-zinc-600 underline-offset-2 hover:text-white">View: {coverMode === "cover" ? "Fill (wallpaper)" : "Fit (full painting)"}</button>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-5">
            <div className="rounded-[24px] bg-zinc-900 border border-zinc-800 p-5 sm:p-6">
              <h3 className="font-serif text-xl font-bold">Get a new masterpiece</h3>
              <p className="mt-1 text-sm text-zinc-400 leading-relaxed">Every wallpaper is a real painting — no AI, no stock. {paintings.length} curated + live discovery from the Met, Chicago, and Wikimedia Commons.</p>
              <div className="mt-4 flex gap-2">
                {(["popular","latest","random"] as LiveMode[]).map(m => (
                  <button key={m} onClick={()=>setLiveMode(m)} className={`flex-1 py-2 rounded-full text-xs font-bold border capitalize transition ${liveMode===m?"bg-white text-black border-white":"bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700"}`}>{m}</button>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <button onClick={randomize} className="py-3 rounded-2xl bg-amber-500 text-black font-bold text-sm hover:bg-amber-400 transition">↻ Shuffle</button>
                <button onClick={fetchLiveMasterpiece} disabled={liveLoading} className="py-3 rounded-2xl bg-zinc-800 border border-zinc-700 text-white font-semibold text-sm hover:bg-zinc-700 transition disabled:opacity-60">{liveLoading?"Fetching…":`✨ Live ${liveMode}`}</button>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
                <span className={`w-2 h-2 rounded-full ${livePaintings.length?"bg-emerald-500 animate-pulse":"bg-zinc-600"}`} />
                {livePaintings.length ? `${livePaintings.length} live found — ${livePaintings[0].title.slice(0,28)}` : `Curated: ${paintings.length} offline-ready`}
              </div>

              <div className="mt-5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold tracking-widest text-zinc-400">RESOLUTION</label>
                  <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                    <input type="checkbox" checked={autoDaily} onChange={e=>void toggleDaily(e.target.checked)} className="accent-amber-500" /> Daily wallpaper
                  </label>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {resolutionOptions.map(r => (
                    <button key={r} onClick={()=>setResolution(r)} className={`px-3 py-2.5 rounded-xl text-xs font-semibold border transition text-left leading-tight ${resolution===r?"bg-white text-black border-white":"bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700"}`}>{r}</button>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-zinc-500">IIIF and Wikimedia receive a target-width URL when available; original files stay unchanged otherwise.</p>
              </div>

              <div className="mt-5">
                <label className="text-xs font-semibold tracking-widest text-zinc-400">PALETTE</label>
                <div className="mt-2 flex gap-2">
                  {colorsFor(active).map(c => <div key={c} className="w-8 h-8 rounded-full border border-white/10 shadow" style={{background:c}} title={c} />)}
                  <span className="ml-2 text-xs text-zinc-500 self-center">Wallpaper tones</span>
                </div>
              </div>

              {historyPaintings.length > 0 && (
                <div className="mt-5">
                  <label className="text-xs font-semibold tracking-widest text-zinc-400">RECENT</label>
                  <div className="mt-2 flex gap-2 overflow-auto scrollbar-hide pb-1">
                    {historyPaintings.slice(0,10).map(p => (
                      <button key={p.id+"h"} onClick={()=>void activate(p, { scroll: true })} className={`shrink-0 w-14 h-14 rounded-xl overflow-hidden border-2 ${active.id===p.id?"border-amber-500":"border-transparent"}`}>
                        <img src={p.thumb} alt={p.title} className="w-full h-full object-cover" loading="lazy" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-5 rounded-2xl bg-gradient-to-br from-amber-500/15 to-orange-600/15 border border-amber-500/20 p-4">
                <p className="text-sm font-bold text-amber-200">📱 Install as app</p>
                <p className="mt-1 text-xs leading-relaxed text-zinc-300">Android/desktop: use the install button or the browser menu. iOS: Share → Add to Home Screen. Runs fullscreen and keeps the shell offline.</p>
                {installPrompt && <button onClick={installApp} className="mt-3 px-4 py-2 rounded-full bg-white text-black text-xs font-bold">Install Masterpiece</button>}
              </div>
            </div>

            <div className="rounded-[24px] bg-white text-zinc-900 p-5 sm:p-6">
              <h4 className="font-bold text-sm tracking-widest">WHY MASTERPIECE?</h4>
              <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-zinc-600">
                <li>• <b className="text-zinc-900">Always a real painting</b> — {artists.slice(0,6).join(", ")} & more</li>
                <li>• <b className="text-zinc-900">HD & free</b> — public domain, no watermarks</li>
                <li>• <b className="text-zinc-900">Daily + Live</b> — deterministic daily + shuffle + live famous/latest</li>
                <li>• <b className="text-zinc-900">All artists</b> — Renaissance to Post-Impressionism, Ukiyo-e, Baroque…</li>
              </ul>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="px-2.5 py-1 rounded-full bg-zinc-900 text-white text-xs font-semibold">{paintings.length} curated</span>
                <span className="px-2.5 py-1 rounded-full bg-zinc-100 border border-zinc-200 text-xs">+ Live API ∞</span>
                <span className="px-2.5 py-1 rounded-full bg-zinc-100 border border-zinc-200 text-xs">4K ready</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Controls */}
      <section id="gallery" className="mx-auto max-w-[1400px] px-4 sm:px-6">
        <div className="rounded-[20px] bg-zinc-900 border border-zinc-800 p-3 sm:p-4 flex flex-col xl:flex-row gap-3 items-stretch xl:items-center">
          <div className="flex-1 relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500">⌕</span>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search paintings, artists, museums… (e.g. Monet, Uffizi, 1889)" className="w-full pl-10 pr-4 py-3 rounded-2xl bg-zinc-800 border border-zinc-700 text-sm placeholder:text-zinc-500 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500" />
          </div>
          <div className="flex gap-2 sm:gap-3 flex-1 xl:flex-none overflow-auto scrollbar-hide">
            <select value={artistFilter} onChange={e=>setArtistFilter(e.target.value)} className="flex-1 xl:w-[160px] px-3 py-3 rounded-2xl bg-zinc-800 border border-zinc-700 text-sm text-white focus:outline-none">
              <option>All artists</option>{artists.map(a=><option key={a}>{a}</option>)}
            </select>
            <select value={styleFilter} onChange={e=>setStyleFilter(e.target.value)} className="flex-1 xl:w-[150px] px-3 py-3 rounded-2xl bg-zinc-800 border border-zinc-700 text-sm text-white focus:outline-none">
              <option>All styles</option>{styles.map(s=><option key={s}>{s}</option>)}
            </select>
            <select value={museumFilter} onChange={e=>setMuseumFilter(e.target.value)} className="hidden lg:block xl:w-[180px] px-3 py-3 rounded-2xl bg-zinc-800 border border-zinc-700 text-sm text-white focus:outline-none">
              <option>All museums</option>{museums.map(m=><option key={m}>{m}</option>)}
            </select>
            <select value={periodFilter} onChange={e=>setPeriodFilter(e.target.value)} className="hidden md:block xl:w-[130px] px-3 py-3 rounded-2xl bg-zinc-800 border border-zinc-700 text-sm text-white focus:outline-none">
              <option>All periods</option>{periods.map(p=><option key={p}>{p}</option>)}
            </select>
            <select value={paletteFilter} onChange={e=>setPaletteFilter(e.target.value as Palette)} className="hidden sm:block xl:w-[120px] px-3 py-3 rounded-2xl bg-zinc-800 border border-zinc-700 text-sm text-white focus:outline-none">
              {paletteOptions.map(p=><option key={p}>{p}</option>)}
            </select>
            <select value={sort} onChange={e=>{ const value = e.target.value as SortMode; setSort(value); if (value === "random") setRandomSeed(Date.now()) }} className="w-[130px] px-3 py-3 rounded-2xl bg-zinc-800 border border-zinc-700 text-sm text-white focus:outline-none">
              <option value="popular">Popular</option><option value="latest">Latest</option><option value="random">Random</option>
            </select>
          </div>
          <div className="flex items-center gap-3 text-sm text-zinc-400 justify-between xl:justify-end">
            <span className="hidden sm:inline whitespace-nowrap">{filtered.length} wallpapers</span>
            <button onClick={randomize} className="px-4 py-2 rounded-full bg-white text-black font-semibold text-sm whitespace-nowrap">↻ Random</button>
          </div>
        </div>
      </section>

      {/* Gallery */}
      <section className="mx-auto max-w-[1400px] px-4 sm:px-6 py-6">
        {filtered.length===0 ? (
          <div className="py-20 text-center rounded-[24px] bg-zinc-900 border border-zinc-800">
            <p className="text-zinc-400">No matches. Try another artist or clear filters.</p>
            <button onClick={clearFilters} className="mt-4 px-5 py-2 rounded-full bg-white text-black font-semibold text-sm">Clear filters</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {visiblePaintings.map(p => (
              <article key={p.id} className={`group relative overflow-hidden rounded-[20px] bg-zinc-900 border transition cursor-pointer flex flex-col [content-visibility:auto] ${active.id===p.id?"border-amber-500/50 ring-2 ring-amber-500/20":"border-zinc-800 hover:border-zinc-700"}`} onClick={()=>void activate(p, { scroll: true })}>
                <div className="relative overflow-hidden">
                  <img src={p.thumb} alt={`${p.title} by ${p.artist}`} loading="lazy" onError={e=>{(e.currentTarget as HTMLImageElement).style.display="none"}} className="w-full h-[260px] object-cover transition duration-500 group-hover:scale-[1.04]" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-transparent opacity-80" />
                  <div className="absolute top-3 left-3 flex gap-1.5 flex-wrap max-w-[70%]">
                    <span className="px-2.5 py-1 rounded-full bg-black/60 backdrop-blur border border-white/15 text-[11px] font-bold tracking-wide text-white">{p.style}</span>
                  </div>
                  <button onClick={e=>{e.stopPropagation(); toggleFav(p.id)}} aria-label="favorite" className={`absolute top-3 right-3 w-8 h-8 rounded-full grid place-items-center backdrop-blur border text-sm transition ${favs.has(p.id)?"bg-amber-500 border-amber-400 text-black":"bg-black/50 border-white/15 text-white"}`}>{favs.has(p.id)?"♥":"♡"}</button>
                  <div className="absolute bottom-3 left-3 right-3 flex gap-2">
                    <button onClick={e=>{e.stopPropagation(); void activate(p); void setWallpaper(p)}} className="flex-1 py-2 rounded-full bg-white text-black text-xs font-bold hover:bg-zinc-100 transition">Set wallpaper</button>
                    <button onClick={e=>{e.stopPropagation(); setDetail(p)}} className="px-3 py-2 rounded-full bg-black/60 backdrop-blur border border-white/15 text-white text-xs font-semibold">Details</button>
                  </div>
                  {active.id===p.id && <span className="absolute bottom-3 right-3 hidden sm:inline-flex translate-y-[-44px] px-2 py-1 rounded-full bg-amber-500 text-black text-[10px] font-bold tracking-widest">ACTIVE</span>}
                </div>
                <div className="p-4 flex-1 flex flex-col">
                  <h3 className="font-serif font-bold leading-tight line-clamp-1 text-[15px]">{p.title}</h3>
                  <p className="text-sm text-zinc-400 line-clamp-1">{p.artist} • {p.year}</p>
                  <div className="mt-auto pt-3 flex items-center justify-between gap-2">
                    <span className="text-xs text-zinc-500 truncate">{p.museum}</span>
                    <span className="text-xs px-2 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300 shrink-0">{p.aspect}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
        {visibleCount < filtered.length && <div ref={moreRef} className="mt-8 text-center"><button onClick={()=>setVisibleCount(count => Math.min(count + 16, filtered.length))} className="px-5 py-2.5 rounded-full bg-zinc-800 border border-zinc-700 text-white text-sm font-semibold">Show more ({filtered.length - visibleCount} remaining)</button></div>}
        <div className="mt-8 rounded-[20px] border border-dashed border-zinc-700 p-6 text-center">
          <p className="text-sm text-zinc-400">Discover more through <b className="text-zinc-200">✨ Live</b> — public-domain results from Chicago, The Met, then Wikimedia Commons. No key.</p>
          <div className="mt-3 flex justify-center gap-3 flex-wrap">
            <button onClick={fetchLiveMasterpiece} disabled={liveLoading} className="px-5 py-2.5 rounded-full bg-amber-500 text-black font-bold text-sm disabled:opacity-60">{liveLoading?"Fetching…":`Fetch live ${liveMode}`}</button>
            <button onClick={randomize} className="px-5 py-2.5 rounded-full bg-zinc-800 border border-zinc-700 text-white font-semibold text-sm">Shuffle curated</button>
          </div>
        </div>
      </section>

      {/* Detail */}
      {detail && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={()=>setDetail(null)} />
          <div role="dialog" aria-modal="true" aria-labelledby="detail-title" className="relative w-full max-w-5xl max-h-[90vh] overflow-auto rounded-[28px] bg-zinc-900 border border-zinc-800">
            <button onClick={()=>setDetail(null)} className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-black/60 backdrop-blur border border-white/20 text-white grid place-items-center hover:bg-black/80">✕</button>
            <div className="grid lg:grid-cols-[1.3fr_0.9fr] gap-0">
              <img src={getResizedUrl(detail, resolution)} alt={detail.title} className={`w-full h-[420px] lg:h-[640px] ${coverMode==="cover"?"object-cover":"object-contain bg-zinc-800"}`} />
              <div className="p-6 sm:p-8">
                <span className="inline-flex px-3 py-1 rounded-full bg-amber-500 text-black text-xs font-bold tracking-widest">{detail.style} • {detail.year}</span>
                <h3 id="detail-title" className="mt-3 font-serif text-3xl font-bold leading-none">{detail.title}</h3>
                <p className="mt-2 text-zinc-300"><span className="font-semibold text-white">{detail.artist}</span> • {detail.museum}</p>
                <p className="mt-1 text-xs text-zinc-500">{detail.license} • {detail.period} • {detail.aspect}</p>
                <p className="mt-4 text-sm leading-relaxed text-zinc-400">{detail.description}</p>
                <div className="mt-6 flex flex-wrap gap-2">{colorsFor(detail).map(c=><span key={c} className="w-7 h-7 rounded-full border border-white/10" style={{background:c}} />)}</div>
                <div className="mt-8 grid gap-3">
                  <button onClick={()=>setWallpaper(detail)} className="w-full py-3.5 rounded-2xl bg-amber-500 text-black font-bold">Set as wallpaper</button>
                  <button onClick={()=>downloadHD(detail)} className="w-full py-3.5 rounded-2xl bg-white text-black font-bold">⬇ Download {resolution.split("(")[0].trim()}</button>
                  <button onClick={()=>sharePainting(detail)} className="w-full py-3 rounded-2xl bg-zinc-800 border border-zinc-700 text-white font-semibold">Share ↗</button>
                  {safeExternalUrl(detail.museumUrl) && <a href={safeExternalUrl(detail.museumUrl)} target="_blank" rel="noreferrer" className="w-full py-3 rounded-2xl bg-zinc-800 border border-zinc-700 text-white text-center font-semibold">View museum collection ↗</a>}
                  {safeExternalUrl(detail.sourceUrl) && <a href={safeExternalUrl(detail.sourceUrl)} target="_blank" rel="noreferrer" className="w-full py-3 rounded-2xl bg-zinc-800 border border-zinc-700 text-white text-center font-semibold">View image source ↗</a>}
                </div>
                <p className="mt-4 text-xs leading-relaxed text-zinc-500">Public domain — free for personal wallpaper. Check museum license for prints. Image via Wikimedia / IIIF / Met — {resolution}.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-full bg-white text-black text-sm font-semibold shadow-xl border border-zinc-200 max-w-[90vw] truncate">{toast}</div>}

      <footer className="mt-8 border-t border-zinc-800 py-8">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 flex flex-col lg:flex-row gap-3 justify-between items-center text-sm text-zinc-500 text-center lg:text-left">
          <p>© {new Date().getFullYear()} Masterpiece Wallpapers — All paintings public domain. Built for art lovers.</p>
          <span className="text-xs">Sources: Wikimedia Commons • Met Open Access • Art Institute Open Access • Rijksmuseum (optional)</span>
        </div>
      </footer>
    </div>
  )
}

export default App
