@echo off
cd /d "%~dp0"
start "" http://localhost:8765/index.html
where python >nul 2>nul
if %errorlevel%==0 (
  python -m http.server 8765 --bind 127.0.0.1
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor.ps1" -Puerto 8765
)
