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

</div>

---

## 📸 Screenshots

<div align="center">
  <img src="docs/images/landing.png" alt="Landing Page" width="800"/>
  <br/><br/>
  <img src="docs/images/live-tv.png" alt="Live TV" width="800"/>
  <br/><br/>
  <img src="docs/images/movies.png" alt="Movies" width="800"/>
  <br/><br/>
  <img src="docs/images/series.png" alt="Series" width="800"/>
  <br/><br/>
  <img src="docs/images/providers.png" alt="Providers" width="800"/>
</div>

---

## ✨ Vision

ipGenz is not just another standard IPTV player. 

It is a completely unified IPTV ecosystem that allows users to connect to multiple IPTV providers while effortlessly preserving provider folder structures. Delivering content through a premium, cinematic streaming interface, ipGenz aims to replace native cable boxes with a deeply personalized, Netflix-grade application.

Users can aggregate content from:
* Xtream Codes API
* Standard M3U / M3U8 Playlists
* MAG Portals (Planned)
* Custom Feeds

---

## 🎯 Key Features & Capabilities

### 📺 Live TV Architecture
* **Live Channel Streaming:** Instantly zaps between live channels using an optimized player architecture.
* **EPG Integration:** Fully supports Electronic Program Guides to show what's currently airing and what's next.
* **Channel Categories:** Seamless categorization synchronized directly from your provider.
* **Multi-View Setup:** Allows playback of multiple channels simultaneously.
* **Favorites & Recents:** Never lose your most-watched sports or news channels.
* **Global Search:** Find specific channels across hundreds of thousands of entries in milliseconds.

### 🎬 Movies (VOD)
* **Netflix-Style UI:** Beautiful hero banners, backdrops, and meticulously crafted typography.
* **Automated TMDB Enrichment:** Automatically fetches missing high-resolution posters, backdrops, and plots from The Movie Database (TMDB).
* **Continue Watching:** Stop a movie and resume it from the exact second you left off on any device.
* **Watch Later & Favorites:** Add movies to your personal library.
* **Playback Controls:** Fully custom video player interface with speed controls, picture-in-picture, and aspect ratio modifications.

### 📚 Series & Boxsets
* **Season & Episode Management:** Beautifully groups hundreds of episodes into collapsible season lists.
* **Episode Tracking:** Remembers exactly which episodes you've watched.
* **Auto-Play Next:** Seamlessly transitions to the next episode for uninterrupted binge-watching.
* **Resume Playback:** Memorizes your timestamp for every single episode independently.

### 👤 Profile Management & Security
* **Multiple Profiles:** Create unique profiles for family members within a single account.
* **PIN Protection (Profile Locks):** 4-digit PIN locks secure individual profiles to prevent unauthorized access.
* **Child Profiles:** Content restrictions explicitly configured via locked profiles.
* **Isolated Libraries:** Every profile maintains its own independent *Watch History*, *Favorites*, *Watch Later*, and *Playlists*.

### 🔍 Unified Global Search Engine
Our custom-built search engine allows you to find content instantaneously across your entire database.
* **Cross-Category Searching:** Searches Movies, Series, Episodes, and Live Channels simultaneously.
* **Fuzzy Search capabilities:** Finds what you're looking for even if you misspell it slightly.
* **Instant Results:** Debounced and heavily indexed in PostgreSQL for immediate retrieval.

### ❤️ Personalization & Playlists
* **Custom Playlists:** Users can create custom playlists and mix-and-match Live Channels, VODs, and Series.
* **Recently Watched tracking.**
* **Recommendations:** "Because you watched..." logic based on viewing history.

---

## 🏗 Backend Architecture & Sync Engine

### Supported Login Types
#### Xtream Codes
* **Inputs:** Server URL, Username, Password.
* **Engine:** Makes direct API calls via the `player_api.php` endpoints to authenticate and pull structured JSON libraries.

#### M3U
* **Inputs:** Remote M3U URL.
* **Engine:** High-performance stream parser that breaks down massive `.m3u` files into Live Channels and VODs based on metadata tags.

### The Ingestion Engine
Ingesting IPTV playlists involves processing hundreds of thousands of items. ipGenz handles this gracefully:
* **Background Processing:** Providers are synced asynchronously in the background. The user sees a real-time progress bar detailing exactly how many items have been processed.
* **Smart Deduplication:** Avoids storing duplicate TMDB metadata.
* **Atomic Transactions:** Ensures partial sync failures do not corrupt your library.

---

## 🎞 Supported Stream Formats & Codecs

ipGenz utilizes advanced web video players capable of streaming nearly any format natively in modern browsers.

### The Player Stack
<div style="display: flex; gap: 10px; margin-bottom: 10px;">
  <img src="https://img.shields.io/badge/Video.js-v8.0-blue?style=flat-square" alt="Video.js" />
  <img src="https://img.shields.io/badge/Shaka_Player-v4.3-green?style=flat-square" alt="Shaka Player" />
  <img src="https://img.shields.io/badge/Mpegts.js-Active-orange?style=flat-square" alt="Mpegts.js" />
</div>

* **Shaka Player:** Used heavily for VODs (Movies & Series). Supports adaptive bitrate streaming via **DASH (.mpd)** and **HLS (.m3u8)**.
* **Mpegts.js:** Handles complex Live TV streams broadcasted in raw **MPEG-TS (.ts)** format directly in the browser over HTTP/WebSocket without requiring external transcoding.
* **Native HTML5:** Used as a fallback for standard **MP4** and **WebM** formats.

### Audio & Subtitle Codecs
* **Audio:** AAC, MP3, AC3 (Dolby Digital via Edge/Safari native support), EAC3, Vorbis, FLAC.
* **Subtitles:** Native support for rendering WebVTT and extracting embedded multi-lingual subtitles via Shaka Player. 

---

## 🔒 Security & Data Isolation

### Multi-Tenant Architecture
Every user is strictly isolated via Prisma and PostgreSQL Row-Level logic.
* Users cannot access or interact with other users' Providers, Playlists, or Credentials.
* The API guards all endpoints using robust `JwtAuthGuards` via Passport.js.

### Demo User Lockdown
ipGenz features a secure **Demo Mode** (`demo@ipgenz.com`).
* **UI Restrictions:** The frontend dynamically hides "Add Provider", Profile Creation, and Password modification options.
* **Backend Enforcement:** The backend strictly enforces a `ForbiddenException` if the demo user attempts to mutate the database (e.g., adding favorites, modifying providers, locking profiles).

### Credential Security
* Provider passwords and URLs are securely encrypted and securely transmitted.
* Auth tokens are signed via JWT and utilize secure payload transmission.

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
* **Framework:** Next.js 15 (App Router for maximum server-side rendering performance).
* **Library:** React 19.
* **Styling:** TailwindCSS with complex custom configuration.
* **Components:** Custom-built accessible components inspired by `shadcn/ui`.
* **Icons:** `lucide-react` for crisp, scalable vector graphics.

### Backend Application
* **Framework:** NestJS (Node.js). Extremely modular, highly scalable enterprise framework.
* **Database:** PostgreSQL (Hosted on Neon.tech/Supabase).
* **ORM:** Prisma Client for type-safe database queries.
* **Authentication:** JWT (JSON Web Tokens) with Passport.js.
* **HTTP Client:** Axios for lightning-fast provider syncing.

### Infrastructure & Deployment
* **Vercel:** Hosts the Next.js frontend, taking advantage of Edge caching and CDN global distribution.
* **Render / Railway:** Hosts the Next.js backend, providing robust long-running processes for provider synchronization.

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
