"use client"

import { useEffect, useState, useRef } from "react"
import { Play, Search, ChevronDown, SlidersHorizontal, Plus } from "lucide-react"
import Link from "next/link"
import { api } from "@/lib/api"

interface Channel {
  id: string
  name: string
  logo?: string
  category?: { name: string }
}

interface Category {
  id: string
  name: string
  _count?: { channels: number }
}

export default function LiveTvPage() {
  const [channels, setChannels] = useState<Channel[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [activeCategory, setActiveCategory] = useState<Category | null>(null)
  const [categoriesLoaded, setCategoriesLoaded] = useState(false)
  const [categoryQuery, setCategoryQuery] = useState("")
  const [channelsQuery, setChannelsQuery] = useState("")
  const [debouncedChannelsQuery, setDebouncedChannelsQuery] = useState("")
  const [sortBy, setSortBy] = useState("name-asc")
  const [showSortDropdown, setShowSortDropdown] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingChannels, setLoadingChannels] = useState(false)
  const gridContainerRef = useRef<HTMLDivElement>(null)
  const isFirstLoadRef = useRef(true)

  const [providers, setProviders] = useState<any[]>([])

  // Fetch categories on mount
  useEffect(() => {
    Promise.all([
      api.getProviders().catch(() => []),
      api.getLiveCategories().catch(() => [])
    ]).then(([provs, cats]) => {
      setProviders(provs)
      setCategories(cats)
      // Restore selected category on mount
      if (typeof window !== 'undefined') {
        const savedCatId = sessionStorage.getItem('lastActiveLiveCategoryId')
        if (savedCatId && savedCatId !== 'all') {
          const found = cats.find((c: any) => c.id === savedCatId)
          if (found) {
            setActiveCategory(found)
          }
        }
        const savedQuery = sessionStorage.getItem('liveSearchQuery')
        if (savedQuery) {
          setChannelsQuery(savedQuery)
        }
      }
      setCategoriesLoaded(true)
    }).catch(err => {
      console.error("Error fetching live categories:", err)
      setCategoriesLoaded(true)
    })
  }, [])

  // Debounce the search query
  useEffect(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('liveSearchQuery', channelsQuery)
    }
    const timer = setTimeout(() => setDebouncedChannelsQuery(channelsQuery), 500)
    return () => clearTimeout(timer)
  }, [channelsQuery])

  // Fetch channels when activeCategory or debounced query changes, but only after categories are loaded/restored
  useEffect(() => {
    if (!categoriesLoaded) return

    setLoadingChannels(true)
    const categoryId = activeCategory ? activeCategory.id : undefined
    // For 'All', limit is 200. For specific categories, limit is 500.
    const limit = activeCategory ? 500 : 200
    api.getLiveChannels(categoryId, limit, debouncedChannelsQuery).then(ch => {
      setChannels(ch)
      setLoadingChannels(false)
      setLoading(false)

      // Restore scroll position after channels are loaded for the first time
      if (isFirstLoadRef.current) {
        isFirstLoadRef.current = false
        if (typeof window !== 'undefined') {
          const savedScroll = sessionStorage.getItem('liveChannelsScrollTop')
          if (savedScroll && gridContainerRef.current) {
            setTimeout(() => {
              if (gridContainerRef.current) {
                gridContainerRef.current.scrollTop = parseInt(savedScroll)
              }
            }, 100)
          }
        }
      }
    }).catch(err => {
      console.error("Error fetching live channels:", err)
      setLoadingChannels(false)
      setLoading(false)
    })
  }, [activeCategory, categoriesLoaded, debouncedChannelsQuery])

  const handleSelectCategory = (cat: Category | null) => {
    setActiveCategory(cat)
    setChannelsQuery("") // Reset query on category change
    if (typeof window !== 'undefined') {
      if (cat) {
        sessionStorage.setItem('lastActiveLiveCategoryId', cat.id)
      } else {
        sessionStorage.setItem('lastActiveLiveCategoryId', 'all')
      }
      sessionStorage.setItem('liveChannelsScrollTop', '0')
    }
    if (gridContainerRef.current) {
      gridContainerRef.current.scrollTop = 0
    }
  }

  const totalChannelsCount = categories.reduce((sum, cat) => sum + (cat._count?.channels || 0), 0)

  // Filter categories based on search query
  const filteredCategories = categories.filter(cat =>
    cat.name.toLowerCase().includes(categoryQuery.toLowerCase())
  )

  // Filter and sort channels client-side
  const processedChannels = channels
    .filter(ch => ch.name.toLowerCase().includes(channelsQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === "name-asc") return a.name.localeCompare(b.name)
      if (sortBy === "name-desc") return b.name.localeCompare(a.name)
      return 0
    })

  if (loading && channels.length === 0 && categories.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!loading && providers.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-black text-white min-h-[60vh] p-8 w-full">
        <div className="max-w-md text-center space-y-6">
          <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto border border-white/10">
            <SlidersHorizontal className="w-10 h-10 text-zinc-400" />
          </div>
          <h2 className="text-3xl font-black tracking-tight">No Providers Connected</h2>
          <p className="text-zinc-400 text-sm font-medium">
            To view live channels, please connect and synchronize an IPTV provider first.
          </p>
          <Link 
            href="/providers" 
            className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-white font-bold px-8 py-3 rounded-full transition shadow-lg shadow-primary/20 cursor-pointer"
          >
            <Plus size={18} /> Connect Provider
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden w-full bg-background">
      {/* Categories Sidebar */}
      <div className="w-64 border-r border-white/10 bg-black/40 overflow-y-auto flex-shrink-0 flex flex-col">
        <div className="p-6 flex-shrink-0 border-b border-white/5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold tracking-tight text-white font-outfit">Live TV</h2>
            <div className="text-xs text-secondary-foreground bg-white/5 px-2 py-0.5 rounded-full border border-white/10">
              {totalChannelsCount} Total
            </div>
          </div>
          {/* Category Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search categories..."
              value={categoryQuery}
              onChange={(e) => setCategoryQuery(e.target.value)}
              className="w-full bg-zinc-900/80 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-primary/80 transition-colors"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          <button
            onClick={() => handleSelectCategory(null)}
            className={`w-full text-left px-3 py-2.5 rounded-lg font-medium text-sm transition-all duration-200 flex items-center justify-between ${!activeCategory ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-zinc-400 hover:bg-white/5 hover:text-white"}`}
          >
            <span>All Channels</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${!activeCategory ? "bg-white/20 text-white" : "bg-white/5 text-zinc-500"}`}>
              {totalChannelsCount}
            </span>
          </button>
          {filteredCategories.map(cat => (
            <button
              key={cat.id}
              onClick={() => handleSelectCategory(cat)}
              className={`w-full text-left px-3 py-2.5 rounded-lg font-medium text-sm transition-all duration-200 flex items-center justify-between ${activeCategory?.id === cat.id ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-zinc-400 hover:bg-white/5 hover:text-white"}`}
            >
              <span className="truncate pr-2">{cat.name}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${activeCategory?.id === cat.id ? "bg-white/20 text-white" : "bg-white/5 text-zinc-500"}`}>
                {cat._count?.channels || 0}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Channels Grid */}
      <div ref={gridContainerRef} className="flex-1 overflow-y-auto p-8 relative">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white font-outfit">{activeCategory?.name || "All Channels"}</h1>
            <p className="text-xs text-zinc-400 mt-1">
              Showing {processedChannels.length} of {activeCategory ? activeCategory._count?.channels || 0 : totalChannelsCount} channels
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {/* Scoped Search Box */}
            <div className="relative flex-1 md:flex-initial min-w-[260px] md:min-w-[320px] group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none gap-2">
                <Search className="h-4 w-4 text-zinc-400 group-focus-within:text-primary transition-colors flex-shrink-0" />
                <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 bg-white/5 border border-white/10 px-1.5 py-0.5 rounded max-w-[120px] truncate">
                  {activeCategory ? activeCategory.name : "All Items"}
                </span>
              </div>
              <input
                type="text"
                value={channelsQuery}
                onChange={(e) => setChannelsQuery(e.target.value)}
                placeholder="Search in this section..."
                className="w-full bg-zinc-900/90 border border-white/10 rounded-xl py-2 pl-32 pr-4 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-primary/80 focus:ring-1 focus:ring-primary/80 transition-all font-medium"
              />
            </div>

            {/* Sorting Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowSortDropdown(!showSortDropdown)}
                className="flex items-center gap-2 bg-zinc-900/90 border border-white/10 rounded-xl px-4 py-2 text-xs text-zinc-300 hover:text-white hover:border-white/20 transition-all font-medium focus:outline-none"
              >
                <SlidersHorizontal size={14} className="text-zinc-400" />
                <span>
                  {sortBy === "name-asc" && "Name (A-Z)"}
                  {sortBy === "name-desc" && "Name (Z-A)"}
                </span>
                <ChevronDown size={14} className={`text-zinc-500 transition-transform ${showSortDropdown ? "rotate-180" : ""}`} />
              </button>

              {showSortDropdown && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowSortDropdown(false)} />
                  <div className="absolute right-0 mt-2 w-48 bg-zinc-950/95 border border-white/10 rounded-xl shadow-2xl p-1 z-40 backdrop-blur-xl animate-in fade-in slide-in-from-top-1 duration-100">
                    <button
                      onClick={() => { setSortBy("name-asc"); setShowSortDropdown(false); }}
                      className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-colors hover:bg-white/5 ${sortBy === "name-asc" ? "text-primary font-semibold" : "text-zinc-300"}`}
                    >
                      Name (A-Z)
                    </button>
                    <button
                      onClick={() => { setSortBy("name-desc"); setShowSortDropdown(false); }}
                      className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-colors hover:bg-white/5 ${sortBy === "name-desc" ? "text-primary font-semibold" : "text-zinc-300"}`}
                    >
                      Name (Z-A)
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {loadingChannels ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : processedChannels.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-12">
            <div className="text-6xl mb-4">📡</div>
            <h2 className="text-2xl font-bold text-white mb-2">No Channels Found</h2>
            <p className="text-secondary-foreground max-w-md">
              No channels match your filters. Try a different search term or category.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {processedChannels.map(channel => (
              <Link 
                href={`/live/${channel.id}`} 
                key={channel.id} 
                className="group block"
                onClick={() => {
                  if (typeof window !== 'undefined' && gridContainerRef.current) {
                    sessionStorage.setItem('liveChannelsScrollTop', gridContainerRef.current.scrollTop.toString())
                  }
                }}
              >
                <div className="bg-surface border border-white/10 rounded-xl overflow-hidden hover:border-white/30 transition-all hover:scale-[1.02] shadow-lg">
                  <div className="h-32 bg-white/5 flex items-center justify-center relative p-4">
                    {channel.logo ? (
                      <img src={channel.logo} alt={channel.name} className="max-h-24 max-w-full object-contain z-10" />
                    ) : (
                      <h3 className="text-lg font-black text-white/20 z-0 text-center uppercase break-all px-2">{channel.name}</h3>
                    )}
                    <div className="absolute inset-0 z-20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/45">
                      <div className="bg-primary p-4 rounded-full text-white shadow-xl shadow-primary/20">
                        <Play className="fill-current w-6 h-6 ml-0.5" />
                      </div>
                    </div>
                  </div>
                  <div className="p-4 border-t border-white/5">
                    <h3 className="font-bold text-sm text-white truncate">{channel.name}</h3>
                    {channel.category && (
                      <p className="text-xs text-secondary-foreground mt-0.5">{channel.category.name}</p>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
