@echo off
SETLOCAL EnableExtensions EnableDelayedExpansion

set "ROOT=%~dp0"
set "BACKEND=%ROOT%backend"
set "CLIENT=%ROOT%client"

:: Detect current PC IP for Android
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
echo   POS OFFLINE SOFTWARE
echo  ==========================================
echo   Backend  : http://localhost:7000
echo   Frontend : http://localhost:7001
echo   Android  : http://%PC_IP%:7000/
echo  ==========================================
echo.

:: Kill any existing Node on ports 7000 and 7001
echo Stopping old processes...
powershell -NoProfile -Command "$ports=7000,7001; foreach($p in $ports){ try{ $c=Get-NetTCPConnection -LocalPort $p -State Listen -EA Stop; foreach($x in $c){ $proc=Get-Process -Id $x.OwningProcess -EA SilentlyContinue; if($proc -and $proc.ProcessName -eq 'node'){ Stop-Process -Id $proc.Id -Force }}} catch{} }" >nul 2>&1
timeout /t 2 /nobreak >nul

:: Add firewall rule for Android access (silent)
netsh advfirewall firewall show rule name="POS Backend 7000" >nul 2>&1
if errorlevel 1 (
    netsh advfirewall firewall add rule name="POS Backend 7000" dir=in action=allow protocol=TCP localport=7000 >nul 2>&1
)

:: Start Backend in its own window
echo Starting Backend...
start "POS Backend :7000" cmd /k "cd /d "%BACKEND%" && npm run dev"

:: Start Frontend in its own window
echo Starting Frontend...
start "POS Frontend :7001" cmd /k "cd /d "%CLIENT%" && npm run dev -- --host 0.0.0.0 --port 7001"

:: Wait for backend to be ready (up to 60 seconds)
echo.
echo Waiting for backend...
set "READY=0"
for /L %%i in (1,1,20) do (
    if "!READY!"=="0" (
        timeout /t 3 /nobreak >nul
        powershell -NoProfile -Command "try{Invoke-WebRequest -Uri 'http://localhost:7000/health' -UseBasicParsing -TimeoutSec 2|Out-Null;exit 0}catch{exit 1}" >nul 2>&1
        if not errorlevel 1 set "READY=1"
        <nul set /p "=."
    )
)

echo.
echo.
echo  ==========================================
if "!READY!"=="1" (
    echo   Backend is READY
) else (
    echo   Backend starting (may need a few more seconds)
)
echo   Opening dashboard...
echo  ==========================================
echo.

:: Open browser
start "" "http://localhost:7001"

:: Beep twice
powershell -NoProfile -Command "[console]::beep(1200,200); Start-Sleep -Milliseconds 100; [console]::beep(1500,300)" >nul 2>&1

echo  Done! Close this window anytime.
echo  Backend and Frontend are running in their own windows.
echo.
echo  Android URL: http://%PC_IP%:7000/
echo.
pause
