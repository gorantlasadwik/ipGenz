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
        
        {/* Poster - Purple fallback style from screenshot */}
        <div className="w-[300px] aspect-[2/3] rounded-xl overflow-hidden flex-shrink-0 bg-[#2d2546] border-none shadow-2xl flex flex-col items-center justify-center text-center p-6 relative">
          {movie.poster ? (
            <img src={movie.poster} alt={movie.name} className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="currentColor" className="text-white/40 mb-4">
                <path d="M19.82 2H4.18C2.97602 2 2 2.97602 2 4.18v15.64C2 21.024 2.97602 22 4.18 22h15.64c1.204 0 2.18-.976 2.18-2.18V4.18C22 2.97602 21.024 2 19.82 2zM7 2h1v4H7V2zm4 0h1v4h-1V2zm4 0h1v4h-1V2zm-9.5 6h13c.8284 0 1.5.6716 1.5 1.5v11c0 .8284-.6716 1.5-1.5 1.5h-13c-.8284 0-1.5-.6716-1.5-1.5v-11C4 8.6716 4.6716 8 5.5 8z" />
              </svg>
              <h2 className="text-white text-lg font-medium tracking-wide">{movie.name}</h2>
            </>
          )}
        </div>

        {/* Details */}
        <div className="flex flex-col flex-1 pt-2">
          
          <h1 className="text-4xl md:text-5xl font-sans font-bold text-white tracking-tight leading-tight mb-4">
            {movie.name} {movie.year ? `(${movie.year})` : ''}
          </h1>

          <div className="mb-6">
            {movie.category && (
              <span className="px-3 py-1.5 bg-transparent border border-white/20 rounded-md text-sm font-medium text-zinc-300">
                {movie.category.name}
              </span>
            )}
          </div>

          {(movie.description || movie.director || movie.actors) && (
            <div className="flex flex-col gap-6 mb-8">
              {movie.description && (
                <p className="text-[15px] text-zinc-300 leading-relaxed max-w-3xl">
                  {movie.description}
                </p>
              )}

              {movie.actors && (
                <div>
                  <h3 className="text-xs text-zinc-500 font-medium mb-1">Actors</h3>
                  <p className="text-sm font-semibold text-zinc-200">{movie.actors}</p>
                </div>
              )}

              {movie.director && (
                <div>
                  <h3 className="text-xs text-zinc-500 font-medium mb-1">Director</h3>
                  <p className="text-sm font-semibold text-zinc-200">{movie.director}</p>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4 mt-2">
            <button 
              onClick={() => setIsPlaying(true)}
              className="bg-[#e5e5e5] text-black px-6 py-3 rounded-md font-bold text-[15px] hover:bg-white transition flex items-center gap-3"
            >
              <div className="bg-white rounded-full p-1.5 flex items-center justify-center shadow-sm">
                <Play className="fill-black w-4 h-4 ml-0.5" />
              </div>
              Play
            </button>

            <button 
              onClick={handleFavoriteToggle}
              disabled={isDemo}
              className={`px-6 py-3 rounded-md font-medium text-[15px] transition flex items-center gap-2 ${
                isFavorite 
                  ? "bg-primary text-white hover:bg-primary/90" 
                  : "bg-[#4d4d4d] text-white hover:bg-[#5a5a5a]"
              } ${isDemo ? "opacity-50 cursor-not-allowed" : ""}`}
              title={isDemo ? "Favorites disabled in demo mode" : ""}
            >
              {isFavorite ? <Heart className="w-5 h-5 fill-current" /> : <span className="text-xl leading-none mr-1">+</span>} 
              {isFavorite ? "Favorited" : "Add to favorites"}
            </button>

            <a 
              href={api.downloadMovieUrl(movie.id)}
              download
              className="px-6 py-3 rounded-md font-medium text-[15px] transition flex items-center gap-2 bg-[#1a82d2] text-white hover:bg-[#258cdb]"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              Download
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

