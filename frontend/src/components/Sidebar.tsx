"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  Home,
  Tv,
  Film,
  MonitorPlay,
  Search,
  Heart,
  Clock,
  ListVideo,
  History,
  Settings,
  User,
  LogOut,
  Database
} from "lucide-react"

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = () => {
    localStorage.removeItem("token")
    localStorage.removeItem("profileId")
    localStorage.removeItem("isDemo")
    localStorage.removeItem("isSrk")
    router.push("/login")
  }

  return (
    <aside className="w-64 border-r border-border bg-card flex flex-col h-screen fixed left-0 top-0 z-40">
      <div className="p-6">
        <Link href="/home" className="flex items-center gap-2 font-bold text-2xl text-primary">
          <MonitorPlay className="h-8 w-8 text-primary" />
          IPGENZ
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto py-4">
        <nav className="space-y-1 px-4">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 mt-4 px-2">Menu</div>
          <SidebarItem href="/home" icon={<Home size={20} />} label="Home" active={pathname === "/home"} />
          <SidebarItem href="/live" icon={<Tv size={20} />} label="Live TV" active={pathname === "/live"} />
          <SidebarItem href="/movies" icon={<Film size={20} />} label="Movies" active={pathname === "/movies"} />
          <SidebarItem href="/series" icon={<MonitorPlay size={20} />} label="Series" active={pathname === "/series"} />
          <SidebarItem href="/search" icon={<Search size={20} />} label="Search" active={pathname === "/search"} />

          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 mt-8 px-2">Library</div>
          <SidebarItem href="/library/favorites" icon={<Heart size={20} />} label="Favorites" active={pathname === "/library/favorites"} />
          <SidebarItem href="/library/watch-later" icon={<Clock size={20} />} label="Watch Later" active={pathname === "/library/watch-later"} />
          <SidebarItem href="/library/playlists" icon={<ListVideo size={20} />} label="Playlists" active={pathname === "/library/playlists"} />
          <SidebarItem href="/library/history" icon={<History size={20} />} label="History" active={pathname === "/library/history"} />

          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 mt-8 px-2">Manage</div>
          <SidebarItem href="/providers" icon={<Database size={20} />} label="Providers" active={pathname === "/providers"} />
        </nav>
      </div>

      <div className="p-4 border-t border-border mt-auto">
        <nav className="space-y-1">
          <SidebarItem href="/settings" icon={<Settings size={20} />} label="Settings" active={pathname === "/settings"} />
          <SidebarItem href="/profiles" icon={<User size={20} />} label="Switch Profile" active={pathname === "/profiles"} />
          <button onClick={handleLogout} className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors">
            <LogOut size={20} />
            Logout
          </button>
        </nav>
      </div>
    </aside>
  )
}

function SidebarItem({ href, icon, label, active }: { href: string; icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ${
        active 
          ? "bg-primary/10 text-primary border-l-2 border-primary" 
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      }`}
    >
      {icon}
      {label}
    </Link>
  )
}
