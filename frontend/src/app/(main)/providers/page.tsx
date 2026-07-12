"use client"

import { useEffect, useState } from "react"
import { Plus, Database, Server, RefreshCw, Trash2, X, AlertCircle } from "lucide-react"
import Link from "next/link"
import { api, isDemoUser } from "@/lib/api"

interface Provider {
  id: string
  providerName: string
  providerType: string
  serverUrl?: string
  username?: string
  playlistUrl?: string
  status: string
  lastSyncAt?: string
  _count?: { liveChannels: number; movies: number; series: number }
}

export default function ProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [showDemoModal, setShowDemoModal] = useState(false)
  const [isDemo, setIsDemo] = useState(false)
  const [form, setForm] = useState({
    providerName: "",
    providerType: "XTREAM",
    serverUrl: "",
    username: "",
    password: "",
    playlistUrl: "",
  })
  const [syncingProviderId, setSyncingProviderId] = useState<string | null>(null)
  const [syncProgress, setSyncProgress] = useState<any>(null)

  const loadProviders = async () => {
    const data = await api.getProviders()
    setProviders(data)
    setLoading(false)

    // Automatically capture active syncing process on load
    const syncing = data.find((p: any) => p.status === "SYNCING")
    if (syncing && !syncingProviderId) {
      setSyncingProviderId(syncing.id)
    }
  }

  useEffect(() => { 
    setIsDemo(isDemoUser())
    loadProviders() 
  }, [])

  useEffect(() => {
    let interval: NodeJS.Timeout
    if (syncingProviderId && (!syncProgress || (syncProgress.status !== "ERROR" && syncProgress.status !== "COMPLETED"))) {
      interval = setInterval(async () => {
        try {
          const progress = await api.getSyncProgress(syncingProviderId)
          setSyncProgress(progress)

          if (progress.status === "COMPLETED" || progress.status === "STOPPED") {
            setTimeout(() => {
              setSyncingProviderId(null)
              setSyncProgress(null)
            }, 1000)
            loadProviders()
          } else if (progress.status === "ERROR") {
            loadProviders()
          }
        } catch (err) {
          console.error("Error polling sync progress:", err)
        }
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [syncingProviderId, syncProgress?.status])

  const handleAdd = async () => {
    await api.createProvider(form)
    setShowAdd(false)
    setForm({ providerName: "", providerType: "XTREAM", serverUrl: "", username: "", password: "", playlistUrl: "" })
    loadProviders()
  }

  const handleDelete = async (id: string) => {
    await api.deleteProvider(id)
    loadProviders()
  }

  const handleSync = async (id: string) => {
    setSyncingProviderId(id)
    setSyncProgress({
      status: "SYNCING",
      step: "Initiating sync...",
      message: "Contacting server...",
      totalItems: 100,
      processedItems: 0
    })
    await api.syncProvider(id)
    loadProviders()
  }

  const handleStopSync = async () => {
    if (!syncingProviderId) return
    try {
      await api.stopSyncProvider(syncingProviderId)
      setSyncingProviderId(null)
      setSyncProgress(null)
      loadProviders()
    } catch (err) {
      console.error(err)
    }
  }

  const statusColors: Record<string, string> = {
    ACTIVE: "bg-green-500/10 text-green-500 border-green-500/20",
    SYNCING: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    ERROR: "bg-red-500/10 text-red-500 border-red-500/20",
    OFFLINE: "bg-zinc-500/10 text-zinc-500 border-zinc-500/20",
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="w-full h-full overflow-y-auto px-4 sm:px-8 md:px-12 py-6 md:py-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-10">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white mb-2">My Providers</h1>
          <p className="text-secondary-foreground text-sm md:text-lg">Manage your IPTV subscriptions and playlists.</p>
        </div>
        <button onClick={() => isDemo ? setShowDemoModal(true) : setShowAdd(true)} className="bg-primary text-white px-5 py-2.5 rounded-lg font-bold hover:bg-primary/90 transition flex items-center gap-2 flex-shrink-0">
          <Plus size={20} />
          Add Provider
        </button>
      </div>

      {/* Add Provider Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm" onClick={() => setShowAdd(false)}>
          <div className="bg-surface border border-white/10 rounded-2xl p-8 w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">Add Provider</h2>
              <button onClick={() => setShowAdd(false)}><X size={24} className="text-secondary-foreground hover:text-white" /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">Provider Name</label>
                <input value={form.providerName} onChange={e => setForm({...form, providerName: e.target.value})}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-primary" placeholder="My IPTV" />
              </div>
              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">Type</label>
                <select value={form.providerType} onChange={e => setForm({...form, providerType: e.target.value})}
                  className="w-full bg-zinc-900 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-primary cursor-pointer">
                  <option value="XTREAM" className="bg-zinc-900 text-white">Xtream Codes</option>
                  <option value="M3U" className="bg-zinc-900 text-white">M3U Playlist</option>
                  <option value="STALKER" className="bg-zinc-900 text-white">Stalker Portal</option>
                  <option value="MAG" className="bg-zinc-900 text-white">MAG Portal</option>
                </select>
              </div>

              {form.providerType === "XTREAM" && (
                <>
                  <input value={form.serverUrl} onChange={e => setForm({...form, serverUrl: e.target.value})}
                    autoComplete="off"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-primary" placeholder="http://provider.com:8080" />
                  <input value={form.username} onChange={e => setForm({...form, username: e.target.value})}
                    autoComplete="off"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-primary" placeholder="Username" />
                  <input type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})}
                    autoComplete="new-password"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-primary" placeholder="Password" />
                </>
              )}

              {form.providerType === "M3U" && (
                <input value={form.playlistUrl} onChange={e => setForm({...form, playlistUrl: e.target.value})}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-primary" placeholder="https://example.com/playlist.m3u" />
              )}

              <button onClick={handleAdd} className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-3 rounded-lg transition mt-2">
                Add Provider
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sync Progress Modal */}
      {syncingProviderId && syncProgress && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-zinc-950/80 border border-white/10 rounded-3xl p-8 w-full max-w-sm flex flex-col items-center text-center shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-200">
            {/* Badge */}
            <span className={`px-4 py-1 text-[10px] font-black tracking-widest rounded-full mb-6 uppercase ${
              syncProgress.status === "ERROR" 
                ? "text-red-400 bg-red-950/30 border border-red-500/20" 
                : "text-cyan-400 bg-cyan-950/30 border border-cyan-500/20"
            }`}>
              {syncProgress.status === "ERROR" ? "Sync Failed" : "Local Library"}
            </span>

            {/* Title & Subtitle */}
            <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">
              {syncProgress.status === "ERROR" ? "Sync Error" : "Syncing playlist"}
            </h2>
            <p className={`text-sm font-semibold mb-2 ${syncProgress.status === "ERROR" ? "text-red-400" : "text-white/80"}`}>
              {syncProgress.step}
            </p>
            <p className="text-white/40 text-xs leading-relaxed max-w-[280px] mb-6">
              {syncProgress.message}
            </p>

            {/* Progress Bar Container */}
            {syncProgress.status !== "ERROR" ? (
              <>
                <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden mb-4">
                  <div 
                    className="bg-purple-400 h-full rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${Math.min(100, (syncProgress.processedItems / (syncProgress.totalItems || 1)) * 100)}%` }}
                  />
                </div>

                {/* Ingestion progress stats */}
                <p className="text-xs font-semibold text-white/50 mb-6">
                  {syncProgress.step === 'Syncing Live Channels' && `Channels imported: ${syncProgress.processedItems} / ${syncProgress.totalItems}`}
                  {syncProgress.step === 'Syncing Movies' && `Movies imported: ${syncProgress.processedItems} / ${syncProgress.totalItems}`}
                  {syncProgress.step === 'Syncing TV Series' && `Series imported: ${syncProgress.processedItems} / ${syncProgress.totalItems}`}
                  {syncProgress.step !== 'Syncing Live Channels' && syncProgress.step !== 'Syncing Movies' && syncProgress.step !== 'Syncing TV Series' && `Items imported: ${syncProgress.processedItems} / ${syncProgress.totalItems}`}
                </p>
              </>
            ) : null}

            {/* Action Buttons */}
            {syncProgress.status === "ERROR" ? (
              <button 
                onClick={() => {
                  setSyncingProviderId(null)
                  setSyncProgress(null)
                }}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 px-6 rounded-full transition duration-200 text-sm"
              >
                Dismiss
              </button>
            ) : (
              <button 
                onClick={handleStopSync}
                className="w-full border border-white/10 hover:border-white/30 hover:bg-white/5 text-white font-bold py-2.5 px-6 rounded-full transition duration-200 text-sm"
              >
                Stop sync
              </button>
            )}
          </div>
        </div>
      )}

      {/* Provider List */}
      {providers.length === 0 ? (
        <div className="text-center py-20">
          <Database size={64} className="mx-auto text-zinc-700 mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">No Providers Yet</h2>
          <p className="text-secondary-foreground mb-6">Add your first IPTV provider to start streaming.</p>
          <button onClick={() => isDemo ? setShowDemoModal(true) : setShowAdd(true)} className="bg-primary text-white px-6 py-3 rounded-lg font-bold hover:bg-primary/90 transition">
            Add Your First Provider
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {providers.map(provider => (
            <div key={provider.id} className="bg-surface border border-white/10 rounded-xl p-6 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                      <Server className="text-blue-500" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">{provider.providerName || (provider.providerType === "XTREAM" ? "Xtream Codes" : "M3U Playlist")}</h3>
                      <p className="text-xs text-secondary-foreground/85">
                        {provider.providerType} {provider.username ? `• User: ${provider.username}` : ''}
                      </p>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold border ${statusColors[provider.status] || statusColors.OFFLINE} ${provider.status === "SYNCING" ? "animate-pulse" : ""}`}>
                    {provider.status}
                  </span>
                </div>

                <div className="space-y-2.5 mb-6 text-sm text-secondary-foreground">
                  {(provider.serverUrl || provider.playlistUrl) && (
                    <div className="text-xs text-white/40 truncate font-mono bg-white/5 px-2.5 py-1 rounded border border-white/5 max-w-[320px]">
                      {provider.serverUrl || provider.playlistUrl}
                    </div>
                  )}
                  {provider._count && (
                    <div className="flex items-center gap-2 text-white/70">
                      <Database size={16} className="text-white/40" />
                      <span>{provider._count.liveChannels} Channels • {provider._count.movies} Movies • {provider._count.series} Series</span>
                    </div>
                  )}
                  {provider.lastSyncAt && (
                    <div className="flex items-center gap-2 text-white/50">
                      <RefreshCw size={16} className="text-white/30" />
                      <span>Last Synced: {new Date(provider.lastSyncAt).toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 border-t border-white/5 pt-4">
                {!isDemo ? (
                  <>
                    <button onClick={() => handleSync(provider.id)} disabled={provider.status === "SYNCING"}
                      className="flex-1 bg-white/5 hover:bg-white/10 text-white px-4 py-2 rounded-md text-sm font-bold transition flex items-center justify-center gap-2 disabled:opacity-50">
                      <RefreshCw size={16} className={provider.status === "SYNCING" ? "animate-spin" : ""} /> {provider.status === "SYNCING" ? "Syncing..." : "Sync Now"}
                    </button>
                    <button onClick={() => handleDelete(provider.id)}
                      className="bg-red-500/10 hover:bg-red-500/20 text-red-500 px-4 py-2 rounded-md text-sm font-bold transition">
                      <Trash2 size={16} />
                    </button>
                  </>
                ) : (
                  <div className="flex-1 text-center py-2 text-xs text-white/40 font-bold tracking-widest uppercase border border-white/5 rounded-md">
                    Demo Mode Locked
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Demo Modal */}
      {showDemoModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm" onClick={() => setShowDemoModal(false)}>
          <div className="bg-surface border border-white/10 rounded-2xl p-8 w-full max-w-md text-center" onClick={e => e.stopPropagation()}>
            <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle size={32} className="text-primary" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Unlock Full Access</h2>
            <p className="text-secondary-foreground mb-8">
              You are currently using a demo account. To add your own IPTV providers and access the full app features, please login or create a free account.
            </p>
            <div className="flex flex-col gap-3">
              <Link href="/signup" className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-3 rounded-lg transition">
                Create Account
              </Link>
              <Link href="/login" className="w-full bg-white/5 hover:bg-white/10 text-white font-bold py-3 rounded-lg transition border border-white/10">
                Log In
              </Link>
              <button onClick={() => setShowDemoModal(false)} className="mt-4 text-sm text-secondary-foreground hover:text-white transition">
                Continue with Demo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
