#!/usr/bin/env bash
set -e

echo "============================================================"
echo "      👻 Ghost Interview Copilot — Auto-Update Utility       "
echo "============================================================"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

echo "📍 Working directory: $ROOT_DIR"

if ! command -v git &> /dev/null; then
  echo "❌ Git is not installed or not in PATH."
  exit 1
fi

if ! command -v npm &> /dev/null; then
  echo "❌ Node/npm is not installed or not in PATH."
  exit 1
fi

echo "🔄 Fetching latest updates from GitHub repository..."
git fetch origin main

CURRENT_HASH=$(git rev-parse HEAD)
REMOTE_HASH=$(git rev-parse origin/main)

if [ "$CURRENT_HASH" = "$REMOTE_HASH" ]; then
  echo "✅ Ghost Copilot is already at the latest version ($CURRENT_HASH)."
else
  echo "🚀 Updates found! Pulling latest commits..."
  git pull --rebase origin main
  echo "📦 Updating dependencies..."
  npm install --prefer-offline --no-audit
  
  if [ -d "mobile" ]; then
    echo "📱 Verifying mobile dependencies..."
    (cd mobile && npm install --prefer-offline --no-audit)
  fi

  echo "🧪 Running verification tests..."
  npm test

  NEW_HASH=$(git rev-parse --short HEAD)
  echo ""
  echo "🎉 Update successful! Ghost is now running commit $NEW_HASH."
  echo "Run 'npm start' to launch Ghost."
fi
