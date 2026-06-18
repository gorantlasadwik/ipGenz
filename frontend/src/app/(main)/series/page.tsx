"use client"

import { useEffect, useState, useRef } from "react"
import { Play, Search, Star, Tv, ChevronDown, SlidersHorizontal } from "lucide-react"
import Link from "next/link"
import { api } from "@/lib/api"

interface Series {
  id: string
  name: string
  poster?: string
  rating?: number
  year?: number
  category?: { name: string }
  seasons?: any[]
}

interface Category {
  id: string
  name: string
  _count?: { series: number }
}

export default function SeriesPage() {
  const [series, setSeries] = useState<Series[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [activeCategory, setActiveCategory] = useState<Category | null>(null)
  const [categoriesLoaded, setCategoriesLoaded] = useState(false)
  const [categoryQuery, setCategoryQuery] = useState("")
  const [seriesQuery, setSeriesQuery] = useState("")
  const [debouncedSeriesQuery, setDebouncedSeriesQuery] = useState("")
  const [sortBy, setSortBy] = useState("name-asc")
  const [showSortDropdown, setShowSortDropdown] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingSeries, setLoadingSeries] = useState(false)
  const gridContainerRef = useRef<HTMLDivElement>(null)
  const isFirstLoadRef = useRef(true)

  // Fetch categories on mount
  useEffect(() => {
    api.getSeriesCategories().then(cats => {
      setCategories(cats)
      // Restore selected category on mount
      if (typeof window !== 'undefined') {
        const savedCatId = sessionStorage.getItem('lastActiveSeriesCategoryId')
        if (savedCatId && savedCatId !== 'all') {
          const found = cats.find((c: any) => c.id === savedCatId)
          if (found) {
            setActiveCategory(found)
          }
        }
      }
      setCategoriesLoaded(true)
    }).catch(err => {
      console.error("Error fetching series categories:", err)
      setCategoriesLoaded(true)
    })
  }, [])

  // Debounce the search query
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSeriesQuery(seriesQuery), 500)
    return () => clearTimeout(timer)
  }, [seriesQuery])

  // Fetch series when activeCategory or debounced query changes, but only after categories are loaded/restored
  useEffect(() => {
    if (!categoriesLoaded) return

    setLoadingSeries(true)
    const categoryId = activeCategory ? activeCategory.id : undefined
    // For 'All', limit is 200. For specific categories, limit is 500.
    const limit = activeCategory ? 500 : 200
    api.getSeries(categoryId, limit, debouncedSeriesQuery).then(data => {
      setSeries(data)
      setLoadingSeries(false)
      setLoading(false)

      // Restore scroll position after series are loaded for the first time
      if (isFirstLoadRef.current) {
        isFirstLoadRef.current = false
        if (typeof window !== 'undefined') {
          const savedScroll = sessionStorage.getItem('seriesScrollTop')
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
      console.error("Error fetching series:", err)
      setLoadingSeries(false)
      setLoading(false)
    })
  }, [activeCategory, categoriesLoaded, debouncedSeriesQuery])

  const handleSelectCategory = (cat: Category | null) => {
    setActiveCategory(cat)
    setSeriesQuery("") // Reset query on category change
    if (typeof window !== 'undefined') {
      if (cat) {
        sessionStorage.setItem('lastActiveSeriesCategoryId', cat.id)
      } else {
        sessionStorage.setItem('lastActiveSeriesCategoryId', 'all')
      }
      sessionStorage.setItem('seriesScrollTop', '0')
    }
    if (gridContainerRef.current) {
      gridContainerRef.current.scrollTop = 0
    }
  }

  const totalSeriesCount = categories.reduce((sum, cat) => sum + (cat._count?.series || 0), 0)

  // Filter categories based on search query
  const filteredCategories = categories.filter(cat =>
    cat.name.toLowerCase().includes(categoryQuery.toLowerCase())
  )

  // Filter and sort series client-side
  const processedSeries = series
    .filter(s => s.name.toLowerCase().includes(seriesQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === "name-asc") return a.name.localeCompare(b.name)
      if (sortBy === "name-desc") return b.name.localeCompare(a.name)
      if (sortBy === "rating-desc") return (b.rating || 0) - (a.rating || 0)
      if (sortBy === "year-desc") return (b.year || 0) - (a.year || 0)
      if (sortBy === "year-asc") return (a.year || 0) - (b.year || 0)
      return 0
    })

  if (loading && series.length === 0 && categories.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden w-full bg-background text-white">
      {/* Categories Sidebar */}
      <div className="w-64 border-r border-white/10 bg-black/40 overflow-y-auto flex-shrink-0 flex flex-col">
        <div className="p-6 flex-shrink-0 border-b border-white/5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold tracking-tight text-white font-outfit">Series</h2>
            <div className="text-xs text-zinc-400 bg-white/5 px-2 py-0.5 rounded-full border border-white/10">
              {totalSeriesCount} Total
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
            <span>All Series</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${!activeCategory ? "bg-white/20 text-white" : "bg-white/5 text-zinc-500"}`}>
              {totalSeriesCount}
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
                {cat._count?.series || 0}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Series Grid */}
      <div ref={gridContainerRef} className="flex-1 overflow-y-auto p-8 relative">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white font-outfit">{activeCategory?.name || "All Series"}</h1>
            <p className="text-xs text-zinc-400 mt-1">
              Showing {processedSeries.length} of {activeCategory ? activeCategory._count?.series || 0 : totalSeriesCount} series
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
                value={seriesQuery}
                onChange={(e) => setSeriesQuery(e.target.value)}
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
                  {sortBy === "rating-desc" && "Highest Rating"}
                  {sortBy === "year-desc" && "Year (Newest)"}
                  {sortBy === "year-asc" && "Year (Oldest)"}
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
                    <button
                      onClick={() => { setSortBy("rating-desc"); setShowSortDropdown(false); }}
                      className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-colors hover:bg-white/5 ${sortBy === "rating-desc" ? "text-primary font-semibold" : "text-zinc-300"}`}
                    >
                      Highest Rating
                    </button>
                    <button
                      onClick={() => { setSortBy("year-desc"); setShowSortDropdown(false); }}
                      className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-colors hover:bg-white/5 ${sortBy === "year-desc" ? "text-primary font-semibold" : "text-zinc-300"}`}
                    >
                      Year (Newest)
                    </button>
                    <button
                      onClick={() => { setSortBy("year-asc"); setShowSortDropdown(false); }}
                      className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-colors hover:bg-white/5 ${sortBy === "year-asc" ? "text-primary font-semibold" : "text-zinc-300"}`}
                    >
                      Year (Oldest)
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {loadingSeries ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : processedSeries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-12">
            <div className="text-6xl mb-4">📺</div>
            <h2 className="text-2xl font-bold text-white mb-2">No Series Found</h2>
            <p className="text-zinc-400 max-w-md">
              No series match your filters. Try a different search term or category.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {processedSeries.map(s => (
              <Link 
                href={`/series/${s.id}`} 
                key={s.id} 
                className="group block"
                onClick={() => {
                  if (typeof window !== 'undefined' && gridContainerRef.current) {
                    sessionStorage.setItem('seriesScrollTop', gridContainerRef.current.scrollTop.toString())
                  }
                }}
              >
                <div className="aspect-[2/3] w-full bg-white/5 relative flex items-center justify-center rounded-xl overflow-hidden border border-white/10 hover:border-white/30 transition-all hover:scale-[1.02] shadow-lg mb-3">
                  {s.poster ? (
                    <img src={s.poster} alt={s.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center justify-center p-4">
                      <Tv className="w-12 h-12 text-white/20" />
                    </div>
                  )}
                  
                  {typeof s.rating === 'number' && s.rating > 0 && (
                    <div className="absolute top-2 right-2 bg-green-600/90 text-white font-bold text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5 shadow-md z-10">
                      <Star size={10} className="fill-current animate-pulse text-yellow-400" />
                      <span>{s.rating.toFixed(1)}</span>
                    </div>
                  )}

                  <div className="absolute inset-0 z-20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/45">
                    <div className="bg-primary p-4 rounded-full text-white shadow-xl shadow-primary/20">
                      <Play className="fill-current w-6 h-6 ml-0.5" />
                    </div>
                  </div>
                </div>
                
                <div className="px-1 text-center">
                  <h3 className="font-semibold text-sm text-zinc-200 group-hover:text-primary transition-colors line-clamp-2 leading-snug">
                    {s.name}
                  </h3>
                  {s.year && (
                    <p className="text-xs text-zinc-500 mt-1">{s.year}</p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
