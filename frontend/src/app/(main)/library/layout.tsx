"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

export default function LibraryLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  const tabs = [
    { name: "History", path: "/library/history" },
    { name: "Favorites", path: "/library/favorites" },
    { name: "Watch Later", path: "/library/watch-later" },
    { name: "Playlists", path: "/library/playlists" },
  ]

  return (
    <div className="w-full h-full flex flex-col p-12">
      <h1 className="text-4xl font-bold tracking-tight text-white mb-8">My Library</h1>
      
      {/* Tabs */}
      <div className="flex gap-8 border-b border-white/10 mb-8">
        {tabs.map((tab) => {
          const isActive = pathname === tab.path
          return (
            <Link
              key={tab.name}
              href={tab.path}
              className={`pb-4 text-sm font-bold tracking-wide transition-colors relative ${
                isActive ? "text-white" : "text-secondary-foreground hover:text-white"
              }`}
            >
              {tab.name}
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-t-md" />
              )}
            </Link>
          )
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  )
}
