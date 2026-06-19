"use client"

import React, { useState, useEffect } from "react"
import { Smartphone, MonitorPlay } from "lucide-react"

export function MobileGuard({ children }: { children: React.ReactNode }) {
  const [isMobile, setIsMobile] = useState<boolean | null>(null)

  useEffect(() => {
    const checkDevice = () => {
      const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent || navigator.vendor || (window as any).opera : '';
      const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;
      const isMobileUA = mobileRegex.test(userAgent);
      
      // Block mobile user-agents or screen widths narrower than a tablet/desktop (1024px)
      const isSmallScreen = window.innerWidth < 1024;
      
      setIsMobile(isMobileUA || isSmallScreen);
    }
    
    checkDevice();
    window.addEventListener('resize', checkDevice);
    return () => window.removeEventListener('resize', checkDevice);
  }, []);

  if (isMobile === null) {
    // Prevent flash of page during hydration
    return (
      <div className="fixed inset-0 bg-[#050505] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className="fixed inset-0 z-[99999] bg-[#050505] text-white flex flex-col items-center justify-center p-8 text-center select-none font-sans">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-red-900/20 via-transparent to-transparent opacity-70 pointer-events-none" />
        
        <div className="relative z-10 max-w-sm flex flex-col items-center gap-6">
          <div className="w-16 h-16 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center shadow-2xl">
            <Smartphone className="w-8 h-8 text-red-500 animate-bounce" />
          </div>
          
          <h1 className="text-2xl font-black tracking-tight text-white uppercase flex items-center gap-2">
            <MonitorPlay className="w-6 h-6 text-red-600" /> Desktop Version Required
          </h1>
          
          <p className="text-zinc-400 text-sm leading-relaxed">
            The premium streaming and cinematic layout features of <strong className="text-white">IPGENZ</strong> are designed exclusively for larger screens (Laptops, Desktops, or TV Displays).
          </p>
          
          <div className="w-full bg-[#111] border border-white/5 rounded-2xl p-4">
            <p className="text-yellow-500 font-bold text-xs uppercase tracking-widest mb-1">
              Coming Soon
            </p>
            <p className="text-white text-xs font-semibold">
              Mobile version is currently in development
            </p>
          </div>
          
          <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-mono">
            ipGenz Ecosystem
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>;
}
