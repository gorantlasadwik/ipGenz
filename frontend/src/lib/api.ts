const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

function authHeaders(): HeadersInit {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export function isDemoUser() {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('isDemo') === 'true';
}

export const api = {
  // ─── AUTH ────────────────────────────────────────────────────────────────
  async register(email: string, password: string) {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async login(email: string, password: string) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error('Invalid credentials');
    return res.json();
  },

  // ─── PROFILES ───────────────────────────────────────────────────────────
  async getProfiles() {
    const res = await fetch(`${API_BASE}/profiles`, { headers: authHeaders() });
    if (res.status === 401) throw new Error('Unauthorized');
    if (!res.ok) return [];
    return res.json();
  },

  async createProfile(data: { name: string; profileType: string; pin?: string }) {
    const res = await fetch(`${API_BASE}/profiles`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Server Error ${res.status}: Failed to create profile`);
    }
    return res.json();
  },

  async updateProfile(id: string, data: { pin: string | null }) {
    const res = await fetch(`${API_BASE}/profiles/${id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to update profile');
    return res.json();
  },

  async verifyPin(profileId: string, pin: string) {
    const res = await fetch(`${API_BASE}/profiles/verify-pin`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ profileId, pin }),
    });
    if (!res.ok) throw new Error('Failed to verify PIN');
    return res.json();
  },

  // ─── PROVIDERS ──────────────────────────────────────────────────────────
  async getProviders() {
    const res = await fetch(`${API_BASE}/providers`, { headers: authHeaders() });
    if (!res.ok) return [];
    return res.json();
  },

  async createProvider(data: any) {
    const res = await fetch(`${API_BASE}/providers`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to create provider');
    return res.json();
  },

  async deleteProvider(id: string) {
    const res = await fetch(`${API_BASE}/providers/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    return res.json();
  },



  async stopSyncProvider(providerId: string) {
    const res = await fetch(`${API_BASE}/sync/${providerId}/stop`, {
      method: 'POST',
      headers: authHeaders(),
    });
    return res.json();
  },

  // ─── CONTENT ────────────────────────────────────────────────────────────
  async getMovies(categoryIdOrLimit?: string | number, limit?: number, q?: string) {
    const params = new URLSearchParams();
    if (typeof categoryIdOrLimit === 'string') {
      params.append('categoryId', categoryIdOrLimit);
    } else if (typeof categoryIdOrLimit === 'number') {
      params.append('limit', categoryIdOrLimit.toString());
    }
    if (limit) params.append('limit', limit.toString());
    if (q) params.append('q', q);
    const queryString = params.toString();
    const res = await fetch(`${API_BASE}/content/movies${queryString ? `?${queryString}` : ''}`, { headers: authHeaders() });
    if (!res.ok) return [];
    return res.json();
  },

  async getMovieCategories() {
    const res = await fetch(`${API_BASE}/content/movies/categories`, { headers: authHeaders() });
    if (!res.ok) return [];
    return res.json();
  },

  async getMovie(id: string) {
    const res = await fetch(`${API_BASE}/content/movies/${id}`, { headers: authHeaders() });
    if (!res.ok) return null;
    return res.json();
  },

  async getSeries(categoryIdOrLimit?: string | number, limit?: number, q?: string) {
    const params = new URLSearchParams();
    if (typeof categoryIdOrLimit === 'string') {
      params.append('categoryId', categoryIdOrLimit);
    } else if (typeof categoryIdOrLimit === 'number') {
      params.append('limit', categoryIdOrLimit.toString());
    }
    if (limit) params.append('limit', limit.toString());
    if (q) params.append('q', q);
    const queryString = params.toString();
    const res = await fetch(`${API_BASE}/content/series${queryString ? `?${queryString}` : ''}`, { headers: authHeaders() });
    if (!res.ok) return [];
    return res.json();
  },

  async getSeriesCategories() {
    const res = await fetch(`${API_BASE}/content/series/categories`, { headers: authHeaders() });
    if (!res.ok) return [];
    return res.json();
  },

  async getSeriesById(id: string) {
    const res = await fetch(`${API_BASE}/content/series/${id}`, { headers: authHeaders() });
    if (!res.ok) return null;
    return res.json();
  },

  async getLiveChannels(categoryId?: string, limit?: number, q?: string) {
    const params = new URLSearchParams();
    if (categoryId) params.append('categoryId', categoryId);
    if (limit) params.append('limit', limit.toString());
    if (q) params.append('q', q);
    const queryString = params.toString();
    const res = await fetch(`${API_BASE}/content/live/channels${queryString ? `?${queryString}` : ''}`, { headers: authHeaders() });
    if (!res.ok) return [];
    return res.json();
  },

  async getLiveChannel(id: string) {
    const res = await fetch(`${API_BASE}/content/live/channels/${id}`, { headers: authHeaders() });
    if (!res.ok) return null;
    return res.json();
  },

  async getLiveCategories() {
    const res = await fetch(`${API_BASE}/content/live/categories`, { headers: authHeaders() });
    if (!res.ok) return [];
    return res.json();
  },

  async search(query: string) {
    const res = await fetch(`${API_BASE}/content/search?q=${encodeURIComponent(query)}`, { headers: authHeaders() });
    if (!res.ok) return { movies: [], series: [], channels: [] };
    return res.json();
  },

  // ─── LIBRARY ────────────────────────────────────────────────────────────
  async getFavorites(profileId: string) {
    const res = await fetch(`${API_BASE}/library/favorites?profileId=${profileId}`, { headers: authHeaders() });
    if (!res.ok) return [];
    return res.json();
  },

  async addFavorite(profileId: string, contentType: string, contentId: string) {
    const res = await fetch(`${API_BASE}/library/favorites`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ profileId, contentType, contentId }),
    });
    return res.json();
  },

  async getWatchLater(profileId: string) {
    const res = await fetch(`${API_BASE}/library/watch-later?profileId=${profileId}`, { headers: authHeaders() });
    if (!res.ok) return [];
    return res.json();
  },

  async addWatchLater(profileId: string, contentType: string, contentId: string) {
    const res = await fetch(`${API_BASE}/library/watch-later`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ profileId, contentType, contentId }),
    });
    return res.json();
  },

  async getHistory(profileId: string) {
    const res = await fetch(`${API_BASE}/library/history?profileId=${profileId}`, { headers: authHeaders() });
    if (!res.ok) return [];
    return res.json();
  },

  async getPlaylists(profileId: string) {
    const res = await fetch(`${API_BASE}/library/playlists?profileId=${profileId}`, { headers: authHeaders() });
    if (!res.ok) return [];
    return res.json();
  },

  async createPlaylist(profileId: string, name: string) {
    const res = await fetch(`${API_BASE}/library/playlists`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ profileId, name }),
    });
    return res.json();
  },

  async getContinueWatching(profileId: string) {
    const res = await fetch(`${API_BASE}/library/continue-watching?profileId=${profileId}`, { headers: authHeaders() });
    if (!res.ok) return [];
    return res.json();
  },

  async upsertContinueWatching(data: {
    profileId: string;
    contentType: 'MOVIE' | 'SERIES' | 'EPISODE' | 'CHANNEL';
    contentId: string;
    positionSeconds: number;
    durationSeconds?: number;
  }) {
    const res = await fetch(`${API_BASE}/library/continue-watching`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    return res.json();
  },

  // ─── ADMIN & OBSERVABILITY ──────────────────────────────────────────────
  async getAdminMetrics() {
    const res = await fetch(`${API_BASE}/sadwik/metrics`);
    if (!res.ok) throw new Error('Failed to fetch admin metrics');
    return res.json();
  },

  async triggerAdminCodecScan() {
    const res = await fetch(`${API_BASE}/sadwik/trigger-scan`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to trigger codec scan');
    return res.json();
  },

  async getAdminUsers() {
    const res = await fetch(`${API_BASE}/sadwik/users`);
    if (!res.ok) return [];
    return res.json();
  },

  async banAdminUser(id: string) {
    const res = await fetch(`${API_BASE}/sadwik/users/${id}/ban`, {
      method: 'POST',
      headers: authHeaders(),
    });
    return res.json();
  },

  async resetAdminUserPassword(id: string, pass: string) {
    const res = await fetch(`${API_BASE}/sadwik/users/${id}/reset-password`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ password: pass }),
    });
    return res.json();
  },

  async deleteAdminUser(id: string) {
    const res = await fetch(`${API_BASE}/sadwik/users/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    return res.json();
  },

  async getAdminSessions() {
    const res = await fetch(`${API_BASE}/sadwik/sessions`);
    if (!res.ok) return [];
    return res.json();
  },

  async deleteAdminSession(id: string) {
    const res = await fetch(`${API_BASE}/sadwik/sessions/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    return res.json();
  },

  async getAdminAuditLogs() {
    const res = await fetch(`${API_BASE}/sadwik/audit-logs`);
    if (!res.ok) return [];
    return res.json();
  },

  async createAdminAuditLog(action: string, target: string) {
    const res = await fetch(`${API_BASE}/sadwik/audit-logs`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ action, target }),
    });
    return res.json();
  },

  async getAdminSystemMetrics() {
    const res = await fetch(`${API_BASE}/sadwik/system-metrics`);
    if (!res.ok) return { cpuLoad: 0, ramUsage: 0, storageUsage: 0, rpm: 0, latency: 0, uptime: 0 };
    return res.json();
  },

  async getAdminRealAnalytics() {
    const res = await fetch(`${API_BASE}/sadwik/real-analytics`);
    if (!res.ok) return { searchesToday: 0, topSearches: [], failedSearches: [], topMovies: [], topSeries: [] };
    return res.json();
  },

  async getAdminLiveWatchers() {
    const res = await fetch(`${API_BASE}/sadwik/live-watchers`);
    if (!res.ok) return [];
    return res.json();
  },

  async getAdminSecuritySettings() {
    const res = await fetch(`${API_BASE}/sadwik/security-settings`);
    if (!res.ok) return { blockedIps: [], failedLogins: [], maintenance: { enabled: false, message: '', downtime: '' } };
    return res.json();
  },

  async blockAdminIp(ip: string) {
    const res = await fetch(`${API_BASE}/sadwik/block-ip`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ ip }),
    });
    return res.json();
  },

  async unblockAdminIp(ip: string) {
    const res = await fetch(`${API_BASE}/sadwik/block-ip/${ip}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    return res.json();
  },

  async updateAdminMaintenance(data: { enabled: boolean; message?: string; downtime?: string }) {
    const res = await fetch(`${API_BASE}/sadwik/maintenance`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    return res.json();
  },

  // ─── STREAM URLS & INFO ──────────────────────────────────────────────────
  streamLiveUrl: (channelId: string) => `${API_BASE}/stream/live/${channelId}?token=${getToken()}`,
  streamMovieUrl: (movieId: string, audioTrack?: string, start?: number) => {
    let url = `${API_BASE}/stream/movie/${movieId}?token=${getToken()}`;
    if (audioTrack !== undefined && audioTrack !== '') url += `&audioTrack=${audioTrack}`;
    if (start !== undefined) url += `&start=${start}`;
    return url;
  },
  streamEpisodeUrl: (episodeId: string, audioTrack?: string, start?: number) => {
    let url = `${API_BASE}/stream/episode/${episodeId}?token=${getToken()}`;
    if (audioTrack !== undefined && audioTrack !== '') url += `&audioTrack=${audioTrack}`;
    if (start !== undefined) url += `&start=${start}`;
    return url;
  },

  async getLiveStreamInfo(channelId: string) {
    const res = await fetch(`${API_BASE}/stream/live/${channelId}/info`, { headers: authHeaders() });
    if (!res.ok) return { allAudioStreams: [] };
    return res.json();
  },

  async getMovieStreamInfo(movieId: string) {
    const res = await fetch(`${API_BASE}/stream/movie/${movieId}/info`, { headers: authHeaders() });
    if (!res.ok) return { allAudioStreams: [] };
    return res.json();
  },

  async getEpisodeStreamInfo(episodeId: string) {
    const res = await fetch(`${API_BASE}/stream/episode/${episodeId}/info`, { headers: authHeaders() });
    if (!res.ok) return { allAudioStreams: [] };
    return res.json();
  },
  
  // ─── DEMO MODE ───────────────────────────────────────────────────────────
  async demoLogin() {
    const res = await fetch(`${API_BASE}/auth/demo-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      throw new Error('Failed to login to demo mode');
    }
    return res.json();
  },

  async getDemoProvider() {
    const res = await fetch(`${API_BASE}/sadwik/demo-provider`, { headers: authHeaders() });
    if (!res.ok) return null;
    return res.json();
  },

  async setDemoProvider(data: any) {
    const res = await fetch(`${API_BASE}/sadwik/demo-provider`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to update demo provider');
    return res.json();
  },

  // ─── SYNC ────────────────────────────────────────────────────────────────
  async syncProvider(providerId: string) {
    const res = await fetch(`${API_BASE}/sync/${providerId}`, {
      method: 'POST',
      headers: authHeaders(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => 'no text');
      throw new Error(`Failed to trigger sync: ${res.status} ${res.statusText} - ${text}`);
    }
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  },

  async getSyncProgress(providerId: string) {
    const res = await fetch(`${API_BASE}/sync/${providerId}/progress`, {
      headers: authHeaders(),
    });
    if (!res.ok) return null;
    return res.json();
  },

  // ─── DOWNLOAD URLS ──────────────────────────────────────────────────────
  downloadMovieUrl: (movieId: string) => `${API_BASE}/stream/download/movie/${movieId}?token=${getToken()}`,
  downloadEpisodeUrl: (episodeId: string) => `${API_BASE}/stream/download/episode/${episodeId}?token=${getToken()}`,
};
