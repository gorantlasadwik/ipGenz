"use client"

import Link from "next/link"
import { useState } from "react"
import { useRouter } from "next/navigation"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      const res = await fetch("http://localhost:3001/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })

      if (!res.ok) {
        throw new Error("Invalid credentials")
      }

      const data = await res.json()
      // In a real app, store data.access_token securely (e.g., HTTP-only cookie or localStorage for dev)
      localStorage.setItem("token", data.access_token)
      if (data.user?.isDemo) {
        localStorage.setItem("isDemo", "true")
      } else {
        localStorage.setItem("isDemo", "false")
      }
      
      router.push("/profiles")
    } catch (err: any) {
      setError(err.message || "An error occurred during login")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex relative items-center justify-center">
      {/* Background */}
      <div 
        className="absolute inset-0 bg-cover bg-center z-0"
        style={{ backgroundImage: `url('https://image.tmdb.org/t/p/original/8rpDcsfLJypbO6vtecsmREWE4Ih.jpg')` }}
      />
      <div className="absolute inset-0 bg-black/80 z-10" />

      {/* Login Form */}
      <div className="relative z-20 w-full max-w-md p-10 bg-black/70 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl">
        <h1 className="text-4xl font-black text-white mb-8 tracking-tight">Sign In</h1>
        
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-3 rounded-lg mb-6 text-sm font-medium">
            {error}
          </div>
        )}

        <form className="space-y-6" onSubmit={handleLogin}>
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">Email Address</label>
            <input 
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              placeholder="name@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">Password</label>
            <input 
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              placeholder="••••••••"
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-4 rounded-lg transition-colors mt-2 disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div className="mt-8 text-white/50 text-sm">
          New to IPGENZ?{' '}
          <Link href="/signup" className="text-white hover:text-primary transition-colors font-medium">
            Sign up now.
          </Link>
        </div>
      </div>
    </div>
  )
}
