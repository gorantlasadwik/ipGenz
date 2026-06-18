"use client"

import { CheckCircle2, ShieldCheck, Zap, MonitorPlay } from "lucide-react"

export default function SubscriptionPage() {
  return (
    <div className="min-h-screen bg-[#050505] text-white pt-24 pb-12 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-black mb-4">Choose Your Premium Plan</h1>
          <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
            Get unlimited access to thousands of live channels, movies, and series. No commitment, cancel anytime.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {/* Daily Plan */}
          <div className="bg-[#111] border border-white/10 rounded-3xl p-8 flex flex-col relative overflow-hidden transition-all duration-300 hover:scale-105 hover:border-white/30">
            <h3 className="text-xl font-bold mb-2">Daily Pass</h3>
            <p className="text-zinc-400 text-sm mb-6">Perfect for weekend binges or catching the big game.</p>
            <div className="mb-6">
              <span className="text-4xl font-black">₹10</span>
              <span className="text-zinc-500">/day</span>
            </div>
            <ul className="space-y-4 mb-8 flex-1">
              <li className="flex gap-3 items-start">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                <span className="text-sm text-zinc-300">24 Hours Full Access</span>
              </li>
              <li className="flex gap-3 items-start">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                <span className="text-sm text-zinc-300">All Live Channels</span>
              </li>
              <li className="flex gap-3 items-start">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                <span className="text-sm text-zinc-300">Standard Quality</span>
              </li>
            </ul>
            <button className="w-full bg-white hover:bg-zinc-200 text-black font-bold py-3.5 rounded-xl transition">
              Get Daily Pass
            </button>
          </div>

          {/* Monthly Plan */}
          <div className="bg-gradient-to-b from-primary/20 to-[#111] border border-primary/50 rounded-3xl p-8 flex flex-col relative overflow-hidden transition-all duration-300 hover:scale-105 shadow-[0_0_40px_-15px_rgba(229,9,20,0.5)]">
            <div className="absolute top-0 right-0 bg-primary text-[10px] font-bold px-3 py-1 uppercase tracking-wider rounded-bl-xl">
              Most Popular
            </div>
            <h3 className="text-xl font-bold mb-2">Monthly</h3>
            <p className="text-zinc-400 text-sm mb-6">Great value for everyday entertainment.</p>
            <div className="mb-6">
              <span className="text-4xl font-black">₹200</span>
              <span className="text-zinc-500">/month</span>
            </div>
            <ul className="space-y-4 mb-8 flex-1">
              <li className="flex gap-3 items-start">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                <span className="text-sm text-zinc-300">Full Premium Access</span>
              </li>
              <li className="flex gap-3 items-start">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                <span className="text-sm text-zinc-300">Movies & Series Library</span>
              </li>
              <li className="flex gap-3 items-start">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                <span className="text-sm text-zinc-300">HD & 4K Quality</span>
              </li>
              <li className="flex gap-3 items-start">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                <span className="text-sm text-zinc-300">Priority Support</span>
              </li>
            </ul>
            <button className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-3.5 rounded-xl transition shadow-lg shadow-primary/20">
              Subscribe Monthly
            </button>
          </div>

          {/* Yearly Plan */}
          <div className="bg-[#111] border border-white/10 rounded-3xl p-8 flex flex-col relative overflow-hidden transition-all duration-300 hover:scale-105 hover:border-white/30">
            <h3 className="text-xl font-bold mb-2">Yearly</h3>
            <p className="text-zinc-400 text-sm mb-6">Massive savings for dedicated streamers.</p>
            <div className="mb-6">
              <span className="text-4xl font-black">₹2000</span>
              <span className="text-zinc-500">/year</span>
            </div>
            <ul className="space-y-4 mb-8 flex-1">
              <li className="flex gap-3 items-start">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                <span className="text-sm text-zinc-300">Save ₹400 annually</span>
              </li>
              <li className="flex gap-3 items-start">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                <span className="text-sm text-zinc-300">All Premium Features</span>
              </li>
              <li className="flex gap-3 items-start">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                <span className="text-sm text-zinc-300">Highest Priority Streaming</span>
              </li>
              <li className="flex gap-3 items-start">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                <span className="text-sm text-zinc-300">Early Access to New Features</span>
              </li>
            </ul>
            <button className="w-full bg-white hover:bg-zinc-200 text-black font-bold py-3.5 rounded-xl transition">
              Get Yearly Plan
            </button>
          </div>
        </div>

        <div className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto border-t border-white/10 pt-16">
          <div className="flex flex-col items-center text-center">
            <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mb-4">
              <Zap className="w-6 h-6 text-primary" />
            </div>
            <h4 className="font-bold mb-2">Instant Delivery</h4>
            <p className="text-sm text-zinc-400">Your account is upgraded the moment your payment is confirmed.</p>
          </div>
          <div className="flex flex-col items-center text-center">
            <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mb-4">
              <ShieldCheck className="w-6 h-6 text-primary" />
            </div>
            <h4 className="font-bold mb-2">Secure Payments</h4>
            <p className="text-sm text-zinc-400">All transactions are encrypted and securely processed.</p>
          </div>
          <div className="flex flex-col items-center text-center">
            <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mb-4">
              <MonitorPlay className="w-6 h-6 text-primary" />
            </div>
            <h4 className="font-bold mb-2">Any Device</h4>
            <p className="text-sm text-zinc-400">Watch on your phone, tablet, laptop, or smart TV.</p>
          </div>
        </div>

      </div>
    </div>
  )
}
