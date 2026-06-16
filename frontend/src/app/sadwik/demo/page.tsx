'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Play, Settings, Save, Server, Link as LinkIcon, KeyRound, User } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function DemoAdminPage() {
  const [provider, setProvider] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncProgress, setSyncProgress] = useState<any>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [form, setForm] = useState({
    providerName: '',
    providerType: 'XTREAM',
    serverUrl: '',
    username: '',
    password: '',
    playlistUrl: ''
  });

  useEffect(() => {
    loadDemoProvider();
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isSyncing && provider?.id) {
      interval = setInterval(async () => {
        try {
          const progress = await api.getSyncProgress(provider.id);
          setSyncProgress(progress);
          if (progress?.status === 'COMPLETED' || progress?.status === 'ERROR') {
            setIsSyncing(false);
            loadDemoProvider(); // Refresh provider status
          }
        } catch (e) {
          console.error("Failed to fetch sync progress", e);
        }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [isSyncing, provider?.id]);

  const loadDemoProvider = async () => {
    try {
      const data = await api.getDemoProvider();
      if (data) {
        setProvider(data);
        if (data.status === 'SYNCING') {
          setIsSyncing(true);
        }
        setForm({
          providerName: data.providerName || '',
          providerType: data.providerType || 'XTREAM',
          serverUrl: data.serverUrl || '',
          username: data.username || '',
          password: '', // Don't pre-fill password
          playlistUrl: data.playlistUrl || ''
        });
      }
    } catch (err) {
      console.error("Failed to load demo provider", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data = await api.setDemoProvider(form);
      setProvider(data);
      alert('Demo provider updated successfully! Ensure you trigger a sync if this is a new provider.');
    } catch (err) {
      console.error(err);
      alert('Failed to update demo provider.');
    } finally {
      setSaving(false);
    }
  };

  const triggerGlobalSync = async () => {
    if (!provider?.id) return;
    try {
      await api.syncProvider(provider.id);
      setIsSyncing(true);
    } catch (err) {
      console.error("Failed to trigger sync", err);
      alert("Failed to start global sync");
    }
  };

  if (loading) return <div className="p-10 text-white">Loading demo config...</div>;

  return (
    <div className="p-10 max-w-4xl mx-auto text-white">
      <div className="mb-8">
        <h1 className="text-3xl font-black mb-2 flex items-center gap-3">
          <Play className="text-red-500" />
          Public Demo Configuration
        </h1>
        <p className="text-zinc-400">
          Configure the IPTV provider that will be used for the public "Experience the App" demo.
          The credentials entered here will be hidden from public users, but they will be able to browse and play the content.
        </p>
      </div>

      {provider && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-bold text-lg text-white mb-1">Current Demo Provider</h2>
              <div className="text-zinc-400 text-sm flex items-center gap-4">
                <span>{provider.providerName}</span>
                <span className="px-2 py-0.5 rounded text-xs bg-white/10 border border-white/20">{provider.providerType}</span>
                <span className="flex items-center gap-1 text-green-400">
                  <div className={`w-2 h-2 rounded-full ${provider.status === 'SYNCING' ? 'bg-yellow-400' : 'bg-green-400'} animate-pulse`} />
                  {provider.status}
                </span>
              </div>
            </div>
            <button 
              onClick={triggerGlobalSync} 
              disabled={isSyncing}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/10 rounded-lg text-sm font-medium transition disabled:opacity-50"
            >
              {isSyncing ? 'Syncing...' : 'Trigger Global Sync'}
            </button>
          </div>
          
          {isSyncing && syncProgress && (
            <div className="mt-4 p-4 bg-black/50 rounded-lg border border-white/10">
              <div className="flex justify-between text-sm mb-2 text-zinc-400">
                <span>Sync Progress ({syncProgress.totalProcessed} / {syncProgress.totalItems || '?'})</span>
                <span>{syncProgress.currentStage}</span>
              </div>
              <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-red-500 h-full transition-all duration-500"
                  style={{ width: `${Math.min(100, ((syncProgress.totalProcessed || 0) / (syncProgress.totalItems || 1)) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="bg-[#0B0B0C] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-white/10 bg-white/5 flex items-center gap-2">
          <Settings className="w-5 h-5 text-red-500" />
          <h2 className="font-bold">Provider Settings</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-400">Demo Provider Name</label>
              <input 
                type="text" 
                required
                value={form.providerName}
                onChange={e => setForm({...form, providerName: e.target.value})}
                className="w-full bg-black border border-white/10 rounded-lg px-4 py-3 text-white focus:border-red-500 focus:outline-none transition" 
                placeholder="e.g. Public Demo Server"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-400">Provider Type</label>
              <select 
                value={form.providerType}
                onChange={e => setForm({...form, providerType: e.target.value})}
                className="w-full bg-black border border-white/10 rounded-lg px-4 py-3 text-white focus:border-red-500 focus:outline-none transition appearance-none"
              >
                <option value="XTREAM">Xtream Codes</option>
                <option value="M3U">M3U Playlist</option>
                <option value="STALKER">Stalker Portal</option>
              </select>
            </div>
          </div>

          <div className="border-t border-white/5 pt-6 space-y-6">
            {form.providerType === 'XTREAM' || form.providerType === 'STALKER' ? (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                    <Server className="w-4 h-4" /> Server URL
                  </label>
                  <input 
                    type="url" 
                    required
                    value={form.serverUrl}
                    onChange={e => setForm({...form, serverUrl: e.target.value})}
                    className="w-full bg-black border border-white/10 rounded-lg px-4 py-3 text-white focus:border-red-500 focus:outline-none" 
                    placeholder="http://example.com:8080"
                  />
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                      <User className="w-4 h-4" /> Username
                    </label>
                    <input 
                      type="text" 
                      required
                      value={form.username}
                      onChange={e => setForm({...form, username: e.target.value})}
                      className="w-full bg-black border border-white/10 rounded-lg px-4 py-3 text-white focus:border-red-500 focus:outline-none" 
                      placeholder="Username"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                      <KeyRound className="w-4 h-4" /> Password
                    </label>
                    <input 
                      type="password" 
                      required={!provider}
                      value={form.password}
                      onChange={e => setForm({...form, password: e.target.value})}
                      className="w-full bg-black border border-white/10 rounded-lg px-4 py-3 text-white focus:border-red-500 focus:outline-none" 
                      placeholder={provider ? "Leave blank to keep existing" : "Password"}
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                  <LinkIcon className="w-4 h-4" /> M3U Playlist URL
                </label>
                <input 
                  type="url" 
                  required
                  value={form.playlistUrl}
                  onChange={e => setForm({...form, playlistUrl: e.target.value})}
                  className="w-full bg-black border border-white/10 rounded-lg px-4 py-3 text-white focus:border-red-500 focus:outline-none" 
                  placeholder="http://example.com/get.php?username=..."
                />
              </div>
            )}
          </div>

          <div className="pt-4 flex justify-end">
            <button 
              type="submit" 
              disabled={saving}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition shadow-lg shadow-red-900/20 flex items-center gap-2 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Demo Configuration'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
