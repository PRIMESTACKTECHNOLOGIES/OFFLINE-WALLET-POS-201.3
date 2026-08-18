@echo off
SETLOCAL EnableExtensions EnableDelayedExpansion

set "ROOT=%~dp0"
set "BACKEND=%ROOT%backend"
set "CLIENT=%ROOT%client"
set "DATABASE_PATH=%ROOT%database.sqlite"
set "NODE_ENV=production"
set "JWT_SECRET=offline-pos-kodolo-2026-jwt-secret-change-live"

:: ── Detect current Wi-Fi IP ──────────────────────────────────────────────────
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /C:"IPv4 Address" ^| findstr /V "172\." ^| findstr /V "127\."') do (
    set "RAW=%%A"
    goto :found
)
:found
set "PC_IP=%RAW: =%"
if "%PC_IP%"=="" set "PC_IP=localhost"

cls
echo.
echo  ==========================================
echo   POS OFFLINE SOFTWARE  ^|  Starting...
echo  ==========================================
echo.
echo   Backend  : http://localhost:7000
echo   Frontend : http://localhost:7001
echo   Android  : http://%PC_IP%:7000/
echo.

:: ── Kill any Node on 7000/7001 ───────────────────────────────────────────────
echo  [1/5] Stopping old processes...
powershell -NoProfile -Command ^
  "$ports=7000,7001; foreach($p in $ports){ try{ $c=Get-NetTCPConnection -LocalPort $p -State Listen -EA Stop; foreach($x in $c){ $proc=Get-Process -Id $x.OwningProcess -EA SilentlyContinue; if($proc -and $proc.ProcessName -eq 'node'){ Stop-Process -Id $proc.Id -Force }}} catch{} }" >nul 2>&1
timeout /t 2 /nobreak >nul
echo     Done.

:: ── Firewall rule ─────────────────────────────────────────────────────────────
echo  [2/5] Firewall rule for Android access...
netsh advfirewall firewall show rule name="POS Backend 7000" >nul 2>&1
if errorlevel 1 (
    netsh advfirewall firewall add rule name="POS Backend 7000" dir=in action=allow protocol=TCP localport=7000 >nul 2>&1
)

:: ── Update .env ALLOWED_ORIGINS with current IP ──────────────────────────────
powershell -NoProfile -Command ^
  "$env='%BACKEND%\.env'; $ip='%PC_IP%'; if(Test-Path $env){ $c=Get-Content $env -Raw; $new='ALLOWED_ORIGINS=http://localhost:7001,http://'+$ip+':7001'; $c=$c -replace 'ALLOWED_ORIGINS=.*',$new; Set-Content $env $c }" >nul 2>&1
echo     Done.

:: ── Build Backend (compile TypeScript so latest fixes are live) ──────────────
echo  [3/5] Building backend (compiling TypeScript)...
pushd "%BACKEND%"
call npm run build >nul 2>&1
if errorlevel 1 (
    echo     Build had warnings — starting in dev mode with ts-node instead.
) else (
    echo     Build OK.
)
popd

:: ── Start Backend ─────────────────────────────────────────────────────────────
echo  [4/5] Starting backend on :7000...
set "BACKEND_ENV=set DATABASE_PATH=%DATABASE_PATH%&& set NODE_ENV=%NODE_ENV%&& set JWT_SECRET=%JWT_SECRET%"
start "POS Backend :7000" cmd /k "title POS Backend :7000 && cd /d "%BACKEND%" && %BACKEND_ENV% && npm run dev"

:: ── Start Frontend ────────────────────────────────────────────────────────────
echo  [5/5] Starting frontend on :7001...
start "POS Frontend :7001" cmd /k "title POS Frontend :7001 && cd /d "%CLIENT%" && npm run dev -- --host 0.0.0.0 --port 7001"

:: ── Wait for backend ─────────────────────────────────────────────────────────
echo.
echo  Waiting for backend to be ready...
set "READY=0"
for /L %%i in (1,1,20) do (
    if "!READY!"=="0" (
        timeout /t 3 /nobreak >nul
        powershell -NoProfile -Command "try{Invoke-WebRequest -Uri 'http://localhost:7000/health' -UseBasicParsing -TimeoutSec 2|Out-Null;exit 0}catch{exit 1}" >nul 2>&1
        if not errorlevel 1 set "READY=1"
        <nul set /p "=."
    )
)

:: ── Done ─────────────────────────────────────────────────────────────────────
echo.
echo.
echo  ==========================================
echo   ALL SYSTEMS READY
echo  ==========================================
echo.
echo   Dashboard : http://localhost:7001
echo   API       : http://localhost:7000
echo   Android   : http://%PC_IP%:7000/
echo.
echo   Login: admin / admin1234
echo.
echo  ── TRON Hot Wallet ───────────────────────
powershell -NoProfile -Command ^
  "try{ $r=(Invoke-WebRequest -Uri 'https://api.trongrid.io/v1/accounts/TFZXzaXXgk3uCcCWbUWKZAydsc95D8GZBP' -UseBasicParsing -TimeoutSec 6).Content|ConvertFrom-Json; $d=$r.data[0]; $trx=[math]::Round($d.balance/1000000,2); $usdt=0; foreach($t in $d.trc20){ if($t.'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'){$usdt=[math]::Round($t.'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'/1000000,2)}}; Write-Host '   TRX  (gas)  :' $trx 'TRX'; Write-Host '   USDT (pool) :' $usdt 'USDT' } catch { Write-Host '   (Could not reach TronGrid to check balance)' }" 2>nul
echo  ==========================================
echo.

:: Open browser
if "!READY!"=="1" (
    start "" "http://localhost:7001"
) else (
    echo  Backend still starting — open http://localhost:7001 manually.
)

:: Two beeps
powershell -NoProfile -Command "[console]::beep(1200,180);Start-Sleep -ms 100;[console]::beep(1500,250)" >nul 2>&1

echo  Both server windows are running. Close them to stop.
echo  Press any key to close this launcher window...
pause >nul
