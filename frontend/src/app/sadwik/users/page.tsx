"use client"

import { useEffect, useState } from "react"
import { 
  Users, Search, Key, Activity, Monitor, ShieldAlert, LogOut
} from "lucide-react"
import { api } from "@/lib/api"

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([])
  const [sessions, setSessions] = useState<any[]>([])
  const [liveWatchers, setLiveWatchers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [userQuery, setUserQuery] = useState("")
  const [resetPassUser, setResetPassUser] = useState<any | null>(null)
  const [newPassword, setNewPassword] = useState("")
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null)
  const [impersonatedUser, setImpersonatedUser] = useState<string | null>(null)

  const loadData = async () => {
    try {
      const [usr, sess, watchers] = await Promise.all([
        api.getAdminUsers(),
        api.getAdminSessions(),
        api.getAdminLiveWatchers()
      ])
      setUsers(usr)
      setSessions(sess)
      setLiveWatchers(watchers)
      setLoading(false)
    } catch (err) {
      console.error("Failed to load user statistics:", err)
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    
    // Poll active watch sessions every 3 seconds
    const interval = setInterval(async () => {
      try {
        const watchers = await api.getAdminLiveWatchers()
        setLiveWatchers(watchers)
      } catch (err) {}
    }, 3000)

    return () => clearInterval(interval)
  }, [])

  const handleBanUser = async (userId: string, email: string) => {
    if (!confirm(`Are you sure you want to ban user: ${email}?`)) return
    try {
      await api.banAdminUser(userId)
      setActionSuccessMessage(`Banned email ${email}. Action recorded.`)
      loadData()
    } catch (err) {
      setActionSuccessMessage("Failed to submit account ban.")
    }
    setTimeout(() => setActionSuccessMessage(null), 4000)
  }

  const handleDeleteUser = async (userId: string, email: string) => {
    if (!confirm(`WARNING: Deleting user ${email} is permanent. Purge all records?`)) return
    try {
      await api.deleteAdminUser(userId)
      setActionSuccessMessage(`Purged profile records for ${email}.`)
      loadData()
    } catch (err) {
      setActionSuccessMessage("Failed to delete user profile.")
    }
    setTimeout(() => setActionSuccessMessage(null), 4000)
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resetPassUser || !newPassword) return
    try {
      await api.resetAdminUserPassword(resetPassUser.id, newPassword)
      setActionSuccessMessage(`Password updated successfully for ${resetPassUser.email}.`)
      setResetPassUser(null)
      setNewPassword("")
      loadData()
    } catch (err) {
      setActionSuccessMessage("Failed to submit password hash change.")
    }
    setTimeout(() => setActionSuccessMessage(null), 4000)
  }

  const handleRevokeSession = async (sessionId: string, device: string) => {
    try {
      await api.deleteAdminSession(sessionId)
      setActionSuccessMessage(`Revoked active auth token for device: ${device}.`)
      loadData()
    } catch (err) {
      setActionSuccessMessage("Failed to close session.")
    }
    setTimeout(() => setActionSuccessMessage(null), 4000)
  }

  const startImpersonation = (email: string) => {
    setImpersonatedUser(email)
    if (typeof window !== 'undefined') {
      sessionStorage.setItem("impersonate_user_email", email)
    }
    api.createAdminAuditLog("IMPERSONATION_ACTIVE", email)
    setActionSuccessMessage(`Viewing console context as ${email}.`)
    window.location.reload()
  }

  const filteredUsers = users.filter(u => 
    u.email.toLowerCase().includes(userQuery.toLowerCase()) || 
    u.id.includes(userQuery)
  )

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-slate-950 gap-4 text-white">
        <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-semibold tracking-wide text-zinc-400 font-mono">LOADING USER NODE...</span>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-6">
      
      {/* Search directory */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-zinc-950 border border-white/10 rounded-xl p-4">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Filter users directory by email or database id..."
            value={userQuery}
            onChange={(e) => setUserQuery(e.target.value)}
            className="w-full bg-black border border-white/10 rounded-lg pl-10 pr-4 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-red-500 transition-all"
          />
        </div>
        {actionSuccessMessage && (
          <span className="text-xs bg-green-500/10 border border-green-500/20 text-green-400 px-3 py-2 rounded-xl font-semibold">
            {actionSuccessMessage}
          </span>
        )}
        <div className="text-xs text-zinc-400 bg-white/5 px-3 py-2 rounded border border-white/10 font-mono">
          Real Accounts: {filteredUsers.length}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Users List */}
        <div className="bg-zinc-950 border border-white/10 rounded-2xl p-6 lg:col-span-2 space-y-4">
          <h3 className="font-extrabold text-base flex items-center gap-2 border-b border-white/5 pb-3">
            <Users size={16} className="text-red-500" /> Registered Users
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-black text-zinc-400 border-b border-white/10 text-[9px] uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Profiles</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-6 text-zinc-500">No matching user records.</td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3.5 font-semibold">
                        <span className="block text-white font-medium">{u.email}</span>
                        <span className="text-[8px] text-zinc-500 block font-mono mt-0.5">{u.id}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap gap-1">
                          {u.profiles?.map((p: any) => (
                            <span key={p.id} className="text-[9px] bg-white/5 border border-white/10 text-zinc-300 px-1.5 py-0.5 rounded">
                              {p.name}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-zinc-400">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3.5 text-right space-x-1.5">
                        <button 
                          onClick={() => startImpersonation(u.email)}
                          className="text-[9px] bg-blue-500/10 hover:bg-blue-500 text-blue-400 hover:text-white px-2 py-1 rounded border border-blue-500/20 font-bold"
                        >
                          Impersonate
                        </button>
                        <button 
                          onClick={() => setResetPassUser(u)}
                          className="text-[9px] bg-yellow-500/10 hover:bg-yellow-500 text-yellow-400 hover:text-white px-2 py-1 rounded border border-yellow-500/20 font-bold"
                        >
                          Reset
                        </button>
                        <button 
                          onClick={() => handleBanUser(u.id, u.email)}
                          className="text-[9px] bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white px-2 py-1 rounded border border-red-500/20 font-bold"
                        >
                          Ban
                        </button>
                        <button 
                          onClick={() => handleDeleteUser(u.id, u.email)}
                          className="text-[9px] bg-zinc-800 hover:bg-red-600 text-zinc-400 hover:text-white px-2 py-1 rounded border border-zinc-700 font-bold"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Reset Password Form Side panel */}
        <div className="space-y-6">
          {resetPassUser && (
            <div className="bg-zinc-950 border border-yellow-500/30 rounded-2xl p-6">
              <div className="flex justify-between items-center mb-4 border-b border-white/5 pb-2">
                <h3 className="font-extrabold text-xs text-yellow-500 flex items-center gap-1.5">
                  <Key size={14} /> Password Reset Form
                </h3>
                <button onClick={() => setResetPassUser(null)} className="text-zinc-500 hover:text-white text-xs">Close</button>
              </div>
              
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="space-y-1">
                  <span className="text-[10px] text-zinc-500 block font-bold">TARGET EMAIL</span>
                  <span className="text-xs font-mono text-zinc-300 truncate block">{resetPassUser.email}</span>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-zinc-400 block font-bold">NEW PASSWORD</label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-700 focus:outline-none focus:border-yellow-500 transition-colors font-mono"
                  />
                </div>

                <button 
                  type="submit"
                  className="w-full bg-yellow-500 hover:bg-yellow-400 text-black text-xs font-black py-2.5 rounded-lg transition-colors"
                >
                  Commit Password Reset
                </button>
              </form>
            </div>
          )}

          {/* Real Live Watcher Activity Stream */}
          <div className="bg-zinc-950 border border-white/10 rounded-2xl p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-white/5 pb-3">
              <h3 className="font-extrabold text-base flex items-center gap-2">
                <Activity size={16} className="text-red-500 animate-pulse" /> Active Watch Session
              </h3>
              <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping" />
            </div>

            <div className="space-y-3.5 overflow-y-auto max-h-[350px]">
              {liveWatchers.length === 0 ? (
                <div className="text-center py-8 text-zinc-500 text-xs font-mono">
                  NO ACTIVE WATCHERS FOUND
                </div>
              ) : (
                liveWatchers.map((w, idx) => (
                  <div key={idx} className="bg-white/5 border border-white/5 p-3 rounded-xl space-y-1.5">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-xs font-bold text-zinc-200 block">{w.name}</span>
                        <span className="text-[8px] text-zinc-500 block font-mono">{w.email}</span>
                      </div>
                      <span className="text-[8px] font-extrabold bg-red-600/10 text-red-500 border border-red-500/25 px-1.5 py-0.5 rounded">
                        {w.screen}
                      </span>
                    </div>
                    <div className="text-[10px] text-zinc-400 bg-black/40 px-2 py-1.5 rounded flex flex-col gap-0.5">
                      <div>Watching: <strong className="text-zinc-200 font-medium">{w.content}</strong></div>
                      <div className="flex justify-between mt-1 text-[9px] text-zinc-500">
                        <span>Seek: <strong className="text-primary font-mono">{w.duration}</strong></span>
                        <span>Device: <strong>{w.device}</strong></span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Active Device Sessions List */}
      <div className="bg-zinc-950 border border-white/10 rounded-2xl p-6">
        <h3 className="font-extrabold text-base flex items-center gap-2 mb-4 border-b border-white/5 pb-3">
          <Monitor size={16} className="text-blue-500" /> Active Session & Devices Audit
        </h3>
        
        {sessions.length === 0 ? (
          <div className="text-center py-6 text-zinc-500 text-xs">No active device sessions found in DB.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sessions.map((s) => (
              <div key={s.id} className="bg-white/5 border border-white/5 p-4 rounded-xl flex justify-between items-start hover:border-white/10 transition-all">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 bg-blue-500/10 text-blue-400 rounded">
                      <Monitor size={14} />
                    </span>
                    <span className="text-xs font-bold text-white">{s.device}</span>
                  </div>
                  <div className="text-[10px] text-zinc-400 space-y-0.5">
                    <div>Profile: <strong className="text-zinc-300">{s.profile?.name || 'N/A'}</strong></div>
                    <div>User: <strong className="text-zinc-300">{s.profile?.user?.email || 'N/A'}</strong></div>
                    <div>IP Address: <strong className="font-mono text-zinc-300">{s.ipAddress || '127.0.0.1'}</strong></div>
                    <div>Location: <strong className="text-zinc-300">{s.location || 'Unknown'}</strong></div>
                    <div>Last Activity: <strong className="text-zinc-300">{new Date(s.lastActiveAt).toLocaleString()}</strong></div>
                  </div>
                </div>

                <button 
                  onClick={() => handleRevokeSession(s.id, s.device)}
                  className="text-[10px] text-red-400 hover:text-white bg-red-500/10 hover:bg-red-500 p-1.5 rounded-lg border border-red-500/20 transition-all font-bold"
                  title="Force Logout Device"
                >
                  Kill session
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
