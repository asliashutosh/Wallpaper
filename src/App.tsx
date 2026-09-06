import { useEffect, useMemo, useState } from "react"
import { paintings, artists, styles, type Painting } from "./data/paintings"

type Resolution = "HD (1920×1080)" | "4K (3840×2160)" | "Mobile (1080×1920)" | "Original"

function App() {
  const [active, setActive] = useState<Painting>(() => {
    const dayIndex = new Date().getDate() % paintings.length
    return paintings[dayIndex]
  })
  const [search, setSearch] = useState("")
  const [artistFilter, setArtistFilter] = useState("All artists")
  const [styleFilter, setStyleFilter] = useState("All styles")
  const [favs, setFavs] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("mw_favs") || "[]")) } catch { return new Set() }
  })
  const [showFavsOnly, setShowFavsOnly] = useState(false)
  const [resolution, setResolution] = useState<Resolution>("HD (1920×1080)")
  const [detail, setDetail] = useState<Painting | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [livePainting, setLivePainting] = useState<Painting | null>(null)
  const [liveLoading, setLiveLoading] = useState(false)
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    localStorage.setItem("mw_favs", JSON.stringify([...favs]))
  }, [favs])

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 2200)
      return () => clearTimeout(t)
    }
  }, [toast])

  useEffect(() => { setImgError(false) }, [active.id])

  const filtered = useMemo(() => {
    return paintings.filter(p => {
      if (showFavsOnly && !favs.has(p.id)) return false
      if (artistFilter !== "All artists" && p.artist !== artistFilter) return false
      if (styleFilter !== "All styles" && p.style !== styleFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          p.title.toLowerCase().includes(q) ||
          p.artist.toLowerCase().includes(q) ||
          p.style.toLowerCase().includes(q) ||
          p.year.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [search, artistFilter, styleFilter, favs, showFavsOnly])

  const randomize = () => {
    const pool = filtered.length > 1 ? filtered.filter(p => p.id !== active.id) : paintings.filter(p => p.id !== active.id)
    const next = pool[Math.floor(Math.random() * pool.length)]
    setActive(next)
    setImgError(false)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  // preload helper to verify IIIF image actually loads before showing it
  const preloadImage = (url: string, timeoutMs = 6000) =>
    new Promise<void>((resolve, reject) => {
      const img = new Image()
      const t = setTimeout(() => reject(new Error("timeout")), timeoutMs)
      img.onload = () => { clearTimeout(t); resolve() }
      img.onerror = () => { clearTimeout(t); reject(new Error("load failed")) }
      img.src = url
    })

  const toggleFav = (id: string) => {
    setFavs(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const downloadHD = async (p: Painting) => {
    try {
      setDownloading(true)
      // Try to fetch as blob to force download with correct filename
      const res = await fetch(p.image)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      const safeTitle = p.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()
      a.download = `${safeTitle}-${p.artist.replace(/\s+/g, "_")}-${resolution.includes("4K") ? "4K" : resolution.includes("Mobile") ? "mobile" : "HD"}.jpg`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setToast("Download started — check your downloads folder")
    } catch {
      // fallback open in new tab
      window.open(p.image, "_blank")
      setToast("Opened HD image in new tab — long-press to save")
    } finally {
      setDownloading(false)
    }
  }

  // Live fetch from Met Museum API + Art Institute Chicago
  const fetchLiveMasterpiece = async () => {
    setLiveLoading(true)
    try {
      // Try Art Institute of Chicago - random public domain artworks that are paintings
      const searchTerms = ["monet", "van gogh", "rembrandt", "picasso", "cezanne", "degas", "renoir", "manet", "pissarro"]
      const term = searchTerms[Math.floor(Math.random() * searchTerms.length)]
      const params = new URLSearchParams({
        q: term,
        limit: "30",
        "query[term][is_public_domain]": "true",
        "query[term][artwork_type_title]": "Painting",
        fields: "id,title,artist_title,date_display,style_title,image_id,thumbnail,artwork_type_title",
      })
      const res = await fetch(`https://api.artic.edu/api/v1/artworks/search?${params.toString()}`)
      if (!res.ok) throw new Error(`artic ${res.status}`)
      const data = await res.json()
      const withImage = (data.data as any[])?.filter((d: any) => d.image_id && d.artwork_type_title === "Painting")
      if (!withImage?.length) throw new Error("no results")
      // shuffle and try up to 3 candidates with actual image preload
      const shuffled = [...withImage].sort(() => Math.random() - 0.5)
      let chosen: Painting | null = null
      for (const pick of shuffled.slice(0, 5)) {
        const url = `https://www.artic.edu/iiif/2/${pick.image_id}/full/843,/0/default.jpg`
        try {
          await preloadImage(url, 5000)
          chosen = {
            id: `live-${pick.id}`,
            title: pick.title || "Untitled",
            artist: pick.artist_title || "Unknown artist",
            year: pick.date_display || "",
            style: pick.style_title || "Painting",
            museum: "Art Institute of Chicago",
            image: url,
            thumb: `https://www.artic.edu/iiif/2/${pick.image_id}/full/400,/0/default.jpg`,
            colors: ["#1a1a1a", "#c9a86a", "#6b7a8a"],
            description: `Live from the Art Institute of Chicago collection. Search term: "${term}". Public domain painting.`,
            aspect: "4:3",
          }
          break
        } catch {
          // try next
        }
      }
      if (!chosen) throw new Error("no loadable image")
      setLivePainting(chosen)
      setActive(chosen)
      setImgError(false)
      setToast(`Live masterpiece: ${chosen.title} by ${chosen.artist}`)
      window.scrollTo({ top: 0, behavior: "smooth" })
      return
    } catch (e) {
      console.warn("ArtIC failed, trying Met", e)
      // fallback to Met
      try {
        const metIds = [438012, 436532, 437392, 436121, 459116, 337347, 435882, 436105, 437853, 459055, 544228, 437790]
        // try 3 random Met ids
        const tries = [...metIds].sort(() => Math.random() - 0.5).slice(0, 3)
        for (const metId of tries) {
          const r = await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${metId}`)
          if (!r.ok) continue
          const j = await r.json()
          if (j.primaryImage) {
            try { await preloadImage(j.primaryImage, 5000) } catch { continue }
            const live: Painting = {
              id: `met-${j.objectID}`,
              title: j.title,
              artist: j.artistDisplayName || j.artistDisplayBio || "Unknown",
              year: j.objectDate || "",
              style: j.medium?.split(",")[0] || "Painting",
              museum: "The Met, New York",
              image: j.primaryImage,
              thumb: j.primaryImageSmall || j.primaryImage,
              colors: ["#1a1a1a", "#c9a86a", "#6b7a8a"],
              description: j.artistDisplayBio || j.medium || "From the Metropolitan Museum of Art — public domain.",
              aspect: "4:3",
            }
            setLivePainting(live)
            setActive(live)
            setImgError(false)
            setToast(`Live from The Met: ${j.title}`)
            return
          }
        }
        throw new Error("no met image")
      } catch {
        setToast("Live fetch failed — using curated collection instead")
        randomize()
      }
    } finally {
      setLiveLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-zinc-100 selection:bg-amber-500/30">
      {/* Top Nav */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#0a0a0b]/80 border-b border-zinc-800">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 py-4 flex items-center gap-4 justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 grid place-items-center font-serif font-bold text-black text-lg">M</div>
            <div>
              <h1 className="font-serif text-[18px] leading-none font-bold tracking-tight">MASTERPIECE</h1>
              <p className="text-[11px] tracking-[0.18em] text-zinc-400 font-medium">WALLPAPERS • HD PAINTINGS</p>
            </div>
            <span className="hidden md:inline-flex ml-3 text-[11px] px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400">PWA • Works on mobile</span>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => setShowFavsOnly(v => !v)} className={`hidden sm:inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-sm font-medium border transition ${showFavsOnly ? "bg-amber-500 text-black border-amber-500" : "bg-zinc-900 border-zinc-800 hover:bg-zinc-800 text-zinc-300"}`}>
              ♥ {favs.size} Favorites
            </button>
            <a href="#gallery" className="hidden sm:inline-flex px-4 py-2 rounded-full bg-white text-black text-sm font-semibold hover:bg-zinc-200 transition">Browse gallery</a>
            <button onClick={randomize} className="inline-flex items-center gap-2 px-4 sm:px-5 py-2 rounded-full bg-amber-500 text-black text-sm font-bold hover:bg-amber-400 transition shadow-[0_8px_24px_rgba(245,158,11,0.35)]">
              <span className="hidden sm:inline">Shuffle</span> ↻
            </button>
          </div>
        </div>
      </header>

      {/* Hero - Current Wallpaper */}
      <section className="mx-auto max-w-[1400px] px-4 sm:px-6 pt-6 pb-8">
        <div className="grid lg:grid-cols-[1.35fr_0.85fr] gap-6">
          {/* Image card */}
          <div className="relative group overflow-hidden rounded-[28px] bg-zinc-900 border border-zinc-800">
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent z-10 pointer-events-none" />
            {!imgError ? (
              <img
                key={active.id}
                src={active.image}
                alt={`${active.title} by ${active.artist}`}
                className="w-full h-[520px] sm:h-[640px] lg:h-[720px] object-cover object-center transition duration-700 group-hover:scale-[1.02]"
                crossOrigin="anonymous"
                loading="eager"
                onError={() => {
                  console.warn("hero image failed", active.image)
                  setImgError(true)
                  setToast("Image failed to load — trying another")
                  // auto fallback to curated
                  setTimeout(() => {
                    const pool = paintings.filter(p => p.id !== active.id)
                    const next = pool[Math.floor(Math.random() * pool.length)]
                    setActive(next)
                    setImgError(false)
                  }, 900)
                }}
                onLoad={() => setImgError(false)}
              />
            ) : (
              <div className="w-full h-[520px] sm:h-[640px] lg:h-[720px] grid place-items-center bg-zinc-800 text-zinc-400 p-8 text-center">
                <div>
                  <p className="text-4xl mb-3">🖼️</p>
                  <p className="font-semibold text-white">Image unavailable</p>
                  <p className="text-sm mt-1 text-zinc-400">The museum image didn’t load (Cloudflare/IIIF). Falling back to curated collection…</p>
                  <button onClick={randomize} className="mt-4 px-5 py-2 rounded-full bg-amber-500 text-black font-bold text-sm">Shuffle curated</button>
                </div>
              </div>
            )}
            {/* Top badges */}
            <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="px-3 py-1.5 rounded-full bg-black/60 backdrop-blur border border-white/15 text-xs font-semibold tracking-wide text-white">HD • PUBLIC DOMAIN</span>
                <span className="hidden sm:inline-flex px-3 py-1.5 rounded-full bg-white text-black text-xs font-bold">{active.style}</span>
              </div>
              <button
                onClick={() => toggleFav(active.id)}
                aria-label="favorite"
                className={`w-10 h-10 rounded-full grid place-items-center backdrop-blur border transition ${favs.has(active.id) ? "bg-amber-500 border-amber-400 text-black" : "bg-black/50 border-white/20 text-white hover:bg-black/70"}`}
              >
                {favs.has(active.id) ? "♥" : "♡"}
              </button>
            </div>

            {/* Bottom info overlay */}
            <div className="absolute bottom-0 inset-x-0 z-20 p-6 sm:p-8">
              <div className="flex flex-wrap gap-2 mb-3">
                <span className="px-2.5 py-1 rounded-full bg-amber-500 text-black text-[11px] font-bold tracking-widest">WALLPAPER OF THE DAY</span>
                <span className="px-2.5 py-1 rounded-full bg-zinc-900/80 backdrop-blur border border-white/10 text-white text-xs">{active.museum}</span>
              </div>
              <h2 className="font-serif text-3xl sm:text-4xl lg:text-[42px] leading-none font-bold text-white drop-shadow-xl">{active.title}</h2>
              <p className="mt-2 text-zinc-200 text-[15px] sm:text-lg">
                <span className="font-semibold text-white">{active.artist}</span> <span className="text-zinc-400">• {active.year}</span>
              </p>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-300 line-clamp-2 sm:line-clamp-none">{active.description}</p>

              {/* Actions */}
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  onClick={() => downloadHD(active)}
                  disabled={downloading}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white text-black font-bold text-sm hover:bg-zinc-100 transition disabled:opacity-60"
                >
                  {downloading ? "Preparing…" : "⬇ Download HD"} <span className="hidden sm:inline text-zinc-500 font-medium">• Free</span>
                </button>
                <button onClick={randomize} className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-amber-500 text-black font-bold text-sm hover:bg-amber-400 transition">
                  ↻ New wallpaper
                </button>
                <button onClick={() => setDetail(active)} className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-black/40 backdrop-blur border border-white/20 text-white font-semibold text-sm hover:bg-black/60 transition">
                  View details
                </button>
              </div>

              <p className="mt-3 text-[11px] tracking-wide text-zinc-400">Tip: On iPhone/Android, download then open Photos → Share → Use as Wallpaper. Supports {resolution}.</p>
            </div>
          </div>

          {/* Right panel */}
          <div className="flex flex-col gap-6">
            {/* Shuffle + Live */}
            <div className="rounded-[24px] bg-zinc-900 border border-zinc-800 p-6">
              <h3 className="font-serif text-xl font-bold">Get a new masterpiece</h3>
              <p className="mt-1 text-sm text-zinc-400 leading-relaxed">Every wallpaper is a famous painting — no AI, no stock. Curated from the Met, Rijksmuseum, Uffizi & Art Institute (public domain, 4K).</p>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <button onClick={randomize} className="py-3.5 rounded-2xl bg-amber-500 text-black font-bold text-sm hover:bg-amber-400 transition">↻ Shuffle</button>
                <button
                  onClick={fetchLiveMasterpiece}
                  disabled={liveLoading}
                  className="py-3.5 rounded-2xl bg-zinc-800 border border-zinc-700 text-white font-semibold text-sm hover:bg-zinc-700 transition disabled:opacity-60"
                  title="Fetch a random public-domain painting from Art Institute of Chicago / The Met API"
                >
                  {liveLoading ? "Fetching…" : "✨ Live API"}
                </button>
              </div>

              <div className="mt-4 flex items-center gap-2 text-xs text-zinc-500">
                <span className={`w-2 h-2 rounded-full ${livePainting ? "bg-emerald-500 animate-pulse" : "bg-zinc-600"}`} />
                {livePainting ? "Live mode: showing API painting" : "Curated mode: 20 masterpieces offline-ready"}
              </div>

              {/* Resolution */}
              <div className="mt-6">
                <label className="text-xs font-semibold tracking-widest text-zinc-400">RESOLUTION</label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(["HD (1920×1080)", "4K (3840×2160)", "Mobile (1080×1920)", "Original"] as Resolution[]).map(r => (
                    <button
                      key={r}
                      onClick={() => setResolution(r)}
                      className={`px-3 py-2.5 rounded-xl text-xs font-semibold border transition text-left ${resolution === r ? "bg-white text-black border-white" : "bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700"}`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-zinc-500">Original = maximum available (often 2500–5000px). Use Mobile for lock-screen.</p>
              </div>

              {/* Color palette */}
              <div className="mt-6">
                <label className="text-xs font-semibold tracking-widest text-zinc-400">PALETTE</label>
                <div className="mt-2 flex gap-2">
                  {active.colors.map(c => (
                    <div key={c} className="w-8 h-8 rounded-full border border-white/10 shadow" style={{ background: c }} title={c} />
                  ))}
                  <span className="ml-2 text-xs text-zinc-500 self-center">Wallpaper tones</span>
                </div>
              </div>

              {/* Install PWA hint */}
              <div className="mt-6 rounded-2xl bg-gradient-to-br from-amber-500/15 to-orange-600/15 border border-amber-500/20 p-4">
                <p className="text-sm font-bold text-amber-200">📱 Install as app</p>
                <p className="mt-1 text-xs leading-relaxed text-zinc-300">On mobile: Chrome → ⋮ → Add to Home Screen. Then it works fullscreen like a native wallpaper app.</p>
              </div>
            </div>

            {/* Quick stats / museum list */}
            <div className="rounded-[24px] bg-white text-zinc-900 p-6">
              <h4 className="font-bold text-sm tracking-widest">WHY MASTERPIECE?</h4>
              <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-zinc-600">
                <li>• <b className="text-zinc-900">Always a real painting</b> — Van Gogh, Monet, da Vinci, Hokusai, Vermeer, Klimt…</li>
                <li>• <b className="text-zinc-900">HD & free</b> — public domain, no watermarks, no login</li>
                <li>• <b className="text-zinc-900">Daily rotation</b> — new wallpaper every 24h + instant shuffle</li>
                <li>• <b className="text-zinc-900">Museum-grade</b> — sourced from Met, Rijksmuseum, Uffizi, Art Institute</li>
              </ul>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="px-2.5 py-1 rounded-full bg-zinc-900 text-white text-xs font-semibold">20 paintings</span>
                <span className="px-2.5 py-1 rounded-full bg-zinc-100 border border-zinc-200 text-xs">+ Live API ∞</span>
                <span className="px-2.5 py-1 rounded-full bg-zinc-100 border border-zinc-200 text-xs">4K ready</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Controls */}
      <section id="gallery" className="mx-auto max-w-[1400px] px-4 sm:px-6">
        <div className="rounded-[20px] bg-zinc-900 border border-zinc-800 p-4 flex flex-col lg:flex-row gap-4 items-stretch lg:items-center">
          <div className="flex-1 relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500">⌕</span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search paintings, artists, styles… (e.g. Van Gogh, Impressionism)"
              className="w-full pl-10 pr-4 py-3 rounded-2xl bg-zinc-800 border border-zinc-700 text-sm placeholder:text-zinc-500 text-white focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
            />
          </div>

          <div className="flex gap-3 flex-1 lg:flex-none">
            <select value={artistFilter} onChange={e => setArtistFilter(e.target.value)} className="flex-1 lg:w-[180px] px-3 py-3 rounded-2xl bg-zinc-800 border border-zinc-700 text-sm text-white focus:outline-none">
              <option>All artists</option>
              {artists.map(a => <option key={a}>{a}</option>)}
            </select>
            <select value={styleFilter} onChange={e => setStyleFilter(e.target.value)} className="flex-1 lg:w-[180px] px-3 py-3 rounded-2xl bg-zinc-800 border border-zinc-700 text-sm text-white focus:outline-none">
              <option>All styles</option>
              {styles.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-3 text-sm text-zinc-400">
            <span className="hidden sm:inline">{filtered.length} wallpapers</span>
            <button onClick={randomize} className="px-4 py-2 rounded-full bg-white text-black font-semibold text-sm whitespace-nowrap">↻ Random</button>
          </div>
        </div>
      </section>

      {/* Gallery */}
      <section className="mx-auto max-w-[1400px] px-4 sm:px-6 py-6">
        {filtered.length === 0 ? (
          <div className="py-20 text-center rounded-[24px] bg-zinc-900 border border-zinc-800">
            <p className="text-zinc-400">No matches. Try another artist or clear filters.</p>
            <button onClick={() => { setSearch(""); setArtistFilter("All artists"); setStyleFilter("All styles"); setShowFavsOnly(false)}} className="mt-4 px-5 py-2 rounded-full bg-white text-black font-semibold text-sm">Clear filters</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filtered.map(p => (
              <article
                key={p.id}
                className={`group relative overflow-hidden rounded-[20px] bg-zinc-900 border transition cursor-pointer ${active.id === p.id ? "border-amber-500/50 ring-2 ring-amber-500/20" : "border-zinc-800 hover:border-zinc-700"}`}
                onClick={() => setActive(p)}
              >
                <div className="relative overflow-hidden">
                  <img src={p.thumb} alt={p.title} loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }} className="w-full h-[280px] object-cover transition duration-500 group-hover:scale-[1.04]" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-transparent opacity-80" />
                  <div className="absolute top-3 left-3 flex gap-1.5">
                    <span className="px-2.5 py-1 rounded-full bg-black/60 backdrop-blur border border-white/15 text-[11px] font-bold tracking-wide text-white">{p.style}</span>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); toggleFav(p.id)}}
                    className={`absolute top-3 right-3 w-8 h-8 rounded-full grid place-items-center backdrop-blur border text-sm transition ${favs.has(p.id) ? "bg-amber-500 border-amber-400 text-black" : "bg-black/50 border-white/15 text-white"}`}
                    aria-label="fav"
                  >
                    {favs.has(p.id) ? "♥" : "♡"}
                  </button>
                  <div className="absolute bottom-3 left-3 right-3 flex gap-2">
                    <button
                      onClick={e => { e.stopPropagation(); setActive(p); window.scrollTo({ top: 0, behavior: "smooth" })}}
                      className="flex-1 py-2 rounded-full bg-white text-black text-xs font-bold hover:bg-zinc-100 transition"
                    >
                      Set wallpaper
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); setDetail(p)}}
                      className="px-3 py-2 rounded-full bg-black/60 backdrop-blur border border-white/15 text-white text-xs font-semibold"
                    >
                      Details
                    </button>
                  </div>
                  {active.id === p.id && (
                    <span className="absolute bottom-3 right-3 hidden sm:inline-flex translate-y-[-44px] px-2 py-1 rounded-full bg-amber-500 text-black text-[10px] font-bold tracking-widest">ACTIVE</span>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="font-serif font-bold leading-tight line-clamp-1 text-[15px]">{p.title}</h3>
                  <p className="text-sm text-zinc-400 line-clamp-1">{p.artist} • {p.year}</p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-zinc-500">{p.museum}</span>
                    <span className="text-xs px-2 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300">{p.aspect}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="mt-8 rounded-[20px] border border-dashed border-zinc-700 p-6 text-center">
          <p className="text-sm text-zinc-400">Want infinite wallpapers? Use <b className="text-zinc-200">✨ Live API</b> — pulls a fresh public-domain painting from Chicago & The Met each time. No API key needed.</p>
          <div className="mt-3 flex justify-center gap-3">
            <button onClick={fetchLiveMasterpiece} disabled={liveLoading} className="px-5 py-2.5 rounded-full bg-amber-500 text-black font-bold text-sm disabled:opacity-60">{liveLoading ? "Fetching…" : "Fetch live masterpiece"}</button>
            <button onClick={randomize} className="px-5 py-2.5 rounded-full bg-zinc-800 border border-zinc-700 text-white font-semibold text-sm">Shuffle curated</button>
          </div>
        </div>
      </section>

      {/* Detail Modal */}
      {detail && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setDetail(null)} />
          <div className="relative w-full max-w-5xl max-h-[90vh] overflow-auto rounded-[28px] bg-zinc-900 border border-zinc-800">
            <button onClick={() => setDetail(null)} className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-black/60 backdrop-blur border border-white/20 text-white grid place-items-center hover:bg-black/80">✕</button>
            <div className="grid lg:grid-cols-[1.3fr_0.9fr] gap-0">
              <img src={detail.image} alt={detail.title} className="w-full h-[420px] lg:h-[640px] object-cover" />
              <div className="p-6 sm:p-8">
                <span className="inline-flex px-3 py-1 rounded-full bg-amber-500 text-black text-xs font-bold tracking-widest">{detail.style} • {detail.year}</span>
                <h3 className="mt-3 font-serif text-3xl font-bold leading-none">{detail.title}</h3>
                <p className="mt-2 text-zinc-300"><span className="font-semibold text-white">{detail.artist}</span> • {detail.museum}</p>
                <p className="mt-4 text-sm leading-relaxed text-zinc-400">{detail.description}</p>

                <div className="mt-6 flex flex-wrap gap-2">
                  {detail.colors.map(c => <span key={c} className="w-7 h-7 rounded-full border border-white/10" style={{ background: c }} />)}
                </div>

                <div className="mt-8 grid gap-3">
                  <button onClick={() => { setActive(detail); setDetail(null); window.scrollTo({ top: 0, behavior: "smooth"})}} className="w-full py-3.5 rounded-2xl bg-amber-500 text-black font-bold">Use as wallpaper</button>
                  <button onClick={() => downloadHD(detail)} className="w-full py-3.5 rounded-2xl bg-white text-black font-bold">⬇ Download HD</button>
                  <button
                    onClick={async () => {
                      const text = `${detail.title} by ${detail.artist} — ${detail.museum} — ${detail.image}`
                      try { await navigator.clipboard.writeText(text); setToast("Link copied") } catch { setToast("Copied") }
                    }}
                    className="w-full py-3 rounded-2xl bg-zinc-800 border border-zinc-700 text-white font-semibold"
                  >
                    Copy share link
                  </button>
                </div>

                <p className="mt-4 text-xs leading-relaxed text-zinc-500">Public domain artwork — free for personal wallpaper use. For commercial prints, check museum license. Image served from Wikimedia / Art Institute IIIF in highest available resolution.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-full bg-white text-black text-sm font-semibold shadow-xl border border-zinc-200">
          {toast}
        </div>
      )}

      {/* Footer */}
      <footer className="mt-8 border-t border-zinc-800 py-8">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 flex flex-col sm:flex-row gap-4 justify-between items-center text-sm text-zinc-500">
          <p>© {new Date().getFullYear()} Masterpiece Wallpapers — All paintings are public domain. Built for art lovers.</p>
          <div className="flex gap-4">
            <span>Sources: Wikimedia Commons • Met Museum API • Art Institute of Chicago API</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
