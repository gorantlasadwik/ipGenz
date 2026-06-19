"use client"

import { useState, useEffect } from "react"
import { Users, Crown, KeyRound, CheckCircle, Clock, ShieldCheck, Save, Server, Globe, Lock, Eye, EyeOff, RefreshCw } from "lucide-react"
import { api } from "@/lib/api"
import { format } from "date-fns"

export default function PremiumAdminPage() {
  const [trials, setTrials] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [savingConfig, setSavingConfig] = useState(false)

  // Master Provider Config Form
  const [providerName, setProviderName] = useState("Premium Trial Master")
  const [providerType, setProviderType] = useState("XTREAM")
  const [serverUrl, setServerUrl] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [playlistUrl, setPlaylistUrl] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null)

  // Shadow Syncing State
  const [shadowProviderId, setShadowProviderId] = useState<string | null>(null)
  const [shadowStatus, setShadowStatus] = useState<string>("ACTIVE")
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState<any>(null)

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    let interval: NodeJS.Timeout
    if (isSyncing && shadowProviderId) {
      interval = setInterval(async () => {
        try {
          const progress = await api.getSyncProgress(shadowProviderId)
          setSyncProgress(progress)
          if (progress?.status === 'COMPLETED' || progress?.status === 'ERROR' || progress?.status === 'STOPPED') {
            setIsSyncing(false)
            // Refresh provider info to get updated status
            const providerConfig = await api.getTrialProvider()
            if (providerConfig) {
              setShadowStatus(providerConfig.shadowStatus || "ACTIVE")
            }
          }
        } catch (e) {
          console.error("Failed to fetch sync progress", e)
        }
      }, 2000)
    }
    return () => clearInterval(interval)
  }, [isSyncing, shadowProviderId])

  const fetchData = async () => {
    try {
      const [trialsData, providerConfig] = await Promise.all([
        api.getPremiumTrials(),
        api.getTrialProvider()
      ])
      setTrials(trialsData)
      if (providerConfig) {
        setProviderName(providerConfig.providerName || "Premium Trial Master")
        setProviderType(providerConfig.providerType || "XTREAM")
        setServerUrl(providerConfig.serverUrl || "")
        setUsername(providerConfig.username || "")
        setPassword(providerConfig.password || "")
        setPlaylistUrl(providerConfig.playlistUrl || "")
        setShadowProviderId(providerConfig.shadowProviderId || null)
        setShadowStatus(providerConfig.shadowStatus || "ACTIVE")
        if (providerConfig.shadowStatus === "SYNCING") {
          setIsSyncing(true)
        }
      }
    } catch (err) {
      console.error("Failed to fetch premium trial details", err)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingConfig(true)
    setSaveStatus(null)

    try {
      const response = await api.saveTrialProvider({
        providerName,
        providerType,
        serverUrl: providerType === "XTREAM" ? serverUrl : null,
        username: providerType === "XTREAM" ? username : null,
        password: providerType === "XTREAM" ? password : null,
        playlistUrl: providerType === "M3U" ? playlistUrl : null,
      })
      setShadowProviderId(response.shadowProviderId || null)
      setShadowStatus(response.shadowStatus || "ACTIVE")
      if (response.shadowStatus === "SYNCING") {
        setIsSyncing(true)
      }
      setSaveStatus({ type: 'success', message: "Master Trial Provider saved successfully!" })
    } catch (err: any) {
      setSaveStatus({ type: 'error', message: err.message || "Failed to save trial provider details" })
    } finally {
      setSavingConfig(false)
    }
  }

  const handleTriggerSync = async () => {
    if (!shadowProviderId) return
    try {
      setSyncProgress({
        status: "SYNCING",
        step: "Initiating sync...",
        message: "Contacting server...",
        totalItems: 100,
        processedItems: 0
      })
      await api.syncProvider(shadowProviderId)
      setIsSyncing(true)
      setShadowStatus("SYNCING")
    } catch (err: any) {
      console.error("Failed to trigger sync", err)
      alert(err.message || "Failed to start sync")
    }
  }

  const handleStopSync = async () => {
    if (!shadowProviderId) return
    try {
      await api.stopSyncProvider(shadowProviderId)
      setIsSyncing(false)
      setSyncProgress(null)
      setShadowStatus("ACTIVE")
    } catch (err: any) {
      console.error(err)
    }
  }

  if (loading) {
    return (
      <div className="flex-1 p-8 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex-1 p-8 overflow-y-auto bg-black text-white">
      <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-300 font-sans">
        
        <div>
          <h1 className="text-3xl font-black mb-2 flex items-center gap-3">
            <Crown className="text-yellow-500 w-8 h-8 animate-pulse" />
            Premium Trials & Subscriptions
          </h1>
          <p className="text-zinc-400">Configure master IPTV trial details and monitor active 1-day guest credentials.</p>
        </div>

        {/* Master Provider Configuration */}
        <div className="bg-[#111] border border-white/10 rounded-2xl p-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -z-10" />
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <ShieldCheck className="text-primary w-5 h-5" />
            Premium Trial Provider Settings
          </h2>
          <p className="text-sm text-zinc-400 mb-6 max-w-2xl">
            Configure the IPTV provider that will be cloned automatically to create 1-day premium trials. 
            When users request a trial, the system will immediately generate and email their personalized streaming credentials.
          </p>

          {saveStatus && (
            <div className={`p-4 rounded-xl mb-6 border text-sm font-medium ${
              saveStatus.type === 'success' 
                ? 'bg-green-500/10 border-green-500/20 text-green-500' 
                : 'bg-red-500/10 border-red-500/20 text-red-500'
            }`}>
              {saveStatus.message}
            </div>
          )}

          <form onSubmit={handleSaveConfig} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Provider Name</label>
                <input
                  type="text"
                  required
                  value={providerName}
                  onChange={(e) => setProviderName(e.target.value)}
                  placeholder="e.g. Premium Trial Master"
                  className="w-full bg-black border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-primary transition"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Provider Type</label>
                <select
                  value={providerType}
                  onChange={(e) => setProviderType(e.target.value)}
                  className="w-full bg-black border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-primary transition"
                >
                  <option value="XTREAM">Xtream Codes API</option>
                  <option value="M3U">M3U Playlist URL</option>
                </select>
              </div>
            </div>

            {providerType === "XTREAM" ? (
              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-zinc-400" /> Server URL
                  </label>
                  <input
                    type="url"
                    required
                    value={serverUrl}
                    onChange={(e) => setServerUrl(e.target.value)}
                    placeholder="http://example.com:8080"
                    className="w-full bg-black border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-primary transition"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Server className="w-3.5 h-3.5 text-zinc-400" /> Username
                    </label>
                    <input
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Enter provider username"
                      className="w-full bg-black border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-primary transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-zinc-400" /> Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter provider password"
                        className="w-full bg-black border border-white/10 rounded-lg p-3 pr-10 text-white focus:outline-none focus:border-primary transition"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-zinc-400" /> Playlist URL
                </label>
                <input
                  type="url"
                  required
                  value={playlistUrl}
                  onChange={(e) => setPlaylistUrl(e.target.value)}
                  placeholder="https://example.com/playlist.m3u"
                  className="w-full bg-black border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-primary transition"
                />
              </div>
            )}

            <div className="pt-2 flex flex-col gap-6">
              <button
                type="submit"
                disabled={savingConfig}
                className="self-start bg-primary hover:bg-primary/90 text-white px-6 py-3 rounded-lg font-bold transition disabled:opacity-50 flex items-center gap-2 shadow-lg hover:shadow-primary/20 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                {savingConfig ? "Saving Configuration..." : "Save Configuration"}
              </button>

              {shadowProviderId && (
                <div className="border-t border-white/5 pt-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 w-full">
                  <div>
                    <h3 className="font-bold text-sm text-white mb-1">Provider Synchronization</h3>
                    <p className="text-zinc-500 text-xs">
                      Trigger and monitor content updates for the premium master provider database cache.
                    </p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs text-zinc-400 font-medium">Status:</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold uppercase ${
                        shadowStatus === 'SYNCING' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse' :
                        shadowStatus === 'ERROR' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                        'bg-green-500/10 text-green-400 border border-green-500/20'
                      }`}>
                        {shadowStatus}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {isSyncing ? (
                      <button 
                        type="button"
                        onClick={handleStopSync}
                        className="px-5 py-2.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg text-sm font-bold text-red-400 transition"
                      >
                        Stop Sync
                      </button>
                    ) : (
                      <button 
                        type="button"
                        onClick={handleTriggerSync}
                        className="px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm font-bold text-white transition flex items-center gap-2"
                      >
                        <RefreshCw className="w-4 h-4" /> Trigger Sync
                      </button>
                    )}
                  </div>
                </div>
              )}

              {isSyncing && syncProgress && (
                <div className="p-4 bg-black/50 rounded-xl border border-white/10 animate-in fade-in duration-200 w-full">
                  <div className="flex justify-between text-xs font-semibold mb-2 text-zinc-400">
                    <span>{syncProgress.step}</span>
                    <span>{syncProgress.processedItems} / {syncProgress.totalItems || '?'}</span>
                  </div>
                  <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden mb-2">
                    <div 
                      className="bg-primary h-full transition-all duration-500"
                      style={{ width: `${Math.min(100, ((syncProgress.processedItems || 0) / (syncProgress.totalItems || 1)) * 100)}%` }}
                    />
                  </div>
                  <p className="text-zinc-500 text-[11px] italic">{syncProgress.message}</p>
                </div>
              )}
            </div>
          </form>
        </div>

        {/* Trial Monitoring Log */}
        <div className="bg-[#111] border border-white/10 rounded-2xl overflow-hidden shadow-xl">
          <div className="p-6 border-b border-white/5 flex items-center justify-between">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Users className="w-5 h-5 text-zinc-400" />
              Active & Expired Trials Log
            </h2>
            <div className="bg-white/5 text-xs px-3 py-1 rounded-full text-zinc-400 font-bold border border-white/5">
              {trials.length} Total Trials
            </div>
          </div>

          <div className="overflow-x-auto font-sans">
            <table className="w-full text-left">
              <thead className="bg-white/5 text-xs uppercase text-zinc-500 font-bold">
                <tr>
                  <th className="px-6 py-4 tracking-wider font-semibold">User / Email</th>
                  <th className="px-6 py-4 tracking-wider font-semibold">Trial Username</th>
                  <th className="px-6 py-4 tracking-wider font-semibold">Status</th>
                  <th className="px-6 py-4 tracking-wider font-semibold">Created At</th>
                  <th className="px-6 py-4 tracking-wider font-semibold">Expiry</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-sm">
                {trials.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-zinc-500">
                      No trial user logs found.
                    </td>
                  </tr>
                ) : (
                  trials.map(trial => {
                    const isExpired = trial.trialExpiry ? new Date() > new Date(trial.trialExpiry) : true;
                    return (
                      <tr key={trial.id} className="hover:bg-white/5 transition duration-150">
                        <td className="px-6 py-4 font-medium text-white">
                          {trial.email}
                        </td>
                        <td className="px-6 py-4 font-mono text-zinc-300">
                          {trial.trialUsername || "—"}
                        </td>
                        <td className="px-6 py-4">
                          {isExpired ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-500 border border-red-500/20">
                              Expired
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-500/10 text-green-500 border border-green-500/20">
                              <CheckCircle className="w-3.5 h-3.5" />
                              Active
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-zinc-400">
                          {format(new Date(trial.createdAt), 'MMM d, yyyy HH:mm')}
                        </td>
                        <td className="px-6 py-4 text-zinc-400">
                          {trial.trialExpiry ? format(new Date(trial.trialExpiry), 'MMM d, yyyy HH:mm') : "—"}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  )
}
