@echo off
TITLE POS Offline System Launcher
echo ===================================================
echo      POS OFFLINE SOFTWARE - SYSTEM LAUNCHER
echo ===================================================
echo.

:: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed or not in PATH.
    echo Please install Node.js from https://nodejs.org/
    pause
    exit
)

echo [Step 1] Cleaning old client dependencies...
if exist "client\node_modules" (
    echo   - Removing old client node_modules...
    rmdir /s /q "client\node_modules" 2>nul
)
if exist "client\package-lock.json" (
    echo   - Removing client package-lock.json...
    del /f /q "client\package-lock.json" 2>nul
)

echo.
echo [Step 2] Installing Frontend dependencies...
cd client
call npm install
cd ..

:: Check Backend Dependencies
if not exist "node_modules" (
    echo.
    echo [Step 3] Installing Backend dependencies...
    call npm install
)

echo.
echo [Step 4] Starting Backend Server...
start "POS Backend Server (Port 3000)" cmd /k "npm run dev"

echo [Step 5] Starting Frontend Dashboard...
start "POS Dashboard (Port 5173)" cmd /k "cd client && npm run dev"

echo.
echo [Step 6] Waiting for servers to initialize (8 seconds)...
timeout /t 8 /nobreak >nul

echo.
echo Launching Dashboard in Browser...
start http://localhost:5173

echo.
echo ===================================================
echo      SYSTEM IS RUNNING
echo ===================================================
echo  - Backend: http://localhost:3000
echo  - Frontend: http://localhost:5173
echo.
echo  DO NOT CLOSE THE POP-UP WINDOWS.
echo  Minimize them to keep the server running.
echo.
pause
