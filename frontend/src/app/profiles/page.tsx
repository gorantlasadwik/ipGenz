"use client"

import { useEffect, useState } from "react"
import { Plus } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { api } from "@/lib/api"

interface Profile {
  id: string
  name: string
  profileType: string
  avatar?: string
}

export default function ProfilesPage() {
  const router = useRouter()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState("")

  useEffect(() => {
    api.getProfiles().then((data) => {
      setProfiles(data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const handleCreateProfile = async () => {
    if (!newName.trim()) return
    const profile = await api.createProfile({ name: newName, profileType: "ADULT" })
    setProfiles([...profiles, profile])
    setNewName("")
    setShowCreate(false)
  }

  const selectProfile = (profileId: string) => {
    localStorage.setItem("profileId", profileId)
    router.push("/home")
  }

  const colors = ["bg-blue-600", "bg-pink-600", "bg-yellow-500", "bg-green-600", "bg-purple-600"]

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center">
      <h1 className="text-4xl md:text-6xl font-medium text-white mb-10">Who's watching?</h1>
      
      <div className="flex flex-wrap justify-center gap-8 px-4">
        {profiles.map((p, i) => (
          <button key={p.id} onClick={() => selectProfile(p.id)} className="group flex flex-col items-center gap-4 cursor-pointer">
            <div className={`w-32 h-32 md:w-40 md:h-40 rounded-xl ${colors[i % colors.length]} border-4 border-transparent group-hover:border-white transition-all overflow-hidden relative flex items-center justify-center`}>
              <span className="text-4xl font-bold text-white/80">{p.name[0]?.toUpperCase()}</span>
            </div>
            <span className="text-zinc-400 font-medium text-lg group-hover:text-white transition-colors">
              {p.name}
            </span>
          </button>
        ))}

        {/* Add Profile Button */}
        {showCreate ? (
          <div className="flex flex-col items-center gap-4">
            <div className="w-32 h-32 md:w-40 md:h-40 rounded-xl border-4 border-zinc-800 flex flex-col items-center justify-center gap-2 p-4">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Name"
                className="bg-transparent border-b border-white/30 text-white text-center text-lg focus:outline-none focus:border-primary w-full"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleCreateProfile()}
              />
            </div>
            <div className="flex gap-2">
              <button onClick={handleCreateProfile} className="text-sm font-bold text-primary hover:text-white transition">Save</button>
              <button onClick={() => setShowCreate(false)} className="text-sm font-bold text-zinc-500 hover:text-white transition">Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowCreate(true)} className="group flex flex-col items-center gap-4 cursor-pointer">
            <div className="w-32 h-32 md:w-40 md:h-40 rounded-xl border-4 border-zinc-800 flex items-center justify-center group-hover:bg-zinc-800 transition-colors">
              <Plus size={48} className="text-zinc-500 group-hover:text-white transition-colors" />
            </div>
            <span className="text-zinc-400 font-medium text-lg group-hover:text-white transition-colors">
              Add Profile
            </span>
          </button>
        )}
      </div>
    </div>
  )
}
