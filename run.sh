#!/usr/bin/env bash
set -e

CYAN='\033[0;36m'
GOLD='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

say()  { echo -e "${CYAN}> $*${NC}"; }
warn() { echo -e "${GOLD}!  $*${NC}"; }
die()  { echo -e "${RED}x $*${NC}"; exit 1; }

# Resolve the directory this script lives in (works with . ./run.sh and bash run.sh)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"

# ── Dependency checks ─────────────────────────────────────────────────────────
say "Checking dependencies..."

command -v python3 >/dev/null 2>&1 || die "python3 not found. Install Python 3.9+ and retry."
command -v ffmpeg  >/dev/null 2>&1 || die "ffmpeg not found. Install with: brew install ffmpeg"
command -v ollama  >/dev/null 2>&1 || die "ollama not found. Install from https://ollama.com"

# ── Start Ollama if not running ───────────────────────────────────────────────
if ! curl -s http://localhost:11434/api/tags >/dev/null 2>&1; then
  say "Starting ollama in background..."
  ollama serve >/tmp/ollama.log 2>&1 &
  sleep 3
fi

# ── Pull model if missing ─────────────────────────────────────────────────────
MODEL="llama3.1:8b"
if ! ollama list 2>/dev/null | grep -q "$MODEL"; then
  warn "Model $MODEL not found. Pulling now (one-time ~4.7 GB download)..."
  ollama pull "$MODEL"
fi

# ── Virtual environment ───────────────────────────────────────────────────────
VENV_DIR="$SCRIPT_DIR/venv"

if [ ! -d "$VENV_DIR" ]; then
  say "Creating virtual environment..."
  python3 -m venv "$VENV_DIR"
fi

say "Activating virtual environment..."
source "$VENV_DIR/bin/activate"

# ── Install Python deps ───────────────────────────────────────────────────────
say "Installing / verifying Python dependencies..."
pip install --quiet --upgrade pip
pip install --quiet flask flask-cors faster-whisper moviepy==1.0.3 numpy requests

# ── Create output dirs ────────────────────────────────────────────────────────
mkdir -p "$SCRIPT_DIR/static/uploads" "$SCRIPT_DIR/static/outputs"

# ── GitHub: one-time init ─────────────────────────────────────────────────────
if [ ! -d "$SCRIPT_DIR/.git" ]; then
  say "Initialising git repository..."

  cat > "$SCRIPT_DIR/.gitignore" <<'GITIGNORE'
venv/
static/uploads/
static/outputs/
__pycache__/
*.pyc
.env
*.egg-info/
dist/
build/
.DS_Store
GITIGNORE

  git -C "$SCRIPT_DIR" init
  git -C "$SCRIPT_DIR" add .
  git -C "$SCRIPT_DIR" commit -m "init in-my-room pipeline"

  if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    say "Pushing to new private GitHub repo 'in-my-room'..."
    if gh repo create in-my-room --private --push --source="$SCRIPT_DIR"; then
      GITHUB_URL=$(gh repo view in-my-room --json url --jq .url 2>/dev/null || true)
      [ -n "$GITHUB_URL" ] && say "GitHub: $GITHUB_URL"
    fi
  else
    warn "GitHub CLI not found or not authenticated."
    warn "To push later: brew install gh && gh auth login && gh repo create in-my-room --private --push --source=."
  fi
fi

# ── Launch ────────────────────────────────────────────────────────────────────
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null \
  || ip route get 1 2>/dev/null | awk '{print $7; exit}' \
  || echo "127.0.0.1")

echo ""
echo -e "${GOLD}-----------------------------------------------${NC}"
echo -e "${GOLD}  IN MY ROOM  --  AI Documentary Editor${NC}"
echo -e "${GOLD}-----------------------------------------------${NC}"
echo -e "  Local:   ${CYAN}http://localhost:5050${NC}"
echo -e "  Network: ${CYAN}http://$LOCAL_IP:5050${NC}"
echo -e "  ngrok:   run 'ngrok http 5050' in another tab"
echo -e "${GOLD}-----------------------------------------------${NC}"
echo ""

python3 "$SCRIPT_DIR/app.py"
