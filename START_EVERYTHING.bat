@echo off
TITLE POS Offline System - START EVERYTHING
echo ===================================================
echo      POS OFFLINE SOFTWARE - START EVERYTHING
echo ===================================================
echo.

:: SET NEW PORTS HERE
set BACKEND_PORT=3001
set FRONTEND_PORT=5174

echo Using ports:
echo   - Backend:  %BACKEND_PORT%
echo   - Frontend: %FRONTEND_PORT%
echo.

:: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed or not in PATH.
    echo Please install Node.js from https://nodejs.org/
    pause
    exit
)

:: Store the root directory
cd /d "%~dp0"
echo Working directory: %CD%
echo.

:: Check Backend Dependencies
if not exist "node_modules" (
    echo [Step 1] Installing Backend dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo Error: Failed to install backend dependencies.
        pause
        exit
    )
) else (
    echo [Step 1] Backend dependencies already installed. Skipping...
)

:: Check Frontend Dependencies
if not exist "client\node_modules" (
    echo.
    echo [Step 2] Installing Frontend dependencies...
    cd client
    call npm install
    if %errorlevel% neq 0 (
        echo Error: Failed to install frontend dependencies.
        pause
        exit
    )
    cd ..
) else (
    echo [Step 2] Frontend dependencies already installed. Skipping...
)

:: Clear Vite cache to fix blank page issues
echo.
echo [Step 3] Clearing Vite cache...
if exist "client\node_modules\.vite" (
    rmdir /s /q "client\node_modules\.vite" 2>nul
    echo   - Vite cache cleared.
) else (
    echo   - No Vite cache to clear.
)

:: Update the .env.development file with correct port
echo VITE_API_URL=http://localhost:%BACKEND_PORT%> "client\.env.development"

echo.
echo [Step 4] Starting Backend Server on port %BACKEND_PORT%...
start "POS Backend Server (Port %BACKEND_PORT%)" cmd /k "cd /d "%~dp0" && set PORT=%BACKEND_PORT% && npm run dev"

echo [Step 5] Starting Frontend Dashboard on port %FRONTEND_PORT%...
start "POS Dashboard (Port %FRONTEND_PORT%)" cmd /k "cd /d "%~dp0\client" && set VITE_PORT=%FRONTEND_PORT% && npm run dev -- --port %FRONTEND_PORT%"

echo.
echo [Step 6] Waiting for servers to initialize (12 seconds)...
timeout /t 12 /nobreak >nul

echo.
echo ===================================================
echo      OPENING BROWSER - IMPORTANT!!!
echo ===================================================
echo.
echo  OPENING: http://localhost:%FRONTEND_PORT%/
echo.
echo  ^|^|^| DO NOT USE http://localhost:%BACKEND_PORT%/ ^|^|^|
echo.
echo  Frontend (UI) runs on port %FRONTEND_PORT%
echo  Backend (API) runs on port %BACKEND_PORT%
echo.
start http://localhost:%FRONTEND_PORT%/

echo.
echo ===================================================
echo      SYSTEM IS NOW RUNNING
echo ===================================================
echo.
echo  ✓ Frontend Dashboard: http://localhost:%FRONTEND_PORT%/
echo  ✓ Backend API:        http://localhost:%BACKEND_PORT%/
echo.
echo  DO NOT CLOSE THE POP-UP WINDOWS!
echo  Minimize them to keep the server running.
echo.
pause
