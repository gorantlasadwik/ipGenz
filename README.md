<div align="center">

# 🚀 ipGenz

### The Next Generation IPTV Platform

A modern, Netflix-inspired IPTV platform that unifies Live TV, Movies, and Series into a premium streaming experience. Built for scale, extreme performance, and a world-class user experience.

<div style="display: flex; gap: 10px; justify-content: center; align-items: center; margin-top: 20px;">
  <img src="https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white" alt="Next.js" />
  <img src="https://img.shields.io/badge/NestJS-E0234E?style=for-the-badge&logo=nestjs&logoColor=white" alt="NestJS" />
  <img src="https://img.shields.io/badge/Prisma-3982CE?style=for-the-badge&logo=Prisma&logoColor=white" alt="Prisma" />
  <img src="https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
</div>

<div style="display: flex; gap: 10px; justify-content: center; align-items: center; margin-top: 10px;">
  <a href="https://github.com/gorantlasadwik/ipGenz">
    <img src="https://img.shields.io/badge/GitHub-100000?style=for-the-badge&logo=github&logoColor=white" alt="GitHub" />
  </a>
  <a href="https://www.linkedin.com/in/sadwik-gorantla-042362282/">
    <img src="https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white" alt="LinkedIn" />
  </a>
</div>

</div>

---

## 📸 Screenshots

| Cinematic Home Dashboard | Landing Page |
|---|---|
| <img src="docs/images/dashboard.png" width="100%" /> | <img src="docs/images/landing-v3.png" width="100%" /> |
| **Movies Library Catalog** | **Movie Details & Metadata** |
| <img src="docs/images/movies-v3.png" width="100%" /> | <img src="docs/images/movie-description-page.png" width="100%" /> |
| **High-Performance Movie Player** | **Advanced Alternate Video Player** |
| <img src="docs/images/movie-player-v3.png" width="100%" /> | <img src="docs/images/movie-player-another-example.png" width="100%" /> |
| **Live TV Category Guide** | **Live TV Player with Embedded EPG** |
| <img src="docs/images/live-tv-v3.png" width="100%" /> | <img src="docs/images/live-tv-screaming-player-v3.png" width="100%" /> |
| **Series & Boxsets Navigator** | **Personal Library & Favorites** |
| <img src="docs/images/series-v3.png" width="100%" /> | <img src="docs/images/library-page.png" width="100%" /> |
| **IPTV Provider Integration** | **Real-Time Playlist Synchronization** |
| <img src="docs/images/provider-page-v3.png" width="100%" /> | <img src="docs/images/playlist-sync-v3.png" width="100%" /> |

---

## ✨ Vision

ipGenz is a completely unified IPTV ecosystem that allows users to aggregate multiple IPTV subscriptions into a single, high-performance web interface. By preserving complex folder/category structures and enriching raw streams with rich, Netflix-grade metadata, ipGenz provides a premium cinematic streaming alternative to clunky native applications.

Users can aggregate content from:
* **Xtream Codes API:** Native communication with IPTV servers.
* **M3U / M3U8 Playlists:** Automatic local/remote list ingestion.
* **Custom Live Feeds:** Direct stream link embedding.

---

## 🎯 Key Features & Capabilities

### 📺 Cinematic Live TV Experience
* **Sub-Second Channel Zapping:** Highly optimized buffering engine that ensures live channels start playing in less than 500ms.
* **Electronic Program Guide (EPG) Engine:** Fully parses XMLTV program guides and correlates schedules with live streams in real time.
* **Dynamic Stream Info Panel:** Displays current channel resolution, frame rate, and bandwidth directly in the player overlay.
* **Multi-View Grid Layout:** Run up to 4 live sports channels concurrently in a split-screen arrangement.
* **Intelligent Recents & Favorites:** Access your most-watched sports, news, and entertainment feeds instantly from the navigation header.

### 🎬 Netflix-Grade Movies & VOD
* **Immersive Hero Banners:** Edge-to-edge cinematic previews with high-resolution backdrops, plots, genres, and cast details.
* **Continue Watching:** Tracks your exact playing coordinate to the millisecond, letting you resume streaming seamlessly.
* **Playback Enhancements:** Customized HTML5 player controls including picture-in-picture, custom aspect-ratio scaling (16:9, 4:3, stretch), playback speed variables (0.5x to 2x), and smart volume boosting.
* **Personalized Watch Later Lists:** Curate your private library across single or multiple providers.

### 📚 Detailed Series & Season Navigators
* **Boxset Consolidation:** Collapses hundreds of episodes into collapsible, clean season folders.
* **Episode Progress Markers:** Highlights watched episodes and tracks mid-episode timestamps.
* **Auto-Play Next Episode:** Automatically pre-buffers and cues the next episode for uninterrupted binge-watching.

### 👤 Profile Lock & Kid-Safe Restrictions
* **Multi-Profile Accounts:** Support for up to 5 family member profiles under a single log-in.
* **Symmetric Profile PIN Protection:** Secure your private profiles with a 4-digit PIN to prevent access by other family members.
* **Kid Profiles:** Restricts content access based on mature ratings and filters categories automatically.
* **Isolated Datasets:** Watch history, bookmarks, continue watching coordinates, and search histories are strictly isolated per profile.

### 🔍 Search Engine
* **Instant In-Memory Indexing:** Search through thousands of movies, series, episodes, and live channels simultaneously.
* **Fuzzy Match Engine:** Retrieves correct streams even when spelling contains minor typos.

---

## 🏗 Ingestion, Metadata & Playback Architecture

### 📥 High-Throughput Ingestion Engine
Ingesting massive IPTV playlists containing up to 100k+ streams is handled asynchronously:
* **Chunked Pipeline Syncing:** Batches database operations to prevent CPU bottlenecks on the backend.
* **Delta Synchronization:** Compares existing channel/VOD IDs to only fetch, write, and delete updated items.
* **Background Worker Processing:** Syncs run asynchronously in the background. The user sees a real-time progress bar detailing exactly how many items have been processed.
* **Database Cleanup Tasks:** Automatically removes orphaned categories and streams when a provider is detached or updated.

### 🏷 TMDB Metadata Enrichment
* **Automated Query Builder:** Scrubs raw stream titles (e.g. removing release quality tags, file extensions) to construct optimal search queries.
* **Fuzzy Title Matching:** Queries the TMDB database for matching movies/series and validates matches using release year comparisons.
* **Metadata & Artwork Caching:** Downloads and serves high-resolution artwork through an optimized caching layer to minimize external API rate-limiting issues.

### 🎞 Supported Stream Formats & Codecs
ipGenz leverages a hybrid player stack to handle standard web streams and raw broadcasting formats directly in browser contexts.

#### The Player Stack
<div style="display: flex; gap: 10px; margin-bottom: 10px;">
  <img src="https://img.shields.io/badge/Video.js-v8.0-blue?style=flat-square" alt="Video.js" />
  <img src="https://img.shields.io/badge/Shaka_Player-v4.3-green?style=flat-square" alt="Shaka Player" />
  <img src="https://img.shields.io/badge/Mpegts.js-Active-orange?style=flat-square" alt="Mpegts.js" />
</div>

* **Shaka Player:** Used for VOD playback (Movies & Series). Supports adaptive bitrate streaming over **DASH (.mpd)** and **HLS (.m3u8)**.
* **Mpegts.js:** Demuxes raw **MPEG-TS (.ts)** live television streams on the fly into native HTML5 video tags, eliminating the need for CPU-intensive server-side transcoding.
* **Audio Codecs:** Supports AAC, MP3, AC3/EAC3 (Dolby Digital/Dolby Digital Plus via browser hardware passthrough), FLAC, and Vorbis.
* **Subtitles:** Renders native WebVTT captions and handles multi-language subtitle track selection.

---

## 🔒 Security & Data Isolation

### Multi-Tenant Architecture
* **Strict SQL Separation:** Every account's data (Providers, Playlists, Profiles, Watch History) is separated at the database level.
* **Route Protection:** All API endpoints are secured with JSON Web Tokens (JWT) using passport strategy logic.

### Demo User Mode
* **Write Lockdowns:** Prevents mutations (e.g. deleting channels, modifying providers) via database interception.
* **UI Controls:** Hides sensitive configuration options, password forms, and provider setup tabs automatically.

### Symmetric Credential Protection
* **AES-256 Encryption:** EncryptsXtream Codes server passwords and M3U URLs before database storage.
* **Secure Environment Configuration:** System environment parameters reside strictly in isolated servers.

---



## 🎨 UI Philosophy

Inspired by the industry titans: **Netflix, Apple TV, Disney+, and Plex**.

* **Glassmorphism:** Widespread use of blurred backgrounds (`backdrop-blur`) and semi-transparent layers to create a premium depth-of-field effect.
* **Cinematic Experience:** Large, edge-to-edge backdrop images dynamically fade into the content grid.
* **Micro-Animations:** Powered by `framer-motion`, elements gracefully slide and fade into view, completely removing jarring page loads.
* **Responsive Layouts:** Perfectly scales from a massive 4K Smart TV down to a mobile phone.

---

## 🛠 Technology Stack

### Frontend Application
* <img src="https://img.shields.io/badge/-Next.js-black?style=flat-square&logo=next.js&logoColor=white" /> **Framework:** Next.js 15 (App Router for maximum server-side rendering performance).
* <img src="https://img.shields.io/badge/-React-61DAFB?style=flat-square&logo=react&logoColor=black" /> **Library:** React 19.
* <img src="https://img.shields.io/badge/-TailwindCSS-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" /> **Styling:** TailwindCSS with complex custom configuration.
* <img src="https://img.shields.io/badge/-shadcn%2Fui-000000?style=flat-square&logo=shadcnui&logoColor=white" /> **Components:** Custom-built accessible components inspired by `shadcn/ui`.
* <img src="https://img.shields.io/badge/-Lucide-FF4785?style=flat-square" /> **Icons:** `lucide-react` for crisp, scalable vector graphics.

### Backend Application
* <img src="https://img.shields.io/badge/-NestJS-E0234E?style=flat-square&logo=nestjs&logoColor=white" /> **Framework:** NestJS (Node.js). Extremely modular, highly scalable enterprise framework.
* <img src="https://img.shields.io/badge/-PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white" /> **Database:** PostgreSQL (Hosted on Neon.tech/Supabase).
* <img src="https://img.shields.io/badge/-Prisma-2D3748?style=flat-square&logo=prisma&logoColor=white" /> **ORM:** Prisma Client for type-safe database queries.
* <img src="https://img.shields.io/badge/-JWT-000000?style=flat-square&logo=jsonwebtokens&logoColor=white" /> **Authentication:** JWT (JSON Web Tokens) with Passport.js.
* <img src="https://img.shields.io/badge/-Axios-5A29E4?style=flat-square&logo=axios&logoColor=white" /> **HTTP Client:** Axios for lightning-fast provider syncing.

### Infrastructure & Deployment
* <img src="https://img.shields.io/badge/-Vercel-000000?style=flat-square&logo=vercel&logoColor=white" /> **Vercel:** Hosts the Next.js frontend, taking advantage of Edge caching and CDN global distribution.
* <img src="https://img.shields.io/badge/-Render-46E3B7?style=flat-square&logo=render&logoColor=white" /> **Render / Railway:** Hosts the Next.js backend, providing robust long-running processes for provider synchronization.

---

## 🚀 Roadmap

### Phase 1 (Completed) ✅
* User Authentication & JWT Security.
* Profile Management with PIN Locking.
* Xtream Codes API Provider Sync.
* Next.js Frontend with Netflix-style UI.
* Live TV, Movies, and Series playback via Shaka Player.
* Global search & TMDB Metadata integration.
* Demo User Lockdown capabilities.

### Phase 2 (In Progress) ⏳
* **M3U File Parsing Engine:** Robust support for massive local/remote `.m3u` files.
* **EPG (XMLTV) Parsing:** Advanced electronic program guide rendering.
* **Downloads:** Offline caching of movies and episodes.
* **Advanced Player Features:** Multi-audio track selection and embedded subtitle toggling via the UI.

### Phase 3 (Planned) 📅
* Native Android TV / Google TV APK via React Native.
* Multi-View support for sports events (4x4 grid).
* Recommendation Engine (AI-based watch suggestions).
* Advanced stream health probing (FFmpeg/FFprobe backend integration).

---

## 💻 Local Development Setup

### Prerequisites
* Node.js v18+
* PostgreSQL

### 1. Clone the Repository
```bash
git clone https://github.com/gorantlasadwik/ipGenz.git
cd ipGenz
```

### 2. Configure Backend
```bash
cd backend
npm install
```
Create `backend/.env`:
```env
DATABASE_URL="postgresql://user:password@localhost:5432/ipgenz"
JWT_SECRET="your-super-secret-jwt-key"
PORT=3001
```
```bash
npx prisma generate
npx prisma db push
npm run start:dev
```

### 3. Configure Frontend
Open a new terminal:
```bash
cd frontend
npm install
```
Create `frontend/.env.local`:
```env
NEXT_PUBLIC_API_URL="http://localhost:3001"
```
```bash
npm run dev
```

The application will now be running on `http://localhost:3000`.

---

## 💖 Support the Project

Developing and maintaining ipGenz takes a significant amount of time and effort. If this project helped you, please consider supporting its ongoing development! 

Your support directly helps in adding new features, maintaining the codebase, and keeping the platform fast and modern.

### Support via UPI (India)

**UPI ID:** `sadwik.india@oksbi`

<img src="https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=upi%3A%2F%2Fpay%3Fpa%3Dsadwik.india%40oksbi%26pn%3DSadwik" alt="UPI QR Code" width="250" height="250" />

*Scan the QR code above with Google Pay, PhonePe, Paytm, or any UPI app to donate!*

---

<div align="center">
  <p>Built with ❤️ by the IPTV community.</p>
  <p><strong>ipGenz — The Next Generation IPTV Platform</strong></p>
</div>
