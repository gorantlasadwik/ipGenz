"use client"

import { useEffect, useState } from "react"
import { 
  Activity, Users, Video, ShieldCheck, Database, RefreshCw, Cpu, HardDrive
} from "lucide-react"
import { api } from "@/lib/api"

export default function AdminOverviewPage() {
  const [metrics, setMetrics] = useState<any>(null)
  const [systemMetrics, setSystemMetrics] = useState({
    cpuLoad: 0,
    ramUsage: 0,
    storageUsage: 45,
    rpm: 0,
    latency: 0,
    uptime: 0
  })

  const [loading, setLoading] = useState(true)
  const [scanLoading, setScanLoading] = useState(false)
  const [scanMessage, setScanMessage] = useState<string | null>(null)

  const loadData = async () => {
    try {
      const [met, sys] = await Promise.all([
        api.getAdminMetrics(),
        api.getAdminSystemMetrics()
      ])
      setMetrics(met)
      setSystemMetrics(sys)
      setLoading(false)
    } catch (err) {
      console.error("Failed to load core admin dataset:", err)
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    
    // Poll dynamic stats every 3 seconds
    const interval = setInterval(async () => {
      try {
        const sys = await api.getAdminSystemMetrics()
        setSystemMetrics(sys)
      } catch (err) {}
    }, 3000)

    return () => clearInterval(interval)
  }, [])

  const handleTriggerScan = async () => {
    setScanLoading(true)
    setScanMessage("Starting stream compatibility diagnostics...")
    try {
      const res = await api.triggerAdminCodecScan()
      setScanMessage(res.message || "Diagnostics sync started in background.")
      loadData()
    } catch (err) {
      setScanMessage("Connection error while starting scanner.")
    }
    setScanLoading(false)
    setTimeout(() => setScanMessage(null), 5000)
  }

  if (loading || !metrics) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-slate-950 gap-4 text-white">
        <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-semibold tracking-wide text-zinc-400 font-mono">LOADING OVERVIEW NODE...</span>
      </div>
    )
  }

  const totalContent = metrics.content.total || 1
  const analyzedContent = metrics.codecs.totalAnalyzed || 0
  const progressPercent = Math.min(100, Math.round((analyzedContent / totalContent) * 100))

  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-6">
      
      {/* Page Header Area */}
      <div className="flex justify-between items-center border-b border-white/5 pb-4">
        <div>
          <h2 className="text-xl font-bold uppercase tracking-wide text-zinc-300">System Dashboard</h2>
          <span className="text-[10px] text-zinc-500 font-mono">Server Uptime: {Math.floor(systemMetrics.uptime / 3600)} Hours</span>
        </div>
        
        <div className="flex items-center gap-3">
          {scanMessage && (
            <span className="text-xs bg-zinc-900 border border-white/5 text-red-500 px-3 py-2 rounded-xl font-semibold">
              {scanMessage}
            </span>
          )}
          <button 
            onClick={handleTriggerScan}
            disabled={scanLoading}
            className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-xl font-bold transition flex items-center gap-2 text-xs disabled:opacity-50"
          >
            <RefreshCw size={14} className={scanLoading ? "animate-spin" : ""} />
            Scan Streams
          </button>
        </div>
      </div>

      {/* Main Overview Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="System Users" value={metrics.users.total.toLocaleString()} label="Database registrations" icon={<Users className="text-blue-500" />} />
        <MetricCard title="VOD Library Items" value={totalContent.toLocaleString()} label={`${metrics.content.channels} Live Channels`} icon={<Video className="text-purple-500" />} />
        <MetricCard title="Scanned Codecs" value={analyzedContent.toLocaleString()} label={`${progressPercent}% mapped`} icon={<ShieldCheck className="text-green-500" />} />
        <MetricCard title="Total Adapters" value={metrics.providers.length.toLocaleString()} label="IPTV integrations" icon={<Database className="text-red-500" />} />
      </div>

      {/* Real OS Resource Utilization dials */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <ResourceCard label="CPU Node Load" percentage={systemMetrics.cpuLoad} desc="Real ticks averaged from os.cpus()" color="stroke-red-500" icon={<Cpu size={16} className="text-red-500" />} />
        <ResourceCard label="System RAM Allocation" percentage={systemMetrics.ramUsage} desc="Used physical memory / os.totalmem()" color="stroke-blue-500" icon={<Activity size={16} className="text-blue-500" />} />
        <ResourceCard label="Storage Status" percentage={systemMetrics.storageUsage} desc="App cache drive occupancy percentage" color="stroke-purple-500" icon={<HardDrive size={16} className="text-purple-500" />} />
      </div>

      {/* Codecs Pipeline Details */}
      <div className="bg-zinc-950 border border-white/10 rounded-2xl p-6">
        <h3 className="font-extrabold text-base flex items-center gap-2 mb-4 border-b border-white/5 pb-3">
          <ShieldCheck size={16} className="text-green-500" /> Real Diagnostics Status
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white/5 border border-white/5 p-4 rounded-xl">
            <span className="text-[10px] text-zinc-400 block font-semibold">DIRECT STREAMS COMPATIBILITY</span>
            <span className="text-2xl font-black text-green-400 font-mono mt-1 block">
              {metrics.codecs.direct.toLocaleString()} <span className="text-xs font-normal text-zinc-400">Items</span>
            </span>
          </div>
          
          <div className="bg-white/5 border border-white/5 p-4 rounded-xl">
            <span className="text-[10px] text-zinc-400 block font-semibold">TRANSCODE REQUIRED (AUDIO/VIDEO)</span>
            <span className="text-2xl font-black text-yellow-500 font-mono mt-1 block">
              {(metrics.codecs.audioTranscode + metrics.codecs.videoTranscode).toLocaleString()} <span className="text-xs font-normal text-zinc-400">Items</span>
            </span>
          </div>

          <div className="bg-white/5 border border-white/5 p-4 rounded-xl">
            <span className="text-[10px] text-zinc-400 block font-semibold">OFFLINE / BROKEN SCAN SEGMENTS</span>
            <span className="text-2xl font-black text-red-500 font-mono mt-1 block">
              {metrics.codecs.broken.toLocaleString()} <span className="text-xs font-normal text-zinc-400">Errors</span>
            </span>
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

function ResourceCard({ label, percentage, desc, color, icon }: { label: string; percentage: number; desc: string; color: string; icon: React.ReactNode }) {
  const radius = 35
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (percentage / 100) * circumference

  return (
    <div className="bg-zinc-950 border border-white/10 rounded-2xl p-5 flex items-center justify-between hover:border-white/15 transition-all">
      <div className="space-y-1.5 flex-1 pr-4">
        <span className="text-xs font-bold text-white flex items-center gap-2">
          {icon} {label}
        </span>
        <p className="text-[10px] text-zinc-500 font-medium leading-normal">{desc}</p>
        <span className="text-xl font-mono font-black text-white block mt-1">{percentage}%</span>
      </div>

      <div className="relative flex-shrink-0 w-20 h-20">
        <svg className="w-full h-full transform -rotate-90">
          <circle cx="40" cy="40" r={radius} stroke="rgba(255,255,255,0.05)" strokeWidth="5" fill="transparent" />
          <circle 
            cx="40" 
            cy="40" 
            r={radius} 
            stroke="currentColor" 
            strokeWidth="5" 
            fill="transparent" 
            className={`${color} transition-all duration-1000`}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[10px] font-black font-mono text-zinc-400">{percentage}%</span>
        </div>
      </div>
    </div>
  )
}
