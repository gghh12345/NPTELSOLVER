#!/bin/bash
# NPTEL Pro Solver - Local Runner for Linux / macOS

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=============================================================="
echo "       NPTEL Pro Solver - Local Development & Test 🎓⚡"
echo "=============================================================="
echo ""
echo "[1/3] Chrome Extension Directory:"
echo "      $SCRIPT_DIR"
echo ""
echo "[2/3] Local Testing & Mock Assignment URLs:"
echo "      👉 Dashboard:        http://127.0.0.1:8787 or http://localhost:3000"
echo "      👉 Mock Assignment:  http://127.0.0.1:8787/mock_nptel.html"
echo ""
echo "[3/3] Starting Local Backend Server (SQLite D1 + Web Portal)..."
echo "      API will be live at: http://127.0.0.1:8787"
echo "      (Press Ctrl+C anytime to stop backend)"
echo ""

node local_server.mjs
