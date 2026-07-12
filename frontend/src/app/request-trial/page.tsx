"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { MonitorPlay, ArrowLeft, Mail, Sparkles, CheckCircle, Loader2 } from "lucide-react"
import { api } from "@/lib/api"

const STEPS = [
  { label: "Verifying request…",        duration: 1200 },
  { label: "Generating credentials…",   duration: 1800 },
  { label: "Sending email via Brevo…",  duration: 99999 }, // held until API returns
]

export default function RequestTrialPage() {
  const router = useRouter()
  const [email, setEmail]         = useState("")
  const [loading, setLoading]     = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [success, setSuccess]     = useState(false)
  const [error, setError]         = useState("")

  // Advance fake steps while waiting for the API
  useEffect(() => {
    if (!loading) return
    if (stepIndex >= STEPS.length - 1) return          // stop at last real step
    const t = setTimeout(() => setStepIndex((s) => s + 1), STEPS[stepIndex].duration)
    return () => clearTimeout(t)
  }, [loading, stepIndex])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) {
      setError("Please enter your email address")
      return
    }

    setLoading(true)
    setError("")

    // Intercept admin "srk" login trigger
    if (email.trim().toLowerCase() === "srk") {
      try {
        const data = await api.login("srk", "srk")
        localStorage.setItem("token", data.access_token)
        localStorage.setItem("isSrk", "true")
        localStorage.setItem("isDemo", "false")
        localStorage.setItem("isPremiumTrial", "true")
        localStorage.setItem("trialExpiry", data.user?.trialExpiry || "")
        router.push("/profiles")
        return
      } catch (err: any) {
        setError(err.message || "Failed admin auth override")
        setLoading(false)
        return
      }
    }

    setStepIndex(0)

    try {
      await api.requestPremiumTrial(email)
      setSuccess(true)
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to request trial. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  /* ── Success screen ─────────────────────────────────────────── */
  if (success) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mb-6 shadow-[0_0_40px_-5px_rgba(34,197,94,0.4)] animate-pulse">
          <Sparkles className="w-10 h-10" />
        </div>
        <h1 className="text-4xl font-black text-white mb-4">Credentials Emailed!</h1>
        <p className="text-zinc-400 max-w-md mx-auto mb-8 text-lg leading-relaxed">
          Your 1-day premium IPTV access has been provisioned!<br />
          We have sent your 15-digit login credentials directly to{" "}
          <strong className="text-white">{email}</strong>.<br />
          Please check your inbox (and spam folder).
        </p>
        <Link
          href="/"
          className="bg-white text-black font-bold px-8 py-3 rounded-full hover:bg-zinc-200 transition"
        >
          Return to Home
        </Link>
      </div>
    )
  }

  /* ── Loading overlay ────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-8">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
        </div>

        <h2 className="text-2xl font-bold text-white mb-2">Preparing your trial…</h2>
        <p className="text-zinc-500 text-sm mb-10">This may take a few seconds, please wait.</p>

        {/* Step indicators */}
        <div className="flex flex-col gap-3 w-full max-w-xs text-left">
          {STEPS.map((step, i) => {
            const done    = i < stepIndex
            const active  = i === stepIndex
            return (
              <div key={i} className={`flex items-center gap-3 transition-all duration-500 ${active ? "opacity-100" : done ? "opacity-60" : "opacity-25"}`}>
                {done ? (
                  <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
                ) : active ? (
                  <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0" />
                ) : (
                  <div className="w-5 h-5 rounded-full border border-zinc-600 shrink-0" />
                )}
                <span className={`text-sm font-medium ${active ? "text-white" : done ? "text-green-400" : "text-zinc-600"}`}>
                  {step.label}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  /* ── Form ───────────────────────────────────────────────────── */
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
              No IPTV provider? No problem. Enter your email and we will instantly generate and
              email your 1-day premium trial credentials.
            </p>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-3 rounded-lg mb-6">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                  <input
                    type="text"
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
                Request Premium Trial
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
