"use client"

import { useEffect, useState } from "react"
import { ListVideo, Plus, Trash2 } from "lucide-react"
import Link from "next/link"
import { api } from "@/lib/api"

export default function PlaylistsPage() {
  const [playlists, setPlaylists] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState("")

  const loadData = async () => {
    const profileId = localStorage.getItem("profileId")
    if (!profileId) return
    const data = await api.getPlaylists(profileId)
    setPlaylists(data)
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const handleCreate = async () => {
    if (!newName.trim()) return
    const profileId = localStorage.getItem("profileId")
    if (!profileId) return
    await api.createPlaylist(profileId, newName)
    setNewName("")
    setShowAdd(false)
    loadData()
  }

  if (loading) {
    return <div className="flex items-center justify-center h-full"><div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>
  }

  return (
    <div className="w-full h-full overflow-y-auto px-4 sm:px-8 md:px-12 py-6 md:py-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-10">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white mb-2">Playlists</h1>
          <p className="text-secondary-foreground text-sm md:text-lg">Your custom collections.</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="bg-primary text-white px-5 py-2.5 rounded-lg font-bold hover:bg-primary/90 transition flex items-center gap-2 flex-shrink-0">
          <Plus size={20} />
          Create Playlist
        </button>
      </div>

      {showAdd && (
        <div className="bg-surface border border-white/10 rounded-xl p-6 mb-8 flex items-center gap-4">
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Playlist Name"
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-primary"
            autoFocus
          />
          <button onClick={handleCreate} className="bg-primary hover:bg-primary/90 text-white font-bold py-3 px-6 rounded-lg transition">Save</button>
          <button onClick={() => setShowAdd(false)} className="text-secondary-foreground hover:text-white font-bold py-3 px-4 transition">Cancel</button>
        </div>
      )}

      {playlists.length === 0 ? (
        <div className="text-center py-20 bg-surface border border-white/5 rounded-2xl">
          <div className="text-5xl mb-4">📑</div>
          <h2 className="text-2xl font-bold text-white mb-2">No Playlists Yet</h2>
          <p className="text-secondary-foreground">Create a playlist to organize your favorite content.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {playlists.map((pl: any) => (
            <div key={pl.id} className="bg-surface border border-white/10 rounded-xl p-6 hover:border-white/30 transition group cursor-pointer">
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                  <ListVideo className="text-blue-500" />
                </div>
              </div>
              <h3 className="text-xl font-bold text-white mb-1">{pl.name}</h3>
              <p className="text-secondary-foreground">{pl._count?.items || 0} items</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
