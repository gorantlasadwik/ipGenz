"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState } from "react"
import { Search, Bell, User, MonitorPlay, LogOut, Settings, Users, Database } from "lucide-react"

export function TopNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [profileOpen, setProfileOpen] = useState(false)

  const handleLogout = () => {
    localStorage.removeItem("token")
    localStorage.removeItem("profileId")
    localStorage.removeItem("isDemo")
    router.push("/login")
  }

  const navLinks = [
    { name: "DASHBOARD", path: "/home" },
    { name: "MOVIES", path: "/movies" },
    { name: "SERIES", path: "/series" },
    { name: "LIVE TV", path: "/live" },
  ]

  return (
    <header className="fixed top-0 left-0 right-0 z-50 transition-all duration-300 bg-gradient-to-b from-black/80 to-transparent">
      <div className="flex items-center justify-between px-8 py-6">
        {/* Left section: Logo and Nav Links */}
        <div className="flex items-center gap-12">
          <Link href="/home" className="flex items-center gap-2 font-black text-2xl tracking-tighter text-white">
            <MonitorPlay className="h-7 w-7 text-primary" fill="currentColor" />
            IPGENZ
          </Link>
          
          <nav className="hidden md:flex items-center gap-8">
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
          </nav>
        </div>

        {/* Right section: Icons and Profile */}
        <div className="flex items-center gap-6">
          <Link href="/search" className="text-white/80 hover:text-white transition">
            <Search size={22} />
          </Link>
          <button className="text-white/80 hover:text-white transition">
            <Bell size={22} />
          </button>
          
          <div className="relative">
            <button 
              onClick={() => setProfileOpen(!profileOpen)}
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
