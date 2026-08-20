@echo off
title CivicResolve AI — Master Launcher
echo ===================================================
echo   CivicResolve AI — Localhost Launcher
echo ===================================================
echo.
echo [1/3] Starting FastAPI Backend on http://localhost:8000 ...
start "CivicResolve Backend (Port 8000)" cmd /k "cd /d %~dp0backend && python -m uvicorn main:app --reload --port 8000"

echo [2/3] Starting Vite Frontend on http://localhost:5173 ...
start "CivicResolve Frontend (Port 5173)" cmd /k "cd /d %~dp0 && npm run dev"

echo [3/3] Waiting for servers to initialize...
timeout /t 3 >nul

echo Opening browser at http://localhost:5173 ...
start http://localhost:5173
start http://localhost:8000/docs

echo.
echo ===================================================
echo   CivicResolve AI is now running!
echo   Frontend: http://localhost:5173
echo   Backend:  http://localhost:8000/docs
echo ===================================================
echo Keep the backend and frontend terminal windows open.
pause
