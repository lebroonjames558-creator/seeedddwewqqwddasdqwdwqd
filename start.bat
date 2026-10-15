@echo off
setlocal
title Shadow AI
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 18 or newer is required.
  echo Install it from https://nodejs.org/ then run start.bat again.
  pause
  exit /b 1
)
echo Starting Shadow AI...
start "" /b cmd /c "timeout /t 2 /nobreak >nul & start http://127.0.0.1:3210"
node server.js
echo.
echo Shadow AI stopped.
pause
