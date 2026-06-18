"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Play, Heart, Clock, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { api, isDemoUser } from "@/lib/api"
import { VodPlayer } from "@/components/VodPlayer"

export default function MovieDetailPage() {
  const params = useParams()
  const [movie, setMovie] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isFavorite, setIsFavorite] = useState(false)
  const [isWatchLater, setIsWatchLater] = useState(false)
  const [isDemo, setIsDemo] = useState(false)

  useEffect(() => {
    setIsDemo(isDemoUser())
    if (params.id) {
      api.getMovie(params.id as string).then(data => {
        setMovie(data)
        setLoading(false)
      }).catch(() => setLoading(false))

      const profileId = localStorage.getItem("profileId")
      if (profileId) {
        // Check favorite status
        api.getFavorites(profileId).then(favs => {
          const found = favs.some((f: any) => f.contentId === params.id && f.contentType === "MOVIE")
          setIsFavorite(found)
        }).catch(err => console.error(err))

        // Check watch later status
        api.getWatchLater(profileId).then(wl => {
          const found = wl.some((w: any) => w.contentId === params.id && w.contentType === "MOVIE")
          setIsWatchLater(found)
        }).catch(err => console.error(err))
      }
    }
  }, [params.id])

  const handleFavoriteToggle = async () => {
    const profileId = localStorage.getItem("profileId")
    if (!profileId || !movie) return
    try {
      await api.addFavorite(profileId, "MOVIE", movie.id)
      setIsFavorite(!isFavorite)
    } catch (err) {
      console.error(err)
    }
  }

  const handleWatchLaterToggle = async () => {
    const profileId = localStorage.getItem("profileId")
    if (!profileId || !movie) return
    try {
      await api.addWatchLater(profileId, "MOVIE", movie.id)
      setIsWatchLater(!isWatchLater)
    } catch (err) {
      console.error(err)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!movie) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <h2 className="text-2xl font-bold text-white mb-4">Movie Not Found</h2>
        <Link href="/movies" className="text-primary hover:text-white transition">← Back to Movies</Link>
      </div>
    )
  }

  if (isPlaying) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col justify-center items-center">
        <VodPlayer 
          src={api.streamMovieUrl(movie.id)}
          rawUrl={movie.streamUrl}
          contentType="MOVIE"
          contentId={movie.id}
          title={movie.name}
          subtitle={movie.category?.name || "Movie"}
          durationSec={movie.duration}
          onClose={() => setIsPlaying(false)}
        />
      </div>
    )
  }

  return (
    <div className="w-full h-full overflow-y-auto bg-[#0a0a0a] text-white p-8 md:p-16">
      <div className="max-w-6xl flex flex-col md:flex-row gap-12 items-start mt-4">
        
        {/* Poster */}
        <div className="w-[280px] aspect-[2/3] rounded-xl overflow-hidden border border-white/10 shadow-2xl flex-shrink-0 bg-zinc-900/40">
          {movie.poster ? (
            <img src={movie.poster} alt={movie.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              {/* Empty placeholder matching the screenshot */}
            </div>
          )}
        </div>

        {/* Details */}
        <div className="flex flex-col flex-1 pt-2">
          <Link href="/movies" className="text-sm text-zinc-400 hover:text-white transition flex items-center gap-2 mb-6">
            <ArrowLeft size={16} /> Back to Movies
          </Link>
          
          <h1 className="text-4xl md:text-[2.75rem] font-serif font-bold text-white tracking-tight leading-tight mb-4">
            {movie.name} {movie.year ? `(${movie.year})` : ''}
          </h1>

          <div className="flex items-center gap-3 mb-8">
            {movie.category && (
              <span className="px-3 py-1 bg-zinc-900/80 border border-white/10 rounded text-xs font-medium text-zinc-300">
                {movie.category.name}
              </span>
            )}
            {movie.rating && (
              <span className="px-3 py-1 bg-zinc-900/80 border border-white/10 rounded text-xs font-medium text-zinc-300 flex items-center gap-1">
                ⭐ {movie.rating.toFixed(1)}
              </span>
            )}
            {movie.duration && (
              <span className="px-3 py-1 bg-zinc-900/80 border border-white/10 rounded text-xs font-medium text-zinc-300">
                {Math.floor(movie.duration / 60)}h {movie.duration % 60}m
              </span>
            )}
          </div>

          {movie.description && (
            <p className="text-base text-zinc-400 mb-8 leading-relaxed max-w-3xl">
              {movie.description}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-4">
            <button 
              onClick={() => setIsPlaying(true)}
              className="bg-white text-black px-8 py-2.5 rounded-lg font-bold text-sm hover:bg-white/90 transition flex items-center gap-2"
            >
              <Play className="fill-black w-4 h-4" /> Play
            </button>
            <button 
              onClick={handleFavoriteToggle}
              disabled={isDemo}
              className={`px-6 py-2.5 rounded-lg font-medium text-sm transition flex items-center gap-2 border ${
                isFavorite 
                  ? "bg-primary/10 border-primary/50 text-primary hover:bg-primary/20" 
                  : "bg-white/5 border-white/10 text-white hover:bg-white/10"
              } ${isDemo ? "opacity-50 cursor-not-allowed" : ""}`}
              title={isDemo ? "Favorites disabled in demo mode" : ""}
            >
              <Heart size={16} className={isFavorite ? "fill-current" : ""} /> Favorite
            </button>
            <button 
              onClick={handleWatchLaterToggle}
              disabled={isDemo}
              className={`px-6 py-2.5 rounded-lg font-medium text-sm transition flex items-center gap-2 border ${
                isWatchLater 
                  ? "bg-primary/10 border-primary/50 text-primary hover:bg-primary/20" 
                  : "bg-white/5 border-white/10 text-white hover:bg-white/10"
              } ${isDemo ? "opacity-50 cursor-not-allowed" : ""}`}
              title={isDemo ? "Watch Later disabled in demo mode" : ""}
            >
              <Clock size={16} className={isWatchLater ? "fill-current" : ""} /> Watch Later
            </button>
            <a 
              href={api.downloadMovieUrl(movie.id)}
              download
              className="px-6 py-2.5 rounded-lg font-medium text-sm transition flex items-center gap-2 border bg-white/5 border-white/10 text-white hover:bg-white/10"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              Download
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

