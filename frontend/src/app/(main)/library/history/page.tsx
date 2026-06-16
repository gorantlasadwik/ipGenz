"use client"

import { useEffect, useState } from "react"
import { Play, Trash2 } from "lucide-react"
import Link from "next/link"
import { api } from "@/lib/api"

export default function HistoryPage() {
  const [history, setHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = async () => {
    const profileId = localStorage.getItem("profileId")
    if (!profileId) return
    const data = await api.getHistory(profileId)
    setHistory(data)
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  if (loading) {
    return <div className="flex items-center justify-center h-full"><div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>
  }

  return (
    <div className="w-full h-full overflow-y-auto px-12 py-10">
      <div className="flex justify-between items-center mb-10">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-white mb-2">Watch History</h1>
          <p className="text-secondary-foreground text-lg">Everything you've watched recently.</p>
        </div>
      </div>

      {history.length === 0 ? (
        <div className="text-center py-20 bg-surface border border-white/5 rounded-2xl">
          <div className="text-5xl mb-4">👀</div>
          <h2 className="text-2xl font-bold text-white mb-2">No History Yet</h2>
          <p className="text-secondary-foreground">Start watching content to see it appear here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {history.map((item: any) => (
            <div key={item.id} className="relative aspect-video rounded-lg overflow-hidden group border border-white/5 hover:border-white/20 transition-all hover:scale-105 bg-zinc-900">
              <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-white/50 text-sm">
                {item.contentType} {item.contentId}
              </div>
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Play className="fill-white w-10 h-10" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
