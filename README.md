# Soulify 🎵

A Spotify-like music app powered by Soulseek. Search and play anything on the Soulseek network with no login screen — just configure credentials once and it works.

Works as a **PWA**: install on iPhone via Safari > Share > "Add to Home Screen", and open in any desktop browser.

---

## Requirements

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Mac/Windows) or Docker + Docker Compose (Linux)
- A free Soulseek account → [soulseek.org](http://www.slsknet.org/news/node/1)
- *(Optional)* A free Last.fm API key for song recommendations → [last.fm/api](https://www.last.fm/api/account/create)

---

## Setup

```bash
# 1. Clone the repo
git clone <repo-url> && cd soulify

# 2. Create your config
cp .env.example .env
# Edit .env with your Soulseek username & password (+ optional Last.fm key)

# 3. Start everything
docker-compose up -d

# 4. Open in browser
open http://localhost:3000
```

**iPhone**: Open `http://<your-mac-ip>:3000` in Safari (same Wi-Fi), then tap Share → "Add to Home Screen".

---

## Features

| Feature | Description |
|---|---|
| 🔍 **Search** | Search the entire Soulseek network. Results update as they come in. Filter by MP3 / FLAC. |
| ▶️ **Play** | Tap any result to download + play. Stream starts once the file is ready. |
| 📚 **Library** | Browse your downloaded songs by track, artist, or album. |
| 🎤 **Artist pages** | View popular tracks and similar artists (via Last.fm). |
| 🎯 **Recommendations** | Similar track suggestions on the Now Playing screen. |
| 📲 **PWA** | Installs on iPhone home screen like a native app. |
| 🔀 **Queue / Shuffle / Repeat** | Full playback controls. |

---

## Architecture

```
Browser / iPhone PWA
        │
        ▼
  Nginx (port 3000)
  ├── /          → React frontend
  ├── /api       → Node.js backend (port 4000)
  └── /ws        → WebSocket (download progress)
        │
        ▼
  slskd (port 5030) ← Soulseek network
        │
        ▼
  ./data/downloads  ← downloaded files (shared volume)
```

---

## Configuration

| Variable | Description |
|---|---|
| `SOULSEEK_USERNAME` | Your Soulseek username |
| `SOULSEEK_PASSWORD` | Your Soulseek password |
| `LASTFM_API_KEY` | *(Optional)* Last.fm key for recommendations |

---

## Notes

- Downloaded files are stored in `./data/downloads/` and persist across restarts.
- Soulseek requires a **free** account — create one at soulseek.org.
- For HTTPS on iPhone (needed for full PWA features), you can put a reverse proxy (Caddy, Nginx) with a self-signed cert in front.
- slskd may take ~30 seconds to connect to the Soulseek network on first start.
