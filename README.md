<div align="center">
  <h1>🚀 ipGenz</h1>
  <p><strong>A Next-Generation, Blazing-Fast, and Premium IPTV Streaming Platform</strong></p>
  <p>
    ipGenz redefines the IPTV experience with a beautifully crafted UI, a powerful global synchronization engine, and real-time observability. Built for speed, elegance, and scale using Next.js 15, NestJS, and PostgreSQL.
  </p>
</div>

---

## 🌟 Key Features

### 🎨 Premium User Experience
- **Cinematic UI:** Immersive dark mode, glassmorphism overlays, and butter-smooth micro-animations.
- **Unified Library:** Watch history, Favorites, Watch Later, and custom Playlists fully synchronized across devices.
- **Smart Search:** Lightning-fast search across thousands of Live Channels, Movies, and TV Series.
- **Built-in Player:** A high-performance, integrated video player handling HLS, M3U8, and MP4 formats.

### ⚙️ Advanced Backend & Sync Engine
- **Global Provider Sync:** Seamlessly connects to **M3U Playlists** and **Xtream Codes** APIs to ingest massive libraries.
- **Smart Caching & Deduplication:** Intelligently clears stale caches and prevents duplicates during synchronizations.
- **TMDB Integration:** Automatically enriches movies and TV series with high-quality posters, backdrops, and metadata.
- **Chunked Processing:** Ingests tens of thousands of channels smoothly without crashing the server.

### 🛡️ Admin & Observability
- **Real-Time Dashboard:** Monitor CPU usage, RAM, active streams, and system latency.
- **User Management:** Ban users, reset passwords, and audit login sessions.
- **Security Logs:** Track admin actions, API requests, and monitor failed login attempts.
- **Demo Mode:** An exclusive "Experience the App" public demo feature.

---

## 🏗️ Architecture & Tech Stack

This project is structured as a full-stack monorepo:

### **Frontend (`/frontend`)**
- **Framework:** Next.js 15 (App Router)
- **Styling:** TailwindCSS with custom design tokens
- **Language:** TypeScript
- **State:** React Hooks & Context

### **Backend (`/backend`)**
- **Framework:** NestJS (Node.js)
- **Database:** PostgreSQL (Neon.tech / Supabase)
- **ORM:** Prisma
- **Auth:** JWT (JSON Web Tokens) with Passport.js
- **Media:** FFmpeg & FFprobe for stream analysis

---

## 🚀 Local Development Setup

### Prerequisites
- Node.js (v18+)
- PostgreSQL Database (Local or Cloud)

### 1. Clone the Repository
```bash
git clone https://github.com/gorantlasadwik/ipGenz.git
cd ipGenz
```

### 2. Configure Environment Variables
Create a `.env` file in the `backend/` directory:
```env
# backend/.env
DATABASE_URL="postgresql://user:password@localhost:5432/ipgenz"
JWT_SECRET="your-super-secret-jwt-key"
PORT=3001
```

Create a `.env.local` file in the `frontend/` directory:
```env
# frontend/.env.local
NEXT_PUBLIC_API_URL="http://localhost:3001"
```

### 3. Start the Backend
```bash
cd backend
npm install
npx prisma generate
npx prisma db push
npm run start:dev
```

### 4. Start the Frontend
Open a new terminal window:
```bash
cd frontend
npm install
npm run dev
```
The app will be running at `http://localhost:3000`.

---

## 🌍 Deployment Guide (100% Free)

You can easily host this application entirely for free!

1. **Database:** Set up a free PostgreSQL database on [Neon.tech](https://neon.tech) or [Supabase](https://supabase.com). Copy the Connection String.
2. **Backend (Render):**
   - Create a Web Service on [Render.com](https://render.com).
   - **Root Directory:** `backend`
   - **Build Command:** `npm install && npx prisma generate && npm run build`
   - **Start Command:** `npm run start:prod`
   - Add your `DATABASE_URL` and `JWT_SECRET` in the Environment Variables section.
3. **Frontend (Vercel):**
   - Import the repository on [Vercel](https://vercel.com).
   - **Root Directory:** `frontend`
   - Set the `NEXT_PUBLIC_API_URL` environment variable to your Render backend URL.

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
  <p>Built with ❤️ by Sadwik</p>
</div>
