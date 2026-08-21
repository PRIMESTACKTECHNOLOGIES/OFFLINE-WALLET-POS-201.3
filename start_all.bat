@echo off
SETLOCAL EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"

set "BACKEND_PORT=7000"
set "FRONTEND_PORT=7001"

title POS Offline System Launcher

cls
echo.
echo POS OFFLINE SYSTEM - ONE CLICK START
echo Backend: http://localhost:%BACKEND_PORT%
echo Frontend: http://localhost:%FRONTEND_PORT%
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo Error: Node.js is not installed or not in PATH.
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

if not exist "%~dp0backend\node_modules" (
    echo [1/3] Installing backend dependencies...
    cd /d "%~dp0backend"
    call npm install
    if errorlevel 1 (
        echo Failed to install backend dependencies.
        pause
        exit /b 1
    )
) else (
    echo [1/3] Backend dependencies already installed.
)

if not exist "%~dp0client\node_modules" (
    echo [2/3] Installing frontend dependencies...
    cd /d "%~dp0client"
    call npm install
    if errorlevel 1 (
        echo Failed to install frontend dependencies.
        pause
        exit /b 1
    )
) else (
    echo [2/3] Frontend dependencies already installed.
)

cd /d "%~dp0"

echo [3/3] Starting backend and frontend...
start "POS Backend" cmd /k "cd /d ""%~dp0backend"" && set PORT=%BACKEND_PORT% && set JWT_SECRET=offline-pos-kodolo-2026-jwt-secret-change-live && npm run dev"
start "POS Frontend" cmd /k "cd /d ""%~dp0client"" && set VITE_API_URL=http://localhost:%BACKEND_PORT% && npm run dev -- --host 0.0.0.0 --port %FRONTEND_PORT%"

ping -n 8 127.0.0.1 >nul
start "" "http://localhost:%FRONTEND_PORT%"

echo.
echo System is running.
echo Frontend: http://localhost:%FRONTEND_PORT%
echo Backend : http://localhost:%BACKEND_PORT%
echo NFC     : ACR122U PC/SC reader enabled
echo.
echo Keep both console windows open while using the system.
echo.
pause
