# IN MY ROOM

AI-powered documentary editor. Two modes: **In My Room** (single talking-head rearrangement) and **Mockumentary** (multi-clip scene ordering). Uses Whisper for transcription, Ollama/llama3.1:8b for creative reordering, and FFmpeg for video rendering.

---

## Quick start

```bash
# Make sure ollama is running first (see below)
chmod +x run.sh
./run.sh
```

Open `http://localhost:5050` in a browser.  
For mobile access via ngrok: `ngrok http 5050`

---

## Requirements

| Tool | Install |
|------|---------|
| Python 3.9+ | [python.org](https://python.org) |
| FFmpeg | `brew install ffmpeg` or `apt install ffmpeg` |
| Ollama | [ollama.com](https://ollama.com) |

`run.sh` handles Python venv creation and pip installs automatically.

---

## Ollama

Ollama must be running before starting the app:

```bash
ollama serve              # starts the server
ollama pull llama3.1:8b   # first-run only (~4.7 GB)
```

`run.sh` starts Ollama automatically if it isn't already running.

### Upgrading the model

For better creative reasoning (requires 48+ GB VRAM or a large Mac):

```python
# app.py, line 12
OLLAMA_MODEL = 'llama3.1:70b'
```

Then `ollama pull llama3.1:70b` and restart.

---

## Workflow notes

- **B-roll**: Drop the exported variant MP4 into DaVinci Resolve as your primary talking-head track, then layer b-roll on top manually — the cuts are already timed to the best sentence ordering.
- **SRT files**: Each variant ships with a pre-timed `.srt` subtitle file. Import directly into DaVinci Resolve (`File > Import > Subtitles`) and it snaps to the cut edit automatically. No re-timing needed.
- **Multiple variants**: Ollama generates up to 10 orderings per run. Render them all and pick the one that feels right before moving to color and mix.

---

## File structure

```
app.py              — Flask backend (transcription, Ollama, FFmpeg rendering)
templates/
  index.html        — Full UI (dark aesthetic, two-mode tabs)
run.sh              — Dependency check, venv setup, auto-pull, launch
static/
  uploads/          — Temp upload storage (git-ignored)
  outputs/          — Rendered MP4 + SRT variants (git-ignored)
```

---

## ngrok (mobile access)

```bash
ngrok http 5050
```

Open the `Forwarding` HTTPS URL on any device on any network.
