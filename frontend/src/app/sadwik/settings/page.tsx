"use client"

import { useEffect, useState } from "react"
import { 
  FileText, Settings, Send, Lock, ShieldAlert
} from "lucide-react"
import { api } from "@/lib/api"

export default function AdminSettingsPage() {
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [securitySettings, setSecuritySettings] = useState({
    blockedIps: [] as string[],
    failedLogins: [] as any[],
    maintenance: {
      enabled: false,
      message: '',
      downtime: ''
    }
  })
  const [loading, setLoading] = useState(true)

  const [newBlockedIp, setNewBlockedIp] = useState("")
  const [maintenanceMsg, setMaintenanceMsg] = useState("")
  const [downtimeEst, setDowntimeEst] = useState("")
  const [notifMessage, setNotifMessage] = useState("")
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null)

  const loadData = async () => {
    try {
      const [logs, sec] = await Promise.all([
        api.getAdminAuditLogs(),
        api.getAdminSecuritySettings()
      ])
      setAuditLogs(logs)
      setSecuritySettings(sec)
      setMaintenanceMsg(sec.maintenance.message || "IPGENZ is undergoing scheduled system upgrades. We will be back online shortly.")
      setDowntimeEst(sec.maintenance.downtime || "2 Hours")
      setLoading(false)
    } catch (err) {
      console.error("Failed to load settings dataset:", err)
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()

    // Poll logs & settings every 8 seconds
    const interval = setInterval(() => {
      api.getAdminAuditLogs().then(setAuditLogs).catch(() => {})
      api.getAdminSecuritySettings().then(setSecuritySettings).catch(() => {})
    }, 8000)

    return () => clearInterval(interval)
  }, [])

  const handleBlockIp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newBlockedIp) return
    try {
      await api.blockAdminIp(newBlockedIp)
      setActionSuccessMessage(`Blocked IP Address ${newBlockedIp}.`)
      setNewBlockedIp("")
      loadData()
    } catch (err) {
      setActionSuccessMessage("Failed to submit firewall rule.")
    }
    setTimeout(() => setActionSuccessMessage(null), 4000)
  }

  const handleReleaseIp = async (ip: string) => {
    try {
      await api.unblockAdminIp(ip)
      setActionSuccessMessage(`Released block rule for ${ip}.`)
      loadData()
    } catch (err) {
      setActionSuccessMessage("Failed to release IP address.")
    }
    setTimeout(() => setActionSuccessMessage(null), 4000)
  }

  const toggleMaintenanceMode = async () => {
    const nextState = !securitySettings.maintenance.enabled
    try {
      await api.updateAdminMaintenance({
        enabled: nextState,
        message: maintenanceMsg,
        downtime: downtimeEst
      })
      setActionSuccessMessage(`Maintenance state toggled: ${nextState ? 'Active' : 'Disabled'}.`)
      loadData()
    } catch (err) {
      setActionSuccessMessage("Failed to toggle system maintenance window.")
    }
    setTimeout(() => setActionSuccessMessage(null), 4000)
  }

  const handleBroadcastNotification = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!notifMessage) return
    try {
      await api.createAdminAuditLog("BROADCAST_ALERT", notifMessage)
      setActionSuccessMessage("Global broadcast notification alert sent.")
      setNotifMessage("")
      loadData()
    } catch (err) {
      setActionSuccessMessage("Failed to send broadcast notification.")
    }
    setTimeout(() => setActionSuccessMessage(null), 4000)
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-slate-950 gap-4 text-white">
        <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-semibold tracking-wide text-zinc-400 font-mono">LOADING SETTINGS NODE...</span>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-6">
      
      {/* Toast alert message overlay */}
      {actionSuccessMessage && (
        <div className="bg-green-500/15 border border-green-500/35 text-green-400 px-4 py-2 rounded-xl text-xs font-bold animate-bounce w-fit">
          {actionSuccessMessage}
        </div>
      )}

      {/* Audit Logs list & maintenance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Database Audit logs */}
        <div className="bg-zinc-950 border border-white/10 rounded-2xl p-6 lg:col-span-2 space-y-4">
          <h3 className="font-extrabold text-base flex items-center gap-2 border-b border-white/5 pb-3">
            <FileText size={16} className="text-red-500" /> Persistent Audit Trail
          </h3>

          <div className="overflow-y-auto max-h-[320px] space-y-2 border border-white/5 p-2 rounded-xl bg-black/40">
            {auditLogs.length === 0 ? (
              <div className="text-center py-8 text-zinc-500 text-xs">No audit logs written to database.</div>
            ) : (
              auditLogs.map((log: any) => (
                <div key={log.id} className="flex justify-between items-start p-2.5 bg-zinc-900/60 border border-white/5 rounded-lg">
                  <div className="space-y-1">
                    <span className="text-[9px] font-black text-red-500 uppercase font-mono tracking-wider">
                      {log.action}
                    </span>
                    <p className="text-xs text-zinc-300 font-medium">Target: <strong className="font-mono text-zinc-400">{log.target}</strong></p>
                  </div>
                  <span className="text-[9px] text-zinc-500 font-mono">
                    {new Date(log.createdAt).toLocaleString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Maintenance Settings panel */}
        <div className="space-y-6">
          <div className="bg-zinc-950 border border-white/10 rounded-2xl p-6 space-y-4">
            <h3 className="font-extrabold text-base flex items-center gap-2 border-b border-white/5 pb-2">
              <Settings size={16} className="text-red-500" /> Maintenance Window
            </h3>

            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-zinc-200">System block mode</span>
                <span className="text-[9px] text-zinc-500 block">Blocks logins & streams</span>
              </div>
              
              <button 
                onClick={toggleMaintenanceMode}
                className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase transition-all ${
                  securitySettings.maintenance.enabled ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-750'
                }`}
              >
                {securitySettings.maintenance.enabled ? 'Active' : 'Disabled'}
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] text-zinc-400 block font-semibold">STATUS NOTICE</label>
                <input 
                  type="text" 
                  value={maintenanceMsg}
                  onChange={(e) => setMaintenanceMsg(e.target.value)}
                  className="w-full bg-black border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-zinc-700 focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-zinc-400 block font-semibold">ESTIMATED ESTIMATE</label>
                <input 
                  type="text" 
                  value={downtimeEst}
                  onChange={(e) => setDowntimeEst(e.target.value)}
                  className="w-full bg-black border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-zinc-700 focus:outline-none focus:border-red-500"
                />
              </div>
            </div>
          </div>

          {/* Broadcast notice */}
          <div className="bg-zinc-950 border border-white/10 rounded-2xl p-6 space-y-4">
            <h3 className="font-extrabold text-base flex items-center gap-2 border-b border-white/5 pb-2">
              <Send size={16} className="text-green-500" /> Notifications Center
            </h3>
            
            <form onSubmit={handleBroadcastNotification} className="space-y-3">
              <textarea
                required
                value={notifMessage}
                onChange={(e) => setNotifMessage(e.target.value)}
                placeholder="Type alert notification banner text..."
                rows={2}
                className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-700 focus:outline-none focus:border-red-500 resize-none font-medium"
              />
              
              <button 
                type="submit" 
                className="w-full bg-red-600 hover:bg-red-500 text-white text-xs font-black py-2.5 rounded-lg transition-colors flex items-center justify-center gap-1.5"
              >
                <Send size={12} /> Dispatch Broadcast Banner
              </button>
            </form>
          </div>
        </div>

      </div>

      {/* Blocked IP Ranges firewall & security logs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Firewall rules IP list */}
        <div className="bg-zinc-950 border border-white/10 rounded-2xl p-6 space-y-4">
          <h3 className="font-extrabold text-base flex items-center gap-2 border-b border-white/5 pb-3">
            <Lock size={16} className="text-red-500" /> Firewall Rule Center (Blocked IPs)
          </h3>

          <form onSubmit={handleBlockIp} className="flex gap-2">
            <input 
              type="text" 
              value={newBlockedIp}
              onChange={(e) => setNewBlockedIp(e.target.value)}
              placeholder="IP e.g. 192.168.1.99"
              required
              pattern="^([0-9]{1,3}\.){3}[0-9]{1,3}$"
              className="flex-1 bg-black border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-zinc-700 focus:outline-none focus:border-red-500 font-mono"
            />
            <button type="submit" className="bg-red-600/20 hover:bg-red-600 text-red-500 hover:text-white px-3 py-1.5 rounded-lg border border-red-500/20 text-xs font-bold transition-all">
              Add rule
            </button>
          </form>

          <div className="space-y-1.5 font-mono text-xs">
            {securitySettings.blockedIps.length === 0 ? (
              <div className="text-center py-4 text-zinc-500 text-xs">No active firewall rules.</div>
            ) : (
              securitySettings.blockedIps.map((ip, idx) => (
                <div key={idx} className="flex justify-between items-center bg-zinc-900 border border-white/5 p-2 rounded-lg text-zinc-400">
                  <span>{ip}</span>
                  <button 
                    onClick={() => handleReleaseIp(ip)}
                    className="text-red-400 hover:text-red-300 text-[10px] uppercase font-bold"
                  >
                    Release
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Login security threats logs */}
        <div className="bg-zinc-950 border border-white/10 rounded-2xl p-6 space-y-4">
          <h3 className="font-extrabold text-base flex items-center gap-2 border-b border-white/5 pb-3">
            <ShieldAlert size={16} className="text-yellow-500" /> Login security threats logs
          </h3>
          
          <div className="space-y-2 text-xs">
            {securitySettings.failedLogins.length === 0 ? (
              <div className="text-center py-4 text-zinc-500 text-xs font-mono">NO SECURITY LOGS REPORTED</div>
            ) : (
              securitySettings.failedLogins.map((item, idx) => (
                <div key={idx} className="bg-yellow-500/5 border border-yellow-500/10 p-3 rounded-xl space-y-1">
                  <div className="flex justify-between font-semibold">
                    <span className="text-zinc-200 truncate pr-2">{item.email}</span>
                    <span className="text-[9px] text-yellow-500 font-bold uppercase">{item.reason}</span>
                  </div>
                  <div className="flex justify-between text-[9px] text-zinc-500 font-mono">
                    <span>IP: {item.ip}</span>
                    <span>{new Date(item.time).toLocaleString()}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

    </div>
  )
}
