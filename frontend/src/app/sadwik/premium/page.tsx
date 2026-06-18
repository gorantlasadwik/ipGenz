"use client"

import { useState, useEffect } from "react"
import { Users, Crown, KeyRound, CheckCircle, Clock, AlertTriangle, ShieldCheck } from "lucide-react"
import { api } from "@/lib/api"
import { format } from "date-fns"

export default function PremiumAdminPage() {
  const [trials, setTrials] = useState<any[]>([])
  const [providers, setProviders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [generatingFor, setGeneratingFor] = useState<string | null>(null)
  const [selectedProviderId, setSelectedProviderId] = useState<string>("")
  const [generatedCredentials, setGeneratedCredentials] = useState<{username: string, password: string} | null>(null)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const [trialsData, providersData] = await Promise.all([
        api.getPremiumTrials(),
        api.getProviders()
      ])
      setTrials(trialsData)
      setProviders(providersData)
      if (providersData.length > 0) {
        setSelectedProviderId(providersData[0].id)
      }
    } catch (err) {
      console.error("Failed to fetch data", err)
    } finally {
      setLoading(false)
    }
  }

  const handleGenerate = async (userId: string) => {
    if (!selectedProviderId) {
      alert("Please select a master provider first")
      return
    }
    
    setGeneratingFor(userId)
    setGeneratedCredentials(null)
    try {
      const res = await api.generatePremiumTrial(userId, selectedProviderId)
      setGeneratedCredentials({
        username: res.trialUsername,
        password: res.trialPassword
      })
      await fetchData() // refresh list
    } catch (err: any) {
      alert(err.message || "Failed to generate trial")
    } finally {
      setGeneratingFor(null)
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
      <div className="max-w-6xl mx-auto space-y-8">
        
        <div>
          <h1 className="text-3xl font-black mb-2 flex items-center gap-3">
            <Crown className="text-yellow-500 w-8 h-8" />
            Premium Subscriptions
          </h1>
          <p className="text-zinc-400">Manage trial requests and provision 1-day premium access.</p>
        </div>

        {/* Master Provider Selection */}
        <div className="bg-[#111] border border-white/10 rounded-2xl p-6">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <ShieldCheck className="text-primary w-5 h-5" />
            Master Provider Config
          </h2>
          <p className="text-sm text-zinc-400 mb-6 max-w-2xl">
            Select the Xtream Codes provider that will be cloned for newly generated premium trials. 
            The trial user will be able to stream using these credentials but will <strong>never</strong> see your raw username or password.
          </p>

          <div className="max-w-md">
            <label className="block text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Master Provider</label>
            <select
              value={selectedProviderId}
              onChange={(e) => setSelectedProviderId(e.target.value)}
              className="w-full bg-black border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-primary"
            >
              {providers.length === 0 ? (
                <option value="">No providers found. Add one first.</option>
              ) : (
                providers.map(p => (
                  <option key={p.id} value={p.id}>{p.providerName} ({p.providerType})</option>
                ))
              )}
            </select>
          </div>
        </div>

        {/* Generated Credentials Alert */}
        {generatedCredentials && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-6 flex items-start gap-4 animate-in fade-in slide-in-from-top-4">
            <KeyRound className="w-6 h-6 text-green-500 flex-shrink-0 mt-1" />
            <div>
              <h3 className="text-green-500 font-bold text-lg mb-2">Credentials Generated Successfully!</h3>
              <p className="text-green-200/80 text-sm mb-4">Please securely copy and email these credentials to the user. They will expire in exactly 24 hours.</p>
              <div className="flex gap-6 items-center bg-black/40 p-4 rounded-lg font-mono text-lg">
                <div>
                  <span className="text-xs text-zinc-500 uppercase tracking-wider block mb-1">Username</span>
                  <span className="font-bold text-white tracking-widest">{generatedCredentials.username}</span>
                </div>
                <div>
                  <span className="text-xs text-zinc-500 uppercase tracking-wider block mb-1">Password</span>
                  <span className="font-bold text-white tracking-widest">{generatedCredentials.password}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Trial Requests Table */}
        <div className="bg-[#111] border border-white/10 rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-white/5 flex items-center justify-between">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Users className="w-5 h-5" />
              Trial Requests
            </h2>
            <div className="bg-white/5 text-xs px-3 py-1 rounded-full text-zinc-400">
              {trials.length} Requests
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-white/5 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-6 py-4 font-semibold tracking-wider">Email</th>
                  <th className="px-6 py-4 font-semibold tracking-wider">Status</th>
                  <th className="px-6 py-4 font-semibold tracking-wider">Requested At</th>
                  <th className="px-6 py-4 font-semibold tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {trials.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-zinc-500">
                      No trial requests found.
                    </td>
                  </tr>
                ) : (
                  trials.map(trial => (
                    <tr key={trial.id} className="hover:bg-white/5 transition">
                      <td className="px-6 py-4">
                        <div className="font-medium">{trial.email}</div>
                        {trial.isPremiumTrial && (
                          <div className="text-xs text-zinc-500 font-mono mt-1">Username: {trial.trialUsername}</div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {trial.isPremiumTrial ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-500 border border-green-500/20">
                            <CheckCircle className="w-3.5 h-3.5" />
                            Active Trial
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-500 border border-yellow-500/20">
                            <Clock className="w-3.5 h-3.5" />
                            Pending Approval
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-zinc-400">
                        {format(new Date(trial.createdAt), 'MMM d, yyyy HH:mm')}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {!trial.isPremiumTrial ? (
                          <button
                            onClick={() => handleGenerate(trial.id)}
                            disabled={generatingFor === trial.id}
                            className="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm font-bold transition disabled:opacity-50 inline-flex items-center gap-2"
                          >
                            {generatingFor === trial.id ? "Generating..." : "Generate 1-Day Trial"}
                          </button>
                        ) : (
                          <span className="text-xs text-zinc-500">
                            Expires: {format(new Date(trial.trialExpiry), 'MMM d, HH:mm')}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  )
}
