@echo off
echo Starting POS System...
echo.

:: Start Backend
echo [1/2] Starting Backend on port 3001...
start "POS Backend" cmd /k "cd /d %~dp0 && set PORT=3001 && npm run dev"

:: Wait a bit for backend to start
timeout /t 3 /nobreak >nul

:: Start Frontend
echo [2/2] Starting Frontend Dashboard...
start "POS Dashboard" cmd /k "cd /d %~dp0\client && npm run dev"

echo.
echo POS System is starting...
echo Backend: http://localhost:3001
echo Dashboard: http://localhost:5174
echo.
pause
