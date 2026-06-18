"use client"

import { useState } from "react"
import { Settings, User, Bell, Shield, Database, Trash2 } from "lucide-react"
import { api } from "@/lib/api"

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("account")
  const currentProfileId = typeof window !== 'undefined' ? localStorage.getItem("profileId") : null;

  return (
    <div className="w-full h-full overflow-y-auto px-12 py-10">
      <div className="mb-10">
        <h1 className="text-4xl font-bold tracking-tight text-white mb-2">Settings</h1>
        <p className="text-secondary-foreground text-lg">Manage your account and preferences.</p>
      </div>

      <div className="flex gap-8">
        {/* Settings Sidebar */}
        <div className="w-64 flex flex-col gap-2">
          <button onClick={() => setActiveTab("account")} className={`flex items-center gap-3 px-4 py-3 rounded-lg font-bold transition-colors ${activeTab === "account" ? "bg-primary text-white" : "text-secondary-foreground hover:bg-white/5 hover:text-white"}`}>
            <User size={20} /> Account
          </button>
          <button onClick={() => setActiveTab("notifications")} className={`flex items-center gap-3 px-4 py-3 rounded-lg font-bold transition-colors ${activeTab === "notifications" ? "bg-primary text-white" : "text-secondary-foreground hover:bg-white/5 hover:text-white"}`}>
            <Bell size={20} /> Notifications
          </button>
          <button onClick={() => setActiveTab("privacy")} className={`flex items-center gap-3 px-4 py-3 rounded-lg font-bold transition-colors ${activeTab === "privacy" ? "bg-primary text-white" : "text-secondary-foreground hover:bg-white/5 hover:text-white"}`}>
            <Shield size={20} /> Privacy & Safety
          </button>
          <button onClick={() => setActiveTab("data")} className={`flex items-center gap-3 px-4 py-3 rounded-lg font-bold transition-colors ${activeTab === "data" ? "bg-primary text-white" : "text-secondary-foreground hover:bg-white/5 hover:text-white"}`}>
            <Database size={20} /> Data & Storage
          </button>
        </div>

        {/* Settings Content */}
        <div className="flex-1 max-w-2xl bg-surface border border-white/10 rounded-xl p-8">
          {activeTab === "account" && (
            <div className="space-y-8">
              <h2 className="text-2xl font-bold border-b border-white/10 pb-4">Account Settings</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">Current Profile</label>
                  <input type="text" disabled value={currentProfileId || ""} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white/50 cursor-not-allowed" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">Email Address</label>
                  <input type="email" disabled value="user@example.com" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white/50 cursor-not-allowed" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-1">Password</label>
                  <button className="bg-white/5 hover:bg-white/10 text-white px-4 py-3 rounded-lg font-bold transition w-full text-left">
                    Change Password...
                  </button>
                </div>
              </div>

              <div className="pt-8 border-t border-white/10">
                <h3 className="text-xl font-bold text-red-500 mb-4">Danger Zone</h3>
                <button className="bg-red-500/10 hover:bg-red-500/20 text-red-500 px-6 py-3 rounded-lg font-bold transition">
                  Delete Account
                </button>
              </div>
            </div>
          )}

          {activeTab === "data" && (
            <div className="space-y-8">
              <h2 className="text-2xl font-bold border-b border-white/10 pb-4">Data & Storage</h2>
              
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">Clear Watch History</h3>
                    <p className="text-sm text-secondary-foreground">Remove all items from your watch history across all devices.</p>
                  </div>
                  <button 
                    onClick={async () => {
                      if (!currentProfileId) return;
                      if (confirm("Are you sure you want to clear your watch history? This cannot be undone.")) {
                        try {
                          await api.clearWatchHistory(currentProfileId);
                          alert("Watch history cleared successfully!");
                        } catch (e) {
                          alert("Failed to clear watch history.");
                        }
                      }
                    }}
                    className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 px-4 py-2 rounded-lg font-bold transition"
                  >
                    <Trash2 size={18} /> Clear
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "notifications" && (
            <div className="space-y-8">
              <h2 className="text-2xl font-bold border-b border-white/10 pb-4">Notification Preferences</h2>
              
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">Push Notifications</h3>
                    <p className="text-sm text-secondary-foreground">Receive push notifications from admins.</p>
                  </div>
                  <div className="w-12 h-6 bg-primary rounded-full relative cursor-pointer">
                    <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full transition-transform"></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "privacy" && (
            <div className="space-y-8">
              <h2 className="text-2xl font-bold border-b border-white/10 pb-4">Privacy & Safety</h2>
              <div className="py-10 text-center text-secondary-foreground">
                Privacy settings (e.g. Profile PIN locks) will be available in a future update.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
