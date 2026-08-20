# CivicResolve AI — Development Startup Script
# Run this to start both the backend and frontend.

Write-Host ""
Write-Host "============================================" -ForegroundColor Red
Write-Host "  CIVICRESOLVE AI — Starting Up" -ForegroundColor White
Write-Host "============================================" -ForegroundColor Red
Write-Host ""

# ── Check Python ──────────────────────────────────────────────
$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
    Write-Host "ERROR: Python not found. Install Python 3.10+ from python.org" -ForegroundColor Red
    exit 1
}

Write-Host "[1] Installing Python dependencies..." -ForegroundColor Yellow
Set-Location backend
pip install -r requirements.txt --quiet
Set-Location ..

Write-Host ""
Write-Host "[2] Starting FastAPI backend on http://localhost:8000" -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$PWD\backend'; python -m uvicorn main:app --reload --port 8000"

Start-Sleep -Seconds 2

Write-Host ""
Write-Host "[3] Starting React frontend on http://localhost:5173" -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$PWD'; npm run dev"

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Frontend : http://localhost:5173" -ForegroundColor White
Write-Host "  Backend  : http://localhost:8000" -ForegroundColor White
Write-Host "  API Docs : http://localhost:8000/docs" -ForegroundColor White
Write-Host ""
Write-Host "  Admin Login:" -ForegroundColor Yellow
Write-Host "    Email    : admin@civicresolve.ai" -ForegroundColor White
Write-Host "    Password : admin123" -ForegroundColor White
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
