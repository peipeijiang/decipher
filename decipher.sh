#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🚀 Decipher — TikTok爆款视频分析平台${NC}"
echo ""

# Check Python
PYTHON=""
for cmd in python3.12 python3.11 python3.10 python3; do
    if command -v $cmd &>/dev/null; then
        PYTHON=$cmd
        break
    fi
done

if [ -z "$PYTHON" ]; then
    echo "❌ Python 3 not found. Please install Python 3.10+ first."
    echo "   brew install python@3.12"
    exit 1
fi

echo "✓ Python: $($PYTHON --version)"

# Setup virtual env
VENV_DIR="$SCRIPT_DIR/.venv"
if [ ! -d "$VENV_DIR" ]; then
    echo "📦 Creating virtual environment..."
    $PYTHON -m venv "$VENV_DIR"
fi

source "$VENV_DIR/bin/activate"

# Install dependencies (first run)
if [ ! -f "$VENV_DIR/.deps_installed" ]; then
    echo "📦 Installing dependencies (first run, ~1 min)..."
    pip install --quiet --upgrade pip
    pip install --quiet -r backend/requirements.txt
    touch "$VENV_DIR/.deps_installed"
    echo "✓ Dependencies installed"
fi

# Check FFmpeg
if ! command -v ffmpeg &>/dev/null; then
    echo "⚠️  FFmpeg not found. Whisper transcription will use CPU fallback."
    echo "   Install: brew install ffmpeg"
fi

# Start backend
echo ""
echo -e "${GREEN}▶ Starting Decipher...${NC}"
echo "   Open http://localhost:18888 in your browser"
echo "   Press Ctrl+C to stop"
echo ""

cd backend
python packaged_main.py
