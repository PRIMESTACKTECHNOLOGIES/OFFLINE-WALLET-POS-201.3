@echo off
cd /d "%~dp0"

if not exist "%~dp0start_all.bat" (
    echo ERROR: start_all.bat not found in this folder.
    pause
    exit /b 1
)

call start_all.bat
