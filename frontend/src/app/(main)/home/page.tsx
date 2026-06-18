"use client"

import { useEffect, useState } from "react"
import { Play, Plus } from "lucide-react"
import Link from "next/link"
import { api } from "@/lib/api"

export default function HomePage() {
  const [movies, setMovies] = useState<any[]>([])
  const [series, setSeries] = useState<any[]>([])
  const [channels, setChannels] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.getMovies(15),
      api.getSeries(15),
      api.getLiveChannels()
    ]).then(([m, s, c]) => {
      setMovies(m)
      setSeries(s)
      setChannels(c.slice(0, 15))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="flex items-center justify-center h-full w-full bg-black"><div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>
  }

  const isEmpty = movies.length === 0 && series.length === 0 && channels.length === 0

  if (isEmpty) {
    return (
      <div className="relative h-screen w-full bg-black flex items-center justify-center">
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-30"
          style={{ backgroundImage: `url('https://image.tmdb.org/t/p/original/mAJ84W6I8I272Da87qxcj2DpTOo.jpg')` }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-transparent" />
        
        <div className="relative z-10 text-center max-w-2xl px-6 flex flex-col items-center">
          <h1 className="text-6xl font-black text-white mb-6 tracking-tight">Welcome to IPGENZ</h1>
          <p className="text-xl text-white/70 mb-10">
            Sync your IPTV providers to unlock thousands of beautifully organized movies, series, and live channels instantly.
          </p>
          <Link href="/providers" className="bg-primary hover:bg-primary/90 text-white font-bold px-10 py-4 rounded-full text-lg transition shadow-[0_0_40px_rgba(124,58,237,0.4)] flex items-center gap-3">
            <Plus size={24} /> Add Provider
          </Link>
        </div>
      </div>
    )
  }

  const featured = movies.length > 0 ? movies[0] : (series.length > 0 ? series[0] : null)

  return (
    <div className="relative h-screen w-full bg-black overflow-hidden flex flex-col">
      {/* Featured Background & Overlay */}
      {featured && (
        <div className="absolute inset-0 z-0">
          <div 
            className="absolute inset-0 bg-cover bg-center transition-transform duration-1000 scale-105"
            style={{ backgroundImage: `url('${featured.backdrop || "https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=2525&auto=format&fit=crop"}')` }}
          />
          {/* Dark gradient vignette matching the screenshot */}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/20 to-transparent" />
        </div>
      )}

      {/* Main Content Area */}
      <div className="relative z-10 flex-1 overflow-y-auto pt-40 px-12 pb-20 scrollbar-hide">
        
        {/* Hero Info */}
        {featured && (
          <div className="max-w-3xl mb-16 animate-in slide-in-from-bottom-8 duration-700 fade-in">
            <h1 className="text-7xl font-black text-white leading-tight tracking-tighter drop-shadow-2xl mb-4">
              {featured.name.toUpperCase()}
            </h1>
            
            <div className="flex items-center gap-4 text-white/90 text-sm font-semibold mb-8">
              {featured.category?.name && <span>{featured.category.name}</span>}
              <span className="text-green-400">98% Match</span>
              <span>2024</span>
            </div>

            <div className="flex items-center gap-4">
              <Link 
                href={movies.length > 0 ? `/movies/${featured.id}` : `/series/${featured.id}`} 
                className="flex items-center gap-2 bg-[#8a2be2] hover:bg-[#9b3df3] text-white px-10 py-3 rounded-full font-bold transition shadow-[0_0_30px_rgba(138,43,226,0.5)]"
              >
                <Play fill="currentColor" size={20} /> PLAY
              </Link>
              <button className="flex items-center justify-center w-12 h-12 rounded-full border-2 border-white/50 text-white hover:border-white transition">
                <Plus size={24} />
              </button>
            </div>
          </div>
        )}

        {/* Horizontal Carousels */}
        <div className="flex flex-col gap-10 mt-auto">
          {movies.length > 1 && <ContentRail title="MY LIST" items={movies.slice(1)} type="movie" />}
          {series.length > 0 && <ContentRail title="TRENDING SERIES" items={series} type="series" />}
          {channels.length > 0 && (
            <div className="flex flex-col gap-4">
              <h2 className="text-lg font-bold text-white tracking-widest px-2">LIVE CHANNELS</h2>
              <div className="flex gap-4 overflow-x-auto pb-6 px-2 snap-x scrollbar-hide">
                {channels.map((ch) => (
                  <Link href={`/live/${ch.id}`} key={ch.id} className="snap-start shrink-0 w-64 bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-4 hover:border-white/30 transition hover:scale-105 group cursor-pointer">
                    <div className="h-20 flex items-center justify-center mb-2">
                      {ch.logo ? <img src={ch.logo} alt={ch.name} className="max-h-full max-w-full object-contain drop-shadow-lg" /> : <h3 className="font-bold text-lg text-center text-white">{ch.name}</h3>}
                    </div>
                    <p className="text-xs text-white/60 text-center font-bold tracking-widest uppercase truncate">{ch.category?.name}</p>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ContentRail({ title, items, type }: { title: string, items: any[], type: "movie" | "series" }) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-bold text-white tracking-widest px-2">{title}</h2>
      <div className="flex gap-4 overflow-x-auto pb-6 px-2 snap-x scrollbar-hide">
        {items.map((item) => (
          <Link 
            href={`/${type === 'movie' ? 'movies' : 'series'}/${item.id}`}
            key={item.id} 
            className="snap-start shrink-0 w-44 aspect-[2/3] bg-zinc-900 rounded-lg overflow-hidden relative group cursor-pointer border border-transparent hover:border-white/50 transition-all duration-300 hover:scale-105 hover:-translate-y-2 shadow-xl hover:shadow-2xl"
          >
            {item.poster ? (
              <div className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110" style={{ backgroundImage: `url('${item.poster}')` }} />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-white/30">{item.name}</div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
              <div className="text-sm font-bold text-white truncate mb-2">{item.name}</div>
              <Play className="fill-white text-white w-10 h-10 self-center mb-6 shadow-2xl drop-shadow-2xl transform scale-50 opacity-0 group-hover:scale-100 group-hover:opacity-100 transition-all duration-300 delay-100" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
