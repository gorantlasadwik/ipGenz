import { TopNav } from "@/components/TopNav"

export default function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-screen bg-black text-white overflow-hidden font-sans">
      <TopNav />
      <main className="flex-1 w-full h-full relative">
        {children}
      </main>
    </div>
  )
}
