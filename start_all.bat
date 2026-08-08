@echo off
SETLOCAL EnableExtensions EnableDelayedExpansion

:: ════════════════════════════════════════════════════════════════════════════
::  POS OFFLINE SOFTWARE — START ALL
::  Auto-detects IP, updates backend + frontend, adds firewall rule, opens browser
:: ════════════════════════════════════════════════════════════════════════════

set "ROOT=%~dp0"
set "BACKEND=%ROOT%backend"
set "CLIENT=%ROOT%client"
set "BACKEND_PORT=7000"
set "CLIENT_PORT=7001"

:: ── Detect current Wi-Fi IP ──────────────────────────────────────────────────
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /C:"IPv4 Address" ^| findstr /V "172\." ^| findstr /V "127\."') do (
    set "RAW_IP=%%A"
    goto :got_ip
)
:got_ip
set "PC_IP=%RAW_IP: =%"
if "%PC_IP%"=="" set "PC_IP=localhost"

cls
echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║        POS OFFLINE SOFTWARE — STARTING UP            ║
echo  ╚══════════════════════════════════════════════════════╝
echo.
echo  Backend  : http://localhost:%BACKEND_PORT%
echo  Frontend : http://localhost:%CLIENT_PORT%
echo  Android  : http://%PC_IP%:%BACKEND_PORT%/
echo.

:: ── Step 1: Git pull latest code ─────────────────────────────────────────────
echo [1/6] Pulling latest code from GitHub...
cd /d "%ROOT%"
git pull origin main --no-rebase >nul 2>&1
if errorlevel 1 (
    echo    Warning: git pull failed (offline or no changes). Continuing...
) else (
    echo    Code updated.
)

:: ── Step 2: Update backend dependencies ─────────────────────────────────────
echo.
echo [2/6] Installing backend dependencies...
cd /d "%BACKEND%"
call npm install --no-audit --no-fund >nul 2>&1
echo    Done.

:: ── Step 3: Update frontend dependencies ────────────────────────────────────
echo.
echo [3/6] Installing frontend dependencies...
cd /d "%CLIENT%"
call npm install --no-audit --no-fund >nul 2>&1
echo    Done.

:: ── Step 4: Rebuild React frontend ──────────────────────────────────────────
echo.
echo [4/6] Building React frontend...
cd /d "%CLIENT%"
call npm run build >nul 2>&1
if errorlevel 1 (
    echo    Warning: Frontend build failed. Using last built version.
) else (
    echo    Frontend built.
)

:: ── Step 5: Firewall rule for Android access ─────────────────────────────────
echo.
echo [5/6] Firewall rule for port %BACKEND_PORT%...
netsh advfirewall firewall show rule name="POS Backend %BACKEND_PORT%" >nul 2>&1
if errorlevel 1 (
    netsh advfirewall firewall add rule name="POS Backend %BACKEND_PORT%" dir=in action=allow protocol=TCP localport=%BACKEND_PORT% >nul 2>&1
    echo    Rule added.
) else (
    echo    Rule already exists.
)

:: ── Step 6: Kill old Node processes on ports ─────────────────────────────────
echo.
echo [6/6] Stopping old processes on ports %BACKEND_PORT%-%CLIENT_PORT%...
powershell -NoProfile -Command ^
  "$ports=7000,7001; foreach($p in $ports){ try{ $c=Get-NetTCPConnection -LocalPort $p -State Listen -EA Stop; foreach($x in $c){ $proc=Get-Process -Id $x.OwningProcess -EA SilentlyContinue; if($proc -and $proc.ProcessName -eq 'node'){ Stop-Process -Id $proc.Id -Force }}} catch{} }"
echo    Done.

:: ── Update .env ALLOWED_ORIGINS with current IP ──────────────────────────────
powershell -NoProfile -Command ^
  "$env='%BACKEND%\.env'; $ip='%PC_IP%'; if(Test-Path $env){ $c=Get-Content $env -Raw; $new='ALLOWED_ORIGINS=http://localhost:7001,http://'+$ip+':7001'; $c=$c -replace 'ALLOWED_ORIGINS=.*',$new; Set-Content $env $c }" >nul 2>&1

:: ── Start Backend ─────────────────────────────────────────────────────────────
echo.
echo Starting backend on port %BACKEND_PORT%...
start "POS Backend :7000" cmd /k "title POS Backend :7000 && cd /d "%BACKEND%" && npm run dev"

:: ── Start Frontend ────────────────────────────────────────────────────────────
echo Starting frontend on port %CLIENT_PORT%...
start "POS Frontend :7001" cmd /k "title POS Frontend :7001 && cd /d "%CLIENT%" && npm run dev -- --host 0.0.0.0 --port %CLIENT_PORT%"

:: ── Wait for backend ─────────────────────────────────────────────────────────
echo.
echo Waiting for backend to start...
set "READY=0"
for /L %%i in (1,1,20) do (
    if "!READY!"=="0" (
        timeout /t 3 /nobreak >nul
        powershell -NoProfile -Command "try{Invoke-WebRequest -Uri 'http://localhost:%BACKEND_PORT%/health' -UseBasicParsing -TimeoutSec 2 | Out-Null; exit 0}catch{exit 1}" >nul 2>&1
        if not errorlevel 1 set "READY=1"
        <nul set /p "=."
    )
)

echo.
echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║                  ✅  ALL SYSTEMS GO                   ║
echo  ╠══════════════════════════════════════════════════════╣
echo  ║                                                      ║
echo  ║  Dashboard   : http://localhost:7001                 ║
echo  ║  Backend API : http://localhost:7000                 ║
echo  ║  Android URL : http://%PC_IP%:7000/           ║
echo  ║                                                      ║
echo  ║  Login: admin / admin1234                            ║
echo  ║                                                      ║
echo  ╚══════════════════════════════════════════════════════╝
echo.

if "!READY!"=="1" (
    start "" "http://localhost:%CLIENT_PORT%"
) else (
    echo  Backend not ready — open http://localhost:%CLIENT_PORT% manually.
)

powershell -NoProfile -Command "[console]::beep(1200,150); Start-Sleep -ms 80; [console]::beep(1500,200)" >nul 2>&1

echo.
echo  Press any key to close this window.
echo  (Backend and Frontend keep running in their own windows)
pause >nul
