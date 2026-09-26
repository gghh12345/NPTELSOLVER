@echo off
title NPTEL Pro Solver - Local Runner
cd /d "%~dp0"

echo ==============================================================
echo        NPTEL Pro Solver - Local Development & Test
echo ==============================================================
echo.
echo [1/3] Chrome Extension Directory:
echo       %cd%
echo.
echo [2/3] Opening Local Mock Assignment Page in Chrome...
start "" "test\mock_nptel.html"
echo.
echo [3/3] Starting Local Backend Server (Cloudflare D1 + Worker)...
echo       API will be live at: http://127.0.0.1:8787
echo       (Press Ctrl+C anytime to stop backend)
echo.
cd cloudflare-backend
npm run dev -- --port 8787 --ip 127.0.0.1
pause
