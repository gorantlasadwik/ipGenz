"use client"

import React, { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { api } from "@/lib/api"
import { motion, AnimatePresence } from "framer-motion"
import { MonitorPlay, Play, Sparkles } from "lucide-react"

const GithubIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" className={className}>
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
  </svg>
)

const LinkedinIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" className={className}>
    <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
  </svg>
)

const MacWindow = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-xl overflow-hidden border border-white/10 bg-[#000000] shadow-2xl">
    <div className="h-8 bg-[#1E1E1E] border-b border-white/5 flex items-center px-4 gap-2">
      <div className="w-3 h-3 rounded-full bg-[#FF5F56]" />
      <div className="w-3 h-3 rounded-full bg-[#FFBD2E]" />
      <div className="w-3 h-3 rounded-full bg-[#27C93F]" />
    </div>
    <div className="relative">
      {children}
    </div>
  </div>
)

const BrowserFrame = ({ children, url = "ipgenz.vercel.app" }: { children: React.ReactNode, url?: string }) => (
  <div className="rounded-xl overflow-hidden border border-white/10 bg-[#000000] shadow-2xl">
    <div className="h-10 bg-[#1E1E1E] border-b border-white/5 flex items-center px-4 gap-4">
      <div className="flex gap-2">
        <div className="w-3 h-3 rounded-full bg-[#FF5F56]" />
        <div className="w-3 h-3 rounded-full bg-[#FFBD2E]" />
        <div className="w-3 h-3 rounded-full bg-[#27C93F]" />
      </div>
      <div className="bg-[#000000] rounded-md px-4 py-1 text-xs text-zinc-500 flex-1 max-w-sm border border-white/5 mx-auto text-center font-mono">
        {url}
      </div>
    </div>
    <div className="relative">
      {children}
    </div>
  </div>
)

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
      localStorage.setItem("isPremiumTrial", "false")
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
    <div className="min-h-screen bg-[#050505] text-foreground font-sans selection:bg-primary/30">
      
      {/* Navigation Bar */}
      <header 
        className={`fixed top-0 w-full z-50 transition-all duration-300 h-[72px] flex items-center px-6 md:px-12 ${
          scrolled ? "bg-[#050505]/80 backdrop-blur-xl border-b border-white/5 shadow-2xl" : "bg-transparent"
        }`}
      >
        <div className="flex items-center justify-between w-full max-w-7xl mx-auto">
          <div className="flex items-center gap-2 font-black text-2xl tracking-tighter text-white">
            <MonitorPlay className="h-7 w-7 text-primary" />
            IPGENZ
          </div>
          
          <nav className="hidden md:flex items-center bg-[#111111]/80 backdrop-blur-xl border border-white/10 rounded-full px-4 py-1 gap-1.5 text-[11px] font-bold tracking-wider text-zinc-400 uppercase shadow-xl shadow-black/50">
            <a href="#tour" className="hover:text-white hover:bg-white/5 px-3 py-1.5 rounded-full transition duration-200">
              Features
            </a>
            <Link href="/subscription" className="hover:text-white hover:bg-white/5 px-3 py-1.5 rounded-full transition duration-200">
              Plans
            </Link>
            <Link href="/request-trial" className="text-yellow-500 hover:text-yellow-400 hover:bg-yellow-500/10 px-3 py-1.5 rounded-full transition duration-200">
              Trial
            </Link>
            <button 
              onClick={handleDemoLogin}
              disabled={isDemoLoading}
              className="text-primary hover:text-red-400 hover:bg-primary/10 px-3 py-1.5 rounded-full transition duration-200 flex items-center gap-1 disabled:opacity-50"
            >
              <Sparkles className="w-3 h-3" /> Demo
            </button>
          </nav>

          <div className="flex items-center gap-6">
            <a href="https://github.com/gorantlasadwik/ipGenz" target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-white hover:text-white/80 transition hidden lg:flex items-center gap-2">
              <GithubIcon className="h-4 w-4" /> Star
            </a>
            <a href="https://www.linkedin.com/in/sadwik-gorantla-042362282/" target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-[#0A66C2] hover:brightness-110 transition hidden lg:flex items-center gap-2">
              <LinkedinIcon className="h-4 w-4" /> Connect
            </a>
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
      <section className="relative pt-40 pb-20 px-6 flex flex-col items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-0 bg-[#050505]">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/20 blur-[150px]" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-blue-600/10 blur-[150px]" />
          <div className="absolute top-[20%] right-[20%] w-[30%] h-[30%] rounded-full bg-purple-600/10 blur-[150px]" />
        </div>

        <div className="relative z-20 max-w-5xl mx-auto w-full flex flex-col items-center text-center gap-6">
          <span className="text-primary font-bold tracking-widest uppercase text-sm mb-2 px-4 py-1.5 rounded-full border border-primary/20 bg-primary/10">Powerful Features</span>
          <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-[1.1] mb-2 text-white">
            Everything you need. <br/>
            Built for the <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-purple-500">next generation.</span>
          </h1>
          <p className="text-lg md:text-xl text-zinc-400 font-medium mb-10 max-w-2xl mx-auto leading-relaxed">
            IPGenz brings all your entertainment together with a powerful set of features designed for the ultimate streaming experience.
          </p>
          
          <div className="flex flex-col gap-4 mb-8 w-full max-w-[600px] mx-auto">
            <div className="flex flex-col sm:flex-row gap-4 w-full">
              <Link href="/signup" className="flex-1 bg-white hover:bg-zinc-200 text-black px-8 py-4 rounded-full font-bold text-lg transition flex items-center justify-center gap-2 shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)]">
                Get Started for Free
              </Link>
              <button 
                onClick={handleDemoLogin}
                disabled={isDemoLoading}
                className="flex-1 bg-primary hover:bg-primary/90 text-white px-8 py-4 rounded-full font-bold text-lg transition shadow-[0_0_30px_-5px_rgba(229,9,20,0.6)] flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Sparkles className="w-5 h-5" />
                {isDemoLoading ? "Loading Demo..." : "Try Demo Instance"}
              </button>
            </div>
            
            <Link 
              href="/request-trial" 
              className="w-full bg-zinc-900 hover:bg-zinc-800 border border-white/10 hover:border-white/20 text-white px-8 py-4 rounded-full font-bold text-lg transition flex items-center justify-center gap-2 shadow-xl"
            >
              No IPTV Provider? Try Us
            </Link>
          </div>
        </div>
      </section>

      {/* Guided Tour Sections */}
      <div id="tour" className="max-w-7xl mx-auto px-6 py-20 flex flex-col gap-32">
        
        {/* Section 1: Universal Support */}
        <motion.section 
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8 }}
          className="flex flex-col items-center text-center gap-8"
        >
          <div className="max-w-2xl">
            <h2 className="text-4xl md:text-5xl font-black text-white mb-4 tracking-tight">Connect Any Provider</h2>
            <p className="text-xl text-zinc-400 font-medium">Import and manage multiple IPTV providers from a single dashboard. Natively supports Xtream, M3U, MAG, and more.</p>
          </div>
          <div className="w-full max-w-5xl group perspective-1000">
            <div className="transition-transform duration-700 ease-out group-hover:rotate-x-2 group-hover:rotate-y-[-2deg] group-hover:scale-[1.02]">
              <MacWindow>
                <img src="/images/provider-page-v3.png" alt="Provider Dashboard" className="w-full h-auto object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
              </MacWindow>
            </div>
          </div>
        </motion.section>

        {/* Section 2: Global Search */}
        <motion.section 
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8 }}
          className="flex flex-col items-center text-center gap-8"
        >
          <div className="max-w-2xl">
            <h2 className="text-4xl md:text-5xl font-black text-white mb-4 tracking-tight">Search Everything</h2>
            <p className="text-xl text-zinc-400 font-medium">Find content across every connected provider instantly. Unified results for movies, series, and live channels.</p>
          </div>
          <div className="w-full max-w-5xl group perspective-1000">
            <div className="transition-transform duration-700 ease-out group-hover:rotate-x-[-2deg] group-hover:rotate-y-2 group-hover:scale-[1.02]">
              <BrowserFrame>
                <img src="/images/dashboard.png" alt="Global Search" className="w-full h-auto object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
              </BrowserFrame>
            </div>
          </div>
        </motion.section>

        {/* Section 3: Movies */}
        <motion.section 
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8 }}
          className="flex flex-col items-center text-center gap-8"
        >
          <div className="max-w-2xl">
            <h2 className="text-4xl md:text-5xl font-black text-white mb-4 tracking-tight">A Premium Movie Experience</h2>
            <p className="text-xl text-zinc-400 font-medium">Netflix-inspired browsing for IPTV movies. Automatically enriched with gorgeous backdrops and metadata.</p>
          </div>
          <div className="w-full max-w-5xl group perspective-1000">
            <div className="transition-transform duration-700 ease-out group-hover:rotate-x-2 group-hover:rotate-y-[2deg] group-hover:scale-[1.02]">
              <div className="rounded-[2rem] p-4 bg-[#141414] border border-white/10 shadow-2xl">
                <div className="rounded-xl overflow-hidden border border-white/5">
                  <img src="/images/movies-v3.png" alt="Movies Interface" className="w-full h-auto object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            </div>
          </div>
        </motion.section>

        {/* Section 4: Series */}
        <motion.section 
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8 }}
          className="flex flex-col items-center text-center gap-8"
        >
          <div className="max-w-2xl">
            <h2 className="text-4xl md:text-5xl font-black text-white mb-4 tracking-tight">Binge Without Limits</h2>
            <p className="text-xl text-zinc-400 font-medium">Track seasons, episodes, and continue where you left off with flawless auto-play functionality.</p>
          </div>
          <div className="w-full max-w-5xl group perspective-1000">
            <div className="transition-transform duration-700 ease-out group-hover:rotate-x-[-2deg] group-hover:rotate-y-[-2deg] group-hover:scale-[1.02]">
              <BrowserFrame url="ipgenz.app/series/play">
                  <img src="/images/series-v3.png" alt="Series Interface" className="w-full h-auto object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
              </BrowserFrame>
            </div>
          </div>
        </motion.section>

        {/* Section 5: Live TV */}
        <motion.section 
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8 }}
          className="flex flex-col items-center text-center gap-8"
        >
          <div className="max-w-2xl">
            <h2 className="text-4xl md:text-5xl font-black text-white mb-4 tracking-tight">Live TV Reimagined</h2>
            <p className="text-xl text-zinc-400 font-medium">Fast channel switching with full EPG integration. Never miss a game or breaking news.</p>
          </div>
          <div className="w-full max-w-6xl group perspective-1000">
            <div className="transition-transform duration-700 ease-out group-hover:rotate-x-3 group-hover:scale-[1.03]">
              <div className="rounded-[2.5rem] p-2 bg-gradient-to-b from-zinc-800 to-black border border-white/20 shadow-[0_30px_60px_-15px_rgba(0,0,0,1)]">
                <div className="rounded-[2rem] overflow-hidden border border-black bg-black">
                  <img src="/images/live-tv-v3.png" alt="Live TV Interface" className="w-full h-auto object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            </div>
          </div>
        </motion.section>

        {/* Section 6: Player */}
        <motion.section 
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8 }}
          className="flex flex-col items-center text-center gap-8"
        >
          <div className="max-w-2xl">
            <h2 className="text-4xl md:text-5xl font-black text-white mb-4 tracking-tight">Built For Power Users</h2>
            <p className="text-xl text-zinc-400 font-medium">Advanced playback controls rarely found in IPTV platforms. Multi-audio, subtitles, and hardware acceleration.</p>
          </div>
          <div className="w-full max-w-6xl group perspective-1000">
            <div className="transition-transform duration-700 ease-out group-hover:scale-[1.04]">
              <div className="rounded-3xl overflow-hidden border border-white/10 shadow-[0_0_50px_rgba(229,9,20,0.3)]">
                <img src="/images/movie-player-v3.png" alt="Video Player" className="w-full h-auto object-cover" />
              </div>
            </div>
          </div>
        </motion.section>

        {/* Section 9: Admin Dashboard (Placeholder using sync progress for now) */}
        <motion.section 
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8 }}
          className="flex flex-col items-center text-center gap-8"
        >
          <div className="max-w-2xl">
            <h2 className="text-4xl md:text-5xl font-black text-white mb-4 tracking-tight">Complete Platform Control</h2>
            <p className="text-xl text-zinc-400 font-medium">Manage the entire platform from a single dashboard. Automated background syncing keeps libraries fresh.</p>
          </div>
          <div className="w-full max-w-4xl group perspective-1000">
            <div className="transition-transform duration-700 ease-out group-hover:rotate-x-2 group-hover:rotate-y-2 group-hover:scale-[1.02]">
              <MacWindow>
                <img src="/images/playlist-sync-v3.png" alt="Admin Dashboard Sync" className="w-full h-auto object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
              </MacWindow>
            </div>
          </div>
        </motion.section>

      </div>

      {/* Final CTA */}
      <section className="relative py-32 px-6 flex items-center justify-center overflow-hidden border-t border-white/5 bg-[#050505]">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent z-0" />
        <div className="relative z-10 text-center max-w-3xl mx-auto">
          <h2 className="text-5xl md:text-6xl font-black mb-8 leading-tight text-white">Ready to transform your streaming?</h2>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/signup" className="bg-primary hover:bg-primary/90 text-white px-10 py-5 rounded-full font-bold text-xl transition shadow-[0_0_40px_-10px_rgba(229,9,20,0.8)]">
              Get Started Now
            </Link>
          </div>
        </div>
      </section>

      <style dangerouslySetInnerHTML={{__html: `
        .perspective-1000 {
          perspective: 1000px;
        }
        .rotate-x-2 { transform: rotateX(2deg); }
        .rotate-x-[-2deg] { transform: rotateX(-2deg); }
        .rotate-y-2 { transform: rotateY(2deg); }
        .rotate-y-[-2deg] { transform: rotateY(-2deg); }
        .rotate-x-3 { transform: rotateX(3deg); }
      `}} />
    </div>
  )
}
