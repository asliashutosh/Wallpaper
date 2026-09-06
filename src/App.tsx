import { useEffect, useMemo, useState } from "react"
import { paintings, artists, styles, museums, type Painting } from "./data/paintings"

type Resolution = "HD (1920×1080)" | "4K (3840×2160)" | "Mobile (1080×1920)" | "Ultrawide (2560×1080)" | "Original"
type CoverMode = "cover" | "contain"
type LiveMode = "famous" | "latest" | "random"

function getResizedUrl(p: Painting, res: Resolution): string {
  // Wikimedia thumb: /thumb/.../XXXpx-name.jpg -> replace width
  const targetWidth = res === "4K (3840×2160)" ? "2560px" : res === "HD (1920×1080)" ? "1920px" : res === "Mobile (1080×1920)" ? "1080px" : res === "Ultrawide (2560×1080)" ? "2560px" : null
  if (targetWidth && p.image.includes("/thumb/")) {
    return p.image.replace(/\/\d+px-/, `/${targetWidth}-`)
  }
  if (targetWidth && p.image.includes("wikimedia.org")) {
    // fallback for non-thumb original.jpg -> request thumb via ?width (Wikimedia supports thumb proxy, but we keep original)
    return p.image
  }
  // IIIF (Art Institute)
  if (p.image.includes("/iiif/2/")) {
    const w = res === "4K (3840×2160)" ? "2000," : res === "HD (1920×1080)" ? "1600," : res === "Mobile (1080×1920)" ? "1080," : res === "Ultrawide (2560×1080)" ? "2560," : "843,"
    return p.image.replace(/\/full\/[^/]+\//, `/full/${w}/`)
  }
  // Met & others: original is already max, return as is
  return p.image
}

function App() {
  const [active, setActive] = useState<Painting>(() => {
    const dayIndex = new Date().getDate() % paintings.length
    return paintings[dayIndex]
  })
  const [search, setSearch] = useState("")
  const [artistFilter, setArtistFilter] = useState("All artists")
  const [styleFilter, setStyleFilter] = useState("All styles")
  const [museumFilter, setMuseumFilter] = useState("All museums")
  const [sort, setSort] = useState<"shuffle" | "artist" | "year">("shuffle")
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
  const [livePainting, setLivePainting] = useState<Painting | null>(null)
  const [liveLoading, setLiveLoading] = useState(false)
  const [liveMode, setLiveMode] = useState<LiveMode>("famous")
  const [imgError, setImgError] = useState(false)
  const [autoDaily, setAutoDaily] = useState<boolean>(() => {
    try { return localStorage.getItem("mw_autodaily") === "1" } catch { return false }
  })
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  useEffect(() => { localStorage.setItem("mw_favs", JSON.stringify([...favs])) }, [favs])
  useEffect(() => { localStorage.setItem("mw_history", JSON.stringify(history.slice(0, 30))) }, [history])
  useEffect(() => { localStorage.setItem("mw_autodaily", autoDaily ? "1" : "0") }, [autoDaily])
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 2400); return () => clearTimeout(t) } }, [toast])
  useEffect(() => { setImgError(false) }, [active.id])
  useEffect(() => {
    // record history on active change
    setHistory(h => {
      const n = [active.id, ...h.filter(x => x !== active.id)].slice(0, 30)
      return n
    })
  }, [active.id])

  // daily auto: if enabled, lock to day Index until next day
  useEffect(() => {
    if (!autoDaily) return
    const dayIndex = new Date().getDate() % paintings.length
    setActive(paintings[dayIndex])
  }, [autoDaily])

  const filtered = useMemo(() => {
    let out = paintings.filter(p => {
      if (showFavsOnly && !favs.has(p.id)) return false
      if (artistFilter !== "All artists" && p.artist !== artistFilter) return false
      if (styleFilter !== "All styles" && p.style !== styleFilter) return false
      if (museumFilter !== "All museums" && p.museum !== museumFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return p.title.toLowerCase().includes(q) || p.artist.toLowerCase().includes(q) || p.style.toLowerCase().includes(q) || p.year.toLowerCase().includes(q) || p.museum.toLowerCase().includes(q)
      }
      return true
    })
    if (sort === "artist") out = [...out].sort((a, b) => a.artist.localeCompare(b.artist))
    else if (sort === "year") out = [...out].sort((a, b) => a.year.localeCompare(b.year))
    else if (sort === "shuffle") out = [...out] // keep original
    return out
  }, [search, artistFilter, styleFilter, museumFilter, favs, showFavsOnly, sort])

  const historyPaintings = useMemo(() => history.map(id => paintings.find(p => p.id === id) || (livePainting?.id === id ? livePainting : null)).filter(Boolean) as Painting[], [history, livePainting])

  const randomize = () => {
    const pool = filtered.length > 1 ? filtered.filter(p => p.id !== active.id) : paintings.filter(p => p.id !== active.id)
    const next = pool[Math.floor(Math.random() * pool.length)]
    setActive(next)
    setImgError(false)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const preloadImage = (url: string, timeoutMs = 6000) =>
    new Promise<void>((resolve, reject) => {
      const img = new Image()
      const t = setTimeout(() => reject(new Error("timeout")), timeoutMs)
      img.onload = () => { clearTimeout(t); resolve() }
      img.onerror = () => { clearTimeout(t); reject(new Error("load failed")) }
      img.src = url
    })

  const toggleFav = (id: string) => setFavs(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const sharePainting = async (p: Painting) => {
    const text = `${p.title} by ${p.artist} (${p.year}) — ${p.museum}\n${getResizedUrl(p, resolution)}`
    if (navigator.share) {
      try { await navigator.share({ title: `${p.title} — ${p.artist}`, text, url: p.image }); setToast("Shared") ; return } catch {}
    }
    try { await navigator.clipboard.writeText(text); setToast("Link copied") } catch { setToast("Copied") }
  }

  const downloadHD = async (p: Painting) => {
    const url = getResizedUrl(p, resolution)
    try {
      setDownloading(true)
      // Try blob download (needs CORS). Wikimedia & Met allow it; IIIF may block -> catch
      const res = await fetch(url, { mode: "cors" })
      if (!res.ok) throw new Error(`http ${res.status}`)
      const blob = await res.blob()
      const objUrl = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = objUrl
      const safeTitle = p.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()
      const suffix = resolution.includes("4K") ? "4K" : resolution.includes("Mobile") ? "mobile" : resolution.includes("Ultrawide") ? "ultrawide" : "HD"
      a.download = `${safeTitle}-${p.artist.replace(/\s+/g, "_")}-${suffix}.jpg`
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(objUrl)
      setToast("Download started — check downloads")
    } catch {
      window.open(url, "_blank")
      setToast("Opened HD image — long-press to save")
    } finally { setDownloading(false) }
  }

  const fetchLiveMasterpiece = async () => {
    setLiveLoading(true)
    try {
      const searchTermsFamous = ["monet", "van gogh", "rembrandt", "picasso", "cezanne", "degas", "renoir", "manet", "vermeer", "turner"]
      const searchTermsLatest = ["contemporary", "abstract", "impressionism", "portrait"]
      const termPool = liveMode === "latest" ? searchTermsLatest : liveMode === "famous" ? searchTermsFamous : [...searchTermsFamous, ...searchTermsLatest]
      const term = termPool[Math.floor(Math.random() * termPool.length)]
      const params = new URLSearchParams({
        q: term,
        limit: liveMode === "latest" ? "30" : "30",
        "query[term][is_public_domain]": "true",
        "query[term][artwork_type_title]": "Painting",
        fields: "id,title,artist_title,date_display,style_title,image_id,thumbnail,artwork_type_title,date_start",
      })
      // latest: sort by date_start desc via search params not directly supported, so we randomize and let client pick newer date_start
      const res = await fetch(`https://api.artic.edu/api/v1/artworks/search?${params.toString()}`)
      if (!res.ok) throw new Error(`artic ${res.status}`)
      const data = await res.json()
      let candidates = (data.data as any[])?.filter((d: any) => d.image_id && d.artwork_type_title === "Painting") || []
      if (liveMode === "latest") candidates = [...candidates].sort((a, b) => (b.date_start || 0) - (a.date_start || 0))
      else candidates = [...candidates].sort(() => Math.random() - 0.5)
      if (!candidates.length) throw new Error("no results")
      let chosen: Painting | null = null
      for (const pick of candidates.slice(0, 6)) {
        const url = `https://www.artic.edu/iiif/2/${pick.image_id}/full/843,/0/default.jpg`
        try { await preloadImage(url, 5500); chosen = {
          id: `live-${pick.id}`, title: pick.title || "Untitled", artist: pick.artist_title || "Unknown artist", year: pick.date_display || String(pick.date_start || ""), style: pick.style_title || "Painting", museum: "Art Institute of Chicago",
          image: url, thumb: `https://www.artic.edu/iiif/2/${pick.image_id}/full/400,/0/default.jpg`,
          colors: ["#1a1a1a", "#c9a86a", "#6b7a8a"],
          description: `Live from the Art Institute of Chicago — ${liveMode === "latest" ? "recent acquisition" : "public domain masterpiece"} • search: "${term}"`,
          aspect: "4:3", license: "CC0 — Art Institute Open Access"
        }; break } catch {}
      }
      if (!chosen) throw new Error("no loadable image")
      setLivePainting(chosen); setActive(chosen); setImgError(false)
      setToast(`Live ${liveMode}: ${chosen.title} — ${chosen.artist}`)
      window.scrollTo({ top: 0, behavior: "smooth" }); return
    } catch (e) {
      console.warn("ArtIC failed, trying Met", e)
      try {
        const metIds = [438012, 436532, 437392, 436121, 459116, 337347, 435882, 436105, 437853, 459055, 544228, 437790, 436667, 437133, 459080, 544525, 459193, 544446]
        const tries = [...metIds].sort(() => Math.random() - 0.5).slice(0, 4)
        for (const metId of tries) {
          const r = await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${metId}`)
          if (!r.ok) continue
          const j = await r.json()
          if (j.primaryImage) {
            try { await preloadImage(j.primaryImage, 5500) } catch { continue }
            const live: Painting = {
              id: `met-${j.objectID}`, title: j.title, artist: j.artistDisplayName || j.artistDisplayBio || "Unknown", year: j.objectDate || "",
              style: j.medium?.split(",")[0] || "Painting", museum: "The Met, New York",
              image: j.primaryImage, thumb: j.primaryImageSmall || j.primaryImage,
              colors: ["#1a1a1a", "#c9a86a", "#6b7a8a"],
              description: j.artistDisplayBio || j.medium || "From the Metropolitan Museum of Art — public domain.",
              aspect: "4:3", license: "CC0 — The Met Open Access"
            }
            setLivePainting(live); setActive(live); setImgError(false)
            setToast(`Live from The Met: ${j.title}`); return
          }
        }
        throw new Error("no met image")
      } catch {
        setToast("Live fetch failed — using curated")
        randomize()
      }
    } finally { setLiveLoading(false) }
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
        {/* mobile filters dropdown */}
        {mobileFiltersOpen && (
          <div className="sm:hidden border-t border-zinc-800 bg-zinc-900 px-4 py-3">
            <div className="flex gap-2 overflow-auto scrollbar-hide">
              <button onClick={()=>setShowFavsOnly(v=>!v)} className={`px-3 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap ${showFavsOnly?"bg-amber-500 text-black":"bg-zinc-800 text-white border-zinc-700"}`}>♥ Favorites</button>
              <span className="px-3 py-1.5 rounded-full bg-zinc-800 border border-zinc-700 text-xs text-zinc-400 whitespace-nowrap">{filtered.length} items</span>
            </div>
          </div>
        )}
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-[1400px] px-4 sm:px-6 pt-5 pb-6">
        <div className="grid lg:grid-cols-[1.35fr_0.85fr] gap-5">
          <div className="relative group overflow-hidden rounded-[28px] bg-zinc-900 border border-zinc-800">
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent z-10 pointer-events-none" />
            {!imgError ? (
              <img key={active.id} src={activeUrl} alt={`${active.title} by ${active.artist}`} className={`w-full h-[500px] sm:h-[620px] lg:h-[700px] object-center transition duration-700 group-hover:scale-[1.02] ${coverMode==="cover"?"object-cover":"object-contain bg-zinc-800"}`} crossOrigin="anonymous" loading="eager"
                onError={() => { console.warn("hero image failed", activeUrl); setImgError(true); setToast("Image failed — trying another"); setTimeout(()=>{ const pool = paintings.filter(p=>p.id!==active.id); const n = pool[Math.floor(Math.random()*pool.length)]; setActive(n); setImgError(false)}, 900)}}
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
                {livePainting?.id === active.id && <span className="px-2.5 py-1 rounded-full bg-emerald-500 text-black text-xs font-bold">LIVE API</span>}
              </div>
              <h2 className="font-serif text-[28px] sm:text-4xl lg:text-[42px] leading-none font-bold text-white drop-shadow-xl line-clamp-2">{active.title}</h2>
              <p className="mt-2 text-zinc-200 text-[15px] sm:text-lg"><span className="font-semibold text-white">{active.artist}</span> <span className="text-zinc-400">• {active.year}</span></p>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-300 line-clamp-2 sm:line-clamp-none">{active.description}</p>
              <div className="mt-4 flex flex-wrap gap-2.5">
                <button onClick={()=>downloadHD(active)} disabled={downloading} className="inline-flex items-center gap-2 px-5 sm:px-6 py-3 rounded-full bg-white text-black font-bold text-sm hover:bg-zinc-100 transition disabled:opacity-60">{downloading?"Preparing…":"⬇ Download"} <span className="hidden sm:inline text-zinc-500 font-medium">• {resolution.split("(")[0].trim()}</span></button>
                <button onClick={randomize} className="inline-flex items-center gap-2 px-5 sm:px-6 py-3 rounded-full bg-amber-500 text-black font-bold text-sm hover:bg-amber-400 transition">↻ New wallpaper</button>
                <button onClick={()=>setDetail(active)} className="inline-flex items-center gap-2 px-4 sm:px-5 py-3 rounded-full bg-black/40 backdrop-blur border border-white/20 text-white font-semibold text-sm hover:bg-black/60 transition">Details</button>
                <button onClick={()=>sharePainting(active)} className="inline-flex items-center gap-2 px-4 py-3 rounded-full bg-zinc-800 border border-zinc-700 text-white font-semibold text-sm hover:bg-zinc-700 transition">Share ↗</button>
              </div>
              <div className="mt-3 flex items-center gap-3 text-[11px] tracking-wide text-zinc-400 flex-wrap">
                <span>Tip: Download → Photos → Share → Use as Wallpaper</span>
                <span className="hidden sm:inline">•</span>
                <button onClick={()=>setCoverMode(m=>m==="cover"?"contain":"cover")} className="underline decoration-zinc-600 underline-offset-2 hover:text-white">View: {coverMode === "cover" ? "Fill (wallpaper)" : "Fit (full painting)"}</button>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-5">
            <div className="rounded-[24px] bg-zinc-900 border border-zinc-800 p-5 sm:p-6">
              <h3 className="font-serif text-xl font-bold">Get a new masterpiece</h3>
              <p className="mt-1 text-sm text-zinc-400 leading-relaxed">Every wallpaper is a real painting — no AI, no stock. {paintings.length} curated + ∞ live (Met, ArtIC, Rijks — public domain, 4K).</p>
              <div className="mt-4 flex gap-2">
                {(["famous","latest","random"] as LiveMode[]).map(m => (
                  <button key={m} onClick={()=>setLiveMode(m)} className={`flex-1 py-2 rounded-full text-xs font-bold border capitalize transition ${liveMode===m?"bg-white text-black border-white":"bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700"}`}>{m}</button>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <button onClick={randomize} className="py-3 rounded-2xl bg-amber-500 text-black font-bold text-sm hover:bg-amber-400 transition">↻ Shuffle</button>
                <button onClick={fetchLiveMasterpiece} disabled={liveLoading} className="py-3 rounded-2xl bg-zinc-800 border border-zinc-700 text-white font-semibold text-sm hover:bg-zinc-700 transition disabled:opacity-60">{liveLoading?"Fetching…":`✨ Live ${liveMode}`}</button>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
                <span className={`w-2 h-2 rounded-full ${livePainting?"bg-emerald-500 animate-pulse":"bg-zinc-600"}`} />
                {livePainting ? `Live: ${livePainting.title.slice(0,32)}` : `Curated: ${paintings.length} offline-ready`}
              </div>

              <div className="mt-5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold tracking-widest text-zinc-400">RESOLUTION</label>
                  <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                    <input type="checkbox" checked={autoDaily} onChange={e=>setAutoDaily(e.target.checked)} className="accent-amber-500" /> Daily lock
                  </label>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(["HD (1920×1080)","4K (3840×2160)","Mobile (1080×1920)","Ultrawide (2560×1080)","Original"] as Resolution[]).map(r => (
                    <button key={r} onClick={()=>setResolution(r)} className={`px-3 py-2.5 rounded-xl text-xs font-semibold border transition text-left leading-tight ${resolution===r?"bg-white text-black border-white":"bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700"}`}>{r}</button>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-zinc-500">Wikimedia thumbs: 1080/1920/2560px • IIIF: width param • Met: original max</p>
              </div>

              <div className="mt-5">
                <label className="text-xs font-semibold tracking-widest text-zinc-400">PALETTE</label>
                <div className="mt-2 flex gap-2">
                  {active.colors.map(c => <div key={c} className="w-8 h-8 rounded-full border border-white/10 shadow" style={{background:c}} title={c} />)}
                  <span className="ml-2 text-xs text-zinc-500 self-center">Wallpaper tones</span>
                </div>
              </div>

              {historyPaintings.length > 0 && (
                <div className="mt-5">
                  <label className="text-xs font-semibold tracking-widest text-zinc-400">RECENT</label>
                  <div className="mt-2 flex gap-2 overflow-auto scrollbar-hide pb-1">
                    {historyPaintings.slice(0,10).map(p => (
                      <button key={p.id+"h"} onClick={()=>setActive(p)} className={`shrink-0 w-14 h-14 rounded-xl overflow-hidden border-2 ${active.id===p.id?"border-amber-500":"border-transparent"}`}>
                        <img src={p.thumb} alt={p.title} className="w-full h-full object-cover" loading="lazy" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-5 rounded-2xl bg-gradient-to-br from-amber-500/15 to-orange-600/15 border border-amber-500/20 p-4">
                <p className="text-sm font-bold text-amber-200">📱 Install as app</p>
                <p className="mt-1 text-xs leading-relaxed text-zinc-300">Mobile: Chrome → ⋮ → Add to Home Screen. Then fullscreen + offline. For native iOS/Android use Capacitor (see README).</p>
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
            <select value={sort} onChange={e=>setSort(e.target.value as any)} className="w-[130px] px-3 py-3 rounded-2xl bg-zinc-800 border border-zinc-700 text-sm text-white focus:outline-none">
              <option value="shuffle">Shuffle</option><option value="artist">Sort: Artist</option><option value="year">Sort: Year</option>
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
            <button onClick={()=>{setSearch(""); setArtistFilter("All artists"); setStyleFilter("All styles"); setMuseumFilter("All museums"); setShowFavsOnly(false)}} className="mt-4 px-5 py-2 rounded-full bg-white text-black font-semibold text-sm">Clear filters</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filtered.map(p => (
              <article key={p.id} className={`group relative overflow-hidden rounded-[20px] bg-zinc-900 border transition cursor-pointer flex flex-col ${active.id===p.id?"border-amber-500/50 ring-2 ring-amber-500/20":"border-zinc-800 hover:border-zinc-700"}`} onClick={()=>setActive(p)}>
                <div className="relative overflow-hidden">
                  <img src={p.thumb} alt={`${p.title} by ${p.artist}`} loading="lazy" onError={e=>{(e.currentTarget as HTMLImageElement).style.display="none"}} className="w-full h-[260px] object-cover transition duration-500 group-hover:scale-[1.04]" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-transparent opacity-80" />
                  <div className="absolute top-3 left-3 flex gap-1.5 flex-wrap max-w-[70%]">
                    <span className="px-2.5 py-1 rounded-full bg-black/60 backdrop-blur border border-white/15 text-[11px] font-bold tracking-wide text-white">{p.style}</span>
                  </div>
                  <button onClick={e=>{e.stopPropagation(); toggleFav(p.id)}} aria-label="favorite" className={`absolute top-3 right-3 w-8 h-8 rounded-full grid place-items-center backdrop-blur border text-sm transition ${favs.has(p.id)?"bg-amber-500 border-amber-400 text-black":"bg-black/50 border-white/15 text-white"}`}>{favs.has(p.id)?"♥":"♡"}</button>
                  <div className="absolute bottom-3 left-3 right-3 flex gap-2">
                    <button onClick={e=>{e.stopPropagation(); setActive(p); window.scrollTo({top:0, behavior:"smooth"})}} className="flex-1 py-2 rounded-full bg-white text-black text-xs font-bold hover:bg-zinc-100 transition">Set wallpaper</button>
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
        <div className="mt-8 rounded-[20px] border border-dashed border-zinc-700 p-6 text-center">
          <p className="text-sm text-zinc-400">Want infinite? Use <b className="text-zinc-200">✨ Live</b> — famous/latest/random public-domain from Chicago & The Met. No key.</p>
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
          <div className="relative w-full max-w-5xl max-h-[90vh] overflow-auto rounded-[28px] bg-zinc-900 border border-zinc-800">
            <button onClick={()=>setDetail(null)} className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-black/60 backdrop-blur border border-white/20 text-white grid place-items-center hover:bg-black/80">✕</button>
            <div className="grid lg:grid-cols-[1.3fr_0.9fr] gap-0">
              <img src={getResizedUrl(detail, resolution)} alt={detail.title} className={`w-full h-[420px] lg:h-[640px] ${coverMode==="cover"?"object-cover":"object-contain bg-zinc-800"}`} />
              <div className="p-6 sm:p-8">
                <span className="inline-flex px-3 py-1 rounded-full bg-amber-500 text-black text-xs font-bold tracking-widest">{detail.style} • {detail.year}</span>
                <h3 className="mt-3 font-serif text-3xl font-bold leading-none">{detail.title}</h3>
                <p className="mt-2 text-zinc-300"><span className="font-semibold text-white">{detail.artist}</span> • {detail.museum}</p>
                <p className="mt-1 text-xs text-zinc-500">{detail.license} • {detail.aspect}</p>
                <p className="mt-4 text-sm leading-relaxed text-zinc-400">{detail.description}</p>
                <div className="mt-6 flex flex-wrap gap-2">{detail.colors.map(c=><span key={c} className="w-7 h-7 rounded-full border border-white/10" style={{background:c}} />)}</div>
                <div className="mt-8 grid gap-3">
                  <button onClick={()=>{setActive(detail); setDetail(null); window.scrollTo({top:0,behavior:"smooth"})}} className="w-full py-3.5 rounded-2xl bg-amber-500 text-black font-bold">Use as wallpaper</button>
                  <button onClick={()=>downloadHD(detail)} className="w-full py-3.5 rounded-2xl bg-white text-black font-bold">⬇ Download {resolution.split("(")[0].trim()}</button>
                  <button onClick={()=>sharePainting(detail)} className="w-full py-3 rounded-2xl bg-zinc-800 border border-zinc-700 text-white font-semibold">Share ↗</button>
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
