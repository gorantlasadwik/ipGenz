"use client"

import { TopNav } from "@/components/TopNav"
import { usePathname, useRouter } from "next/navigation"
import { useEffect } from "react"

export default function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const isHome = pathname === "/home"

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem("token");
    if (!token) return;

    const isPremiumTrial = localStorage.getItem("isPremiumTrial") === "true";
    if (isPremiumTrial) {
      const expiryStr = localStorage.getItem("trialExpiry");
      if (expiryStr) {
        const expiryTime = new Date(expiryStr).getTime();
        if (Date.now() > expiryTime) {
          if (pathname !== "/subscription") {
            router.push("/subscription");
          }
        }
      }
    }
  }, [pathname, router]);

  return (
    <div className="flex h-screen bg-black text-white overflow-hidden font-sans">
      <TopNav />
      <main className={`flex-1 w-full h-full overflow-y-auto relative ${!isHome ? 'pt-24' : ''}`}>
        {children}
      </main>
    </div>
  )
}
