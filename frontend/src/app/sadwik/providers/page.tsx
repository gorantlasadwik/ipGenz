"use client"

import { useEffect, useState } from "react"
import { 
  Database
} from "lucide-react"
import { api } from "@/lib/api"

export default function AdminProvidersPage() {
  const [metrics, setMetrics] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getAdminMetrics()
      .then(res => {
        setMetrics(res)
        setLoading(false)
      })
      .catch(err => {
        console.error("Failed to load provider metrics:", err)
        setLoading(false)
      })
  }, [])

  if (loading || !metrics) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-slate-950 gap-4 text-white">
        <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-semibold tracking-wide text-zinc-400 font-mono">LOADING PROVIDER NODE...</span>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-6">
      
      {/* Providers Table */}
      <div className="bg-zinc-950 border border-white/10 rounded-2xl p-6">
        <div className="flex justify-between items-center mb-6 border-b border-white/5 pb-3">
          <h3 className="font-extrabold text-base flex items-center gap-2">
            <Database size={16} className="text-red-500" /> Synced Provider Adapters
          </h3>
          <span className="text-[10px] text-zinc-400 font-mono">Total Adapters: {metrics.providers.length}</span>
        </div>
        
        {metrics.providers.length === 0 ? (
          <div className="text-center py-12 text-zinc-500 text-xs">
            No active provider connections are currently synchronized on this platform.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-black text-zinc-400 border-b border-white/10 text-[9px] uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">Provider Name</th>
                  <th className="px-6 py-4">Type</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Last Sync Time</th>
                  <th className="px-6 py-4 text-right">Items count</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {metrics.providers.map((p: any, idx: number) => (
                  <tr key={idx} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 font-bold text-white">{p.name}</td>
                    <td className="px-6 py-4 text-zinc-400 font-mono">{p.type}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-[9px] font-extrabold border ${
                        p.status === 'ACTIVE' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 
                        p.status === 'SYNCING' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 
                        'bg-red-500/10 text-red-400 border-red-500/20'
                      }`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-zinc-400">
                      {p.lastSync ? new Date(p.lastSync).toLocaleString() : 'Never'}
                    </td>
                    <td className="px-6 py-4 text-right font-mono font-bold text-zinc-300">
                      {p.streamsCount.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  )
}
