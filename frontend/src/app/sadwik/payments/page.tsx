"use client"

import { useEffect, useState } from "react"
import { CheckCircle, XCircle, Clock, Loader2, Eye, X } from "lucide-react"
import { api } from "@/lib/api"

type PaymentRequest = {
  id: string
  userEmail: string
  userName: string
  plan: string
  amount: number
  upiRef: string | null
  screenshotB64: string
  status: "PENDING" | "APPROVED" | "REJECTED"
  adminNotes: string | null
  createdAt: string
}

const STATUS_CONFIG = {
  PENDING:  { label: "Pending",  color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" },
  APPROVED: { label: "Approved", color: "text-green-400 bg-green-500/10 border-green-500/20" },
  REJECTED: { label: "Rejected", color: "text-red-400 bg-red-500/10 border-red-500/20" },
}

export default function AdminPaymentsPage() {
  const [requests, setRequests]     = useState<PaymentRequest[]>([])
  const [loading, setLoading]       = useState(true)
  const [preview, setPreview]       = useState<PaymentRequest | null>(null)
  const [notes, setNotes]           = useState("")
  const [actionLoading, setAction]  = useState<string | null>(null)
  const [filter, setFilter]         = useState<"ALL" | "PENDING" | "APPROVED" | "REJECTED">("ALL")

  const load = async () => {
    try {
      const data = await api.getAdminPaymentRequests()
      setRequests(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const approve = async (id: string) => {
    setAction(id + "-approve")
    try {
      await api.approvePaymentRequest(id, notes)
      setPreview(null); setNotes(""); load()
    } catch (e) { console.error(e) }
    setAction(null)
  }

  const reject = async (id: string) => {
    setAction(id + "-reject")
    try {
      await api.rejectPaymentRequest(id, notes)
      setPreview(null); setNotes(""); load()
    } catch (e) { console.error(e) }
    setAction(null)
  }

  const filtered = filter === "ALL" ? requests : requests.filter((r) => r.status === filter)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-950 gap-4 text-white">
        <Loader2 className="w-8 h-8 animate-spin text-red-500" />
        <span className="text-xs font-mono text-zinc-400">LOADING PAYMENT REQUESTS...</span>
      </div>
    )
  }

  const pending = requests.filter((r) => r.status === "PENDING").length

  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-6 bg-slate-950 text-white">

      {/* Header */}
      <div className="flex justify-between items-center border-b border-white/5 pb-4">
        <div>
          <h2 className="text-xl font-bold uppercase tracking-wide text-zinc-300">Payment Requests</h2>
          <span className="text-[10px] text-zinc-500 font-mono">
            {pending} pending · {requests.length} total
          </span>
        </div>
        {pending > 0 && (
          <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-xs font-bold px-3 py-1.5 rounded-xl">
            <Clock size={13} /> {pending} Awaiting Review
          </div>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {(["ALL", "PENDING", "APPROVED", "REJECTED"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-xl text-xs font-bold transition ${
              filter === f ? "bg-red-600 text-white" : "bg-white/5 text-zinc-400 hover:bg-white/10"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-20 text-zinc-500 font-mono text-sm">No payment requests found.</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => {
            const sc = STATUS_CONFIG[r.status]
            return (
              <div
                key={r.id}
                className="bg-zinc-950 border border-white/10 rounded-2xl p-5 flex items-center justify-between gap-4 hover:border-white/15 transition-all"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-white text-sm">{r.userName}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${sc.color}`}>
                      {sc.label}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 truncate">{r.userEmail}</p>
                  <p className="text-xs text-zinc-500 mt-0.5 font-mono">
                    {r.plan} · ₹{r.amount} · {new Date(r.createdAt).toLocaleString("en-IN")}
                  </p>
                  {r.upiRef && <p className="text-[11px] text-zinc-600 mt-0.5 font-mono">UPI Ref: {r.upiRef}</p>}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => { setPreview(r); setNotes(r.adminNotes || "") }}
                    className="bg-white/10 hover:bg-white/20 text-white px-3 py-2 rounded-xl transition text-xs font-bold flex items-center gap-1.5"
                  >
                    <Eye size={13} /> Review
                  </button>
                  {r.status === "PENDING" && (
                    <>
                      <button
                        onClick={() => approve(r.id)}
                        disabled={actionLoading === r.id + "-approve"}
                        className="bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 text-green-400 px-3 py-2 rounded-xl transition text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {actionLoading === r.id + "-approve" ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />} Approve
                      </button>
                      <button
                        onClick={() => reject(r.id)}
                        disabled={actionLoading === r.id + "-reject"}
                        className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 px-3 py-2 rounded-xl transition text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {actionLoading === r.id + "-reject" ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />} Reject
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Screenshot Preview Modal ── */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-950 border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <div>
                <h3 className="font-bold text-white">{preview.userName}</h3>
                <p className="text-xs text-zinc-400">{preview.userEmail} · {preview.plan} · ₹{preview.amount}</p>
              </div>
              <button onClick={() => setPreview(null)} className="p-2 hover:bg-white/10 rounded-xl">
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Screenshot */}
              <div>
                <p className="text-[10px] text-zinc-500 uppercase font-bold mb-2">Payment Screenshot</p>
                <img
                  src={preview.screenshotB64}
                  alt="Payment screenshot"
                  className="w-full rounded-xl border border-white/10 max-h-80 object-contain bg-zinc-900"
                />
              </div>

              {preview.upiRef && (
                <div>
                  <p className="text-[10px] text-zinc-500 uppercase font-bold mb-1">UPI Ref</p>
                  <p className="font-mono text-sm text-white">{preview.upiRef}</p>
                </div>
              )}

              {/* Admin Notes */}
              <div>
                <label className="block text-[10px] text-zinc-500 uppercase font-bold mb-1.5">Admin Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add a note before approving/rejecting..."
                  rows={2}
                  className="w-full bg-black border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-700 focus:outline-none focus:border-red-500 resize-none"
                />
              </div>

              {preview.status === "PENDING" ? (
                <div className="flex gap-3">
                  <button
                    onClick={() => approve(preview.id)}
                    disabled={!!actionLoading}
                    className="flex-1 bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 text-green-400 font-bold py-3 rounded-xl transition text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {actionLoading === preview.id + "-approve" ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle size={15} />}
                    Approve
                  </button>
                  <button
                    onClick={() => reject(preview.id)}
                    disabled={!!actionLoading}
                    className="flex-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 font-bold py-3 rounded-xl transition text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {actionLoading === preview.id + "-reject" ? <Loader2 size={15} className="animate-spin" /> : <XCircle size={15} />}
                    Reject
                  </button>
                </div>
              ) : (
                <div className={`text-center py-3 rounded-xl font-bold text-sm ${STATUS_CONFIG[preview.status].color} border`}>
                  {STATUS_CONFIG[preview.status].label}
                  {preview.adminNotes && <p className="text-xs font-normal mt-1 opacity-70">{preview.adminNotes}</p>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
