@echo off
title CivicResolve AI — Backend (FastAPI + Ollama)
echo ===================================================
echo   Starting CivicResolve AI Backend on Port 8000...
echo ===================================================
cd /d "%~dp0backend"
python -m uvicorn main:app --reload --port 8000
pause
