"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Activity, Users, Database, Server, Settings, LayoutGrid, ShieldAlert, LogOut, Play, Film } from "lucide-react"
import { api } from "@/lib/api"

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [impersonatedUser, setImpersonatedUser] = useState<string | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const imp = sessionStorage.getItem("impersonate_user_email")
      if (imp) setImpersonatedUser(imp)
      
      const auth = localStorage.getItem("admin_authenticated")
      setIsAuthenticated(auth === "true")
    }
  }, [])

  const exitImpersonation = () => {
    setImpersonatedUser(null)
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem("impersonate_user_email")
    }
    api.createAdminAuditLog("IMPERSONATION_TERMINATED", "None")
    window.location.reload()
  }

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (password === "9618595425") {
      setIsAuthenticated(true)
      if (typeof window !== 'undefined') {
        localStorage.setItem("admin_authenticated", "true")
      }
    } else {
      setError("Access Denied: Invalid Security Key")
    }
  }

  if (isAuthenticated === null) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black gap-4 text-white">
        <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-semibold tracking-wide text-zinc-400 font-mono">LOADING CONTROL CENTER...</span>
      </div>
    )
  }

  if (isAuthenticated === false) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black font-sans relative overflow-hidden">
        {/* Background radial glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-red-600/10 rounded-full blur-[120px] pointer-events-none" />
        
        <div className="w-full max-w-md p-8 bg-zinc-950 border border-white/10 rounded-3xl shadow-2xl relative z-10 backdrop-blur-md">
          {/* Logo Section */}
          <div className="flex flex-col items-center gap-3 text-center mb-8">
            <div className="p-3 bg-red-600/10 border border-red-500/20 rounded-2xl">
              <LayoutGrid className="h-8 w-8 text-red-600 fill-current animate-pulse" />
            </div>
            <h2 className="text-2xl font-black uppercase tracking-wider font-outfit text-white">
              IPGENZ Admin
            </h2>
            <p className="text-xs text-zinc-500 font-medium">
              Administrative credentials required to access this node.
            </p>
          </div>

          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] text-zinc-400 block font-bold uppercase tracking-wider">
                Security Key
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (error) setError(null)
                }}
                placeholder="••••••••••••"
                className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-800 focus:outline-none focus:border-red-500 transition-colors font-mono tracking-widest text-center"
                autoFocus
              />
            </div>

            {error && (
              <p className="text-xs text-red-500 font-semibold text-center mt-2 animate-bounce">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="w-full bg-red-600 hover:bg-red-500 text-white text-xs font-black py-3 rounded-xl transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-red-600/20"
            >
              Authenticate Node
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-black text-white font-sans overflow-hidden">
      {/* ─── SIDEBAR LAYOUT (Matches User Screenshot) ───────────────────── */}
      <aside className="w-64 border-r border-white/10 bg-zinc-950 flex flex-col h-full flex-shrink-0">
        
        {/* Logo Section */}
        <div className="p-6 border-b border-white/5 flex items-center gap-3">
          <LayoutGrid className="h-6 w-6 text-red-600 fill-current animate-pulse" />
          <span className="text-lg font-black tracking-wider font-outfit uppercase">
            IPGENZ Admin
          </span>
        </div>

        {/* Vertical Links Menu */}
        <nav className="flex-1 px-4 py-6 space-y-1">
          <SidebarLink 
            active={pathname === "/sadwik/overview" || pathname === "/sadwik"} 
            href="/sadwik/overview" 
            icon={<Activity size={18} />} 
            label="Overview" 
          />
          <SidebarLink 
            active={pathname === "/sadwik/users"} 
            href="/sadwik/users" 
            icon={<Users size={18} />} 
            label="Users" 
          />
          <SidebarLink 
            active={pathname === "/sadwik/providers"} 
            href="/sadwik/providers" 
            icon={<Database size={18} />} 
            label="Providers" 
          />
          <SidebarLink 
            active={pathname === "/sadwik/infrastructure"} 
            href="/sadwik/infrastructure" 
            icon={<Server size={18} />} 
            label="Infrastructure" 
          />
          <SidebarLink 
            active={pathname === "/sadwik/premium"} 
            href="/sadwik/premium" 
            icon={<ShieldAlert size={18} />} 
            label="Premium Subscriptions" 
          />
          <SidebarLink 
            active={pathname === "/sadwik/settings"} 
            href="/sadwik/settings" 
            icon={<Settings size={18} />} 
            label="Settings" 
          />
        </nav>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-white/5 bg-zinc-900/20 flex flex-col gap-2 text-center">
          <button 
            onClick={() => {
              if (confirm("Lock administrative session?")) {
                localStorage.removeItem("admin_authenticated")
                window.location.reload()
              }
            }}
            className="text-[9px] font-black hover:text-red-500 text-zinc-500 uppercase font-mono cursor-pointer transition-colors bg-transparent border-0 outline-none w-full"
          >
            Lock Admin Session
          </button>
          <span className="text-[10px] text-zinc-500 font-mono block">Node Version: v1.0.4</span>
        </div>
      </aside>

      {/* ─── RIGHT CONTENT AREA ────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-slate-950 relative">
        {/* Impersonation Banner */}
        {impersonatedUser && (
          <div className="bg-red-500/25 border-b border-red-500/40 px-6 py-2.5 flex items-center justify-between backdrop-blur-md sticky top-0 z-40 animate-pulse flex-shrink-0">
            <div className="flex items-center gap-2.5 text-xs font-bold text-red-400 font-mono">
              <ShieldAlert size={14} />
              <span>IMPERSONATION ACTIVE: Browsing database records for {impersonatedUser}</span>
            </div>
            <button 
              onClick={exitImpersonation}
              className="bg-red-600 hover:bg-red-500 text-white text-[10px] font-black uppercase px-3 py-1 rounded transition flex items-center gap-1.5"
            >
              <LogOut size={10} />
              Exit Impersonation
            </button>
          </div>
        )}
        {children}
      </main>
    </div>
  )
}

interface SidebarLinkProps {
  active: boolean
  href: string
  icon: React.ReactNode
  label: string
}

function SidebarLink({ active, href, icon, label }: SidebarLinkProps) {
  return (
    <Link
      href={href}
      className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition-all duration-200 outline-none ${
        active 
          ? "bg-red-500/10 text-red-500 border-l-4 border-red-600 shadow-md shadow-red-500/5" 
          : "text-zinc-400 hover:bg-white/5 hover:text-white"
      }`}
    >
      {icon}
      <span>{label}</span>
    </Link>
  )
}
