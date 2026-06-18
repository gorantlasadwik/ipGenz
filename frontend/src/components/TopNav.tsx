"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState, useEffect } from "react"
import { Search, Bell, User, MonitorPlay, LogOut, Settings, Users, Database, Heart, History, Clock } from "lucide-react"
import { api } from "@/lib/api"

export function TopNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [profileOpen, setProfileOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState<any[]>([])
  
  const currentProfileId = typeof window !== 'undefined' ? localStorage.getItem("profileId") : null;

  useEffect(() => {
    if (currentProfileId) {
      api.getNotifications(currentProfileId).then(data => {
        setNotifications(data)
      }).catch(console.error)
    }
  }, [currentProfileId])

  const handleLogout = () => {
    localStorage.removeItem("token")
    localStorage.removeItem("profileId")
    localStorage.removeItem("isDemo")
    router.push("/login")
  }

  const markAsRead = async (id: string) => {
    if (!currentProfileId) return;
    await api.markNotificationAsRead(id, currentProfileId);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
  }

  const markAllAsRead = async () => {
    if (!currentProfileId) return;
    await api.markAllNotificationsAsRead(currentProfileId);
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  }

  const navLinks = [
    { name: "DASHBOARD", path: "/home" },
    { name: "MOVIES", path: "/movies" },
    { name: "SERIES", path: "/series" },
    { name: "LIVE TV", path: "/live" }
  ]

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 transition-all duration-300 bg-gradient-to-b from-black/80 to-transparent">
      <div className="flex items-center justify-between px-8 py-6">
        {/* Left section: Logo and Nav Links */}
        <div className="flex items-center gap-12">
          <Link href="/home" className="flex items-center gap-2 font-black text-2xl tracking-tighter text-white">
            <MonitorPlay className="h-7 w-7 text-primary" fill="currentColor" />
            IPGENZ
          </Link>
          
          <nav className="hidden md:flex items-center gap-6">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                href={link.path}
                className={`text-sm font-bold tracking-widest transition-colors ${
                  pathname === link.path ? "text-white" : "text-white/60 hover:text-white"
                }`}
              >
                {link.name}
              </Link>
            ))}
            
            {/* Library Dropdown */}
            <div className="relative group">
              <span className={`text-sm font-bold tracking-widest transition-colors cursor-pointer py-4 ${pathname.includes('/library') ? "text-white" : "text-white/60 hover:text-white"}`}>
                LIBRARY
              </span>
              <div className="absolute top-[100%] left-0 pt-2 w-48 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-50">
                <div className="bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden py-2">
                  <Link href="/library/favorites" className="flex items-center gap-3 px-4 py-2 text-sm font-bold text-white/80 hover:text-white hover:bg-white/10 transition">
                    <Heart size={16} /> FAVORITES
                  </Link>
                  <Link href="/library/watch-later" className="flex items-center gap-3 px-4 py-2 text-sm font-bold text-white/80 hover:text-white hover:bg-white/10 transition">
                    <Clock size={16} /> WATCH LATER
                  </Link>
                  <Link href="/library/history" className="flex items-center gap-3 px-4 py-2 text-sm font-bold text-white/80 hover:text-white hover:bg-white/10 transition">
                    <History size={16} /> HISTORY
                  </Link>
                </div>
              </div>
            </div>
          </nav>
        </div>

        {/* Right section: Icons and Profile */}
        <div className="flex items-center gap-6">
          <Link href="/search" className="text-white/80 hover:text-white transition">
            <Search size={22} />
          </Link>

          {/* Notifications Dropdown */}
          <div className="relative">
            <button 
              onClick={() => { setNotificationsOpen(!notificationsOpen); setProfileOpen(false); }}
              className="text-white/80 hover:text-white transition relative"
            >
              <Bell size={22} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                  {unreadCount}
                </span>
              )}
            </button>

            {notificationsOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setNotificationsOpen(false)} />
                <div className="absolute right-0 mt-4 w-80 max-h-96 overflow-y-auto bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl z-50 text-white">
                  <div className="px-4 py-3 border-b border-white/10 flex justify-between items-center sticky top-0 bg-zinc-900/95">
                    <p className="font-bold">Notifications</p>
                    {unreadCount > 0 && (
                      <button onClick={markAllAsRead} className="text-xs text-primary hover:text-primary/80">Mark all as read</button>
                    )}
                  </div>
                  
                  <div className="py-2">
                    {notifications.length === 0 ? (
                      <p className="px-4 py-6 text-center text-white/50 text-sm">No notifications yet.</p>
                    ) : (
                      notifications.map(n => (
                        <div 
                          key={n.id} 
                          onClick={() => { if (!n.isRead) markAsRead(n.id); }}
                          className={`px-4 py-3 border-b border-white/5 hover:bg-white/5 cursor-pointer transition ${n.isRead ? 'opacity-60' : 'bg-primary/5'}`}
                        >
                          <div className="flex justify-between items-start mb-1">
                            <p className={`text-sm ${n.isRead ? 'font-medium' : 'font-bold'}`}>{n.title}</p>
                            {!n.isRead && <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1" />}
                          </div>
                          <p className="text-xs text-white/70 line-clamp-2">{n.message}</p>
                          <p className="text-[10px] text-white/40 mt-2">{new Date(n.createdAt).toLocaleDateString()}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
          
          <div className="relative">
            <button 
              onClick={() => { setProfileOpen(!profileOpen); setNotificationsOpen(false); }}
              className="h-10 w-10 rounded-full bg-zinc-800 border-2 border-transparent hover:border-white transition overflow-hidden flex items-center justify-center"
            >
              <User size={20} className="text-white/80" />
            </button>
            
            {profileOpen && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setProfileOpen(false)} 
                />
                <div className="absolute right-0 mt-3 w-56 bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl py-2 z-50 text-white overflow-hidden">
                  <div className="px-4 py-2 border-b border-white/10 mb-2">
                    <p className="font-bold text-sm">Account</p>
                  </div>
                  
                  <Link href="/providers" className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-white/10 transition">
                    <Database size={16} className="text-primary" /> Providers
                  </Link>
                  <Link href="/profiles" className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-white/10 transition">
                    <Users size={16} /> Switch Profile
                  </Link>
                  <Link href="/settings" className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-white/10 transition">
                    <Settings size={16} /> Settings
                  </Link>
                  
                  <div className="h-px bg-white/10 my-2" />
                  
                  <button 
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-400 hover:bg-white/10 transition"
                  >
                    <LogOut size={16} /> Logout
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
