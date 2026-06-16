"use client"

import { useEffect, useState } from "react"
import { Play, Plus, Info } from "lucide-react"
import Link from "next/link"
import { api } from "@/lib/api"

export default function HomePage() {
  const [movies, setMovies] = useState<any[]>([])
  const [series, setSeries] = useState<any[]>([])
  const [channels, setChannels] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.getMovies(10),
      api.getSeries(10),
      api.getLiveChannels()
    ]).then(([m, s, c]) => {
      setMovies(m)
      setSeries(s)
      setChannels(c.slice(0, 10))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="flex items-center justify-center h-full"><div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>
  }

  const featured = movies.length > 0 ? movies[0] : null

  return (
    <div className="flex flex-col gap-10 p-8 pb-10 overflow-y-auto h-full">
      {/* Hero Banner */}
      <div className="relative h-[60vh] w-full rounded-2xl overflow-hidden bg-zinc-900 group">
        <div 
          className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
          style={{ backgroundImage: `url('${featured?.backdrop || "https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=2525&auto=format&fit=crop"}')` }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/40 to-transparent" />
        
        <div className="absolute bottom-0 left-0 p-10 flex flex-col gap-4 max-w-2xl">
          <h1 className="text-5xl font-black text-white tracking-tight">{featured?.name || "Welcome to IPGENZ"}</h1>
          <p className="text-muted-foreground text-lg line-clamp-3">
            {featured?.description || "Sync your IPTV providers to unlock thousands of movies, series, and live channels."}
          </p>
          <div className="flex items-center gap-3 mt-4">
            {featured ? (
              <Link href={`/movies/${featured.id}`} className="flex items-center gap-2 bg-white text-black px-6 py-3 rounded-full font-bold hover:bg-white/90 transition">
                <Play fill="currentColor" size={20} /> Play Now
              </Link>
            ) : (
              <Link href="/providers" className="flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-full font-bold hover:bg-primary/90 transition">
                <Plus size={20} /> Add Provider
              </Link>
            )}
            <button className="flex items-center gap-2 bg-zinc-800/80 text-white px-6 py-3 rounded-full font-bold hover:bg-zinc-700 transition backdrop-blur-md border border-white/10">
              <Plus size={20} /> Watch Later
            </button>
            <button className="flex items-center justify-center bg-zinc-800/80 text-white w-12 h-12 rounded-full hover:bg-zinc-700 transition backdrop-blur-md border border-white/10">
              <Info size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Content Rails */}
      {movies.length > 0 && <ContentRail title="Trending Movies" items={movies} type="movie" />}
      {series.length > 0 && <ContentRail title="Popular Series" items={series} type="series" />}
      {channels.length > 0 && (
        <div className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold px-2">Live Channels</h2>
          <div className="flex gap-4 overflow-x-auto pb-4 px-2 snap-x scrollbar-hide">
            {channels.map((ch) => (
              <Link href={`/live/${ch.id}`} key={ch.id} className="snap-start shrink-0 w-64 bg-surface border border-white/10 rounded-xl p-4 hover:border-white/30 transition hover:scale-105 group cursor-pointer">
                <div className="h-20 flex items-center justify-center mb-2">
                  {ch.logo ? <img src={ch.logo} alt={ch.name} className="max-h-full max-w-full object-contain" /> : <h3 className="font-bold text-lg text-center">{ch.name}</h3>}
                </div>
                <p className="text-sm text-secondary-foreground text-center truncate">{ch.category?.name}</p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ContentRail({ title, items, type }: { title: string, items: any[], type: "movie" | "series" }) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-2xl font-bold px-2">{title}</h2>
      <div className="flex gap-4 overflow-x-auto pb-4 px-2 snap-x scrollbar-hide">
        {items.map((item) => (
          <Link 
            href={`/${type === 'movie' ? 'movies' : 'series'}/${item.id}`}
            key={item.id} 
            className="snap-start shrink-0 w-48 aspect-[2/3] bg-zinc-900 rounded-lg overflow-hidden relative group cursor-pointer border border-white/5 hover:border-white/20 transition-all hover:scale-105"
          >
            {item.poster ? (
              <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${item.poster}')` }} />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-white/30">{item.name}</div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-4">
              <div className="text-xs font-bold truncate mb-2">{item.name}</div>
              <Play className="fill-white w-8 h-8 self-center mb-4" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
