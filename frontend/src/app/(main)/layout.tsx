import { Sidebar } from "@/components/Sidebar"

export default function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar />
      <main className="flex-1 ml-64 h-full overflow-hidden relative">
        {children}
      </main>
    </div>
  )
}
