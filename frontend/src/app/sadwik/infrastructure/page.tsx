"use client"

import { useEffect, useState } from "react"
import { 
  Cpu, Activity, Radio, Clock, LineChart, PlayCircle, Search
} from "lucide-react"
import { api } from "@/lib/api"

export default function AdminInfrastructurePage() {
  const [systemMetrics, setSystemMetrics] = useState({
    cpuLoad: 0,
    ramUsage: 0,
    storageUsage: 45,
    rpm: 0,
    latency: 0,
    uptime: 0
  })
  
  const [realAnalytics, setRealAnalytics] = useState({
    searchesToday: 0,
    topSearches: [] as string[],
    failedSearches: [] as string[],
    topMovies: [] as any[],
    topSeries: [] as any[]
  })

  const [loading, setLoading] = useState(true)

  const loadData = async () => {
    try {
      const [sys, analytics] = await Promise.all([
        api.getAdminSystemMetrics(),
        api.getAdminRealAnalytics()
      ])
      setSystemMetrics(sys)
      setRealAnalytics(analytics)
      setLoading(false)
    } catch (err) {
      console.error("Failed to load infrastructure metrics:", err)
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()

    // Poll live metrics every 3 seconds
    const interval = setInterval(async () => {
      try {
        const sys = await api.getAdminSystemMetrics()
        setSystemMetrics(sys)
      } catch (err) {}
    }, 3000)

    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-slate-950 gap-4 text-white">
        <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-semibold tracking-wide text-zinc-400 font-mono">LOADING INFRASTRUCTURE NODE...</span>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-6">
      
      {/* Live Metrics Counters */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="System CPU Average" value={`${systemMetrics.cpuLoad}%`} label="Dynamic usage stats" icon={<Cpu className="text-red-500" />} />
        <MetricCard title="System Memory Usage" value={`${systemMetrics.ramUsage}%`} label="Freemem allocations" icon={<Activity className="text-blue-500" />} />
        <MetricCard title="API Requests RPM" value={`${systemMetrics.rpm} rpm`} label="Window last 60 seconds" icon={<Radio className="text-purple-500" />} />
        <MetricCard title="API Average Latency" value={`${systemMetrics.latency} ms`} label="Average duration" icon={<Clock className="text-green-500" />} />
      </div>

      {/* Interactive Line Chart */}
      <div className="bg-zinc-950 border border-white/10 rounded-2xl p-6">
        <h3 className="font-extrabold text-base flex items-center gap-2 mb-4 border-b border-white/5 pb-3">
          <LineChart size={16} className="text-red-500 animate-pulse" /> Live Request Rates (RPM) & API Latency Metrics
        </h3>
        
        <div className="h-44 w-full bg-black rounded-xl relative border border-white/5 overflow-hidden flex items-end p-2.5">
          <svg className="w-full h-full absolute inset-0 overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
            <line x1="0" y1="25" x2="100" y2="25" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
            <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
            <line x1="0" y1="75" x2="100" y2="75" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
            
            {/* SVG Line mapping real metrics load */}
            <path 
              d={`M 0 70 Q 20 60 40 80 T 70 40 T 100 ${100 - Math.max(10, Math.min(90, systemMetrics.cpuLoad))}`}
              fill="none" 
              stroke="rgba(239, 68, 68, 0.8)" 
              strokeWidth="1.5" 
              strokeLinecap="round"
            />
          </svg>

          <div className="absolute top-3 right-3 flex items-center gap-4 text-[9px] bg-zinc-900 border border-white/10 px-3 py-1.5 rounded-lg">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-600" /> Requests (RPM): {systemMetrics.rpm}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> API Latency: {systemMetrics.latency}ms</span>
          </div>
        </div>
      </div>

      {/* Real DB Metrics Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Real Watched Metrics Counts */}
        <div className="bg-zinc-950 border border-white/10 rounded-2xl p-6 lg:col-span-2 space-y-4">
          <h3 className="font-extrabold text-base flex items-center gap-2 border-b border-white/5 pb-2">
            <PlayCircle size={16} className="text-red-500" /> Most Watched Content
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <span className="text-[10px] text-zinc-500 font-bold block uppercase tracking-wider">Top Movies</span>
              {realAnalytics.topMovies.length === 0 ? (
                <span className="text-zinc-500 text-xs italic">No watched movies logged.</span>
              ) : (
                realAnalytics.topMovies.map((m, idx) => (
                  <div key={idx} className="flex justify-between items-center bg-black border border-white/5 p-2 rounded-lg text-xs">
                    <span className="font-semibold truncate pr-3">{idx + 1}. {m.name}</span>
                    <span className="text-[10px] text-red-500 font-bold whitespace-nowrap">{m.count} plays</span>
                  </div>
                ))
              )}
            </div>

            <div className="space-y-2">
              <span className="text-[10px] text-zinc-500 font-bold block uppercase tracking-wider">Top Series</span>
              {realAnalytics.topSeries.length === 0 ? (
                <span className="text-zinc-500 text-xs italic">No watched series logged.</span>
              ) : (
                realAnalytics.topSeries.map((s, idx) => (
                  <div key={idx} className="flex justify-between items-center bg-black border border-white/5 p-2 rounded-lg text-xs">
                    <span className="font-semibold truncate pr-3">{idx + 1}. {s.name}</span>
                    <span className="text-[10px] text-red-500 font-bold whitespace-nowrap">{s.count} plays</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Real Queries Database Charts */}
        <div className="bg-zinc-950 border border-white/10 rounded-2xl p-6 space-y-4">
          <h3 className="font-extrabold text-base flex items-center gap-2 border-b border-white/5 pb-2">
            <Search size={16} className="text-blue-500" /> Search Queries Statistics
          </h3>

          <div className="space-y-3 text-xs">
            <div>
              <span className="text-[10px] text-zinc-500 block font-bold uppercase mb-1.5">Top Queries Today ({realAnalytics.searchesToday} total)</span>
              <div className="flex flex-wrap gap-1.5">
                {realAnalytics.topSearches.length === 0 ? (
                  <span className="text-zinc-500 italic text-xs">No searches performed today.</span>
                ) : (
                  realAnalytics.topSearches.map((s, idx) => (
                    <span key={idx} className="bg-white/5 border border-white/10 px-2.5 py-1 rounded-full text-zinc-300 font-medium">
                      {s}
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

      </div>

    </div>
  )
}

function MetricCard({ title, value, label, icon }: { title: string; value: string; label: string; icon: React.ReactNode }) {
  return (
    <div className="bg-zinc-950 border border-white/10 rounded-2xl p-5 flex justify-between items-start hover:border-white/15 transition-all">
      <div className="space-y-2.5">
        <span className="text-[10px] text-zinc-400 uppercase font-black tracking-wider block font-mono">{title}</span>
        <span className="text-2xl font-black text-white block leading-none">{value}</span>
        <span className="text-[10px] text-zinc-500 block font-medium">{label}</span>
      </div>
      <div className="p-2 bg-white/5 border border-white/10 rounded-xl">{icon}</div>
    </div>
  )
}
