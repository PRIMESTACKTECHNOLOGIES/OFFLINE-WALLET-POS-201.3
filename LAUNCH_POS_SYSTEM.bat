@echo off
REM ════════════════════════════════════════════════════════════════════════════
REM  POS OFFLINE SYSTEM LAUNCHER
REM  Double-click this to start the entire POS system
REM ════════════════════════════════════════════════════════════════════════════

cls
echo.
echo  ╔════════════════════════════════════════════════════════════╗
echo  ║     POS OFFLINE - QUICK START LAUNCHER                    ║
echo  ║     v201.3 + Crypto Wallet                                ║
echo  ╚════════════════════════════════════════════════════════════╝
echo.

REM Check if start_all.bat exists
if not exist "%~dp0start_all.bat" (
    echo  ERROR: start_all.bat not found in the same directory
    echo  Please ensure both files are in the same folder
    pause
    exit /b 1
)

REM Run the main startup script
cd /d "%~dp0"
call start_all.bat
