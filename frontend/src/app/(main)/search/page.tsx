"use client"

import { useState, useEffect } from "react"
import { Search as SearchIcon, Play, Plus } from "lucide-react"
import Link from "next/link"
import { api } from "@/lib/api"

export default function SearchPage() {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<{ movies: any[]; series: any[]; channels: any[] }>({ movies: [], series: [], channels: [] })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (query.length < 2) {
      setResults({ movies: [], series: [], channels: [] })
      return
    }

    const timer = setTimeout(async () => {
      setLoading(true)
      const data = await api.search(query)
      setResults(data)
      setLoading(false)
    }, 400) // debounce

    return () => clearTimeout(timer)
  }, [query])

  const hasResults = results.movies.length > 0 || results.series.length > 0 || results.channels.length > 0

  return (
    <div className="w-full h-full overflow-y-auto px-12 py-10">
      <div className="max-w-3xl mb-12 relative group">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <SearchIcon className="h-6 w-6 text-secondary-foreground group-focus-within:text-primary transition-colors" />
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for movies, series, or live channels..."
          className="w-full bg-surface border border-white/10 rounded-full py-4 pl-14 pr-6 text-xl text-white placeholder:text-secondary-foreground focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/30 transition-all shadow-lg"
        />
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && query.length >= 2 && !hasResults && (
        <div className="text-center py-20">
          <div className="text-5xl mb-4">🔍</div>
          <h2 className="text-2xl font-bold text-white mb-2">No Results Found</h2>
          <p className="text-secondary-foreground">No content matched "{query}". Try a different search term.</p>
        </div>
      )}

      {hasResults && (
        <div className="space-y-12">
          {results.movies.length > 0 && (
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-white mb-4 border-b border-white/10 pb-2">
                Movies ({results.movies.length})
              </h2>
              <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
                {results.movies.map((movie: any) => (
                  <Link href={`/movies/${movie.id}`} key={movie.id}
                    className="flex-none w-40 md:w-48 aspect-[2/3] relative rounded-lg overflow-hidden group cursor-pointer border border-white/5 hover:border-white/20 transition-all hover:scale-105">
                    {movie.poster ? (
                      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${movie.poster}')` }} />
                    ) : (
                      <div className="absolute inset-0 bg-zinc-800 flex items-center justify-center p-2"><span className="text-white/30 text-xs text-center">{movie.name}</span></div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                      <div className="text-xs font-bold truncate">{movie.name}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {results.series.length > 0 && (
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-white mb-4 border-b border-white/10 pb-2">
                Series ({results.series.length})
              </h2>
              <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
                {results.series.map((s: any) => (
                  <Link href={`/series/${s.id}`} key={s.id}
                    className="flex-none w-40 md:w-48 aspect-[2/3] relative rounded-lg overflow-hidden group cursor-pointer border border-white/5 hover:border-white/20 transition-all hover:scale-105">
                    {s.poster ? (
                      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${s.poster}')` }} />
                    ) : (
                      <div className="absolute inset-0 bg-zinc-800 flex items-center justify-center p-2"><span className="text-white/30 text-xs text-center">{s.name}</span></div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                      <div className="text-xs font-bold truncate">{s.name}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {results.channels.length > 0 && (
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-white mb-4 border-b border-white/10 pb-2">
                Live Channels ({results.channels.length})
              </h2>
              <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
                {results.channels.map((ch: any) => (
                  <Link href={`/live/${ch.id}`} key={ch.id}
                    className="flex-none w-64 bg-surface border border-white/10 rounded-xl p-4 hover:border-white/30 transition hover:scale-105 group cursor-pointer">
                    <h3 className="font-bold text-lg">{ch.name}</h3>
                    {ch.category && <p className="text-sm text-secondary-foreground">{ch.category.name}</p>}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!query && (
        <div className="text-center py-20">
          <div className="text-5xl mb-4">🎬</div>
          <h2 className="text-2xl font-bold text-white mb-2">Search Your Library</h2>
          <p className="text-secondary-foreground">Type at least 2 characters to search across movies, series, and live channels.</p>
        </div>
      )}
    </div>
  )
}
