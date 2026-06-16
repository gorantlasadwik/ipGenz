"use client"

import React, { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { api } from "@/lib/api"
import { motion, AnimatePresence } from "framer-motion"
import { 
  Tv, MonitorPlay, Film, Zap, Search, Users, 
  Download, Activity, Server, ChevronDown, CheckCircle2, Play, Sparkles
} from "lucide-react"

export default function PremiumLandingPage() {
  const router = useRouter()
  const [scrolled, setScrolled] = useState(false)
  const [isDemoLoading, setIsDemoLoading] = useState(false)

  const handleDemoLogin = async () => {
    setIsDemoLoading(true)
    try {
      const data = await api.demoLogin()
      localStorage.setItem("token", data.access_token)
      if (data.user?.isDemo) {
        localStorage.setItem("isDemo", "true")
      } else {
        localStorage.setItem("isDemo", "false")
      }
      router.push("/profiles")
    } catch (err) {
      console.error("Failed to start demo:", err)
      alert("Demo is currently unavailable. Please check back later.")
    } finally {
      setIsDemoLoading(false)
    }
  }

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50)
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/30">
      
      {/* Navigation Bar */}
      <header 
        className={`fixed top-0 w-full z-50 transition-all duration-300 h-[72px] flex items-center px-6 md:px-12 ${
          scrolled ? "bg-background/80 backdrop-blur-md border-b border-white/10 shadow-2xl" : "bg-transparent"
        }`}
      >
        <div className="flex items-center justify-between w-full max-w-7xl mx-auto">
          <div className="flex items-center gap-2 font-black text-2xl tracking-tighter text-white">
            <MonitorPlay className="h-7 w-7 text-primary" />
            IPGENZ
          </div>
          
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-secondary-foreground">
            <a href="#features" className="hover:text-white transition">Features</a>
            <a href="#showcase" className="hover:text-white transition">Platform</a>
          </nav>

          <div className="flex items-center gap-6">
            <Link href="/login" className="text-sm font-bold text-white hover:text-white/80 transition hidden sm:block">
              Log In
            </Link>
            <Link 
              href="/signup" 
              className="bg-primary hover:scale-105 transition-transform text-white px-6 py-2.5 rounded-full font-bold text-sm shadow-[0_0_20px_-5px_rgba(229,9,20,0.5)]"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20">
        {/* Modern Gradient Mesh Background */}
        <div className="absolute inset-0 z-0 bg-black">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/20 blur-[120px]" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-blue-600/10 blur-[150px]" />
          <div className="absolute top-[20%] right-[20%] w-[30%] h-[30%] rounded-full bg-purple-600/10 blur-[100px]" />
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background/50 z-10" />
        </div>

        <div className="relative z-20 max-w-7xl mx-auto w-full px-6 md:px-12 flex flex-col items-center justify-center gap-8 mt-10 text-center">
          
          {/* Animated Badge */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-md shadow-2xl"
          >
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
            </span>
            <span className="text-xs font-semibold tracking-wide text-zinc-300 uppercase">The Ultimate Streaming Engine</span>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1, ease: "easeOut" }}
            className="flex flex-col items-center"
          >
            <h1 className="text-5xl md:text-8xl font-black tracking-tighter leading-[1.05] mb-6">
              Next-Gen Playback. <br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-zinc-200 to-zinc-500">
                Zero Compromises.
              </span>
            </h1>
            <p className="text-lg md:text-xl text-secondary-foreground font-medium mb-10 max-w-2xl mx-auto leading-relaxed">
              Experience unparalleled streaming quality with native support for advanced codecs, seamless audio track switching, and on-the-fly transcoding.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 mb-12">
              <Link href="/signup" className="bg-white hover:bg-zinc-200 text-black px-8 py-4 rounded-full font-bold text-lg transition flex items-center justify-center gap-2 shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)] group">
                <Play className="fill-black w-5 h-5 group-hover:scale-110 transition-transform" />
                Start Watching
              </Link>
              <button 
                onClick={handleDemoLogin}
                disabled={isDemoLoading}
                className="bg-primary hover:bg-primary/90 text-white px-8 py-4 rounded-full font-bold text-lg transition shadow-[0_0_30px_-5px_rgba(229,9,20,0.6)] flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Sparkles className="w-5 h-5" />
                {isDemoLoading ? "Loading Demo..." : "Experience the App"}
              </button>
            </div>

            {/* Formats Marquee/List */}
            <div className="flex flex-col items-center gap-4">
              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Natively Supported Formats</span>
              <div className="flex flex-wrap justify-center gap-3 max-w-3xl">
                {['H.264', 'HEVC / H.265', 'AV1', 'VP9', 'MPEG-TS', 'M3U8 / HLS', 'DASH', 'AAC', 'MP3', 'AC-3', 'E-AC-3'].map((format) => (
                  <span key={format} className="px-3 py-1.5 rounded-md bg-white/5 border border-white/10 text-xs font-bold text-zinc-300">
                    {format}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Glowing Dashboard Preview */}
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.3, ease: "easeOut" }}
            className="w-full max-w-5xl mt-12 relative"
          >
            <div className="absolute -inset-1 bg-gradient-to-r from-primary via-blue-500 to-purple-600 rounded-2xl blur opacity-20" />
            <div className="relative aspect-[16/9] w-full rounded-2xl border border-white/10 bg-[#0B0B0C] overflow-hidden shadow-2xl flex items-center justify-center">
              <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=2525&auto=format&fit=crop')] bg-cover opacity-40 mix-blend-luminosity" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0B0B0C] via-transparent to-transparent" />
              
              <div className="z-10 text-center flex flex-col items-center gap-6">
                <div className="w-20 h-20 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center border border-white/20 shadow-2xl shadow-primary/20 animate-pulse">
                  <MonitorPlay className="text-white w-8 h-8 ml-1" />
                </div>
                <div className="text-white font-bold tracking-widest uppercase text-sm">Interactive Cinematic UI</div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Trust Banner Marquee */}
      <div className="w-full border-y border-white/5 bg-surface/50 py-6 overflow-hidden flex items-center">
        <div className="flex gap-16 whitespace-nowrap animate-[marquee_20s_linear_infinite] opacity-60 font-bold tracking-widest uppercase text-sm">
          {['Xtream', 'M3U', 'Stalker', 'MAG', 'XML', 'JSON', 'HLS', 'DASH', 'RTSP', 'Xtream', 'M3U', 'Stalker', 'MAG', 'XML', 'JSON'].map((prov, i) => (
            <span key={i} className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-primary" />
              {prov}
            </span>
          ))}
        </div>
      </div>

      {/* Features Grid */}
      <section id="features" className="py-32 px-6 max-w-7xl mx-auto">
        <div className="text-center mb-20">
          <h2 className="text-4xl md:text-5xl font-black mb-4">Everything You Need</h2>
          <p className="text-secondary-foreground text-lg max-w-2xl mx-auto">
            A premium streaming experience crafted with absolute attention to detail, designed to handle immense libraries without breaking a sweat.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <FeatureCard title="Universal Support" desc="Connect any provider natively." icon={<Server />} />
          <FeatureCard title="Multi Profiles" desc="Personalized tracking per user." icon={<Users />} />
          <FeatureCard title="Global Search" desc="Find anything instantly (Ctrl+K)." icon={<Search />} />
          <FeatureCard title="Live TV EPG" desc="Lightning fast channel surfing." icon={<Tv />} />
          <FeatureCard title="Rich Metadata" desc="Automated TMDB enrichment." icon={<Film />} />
          <FeatureCard title="Smart Sync" desc="Lag-free incremental updates." icon={<Zap />} />
          <FeatureCard title="Offline Downloads" desc="Watch without an internet connection." icon={<Download />} />
          <FeatureCard title="Analytics" desc="Monitor platform health live." icon={<Activity />} />
          <FeatureCard title="4K Streaming" desc="OLED optimized visual fidelity." icon={<MonitorPlay />} />
        </div>
      </section>

      {/* Platform Showcase (Tabs) */}
      <PlatformShowcase />

      {/* Final CTA */}
      <section className="relative py-32 px-6 flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/20 via-background to-background z-0" />
        <div className="relative z-10 text-center max-w-3xl mx-auto">
          <h2 className="text-5xl md:text-6xl font-black mb-8 leading-tight">Ready To Build Your Entertainment Universe?</h2>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/signup" className="bg-primary hover:bg-primary/90 text-white px-10 py-5 rounded-full font-bold text-xl transition shadow-[0_0_40px_-10px_rgba(229,9,20,0.8)]">
              Get Started Now
            </Link>
          </div>
        </div>
      </section>


      {/* Custom Styles for Marquee */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes marquee {
          0% { transform: translateX(0%); }
          100% { transform: translateX(-50%); }
        }
      `}} />
    </div>
  )
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) {
  return (
    <motion.div 
      whileHover={{ y: -5, scale: 1.02 }}
      className="bg-card border border-white/5 rounded-2xl p-8 flex flex-col items-start transition-all hover:border-primary/50 hover:shadow-[0_0_30px_-15px_rgba(229,9,20,0.4)] group relative overflow-hidden"
    >
      <div className="absolute -right-10 -top-10 bg-primary/10 w-32 h-32 rounded-full blur-3xl group-hover:bg-primary/20 transition-colors" />
      <div className="text-primary mb-6 p-3 bg-primary/10 rounded-xl">
        {icon}
      </div>
      <h3 className="text-2xl font-bold mb-2 text-white">{title}</h3>
      <p className="text-secondary-foreground font-medium">{desc}</p>
    </motion.div>
  )
}

// Platform Showcase Component
function PlatformShowcase() {
  const tabs = ['Home', 'Movies', 'Live TV', 'Search', 'Profiles']
  const [activeTab, setActiveTab] = useState('Home')

  return (
    <section id="showcase" className="py-32 px-6 max-w-6xl mx-auto">
      <div className="text-center mb-16">
        <h2 className="text-4xl md:text-5xl font-black mb-4">A Cinematic Experience</h2>
        <p className="text-secondary-foreground text-lg">Every view meticulously crafted for maximum visual fidelity.</p>
      </div>

      <div className="flex justify-center mb-12">
        <div className="bg-card border border-white/10 rounded-full p-2 flex flex-wrap justify-center gap-2">
          {tabs.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${
                activeTab === tab 
                  ? "bg-primary text-white shadow-lg" 
                  : "text-secondary-foreground hover:text-white hover:bg-white/5"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Mockup Display */}
      <div className="relative w-full aspect-video bg-card border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex items-center justify-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 flex flex-col items-center justify-center p-10 text-center bg-[url('https://images.unsplash.com/photo-1626814026160-2237a95fc5a0?q=80&w=2525&auto=format&fit=crop')] bg-cover bg-center"
          >
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
            <div className="relative z-10">
              <h3 className="text-4xl font-black text-white mb-4">{activeTab} View</h3>
              <p className="text-xl text-secondary-foreground">Interactive demo component rendering {activeTab} layout.</p>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  )
}
