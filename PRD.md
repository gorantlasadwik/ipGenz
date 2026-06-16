# IpFlix- Final Product Requirements Document (PRD)

## 1. Product Vision

Build the most universal IPTV aggregation and playback platform possible.

The platform must support:
* Live TV
* Movies
* Series
* Xtream Providers
* M3U Providers
* Stalker Portals
* MAG Portals
* XML Sources
* JSON Sources
* Direct Stream URLs

The platform should preserve the original provider structure exactly as provided.
The platform must support virtually all common IPTV streaming formats through a universal stream processing architecture.
The platform is designed as a metadata aggregation, management, discovery, and playback platform.

---

# 2. Core Principles

## Provider Structure Preservation
Provider data must never be altered.
Categories received from providers must remain exactly as delivered.

Example:
LIVE TV
* Telugu
* Hindi

MOVIES
* Telugu
* Hindi

SERIES
* Telugu
* Hindi

These are NOT merged.
They remain separate entities.

---

## Content Type Isolation
The following content types must remain isolated:

### Live TV
Contains:
* Categories
* Channels
* EPG

### Movies
Contains:
* Categories
* Movies

### Series
Contains:
* Categories
* Series
* Seasons
* Episodes

No cross-content category sharing.
No category normalization.
No category merging.

---

# 3. Supported IPTV Provider Types

## Xtream Codes
Authentication:
* Server URL
* Username
* Password

Supported Endpoints:
* player_api.php
* get_live_categories
* get_live_streams
* get_vod_categories
* get_vod_streams
* get_series_categories
* get_series

---

## Playlist URL Sources
Support:
* M3U
* M3U8
* Extended M3U
* XSPF
* PLS
* XML Playlists
* JSON Playlists
* ASX
* WPL
* SMIL

---

## Playlist File Upload
Support:
* .m3u
* .m3u8
* .xml
* .json
* .xspf
* .pls
* .asx
* .wpl
* .smil

---

## Portal Systems
Support:
* Stalker Portal
* MAG Portal
* Ministra Portal

---

## Direct Stream Sources
Support:
* HLS URL
* DASH URL
* RTSP URL
* RTMP URL
* UDP Stream
* RTP Stream
* SRT Stream
* RIST Stream
* WebRTC Stream
* MPEG-TS Stream

---

# 4. Database Schema

## Providers
providers
* id
* provider_type
* provider_name
* server_url
* username
* encrypted_password
* last_sync_at
* created_at
* updated_at

provider_type:
* xtream
* m3u
* stalker
* mag
* ministra
* custom

---

# Live TV Schema
live_categories
* id
* provider_id
* provider_category_id
* name
* created_at

live_channels
* id
* provider_id
* live_category_id
* provider_stream_id
* name
* logo
* stream_url
* epg_id
* is_active
* created_at

---

# Movie Schema
movie_categories
* id
* provider_id
* provider_category_id
* name

movies
* id
* provider_id
* movie_category_id
* provider_stream_id
* name
* poster
* backdrop
* description
* year
* rating
* duration
* stream_url

---

# Series Schema
series_categories
* id
* provider_id
* provider_category_id
* name

series
* id
* provider_id
* series_category_id
* provider_series_id
* name
* poster
* backdrop
* description

seasons
* id
* series_id
* season_number
* name

episodes
* id
* series_id
* season_id
* provider_episode_id
* episode_number
* title
* description
* stream_url
* duration

---

# EPG Schema
epg_channels
* id
* provider_id
* epg_id
* channel_name

epg_programs
* id
* epg_channel_id
* title
* description
* start_time
* end_time

---

# Playback Metadata
audio_tracks
* id
* content_type
* content_id
* language
* codec
* channels
* is_default

subtitle_tracks
* id
* content_type
* content_id
* language
* subtitle_format
* subtitle_url
* is_default

video_profiles
* id
* content_type
* content_id
* resolution
* codec
* fps
* bitrate
* aspect_ratio

---

# User Data
users
favorites
watch_history
continue_watching
provider_connections

---

# 5. Supported Streaming Protocols
The platform must ingest and support:
* HLS
* MPEG-DASH
* RTMP
* RTMPS
* RTSP
* RTP
* RTCP
* UDP
* TCP
* SRT
* RIST
* WebRTC
* HTTP-FLV
* MPEG-TS
* Multicast IPTV
* Unicast IPTV

---

# 6. Supported Containers
* MP4
* MKV
* AVI
* MOV
* WEBM
* TS
* M2TS
* FLV

---

# 7. Supported Video Codecs
* H264
* H265
* HEVC
* MPEG2
* MPEG4
* VP8
* VP9
* AV1
* VC1

---

# 8. Supported Audio Codecs
* AAC
* HE-AAC
* AAC-LC
* MP3
* AC3
* EAC3
* Opus
* Vorbis
* FLAC
* PCM

---

# 9. Supported Subtitle Formats
* SRT
* WebVTT
* ASS
* SSA
* PGS
* DVB Subtitle
* Teletext
* TTML
* CEA608
* CEA708

---

# 10. Universal Stream Gateway
Purpose: Allow support for virtually all IPTV source formats.

Core Components:
MediaMTX
FFmpeg

Responsibilities:
* Protocol Detection
* Codec Detection
* Audio Detection
* Subtitle Detection
* Resolution Detection
* Aspect Ratio Detection
* Stream Health Monitoring

---

# 11. Playback Engine
## UI Player
Video.js

## Playback Engines
HLS.js
Shaka Player
Native HTML5

---

# Playback Features
* 4K Playback
* Adaptive Bitrate Streaming
* Multiple Audio Tracks
* Audio Language Selection
* Multiple Subtitle Tracks
* Subtitle Selection
* Aspect Ratio Switching
* Resolution Selection
* Fullscreen
* Picture-in-Picture
* Continue Watching

---

# 12. Search System
Global Search
Search Scope:
* Live TV
* Movies
* Series

Results must be grouped.
Never mix content types.

---

# 13. EPG Features
Support:
* XMLTV
* XML EPG
* Compressed XMLTV
* Remote EPG URL

Features:
* Current Program
* Next Program
* Program Guide
* Weekly Schedule
* Search Programs

---

# 14. Scalability Targets
Support:
* 100,000+ Movies
* 100,000+ Series
* Millions of Episodes
* Thousands of Channels
* Multiple IPTV Providers Per User

---

# 15. Deployment Architecture
## MVP
Frontend: Next.js (Hosted on: Vercel)
Backend: NestJS (Hosted on: Render or Railway)
Database: PostgreSQL (Recommended: Neon)
Cache: Redis (Recommended: Upstash)

## Production Architecture
Frontend: Next.js
Backend: NestJS
Database: PostgreSQL
Cache: Redis
Stream Gateway: MediaMTX
Media Processing: FFmpeg
Background Workers: Metadata Sync Workers, EPG Workers, Provider Sync Workers

Deployment Target: Dedicated VPS
Recommended Minimum: 8 vCPU, 16 GB RAM, 200 GB SSD
Recommended Growth Tier: 16 vCPU, 32 GB RAM, 500 GB SSD

---

# 16. Future Client Applications
Web Application
Mobile Application
Android TV Application
Fire TV Application
Desktop Application
Apple TV Application
All clients share the same backend architecture.

---

# 17. Success Criteria
The platform successfully:
* Connects to all major IPTV provider types
* Preserves provider category structures
* Supports Live TV, Movies, and Series independently
* Supports multiple audio and subtitle tracks
* Handles 4K playback
* Scales to large IPTV libraries
* Provides a unified user experience regardless of provider source
* Supports the broadest practical range of IPTV formats available through open-source technologies

# 18. Search System
## Search Philosophy
The platform must support search at multiple levels while maintaining complete separation between:
* Live TV
* Movies
* Series
Search results must never mix content types.

---

# 19. User Accounts, Provider Management & Metadata Lifecycle
## User Accounts
Users must be able to:
* Sign Up
* Login
* Logout
* Reset Password
* Manage Profile
Every user has their own isolated IPTV workspace.

---

# 20. Download System
## Overview
The platform should support downloading Movies and Series episodes when technically permitted by the source stream.
Downloads are not supported for Live TV channels.

---

# 21. User Experience & Personalization System
## Account System
The platform must use a single account model similar to Netflix.
One Account
↓
Multiple Profiles

Each profile maintains its own:
* Favorites
* Watch History
* Continue Watching
* Custom Playlists
* Search History
* Preferences

---

# IPTV Hub - Admin Panel PRD
# 1. Overview
The Admin Panel is the central control system for monitoring, managing, analyzing, and maintaining the IPTV Hub platform.
Admin panel access is hidden from public navigation.
Default Route: /sadwik

# Visual Design System
### Theme
* Dark First
* OLED Optimized
* Premium

### Fonts
* Inter
* Geist

### UI
* shadcn/ui

### Animations
* Framer Motion

### Icons
* Lucide

---

# Missing UI Pages to be Built:
- **Authentication Pages**: `/login`, `/signup`
- **Search Page**: `/search` (Movies, Series, Live Channels grouped results)
- **Movies Page**: `/movies` (Featured Movie, Trending, Horizontal rails by category)
- **Movie Details Page**: `/movies/[id]` (Large backdrop, play, download, cast, related)
- **Series Page**: `/series` (Trending, horizontal rails by category)
- **Series Details Page**: `/series/[id]` (Overview, season selector, episode cards)
- **Live TV Page**: `/live` (Category sidebar, channels grid, current/upcoming program)
- **Downloads Page**: `/downloads` (Downloaded, Downloading, Failed)
- **Favorites Page**: `/favorites` (Tabs: Movies, Series, Channels)
- **Watch Later Page**: `/watch-later`
- **History Page**: `/history` (Recently watched, resume)
- **Custom Playlist Page**: `/playlists`
- **Provider Management Page**: `/providers` (Add Xtream/M3U, status, sync)
- **Settings Page**: `/settings` (Profile, playback, UI, devices)
- **Admin Dashboard**: `/sadwik` (Custom hidden route)
