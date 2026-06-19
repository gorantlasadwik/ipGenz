"use client"

import Link from "next/link"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { api } from "@/lib/api"
import { ArrowLeft } from "lucide-react"

export default function SignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      await api.register(email, password)

      // Assume the backend returns the user or token, for now just redirect to login
      router.push("/login")
    } catch (err: any) {
      setError(err.message || "An error occurred during sign up")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex relative items-center justify-center">
      {/* Back Button */}
      <Link 
        href="/" 
        className="absolute top-8 left-8 z-20 flex items-center gap-2 text-white/60 hover:text-white bg-black/40 hover:bg-black/60 border border-white/10 px-4 py-2.5 rounded-xl transition-all duration-300 backdrop-blur-sm shadow-lg hover:border-white/20 hover:scale-105"
      >
        <ArrowLeft size={15} className="text-primary" />
        <span className="text-[10px] font-bold uppercase tracking-wider font-mono">Back to Home</span>
      </Link>

      {/* Background */}
      <div 
        className="absolute inset-0 bg-cover bg-center z-0"
        style={{ backgroundImage: `url('https://image.tmdb.org/t/p/original/mAJ84W6I8I272Da87qxcj2DpTOo.jpg')` }}
      />
      <div className="absolute inset-0 bg-black/80 z-10" />

      {/* Signup Form */}
      <div className="relative z-20 w-full max-w-md p-10 bg-black/70 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl">
        <h1 className="text-4xl font-black text-white mb-8 tracking-tight">Create Account</h1>
        
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-3 rounded-lg mb-6 text-sm font-medium">
            {error}
          </div>
        )}

        <form className="space-y-6" onSubmit={handleSignup}>
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">Full Name</label>
            <input 
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              placeholder="John Doe"
            />
          </div>
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
            {loading ? "Signing up..." : "Sign Up"}
          </button>
        </form>

        <div className="mt-8 text-white/50 text-sm">
          Already have an account?{' '}
          <Link href="/login" className="text-white hover:text-primary transition-colors font-medium">
            Sign in.
          </Link>
        </div>
      </div>
    </div>
  )
}
