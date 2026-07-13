"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Heart, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { api } from "@/lib/api"
import { LivePlayer } from "@/components/LivePlayer"
import { LivePlayerV2 } from "@/components/LivePlayerV2"
import { LivePlayerV3 } from "@/components/LivePlayerV3"

export default function LiveChannelPage() {
  const params = useParams()
  const [channel, setChannel] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [isFavorite, setIsFavorite] = useState(false)

  // Player selection state
  const [selectedPlayer, setSelectedPlayer] = useState<'player1' | 'player2' | 'player3' | null>(null)
  const [rememberChoice, setRememberChoice] = useState(false)

  useEffect(() => {
    if (params.id) {
      api.getLiveChannel(params.id as string).then(ch => {
        setChannel(ch)
        setLoading(false)
      }).catch(() => setLoading(false))

      const profileId = localStorage.getItem("profileId")
      if (profileId) {
        api.getFavorites(profileId).then(favs => {
          const found = favs.some((f: any) => f.contentId === params.id && f.contentType === "CHANNEL")
          setIsFavorite(found)
        }).catch(err => console.error(err))
      }

      // Load saved player choice
      const saved = localStorage.getItem(`player-choice-${params.id}`)
      if (saved === 'player1' || saved === 'player2' || saved === 'player3') {
        setSelectedPlayer(saved)
      }
    }
  }, [params.id])

  const handleSelectPlayer = (player: 'player1' | 'player2' | 'player3') => {
    if (rememberChoice && params.id) {
      localStorage.setItem(`player-choice-${params.id}`, player)
    }
    setSelectedPlayer(player)
  }

  const handleResetChoice = () => {
    if (params.id) {
      localStorage.removeItem(`player-choice-${params.id}`)
    }
    setSelectedPlayer(null)
  }

  const handleFavoriteToggle = async () => {
    const profileId = localStorage.getItem("profileId")
    if (!profileId || !channel) return
    try {
      await api.addFavorite(profileId, "CHANNEL", channel.id)
      setIsFavorite(!isFavorite)
    } catch (err) {
      console.error(err)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-black">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!channel) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-black text-center">
        <h2 className="text-2xl font-bold text-white mb-4">Channel Not Found</h2>
        <Link href="/live" className="text-primary hover:text-white transition">← Back to Live TV</Link>
      </div>
    )
  }

  const streamUrl = api.streamLiveUrl(channel.id)

  return (
    <div className="w-full h-full flex flex-col bg-zinc-950 text-white overflow-y-auto pb-12">
      {/* Top Header Bar */}
      <div className="p-6 flex items-center justify-between border-b border-white/5 bg-black/40 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <Link href="/live" className="p-2 hover:bg-white/10 rounded-full transition">
            <ArrowLeft size={24} className="text-white" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">{channel.name}</h1>
            <div className="flex items-center gap-3 mt-1">
              <span className="px-2 py-0.5 text-xs font-semibold bg-white/10 rounded-md text-white/80">
                {channel.category?.name || "Live TV"}
              </span>
              <p className="text-sm text-secondary-foreground flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse" />
                LIVE
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={handleFavoriteToggle}
          className={`p-3 rounded-full transition backdrop-blur-md border ${
            isFavorite
              ? "bg-primary/20 border-primary text-primary hover:bg-primary/30"
              : "bg-white/5 border-white/10 text-white/80 hover:bg-white/10 hover:text-white"
          }`}
        >
          <Heart size={20} className={isFavorite ? "fill-current" : ""} />
        </button>
      </div>

      {/* ── IPGenZ Live Player Section ── */}
      <div className="px-6 mt-6 max-w-6xl w-full mx-auto">
        <div className="aspect-video w-full rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-black flex flex-col items-center justify-center relative">
          {!selectedPlayer ? (
            <div className="p-8 max-w-md w-full text-center flex flex-col gap-6">
              <div>
                <h3 className="text-xl font-bold text-white mb-2">Select Live TV Player</h3>
                <p className="text-xs text-zinc-400">Choose between the classic, server-assisted hybrid, or fully client-side decode player.</p>
              </div>

              <div className="flex flex-col gap-3">
                <button
                  onClick={() => handleSelectPlayer('player1')}
                  className="w-full py-3 px-4 bg-zinc-900 border border-white/10 hover:border-violet-500/50 text-white rounded-xl transition font-medium text-xs flex flex-col items-center gap-0.5"
                >
                  <span className="font-bold text-xs">Player 1 (Classic)</span>
                  <span className="text-[10px] text-zinc-500 font-normal">Standard session-based pipeline</span>
                </button>

                <button
                  onClick={() => handleSelectPlayer('player2')}
                  className="w-full py-3 px-4 bg-zinc-900 border border-white/10 hover:border-violet-500/50 text-white rounded-xl transition font-medium text-xs flex flex-col items-center gap-0.5"
                >
                  <span className="font-bold text-xs">Player 2 (Server-Assisted)</span>
                  <span className="text-[10px] text-zinc-500 font-normal">Continuous-channel architecture (Ultra-Smooth)</span>
                </button>

                <button
                  onClick={() => handleSelectPlayer('player3')}
                  className="w-full py-3 px-4 bg-violet-600/10 border border-violet-500/20 hover:border-violet-500/50 hover:bg-violet-600/20 text-violet-400 rounded-xl transition font-medium text-xs flex flex-col items-center gap-0.5"
                >
                  <span className="font-bold text-xs">Player 3 (Client-Side Decode)</span>
                  <span className="text-[10px] text-violet-400/70 font-normal">No Server Transcode (WASM & WebCodecs)</span>
                </button>
              </div>

              <label className="flex items-center justify-center gap-2 cursor-pointer select-none text-zinc-400 hover:text-zinc-200 transition">
                <input
                  type="checkbox"
                  checked={rememberChoice}
                  onChange={(e) => setRememberChoice(e.target.checked)}
                  className="rounded border-zinc-700 bg-zinc-900 text-violet-500 focus:ring-violet-500 w-4 h-4"
                />
                <span className="text-xs">Remember my choice for this channel</span>
              </label>
            </div>
          ) : selectedPlayer === 'player1' ? (
            <>
              <LivePlayer
                channelId={channel.id}
                streamUrl={streamUrl}
                channelName={channel.name}
                autoplay={true}
                onStateChange={s => console.log('[LivePlayer] State:', s)}
                onError={err => console.error('[LivePlayer] Error:', err)}
              />
              <button
                onClick={handleResetChoice}
                className="absolute top-4 right-4 bg-black/75 hover:bg-black border border-white/10 hover:border-white/30 text-xs px-3 py-1.5 rounded-lg text-zinc-400 hover:text-white transition z-40"
              >
                Switch Player
              </button>
            </>
          ) : selectedPlayer === 'player2' ? (
            <>
              <LivePlayerV2
                channelId={channel.id}
                streamUrl={streamUrl}
                channelName={channel.name}
                autoplay={true}
                onStateChange={s => console.log('[LivePlayerV2] State:', s)}
                onError={err => console.error('[LivePlayerV2] Error:', err)}
              />
              <button
                onClick={handleResetChoice}
                className="absolute top-4 right-4 bg-black/75 hover:bg-black border border-white/10 hover:border-white/30 text-xs px-3 py-1.5 rounded-lg text-zinc-400 hover:text-white transition z-40"
              >
                Switch Player
              </button>
            </>
          ) : (
            <>
              <LivePlayerV3
                channelId={channel.id}
                streamUrl={streamUrl}
                channelName={channel.name}
                autoplay={true}
                onStateChange={s => console.log('[LivePlayerV3] State:', s)}
                onError={err => console.error('[LivePlayerV3] Error:', err)}
              />
              <button
                onClick={handleResetChoice}
                className="absolute top-4 right-4 bg-black/75 hover:bg-black border border-white/10 hover:border-white/30 text-xs px-3 py-1.5 rounded-lg text-zinc-400 hover:text-white transition z-40"
              >
                Switch Player
              </button>
            </>
          )}
        </div>
      </div>

      {/* Info & Metadata Section */}
      <div className="px-6 mt-8 max-w-6xl w-full mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="col-span-2 bg-zinc-900/40 border border-white/5 p-6 rounded-2xl backdrop-blur-md">
          <h2 className="font-bold text-xl mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary" />
            Currently Streaming
          </h2>
          <p className="text-white/70 text-base leading-relaxed">
            Live broadcast of {channel.name}. EPG metadata and schedule information will automatically display here once synced with EPG XMLTV source.
          </p>
        </div>

        <div className="bg-zinc-900/40 border border-white/5 p-6 rounded-2xl backdrop-blur-md flex flex-col justify-between">
          <div>
            <h2 className="font-bold text-xl mb-4 text-white">Up Next</h2>
            <div className="space-y-4">
              <div className="flex items-start gap-4 text-sm text-white/60">
                <span className="font-mono text-white/90 font-semibold">18:00</span>
                <div>
                  <p className="font-medium text-white/95">Evening News Broadcast</p>
                  <p className="text-xs text-white/40">Duration: 60 min</p>
                </div>
              </div>
              <div className="flex items-start gap-4 text-sm text-white/60">
                <span className="font-mono text-white/90 font-semibold">19:00</span>
                <div>
                  <p className="font-medium text-white/95">Prime Time Program</p>
                  <p className="text-xs text-white/40">Duration: 120 min</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

