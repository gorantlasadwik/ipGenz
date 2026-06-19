"use client"

import { TopNav } from "@/components/TopNav"
import { usePathname } from "next/navigation"

export default function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const isHome = pathname === "/home"

  return (
    <div className="flex h-screen bg-black text-white overflow-hidden font-sans">
      <TopNav />
      <main className={`flex-1 w-full h-full overflow-y-auto relative ${!isHome ? 'pt-24' : ''}`}>
        {children}
      </main>
    </div>
  )
}
