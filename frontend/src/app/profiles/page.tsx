"use client"

import { useEffect, useState } from "react"
import { Plus, Edit2, Lock, Unlock, X } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { api, isDemoUser } from "@/lib/api"

interface Profile {
  id: string
  name: string
  profileType: string
  avatar?: string
  hasPin?: boolean
}

export default function ProfilesPage() {
  const router = useRouter()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState("")
  const [isDemo, setIsDemo] = useState(false)
  
  // Manage Mode & Pin states
  const [isManageMode, setIsManageMode] = useState(false)
  const [pinModal, setPinModal] = useState<{ isOpen: boolean; profile: Profile | null; mode: 'verify' | 'set' | 'remove' }>({
    isOpen: false, profile: null, mode: 'verify'
  })
  const [pinInput, setPinInput] = useState("")
  const [pinError, setPinError] = useState("")

  useEffect(() => {
    setIsDemo(isDemoUser())
    api.getProfiles().then((data) => {
      setProfiles(data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const handleCreateProfile = async () => {
    if (!newName.trim()) return
    try {
      const profile = await api.createProfile({ name: newName, profileType: "ADULT" })
      setProfiles([...profiles, profile])
      setNewName("")
      setShowCreate(false)
    } catch (error: any) {
      console.error(error)
      alert(error.message || "Failed to create profile")
    }
  }

  const handleProfileClick = (p: Profile) => {
    if (isManageMode) {
      // Open manage modal for this profile
      setPinModal({ isOpen: true, profile: p, mode: p.hasPin ? 'remove' : 'set' })
      setPinInput("")
      setPinError("")
    } else {
      // Normal login
      if (p.hasPin) {
        setPinModal({ isOpen: true, profile: p, mode: 'verify' })
        setPinInput("")
        setPinError("")
      } else {
        loginToProfile(p.id)
      }
    }
  }

  const loginToProfile = (profileId: string) => {
    localStorage.setItem("profileId", profileId)
    router.push("/home")
  }

  const submitPin = async () => {
    setPinError("")
    if (!pinModal.profile) return

    try {
      if (pinModal.mode === 'verify') {
        const res = await api.verifyPin(pinModal.profile.id, pinInput)
        if (res.valid) {
          setPinModal({ ...pinModal, isOpen: false })
          loginToProfile(pinModal.profile.id)
        } else {
          setPinError("Incorrect PIN")
        }
      } else if (pinModal.mode === 'set') {
        if (pinInput.length < 4) {
          setPinError("PIN must be at least 4 digits")
          return
        }
        const updated = await api.updateProfile(pinModal.profile.id, { pin: pinInput })
        setProfiles(profiles.map(p => p.id === updated.id ? updated : p))
        setPinModal({ ...pinModal, isOpen: false })
      } else if (pinModal.mode === 'remove') {
        const res = await api.verifyPin(pinModal.profile.id, pinInput)
        if (res.valid) {
          const updated = await api.updateProfile(pinModal.profile.id, { pin: null })
          setProfiles(profiles.map(p => p.id === updated.id ? updated : p))
          setPinModal({ ...pinModal, isOpen: false })
        } else {
          setPinError("Incorrect current PIN")
        }
      }
    } catch (err: any) {
      setPinError(err.message || "An error occurred")
    }
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
    <div className="min-h-screen bg-black flex flex-col items-center justify-center relative">
      <div className="text-center mb-10">
        <h1 className="text-4xl md:text-6xl font-medium text-white mb-4">
          {isManageMode ? "Manage Profiles" : "Who's watching?"}
        </h1>
        {isManageMode && <p className="text-zinc-400">Select a profile to lock or unlock</p>}
      </div>
      
      <div className="flex flex-wrap justify-center gap-8 px-4">
        {profiles.map((p, i) => (
          <button key={p.id} onClick={() => handleProfileClick(p)} className="group flex flex-col items-center gap-4 cursor-pointer relative">
            <div className={`w-32 h-32 md:w-40 md:h-40 rounded-xl ${colors[i % colors.length]} border-4 ${isManageMode ? 'border-zinc-500 group-hover:border-white' : 'border-transparent group-hover:border-white'} transition-all overflow-hidden relative flex items-center justify-center`}>
              <span className="text-4xl font-bold text-white/80">{p.name[0]?.toUpperCase()}</span>
              {isManageMode && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  {p.hasPin ? <Unlock size={32} className="text-white" /> : <Lock size={32} className="text-white" />}
                </div>
              )}
            </div>
            <span className="text-zinc-400 font-medium text-lg group-hover:text-white transition-colors flex items-center gap-2">
              {p.name}
              {p.hasPin && !isManageMode && <Lock size={14} className="text-zinc-500" />}
            </span>
          </button>
        ))}

        {/* Add Profile Button */}
        {!isDemo && !isManageMode && (
          showCreate ? (
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
          )
        )}
      </div>

      {/* Manage Profiles Button */}
      {!isDemo && profiles.length > 0 && (
        <div className="mt-16">
          <button 
            onClick={() => setIsManageMode(!isManageMode)}
            className="px-6 py-2 border border-zinc-500 text-zinc-400 hover:text-white hover:border-white rounded text-lg font-medium transition-colors tracking-wider"
          >
            {isManageMode ? "Done" : "Manage Profiles"}
          </button>
        </div>
      )}

      {/* PIN Modal */}
      {pinModal.isOpen && pinModal.profile && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-2xl max-w-sm w-full relative shadow-2xl">
            <button 
              onClick={() => setPinModal({ ...pinModal, isOpen: false })}
              className="absolute top-4 right-4 text-zinc-500 hover:text-white transition"
            >
              <X size={24} />
            </button>
            
            <div className="text-center mb-8">
              {pinModal.mode === 'verify' && <Lock size={48} className="mx-auto text-primary mb-4" />}
              {pinModal.mode === 'set' && <Lock size={48} className="mx-auto text-white mb-4" />}
              {pinModal.mode === 'remove' && <Unlock size={48} className="mx-auto text-white mb-4" />}
              
              <h2 className="text-2xl font-bold text-white mb-2">
                {pinModal.mode === 'verify' ? "Enter PIN" : 
                 pinModal.mode === 'set' ? "Set Profile PIN" : "Remove PIN"}
              </h2>
              <p className="text-zinc-400">
                {pinModal.mode === 'verify' ? `Enter PIN to access ${pinModal.profile.name}` :
                 pinModal.mode === 'set' ? `Set a 4-digit PIN to lock ${pinModal.profile.name}` :
                 `Enter current PIN to unlock ${pinModal.profile.name}`}
              </p>
            </div>

            <div className="flex flex-col items-center gap-4">
              <input 
                type="password"
                maxLength={4}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                className="w-32 text-center text-4xl tracking-widest bg-black border border-zinc-700 rounded-lg p-4 text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && submitPin()}
              />
              {pinError && <p className="text-red-500 text-sm">{pinError}</p>}
              
              <button 
                onClick={submitPin}
                className="w-full bg-white text-black font-bold py-3 rounded-lg hover:bg-zinc-200 transition mt-4"
              >
                {pinModal.mode === 'verify' ? "Unlock" : pinModal.mode === 'set' ? "Save PIN" : "Remove PIN"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
