@echo off
SETLOCAL EnableExtensions EnableDelayedExpansion

:: ════════════════════════════════════════════════════════════════════════════
::  POS OFFLINE SOFTWARE — START ALL
::  Starts backend (port 7000) + frontend (port 7001)
::  Opens browser + adds Windows Firewall rule for Android access
:: ════════════════════════════════════════════════════════════════════════════

set "SCRIPT_DIR=%~dp0"
set "BACKEND_DIR=%SCRIPT_DIR%backend"
set "CLIENT_DIR=%SCRIPT_DIR%client"

set "BACKEND_PORT=7000"
set "CLIENT_PORT=7001"

:: ── Detect PC IP automatically ───────────────────────────────────────────────
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /C:"IPv4 Address" ^| findstr /V "127.0.0.1" ^| findstr /V "172." ^| head /n 1') do (
    set "PC_IP=%%A"
)
:: Trim leading spaces
set "PC_IP=%PC_IP: =%"
:: Fallback if detection fails
if "%PC_IP%"=="" set "PC_IP=10.40.251.57"

set "BACKEND_URL=http://localhost:%BACKEND_PORT%"
set "CLIENT_URL=http://localhost:%CLIENT_PORT%"
set "ANDROID_URL=http://%PC_IP%:%BACKEND_PORT%"

cls
echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║          POS OFFLINE SOFTWARE — STARTING UP          ║
echo  ╚══════════════════════════════════════════════════════╝
echo.
echo  Backend  : %BACKEND_URL%
echo  Frontend : %CLIENT_URL%
echo  Android  : %ANDROID_URL%  ← use this in Android Settings
echo.

:: ── Kill any existing Node on these ports ────────────────────────────────────
echo [1/5] Stopping existing Node processes on ports 7000-7001...
powershell -NoProfile -Command ^
  "$ports = 7000,7001,3000,5173; foreach ($p in $ports) { try { $conns = Get-NetTCPConnection -LocalPort $p -State Listen -EA Stop; foreach ($c in $conns) { $proc = Get-Process -Id $c.OwningProcess -EA SilentlyContinue; if ($proc -and $proc.ProcessName -eq 'node') { Stop-Process -Id $proc.Id -Force } } } catch {} }"
echo    Done.

:: ── Open Firewall port 7000 for Android access ───────────────────────────────
echo.
echo [2/5] Allowing port %BACKEND_PORT% through Windows Firewall (for Android access)...
netsh advfirewall firewall show rule name="POS Backend %BACKEND_PORT%" >nul 2>&1
if errorlevel 1 (
    netsh advfirewall firewall add rule name="POS Backend %BACKEND_PORT%" dir=in action=allow protocol=TCP localport=%BACKEND_PORT% >nul 2>&1
    echo    Firewall rule added.
) else (
    echo    Firewall rule already exists.
)

:: ── Start Backend ─────────────────────────────────────────────────────────────
echo.
echo [3/5] Starting backend on port %BACKEND_PORT%...
start "POS Backend :7000" cmd /k "title POS Backend :7000 && cd /d "%BACKEND_DIR%" && echo Installing dependencies... && npm install --no-audit --no-fund 2>nul && echo Starting server... && npm run dev"

:: ── Start Frontend ────────────────────────────────────────────────────────────
echo.
echo [4/5] Starting frontend on port %CLIENT_PORT%...
start "POS Frontend :7001" cmd /k "title POS Frontend :7001 && cd /d "%CLIENT_DIR%" && echo Installing dependencies... && npm install --no-audit --no-fund 2>nul && echo Starting frontend... && npm run dev -- --host 0.0.0.0 --port %CLIENT_PORT%"

:: ── Wait for backend to be ready ─────────────────────────────────────────────
echo.
echo [5/5] Waiting for backend to be ready (up to 60s)...
set "BACKEND_READY=0"
set "CLIENT_READY=0"

for /L %%i in (1,1,20) do (
    timeout /t 3 /nobreak >nul

    powershell -NoProfile -Command ^
      "try { $r = Invoke-WebRequest -Uri '%BACKEND_URL%/health' -UseBasicParsing -TimeoutSec 3; exit 0 } catch { exit 1 }" >nul 2>&1
    if not errorlevel 1 set "BACKEND_READY=1"

    powershell -NoProfile -Command ^
      "try { $r = Invoke-WebRequest -Uri '%CLIENT_URL%' -UseBasicParsing -TimeoutSec 3; exit 0 } catch { exit 1 }" >nul 2>&1
    if not errorlevel 1 set "CLIENT_READY=1"

    if "!BACKEND_READY!"=="1" if "!CLIENT_READY!"=="1" goto :ready
    <nul set /p "=."
)

:ready
echo.
echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║                  ✅  ALL SYSTEMS GO                   ║
echo  ╠══════════════════════════════════════════════════════╣
echo  ║                                                      ║
echo  ║  Dashboard   : http://localhost:7001                 ║
echo  ║  Backend API : http://localhost:7000                 ║
echo  ║  Android URL : http://%PC_IP%:7000/         ║
echo  ║                                                      ║
echo  ║  Default login: admin / admin1234                    ║
echo  ║                                                      ║
echo  ╚══════════════════════════════════════════════════════╝
echo.

:: ── Open browser ─────────────────────────────────────────────────────────────
if "!BACKEND_READY!"=="1" (
    echo  Opening dashboard in browser...
    start "" "http://localhost:%CLIENT_PORT%"
) else (
    echo  Backend not ready yet — open http://localhost:%CLIENT_PORT% manually.
)

:: ── Beep to signal ready ──────────────────────────────────────────────────────
powershell -NoProfile -Command "[console]::beep(1200,150); Start-Sleep -Milliseconds 80; [console]::beep(1500,150)" >nul 2>&1

echo.
echo  Press any key to close this window (servers keep running in their own windows).
pause >nul
