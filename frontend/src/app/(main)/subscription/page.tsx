"use client"

import { useState, useRef } from "react"
import { CheckCircle2, ShieldCheck, Zap, MonitorPlay, X, Copy, Upload, CheckCircle, Loader2, QrCode } from "lucide-react"
import { api } from "@/lib/api"

const PLANS = [
  {
    name: "Daily Pass",
    price: 10,
    period: "/day",
    description: "Perfect for weekend binges or catching the big game.",
    features: ["24 Hours Full Access", "All Live Channels", "Standard Quality"],
    highlight: false,
  },
  {
    name: "Monthly",
    price: 200,
    period: "/month",
    description: "Great value for everyday entertainment.",
    features: ["Full Premium Access", "Movies & Series Library", "HD & 4K Quality", "Priority Support"],
    highlight: true,
  },
  {
    name: "Yearly",
    price: 2000,
    period: "/year",
    description: "Massive savings for dedicated streamers.",
    features: ["Save ₹400 annually", "All Premium Features", "Highest Priority Streaming", "Early Access to New Features"],
    highlight: false,
  },
]

const UPI_ID = "sadwik.india@oksbi"
const QR_URL = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=upi%3A%2F%2Fpay%3Fpa%3Dsadwik.india%40oksbi%26pn%3DIPGENZ%26cu%3DINR`

export default function SubscriptionPage() {
  const [selectedPlan, setSelectedPlan] = useState<typeof PLANS[0] | null>(null)
  const [step, setStep] = useState<"qr" | "upload" | "done">("qr")

  // Form fields
  const [name, setName]           = useState("")
  const [email, setEmail]         = useState("")
  const [upiRef, setUpiRef]       = useState("")
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [fileName, setFileName]   = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]         = useState("")
  const [copied, setCopied]       = useState(false)

  const fileRef = useRef<HTMLInputElement>(null)

  const openModal = (plan: typeof PLANS[0]) => {
    setSelectedPlan(plan)
    setStep("qr")
    setName(""); setEmail(""); setUpiRef(""); setScreenshot(null); setFileName(""); setError("")
  }

  const closeModal = () => {
    setSelectedPlan(null)
    setStep("qr")
  }

  const copyUPI = () => {
    navigator.clipboard.writeText(UPI_ID)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { setError("Screenshot must be under 5MB"); return }
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (ev) => setScreenshot(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const handleSubmit = async () => {
    if (!name || !email || !screenshot) {
      setError("Please fill in your name, email and upload a screenshot."); return
    }
    setSubmitting(true)
    setError("")
    try {
      await api.submitPaymentRequest({
        userEmail: email,
        userName: name,
        plan: selectedPlan!.name,
        amount: selectedPlan!.price,
        upiRef: upiRef || undefined,
        screenshotB64: screenshot,
      })
      setStep("done")
    } catch (e: any) {
      setError(e.message || "Submission failed. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white pt-24 pb-12 px-6">
      <div className="max-w-6xl mx-auto">

        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-black mb-4">Choose Your Premium Plan</h1>
          <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
            Get unlimited access to thousands of live channels, movies, and series. Pay via UPI — verified manually within a few hours.
          </p>
        </div>

        {/* Plan Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-3xl p-8 flex flex-col relative overflow-hidden transition-all duration-300 hover:scale-105 ${
                plan.highlight
                  ? "bg-gradient-to-b from-primary/20 to-[#111] border border-primary/50 shadow-[0_0_40px_-15px_rgba(229,9,20,0.5)]"
                  : "bg-[#111] border border-white/10 hover:border-white/30"
              }`}
            >
              {plan.highlight && (
                <div className="absolute top-0 right-0 bg-primary text-[10px] font-bold px-3 py-1 uppercase tracking-wider rounded-bl-xl">
                  Most Popular
                </div>
              )}
              <h3 className="text-xl font-bold mb-2">{plan.name}</h3>
              <p className="text-zinc-400 text-sm mb-6">{plan.description}</p>
              <div className="mb-6">
                <span className="text-4xl font-black">₹{plan.price}</span>
                <span className="text-zinc-500">{plan.period}</span>
              </div>
              <ul className="space-y-4 mb-8 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-3 items-start">
                    <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                    <span className="text-sm text-zinc-300">{f}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => openModal(plan)}
                className={`w-full font-bold py-3.5 rounded-xl transition ${
                  plan.highlight
                    ? "bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20"
                    : "bg-white hover:bg-zinc-200 text-black"
                }`}
              >
                Get {plan.name}
              </button>
            </div>
          ))}
        </div>

        {/* Trust Badges */}
        <div className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto border-t border-white/10 pt-16">
          {[
            { icon: <Zap className="w-6 h-6 text-primary" />, title: "Quick Activation", desc: "Your account is upgraded within a few hours of payment verification." },
            { icon: <ShieldCheck className="w-6 h-6 text-primary" />, title: "Secure UPI", desc: "Pay directly via UPI — no card details stored anywhere." },
            { icon: <MonitorPlay className="w-6 h-6 text-primary" />, title: "Any Device", desc: "Watch on your phone, tablet, laptop, or smart TV." },
          ].map((b) => (
            <div key={b.title} className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mb-4">{b.icon}</div>
              <h4 className="font-bold mb-2">{b.title}</h4>
              <p className="text-sm text-zinc-400">{b.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Payment Modal ───────────────────────────────────────────── */}
      {selectedPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0f0f0f] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">

            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <div>
                <h2 className="text-lg font-bold">{selectedPlan.name}</h2>
                <p className="text-zinc-400 text-sm">₹{selectedPlan.price}{selectedPlan.period}</p>
              </div>
              <button onClick={closeModal} className="p-2 hover:bg-white/10 rounded-xl transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              {/* ── STEP 1: QR Code ── */}
              {step === "qr" && (
                <div className="space-y-5">
                  <p className="text-zinc-400 text-sm text-center">
                    Scan the QR below with <strong className="text-white">Google Pay, PhonePe, Paytm</strong> or any UPI app and pay <strong className="text-white">₹{selectedPlan.price}</strong>.
                  </p>

                  {/* QR Code */}
                  <div className="flex justify-center">
                    <div className="bg-white p-3 rounded-2xl">
                      <img src={QR_URL} alt="UPI QR Code" width={220} height={220} className="rounded-xl" />
                    </div>
                  </div>

                  {/* UPI ID */}
                  <div className="bg-zinc-900 border border-white/10 rounded-xl p-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] text-zinc-500 uppercase font-semibold mb-0.5">UPI ID</p>
                      <p className="font-mono font-bold text-white text-sm">{UPI_ID}</p>
                    </div>
                    <button
                      onClick={copyUPI}
                      className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-bold px-3 py-2 rounded-lg transition"
                    >
                      {copied ? <CheckCircle className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>

                  <p className="text-xs text-zinc-500 text-center">
                    After paying, click below to upload your payment screenshot for verification.
                  </p>

                  <button
                    onClick={() => setStep("upload")}
                    className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-3.5 rounded-xl transition"
                  >
                    I've Paid — Upload Screenshot →
                  </button>
                </div>
              )}

              {/* ── STEP 2: Upload Screenshot ── */}
              {step === "upload" && (
                <div className="space-y-4">
                  <p className="text-zinc-400 text-sm">Fill in your details and upload a screenshot of the payment confirmation.</p>

                  {error && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-3 rounded-lg">
                      {error}
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 mb-1.5 uppercase tracking-wide">Your Name *</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Sadwik Gorantla"
                      className="w-full bg-black border border-white/10 rounded-xl py-2.5 px-4 text-white text-sm focus:outline-none focus:border-primary transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 mb-1.5 uppercase tracking-wide">Email Address *</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full bg-black border border-white/10 rounded-xl py-2.5 px-4 text-white text-sm focus:outline-none focus:border-primary transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 mb-1.5 uppercase tracking-wide">UPI Transaction ID <span className="text-zinc-600 font-normal normal-case">(optional)</span></label>
                    <input
                      type="text"
                      value={upiRef}
                      onChange={(e) => setUpiRef(e.target.value)}
                      placeholder="e.g. 123456789012"
                      className="w-full bg-black border border-white/10 rounded-xl py-2.5 px-4 text-white text-sm focus:outline-none focus:border-primary transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 mb-1.5 uppercase tracking-wide">Payment Screenshot *</label>
                    <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                    <button
                      onClick={() => fileRef.current?.click()}
                      className={`w-full border-2 border-dashed rounded-xl py-6 flex flex-col items-center gap-2 transition ${
                        screenshot ? "border-green-500/50 bg-green-500/5" : "border-white/10 hover:border-primary/50"
                      }`}
                    >
                      {screenshot ? (
                        <>
                          <CheckCircle className="w-8 h-8 text-green-500" />
                          <span className="text-xs text-green-400 font-semibold">{fileName}</span>
                          <span className="text-[10px] text-zinc-500">Click to change</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-8 h-8 text-zinc-500" />
                          <span className="text-sm text-zinc-400">Click to upload screenshot</span>
                          <span className="text-[10px] text-zinc-600">PNG, JPG up to 5MB</span>
                        </>
                      )}
                    </button>
                    {screenshot && (
                      <img src={screenshot} alt="Preview" className="mt-3 w-full rounded-xl max-h-40 object-contain bg-zinc-900" />
                    )}
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => setStep("qr")}
                      className="flex-1 bg-white/5 hover:bg-white/10 text-white font-bold py-3 rounded-xl transition text-sm"
                    >
                      ← Back
                    </button>
                    <button
                      onClick={handleSubmit}
                      disabled={submitting}
                      className="flex-[2] bg-primary hover:bg-primary/90 text-white font-bold py-3 rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                    >
                      {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</> : "Submit for Verification"}
                    </button>
                  </div>
                </div>
              )}

              {/* ── STEP 3: Done ── */}
              {step === "done" && (
                <div className="py-6 text-center space-y-4">
                  <div className="w-16 h-16 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mx-auto">
                    <CheckCircle className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold text-white">Request Submitted!</h3>
                  <p className="text-zinc-400 text-sm leading-relaxed">
                    Your payment is under review. We will verify it and activate your <strong className="text-white">{selectedPlan.name}</strong> plan within a few hours.
                    <br /><br />
                    We'll contact you at <strong className="text-white">{email}</strong> once it's approved.
                  </p>
                  <button
                    onClick={closeModal}
                    className="w-full bg-white/10 hover:bg-white/20 text-white font-bold py-3 rounded-xl transition mt-4"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
