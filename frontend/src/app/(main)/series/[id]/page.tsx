"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Play, Heart, Clock, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { api } from "@/lib/api"
import { VodPlayer } from "@/components/VodPlayer"

export default function SeriesDetailPage() {
  const params = useParams()
  const [series, setSeries] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeEpisode, setActiveEpisode] = useState<any>(null)
  const [isFavorite, setIsFavorite] = useState(false)
  const [isWatchLater, setIsWatchLater] = useState(false)

  useEffect(() => {
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
    <div className="w-full h-full overflow-y-auto pb-20">
      {/* Backdrop Hero */}
      <div className="relative h-[70vh] w-full flex items-end">
        <div className="absolute inset-0 bg-black">
          {series.backdrop && (
            <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${series.backdrop}')` }} />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-transparent" />
        </div>

        <div className="relative z-10 px-12 pb-12 flex gap-8 items-end w-full">
          {/* Poster */}
          {series.poster && (
            <div className="w-48 aspect-[2/3] rounded-xl overflow-hidden border border-white/20 shadow-2xl flex-shrink-0 hidden md:block">
              <img src={series.poster} alt={series.name} className="w-full h-full object-cover" />
            </div>
          )}

          <div className="max-w-3xl flex-1">
            <Link href="/series" className="text-sm text-white/60 hover:text-white transition flex items-center gap-1 mb-4">
              <ArrowLeft size={16} /> Back to Series
            </Link>
            <h1 className="text-5xl font-black text-white tracking-tighter mb-3">{series.name}</h1>
            <div className="flex items-center gap-4 text-sm text-white/70 mb-4">
              {series.year && <span>{series.year}</span>}
              {series.rating && <span>⭐ {series.rating.toFixed(1)}</span>}
              <span>{series.seasons?.length || 0} Seasons</span>
              {series.category && <span className="px-2 py-0.5 bg-white/10 rounded">{series.category.name}</span>}
            </div>
            {series.description && (
              <p className="text-lg text-white/80 mb-8 leading-relaxed">{series.description}</p>
            )}

            <div className="flex items-center gap-4">
              <button 
                onClick={handleFavoriteToggle}
                className={`px-6 py-3 rounded-md font-bold transition backdrop-blur-md flex items-center gap-2 border ${
                  isFavorite 
                    ? "bg-primary/20 border-primary text-primary hover:bg-primary/30" 
                    : "bg-white/20 border-transparent text-white hover:bg-white/30"
                }`}
              >
                <Heart size={20} className={isFavorite ? "fill-current" : ""} /> Favorite
              </button>
              <button 
                onClick={handleWatchLaterToggle}
                className={`px-6 py-3 rounded-md font-bold transition backdrop-blur-md flex items-center gap-2 border ${
                  isWatchLater 
                    ? "bg-primary/20 border-primary text-primary hover:bg-primary/30" 
                    : "bg-white/20 border-transparent text-white hover:bg-white/30"
                }`}
              >
                <Clock size={20} className={isWatchLater ? "fill-current" : ""} /> Watch Later
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Seasons */}
      <div className="px-12 mt-8">
        <h2 className="text-2xl font-bold mb-6">Episodes</h2>
        
        {(!series.seasons || series.seasons.length === 0) ? (
          <div className="text-secondary-foreground p-8 bg-surface rounded-xl border border-white/5">
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
                      className="bg-surface rounded-lg overflow-hidden border border-white/5 hover:border-white/20 transition group cursor-pointer"
                    >
                      <div className="aspect-video bg-zinc-900 relative">
                        {ep.backdrop ? (
                          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${ep.backdrop}')` }} />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center text-white/10">S{season.seasonNumber} E{ep.episodeNumber}</div>
                        )}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                          <Play className="fill-white w-10 h-10 drop-shadow-xl" />
                        </div>
                      </div>
                      <div className="p-4 flex justify-between items-start">
                        <div>
                          <div className="text-sm text-primary font-bold mb-1">Episode {ep.episodeNumber}</div>
                          <div className="font-medium text-white line-clamp-1">{ep.title || ep.name || `Episode ${ep.episodeNumber}`}</div>
                          {ep.duration && <div className="text-xs text-secondary-foreground mt-1">{Math.floor(ep.duration / 60)}m</div>}
                        </div>
                        <a 
                          href={api.downloadEpisodeUrl(ep.id)}
                          download
                          onClick={(e) => e.stopPropagation()}
                          className="p-2 bg-white/5 hover:bg-white/20 rounded-md transition border border-white/10 text-white/70 hover:text-white"
                          title="Download Episode"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        </a>
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
