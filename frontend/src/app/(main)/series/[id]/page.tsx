"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Play, Heart, Clock, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { api, isDemoUser } from "@/lib/api"
import { VodPlayer } from "@/components/VodPlayer"

export default function SeriesDetailPage() {
  const params = useParams()
  const [series, setSeries] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeEpisode, setActiveEpisode] = useState<any>(null)
  const [isFavorite, setIsFavorite] = useState(false)
  const [isWatchLater, setIsWatchLater] = useState(false)
  const [isDemo, setIsDemo] = useState(false)

  useEffect(() => {
    setIsDemo(isDemoUser())
    if (params.id) {
      api.getSeriesById(params.id as string).then(data => {
        setSeries(data)
        setLoading(false)
      }).catch(() => setLoading(false))

      const profileId = localStorage.getItem("profileId")
      if (profileId) {
        // Check favorite status
        api.getFavorites(profileId).then(favs => {
          const found = favs.some((f: any) => f.contentId === params.id && f.contentType === "SERIES")
          setIsFavorite(found)
        }).catch(err => console.error(err))

        // Check watch later status
        api.getWatchLater(profileId).then(wl => {
          const found = wl.some((w: any) => w.contentId === params.id && w.contentType === "SERIES")
          setIsWatchLater(found)
        }).catch(err => console.error(err))
      }
    }
  }, [params.id])

  const handleFavoriteToggle = async () => {
    const profileId = localStorage.getItem("profileId")
    if (!profileId || !series) return
    try {
      await api.addFavorite(profileId, "SERIES", series.id)
      setIsFavorite(!isFavorite)
    } catch (err) {
      console.error(err)
    }
  }

  const handleWatchLaterToggle = async () => {
    const profileId = localStorage.getItem("profileId")
    if (!profileId || !series) return
    try {
      await api.addWatchLater(profileId, "SERIES", series.id)
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

  if (!series) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <h2 className="text-2xl font-bold text-white mb-4">Series Not Found</h2>
        <Link href="/series" className="text-primary hover:text-white transition">← Back to Series</Link>
      </div>
    )
  }

  if (activeEpisode) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col justify-center items-center">
        <VodPlayer 
          src={api.streamEpisodeUrl(activeEpisode.id)}
          rawUrl={activeEpisode.streamUrl}
          contentType="EPISODE"
          contentId={activeEpisode.id}
          title={series.name}
          subtitle={`Season ${series.seasons?.find((s: any) => s.episodes?.some((e: any) => e.id === activeEpisode.id))?.seasonNumber || 1}, Episode ${activeEpisode.episodeNumber}: ${activeEpisode.title || activeEpisode.name || ''}`}
          onClose={() => setActiveEpisode(null)}
          seriesData={series}
          durationSec={activeEpisode.duration}
          onPlayEpisode={(nextEp) => setActiveEpisode(nextEp)}
        />
      </div>
    )
  }

  return (
    <div className="w-full h-full overflow-y-auto bg-[#0a0a0a] text-white p-8 md:p-16">
      <div className="max-w-6xl flex flex-col md:flex-row gap-12 items-start mt-4">
        
        {/* Poster - Purple fallback style from screenshot */}
        <div className="w-[300px] aspect-[2/3] rounded-xl overflow-hidden flex-shrink-0 bg-[#2d2546] border-none shadow-2xl flex flex-col items-center justify-center text-center p-6 relative">
          {series.poster ? (
            <img src={series.poster} alt={series.name} className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="currentColor" className="text-white/40 mb-4">
                <path d="M19.82 2H4.18C2.97602 2 2 2.97602 2 4.18v15.64C2 21.024 2.97602 22 4.18 22h15.64c1.204 0 2.18-.976 2.18-2.18V4.18C22 2.97602 21.024 2 19.82 2zM7 2h1v4H7V2zm4 0h1v4h-1V2zm4 0h1v4h-1V2zm-9.5 6h13c.8284 0 1.5.6716 1.5 1.5v11c0 .8284-.6716 1.5-1.5 1.5h-13c-.8284 0-1.5-.6716-1.5-1.5v-11C4 8.6716 4.6716 8 5.5 8z" />
              </svg>
              <h2 className="text-white text-lg font-medium tracking-wide">{series.name}</h2>
            </>
          )}
        </div>

        {/* Details */}
        <div className="flex flex-col flex-1 pt-2">
          
          <h1 className="text-4xl md:text-5xl font-sans font-bold text-white tracking-tight leading-tight mb-4">
            {series.name} {series.year ? `(${series.year})` : ''}
          </h1>

          <div className="mb-6">
            {series.category && (
              <span className="px-3 py-1.5 bg-transparent border border-white/20 rounded-md text-sm font-medium text-zinc-300">
                {series.category.name}
              </span>
            )}
          </div>

          {(series.description || series.director || series.actors) && (
            <div className="flex flex-col gap-6 mb-8">
              {series.description && (
                <p className="text-[15px] text-zinc-300 leading-relaxed max-w-3xl">
                  {series.description}
                </p>
              )}

              {series.actors && (
                <div>
                  <h3 className="text-xs text-zinc-500 font-medium mb-1">Actors</h3>
                  <p className="text-sm font-semibold text-zinc-200">{series.actors}</p>
                </div>
              )}

              {series.director && (
                <div>
                  <h3 className="text-xs text-zinc-500 font-medium mb-1">Director</h3>
                  <p className="text-sm font-semibold text-zinc-200">{series.director}</p>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4 mt-2">
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
          </div>
        </div>
      </div>

      {/* Seasons & Episodes */}
      <div className="max-w-6xl mt-16 pt-8 border-t border-white/10">
        <h2 className="text-2xl font-bold mb-6">Episodes</h2>
        
        {(!series.seasons || series.seasons.length === 0) ? (
          <div className="text-zinc-500 py-8">
            No episodes synced yet.
          </div>
        ) : (
          <div className="space-y-12">
            {series.seasons.map((season: any) => (
              <div key={season.id}>
                <h3 className="text-xl font-bold mb-4 text-white/90">Season {season.seasonNumber}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {season.episodes?.map((ep: any) => (
                    <div 
                      key={ep.id} 
                      onClick={() => setActiveEpisode(ep)}
                      className="bg-[#1a1a1a] rounded-lg overflow-hidden border border-white/5 hover:border-white/20 transition group cursor-pointer flex flex-col"
                    >
                      <div className="aspect-video bg-[#2d2546] relative flex-shrink-0">
                        {ep.backdrop ? (
                          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${ep.backdrop}')` }} />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center text-white/20 font-medium">S{season.seasonNumber} E{ep.episodeNumber}</div>
                        )}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                          <div className="bg-white rounded-full p-2 flex items-center justify-center shadow-md">
                            <Play className="fill-black w-6 h-6 ml-1" />
                          </div>
                        </div>
                      </div>
                      <div className="p-4 flex flex-col flex-1">
                        <div className="text-xs text-zinc-400 font-medium mb-1">Episode {ep.episodeNumber}</div>
                        <div className="font-medium text-white line-clamp-2 text-sm leading-snug flex-1">{ep.title || ep.name || `Episode ${ep.episodeNumber}`}</div>
                        <div className="mt-3 flex items-center justify-between">
                          {ep.duration ? (
                            <div className="text-xs text-zinc-500">{Math.floor(ep.duration / 60)}m</div>
                          ) : <div />}
                          <a 
                            href={api.downloadEpisodeUrl(ep.id)}
                            download
                            onClick={(e) => e.stopPropagation()}
                            className="p-1.5 bg-white/5 hover:bg-white/10 rounded-md transition text-zinc-400 hover:text-white"
                            title="Download Episode"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                          </a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
