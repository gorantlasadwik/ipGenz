"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { MonitorPlay, ArrowLeft, Mail, User, Sparkles } from "lucide-react"
import { api } from "@/lib/api"

export default function RequestTrialPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) {
      setError("Please enter your email address")
      return
    }

    setLoading(true)
    setError("")
    
    try {
      await api.requestPremiumTrial(email)
      setSuccess(true)
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to request trial. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mb-6 shadow-[0_0_30px_-5px_rgba(34,197,94,0.3)]">
          <Sparkles className="w-8 h-8" />
        </div>
        <h1 className="text-4xl font-black text-white mb-4">Request Sent!</h1>
        <p className="text-zinc-400 max-w-md mx-auto mb-8 text-lg">
          We've received your request. Once approved, we will send your 15-digit login credentials directly to <strong className="text-white">{email}</strong>.
        </p>
        <Link href="/" className="bg-white text-black font-bold px-8 py-3 rounded-full hover:bg-zinc-200 transition">
          Return to Home
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col">
      <div className="p-6">
        <Link href="/" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white transition">
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </Link>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-2 justify-center mb-8">
            <MonitorPlay className="w-8 h-8 text-primary" />
            <span className="text-2xl font-black text-white tracking-tight">IPGENZ</span>
          </div>

          <div className="bg-[#111] border border-white/10 rounded-2xl p-8 shadow-2xl">
            <h1 className="text-2xl font-bold text-white mb-2">Request 1-Day Trial</h1>
            <p className="text-zinc-400 text-sm mb-8">
              No IPTV provider? No problem. Fill out your email and our admin will provision a 1-day premium trial for you.
            </p>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-sm p-3 rounded-lg mb-6">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full bg-black border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:border-primary transition"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-3.5 rounded-xl transition mt-4 disabled:opacity-50"
              >
                {loading ? "Submitting..." : "Request Premium Trial"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
