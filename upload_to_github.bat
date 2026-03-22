@echo off
echo ================================================
echo   GITHUB UPLOAD - POS OFFLINE SYSTEM
echo ================================================
echo.

set USERNAME=Darkweb191
set REPO=pos-offline-system
set URL=https://github.com/%USERNAME%/%REPO%.git

echo Username: %USERNAME%
echo Repository: %REPO%
echo URL: %URL%
echo.

REM Remove old Git
echo Removing old Git history...
if exist .git rmdir /s /q .git

REM Initialize new Git
echo Initializing new Git repository...
git init

REM Add files
echo Adding all files...
git add .

REM Commit
echo Creating commit...
git commit -m "Initial commit - POS Offline System"

REM Add remote
echo Adding GitHub remote...
git remote add origin %URL%

REM Push
echo Pushing to GitHub...
git branch -M main
git push -u origin main

if %ERRORLEVEL% == 0 (
    echo.
    echo ================================================
    echo   SUCCESS! Uploaded to:
    echo   %URL%
    echo ================================================
) else (
    echo.
    echo ================================================
    echo   PUSH FAILED!
    echo   Make sure repository exists at GitHub
    echo ================================================
)

echo.
pause
