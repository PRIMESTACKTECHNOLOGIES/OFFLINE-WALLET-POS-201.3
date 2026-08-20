@echo off
REM ════════════════════════════════════════════════════════════════════════════
REM  GITHUB PUSH SCRIPT - Push POS System to GitHub
REM ════════════════════════════════════════════════════════════════════════════

cls
echo.
echo  ╔════════════════════════════════════════════════════════════╗
echo  ║     PUSH POS SYSTEM TO GITHUB                             ║
echo  ║     Secure upload of all source code                      ║
echo  ╚════════════════════════════════════════════════════════════╝
echo.

cd /d "%~dp0"

REM Check if git is installed
git --version >nul 2>&1
if errorlevel 1 (
    echo  ❌ ERROR: Git is not installed
    echo  Please install Git from: https://git-scm.com/
    echo.
    pause
    exit /b 1
)

REM Check if .git folder exists
if not exist ".git" (
    echo  ⚠️  First time setup needed...
    echo.
    echo  Initializing git repository...
    git init
    git config user.name "POS Developer"
    git config user.email "pos.developer@example.com"
    echo.
    echo  ⚠️  You need to add the remote repository:
    echo.
    echo  1. Create repository on GitHub: https://github.com/new
    echo  2. Copy the repository URL
    echo  3. Run this command:
    echo     git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
    echo.
    echo  4. Then run this script again
    echo.
    pause
    exit /b 1
)

REM Show current status
echo  📊 Current Git Status:
echo.
git status
echo.

REM Ask for commit message
set /p commit_msg="📝 Enter commit message (or press Enter for auto-generated): "

if "%commit_msg%"=="" (
    for /f "tokens=2-4 delims=/ " %%a in ('date /t') do (set mydate=%%c-%%a-%%b)
    for /f "tokens=1-2 delims=/:" %%a in ('time /t') do (set mytime=%%a-%%b)
    set commit_msg=Auto-update: %mydate% %mytime%
)

REM Stage all changes
echo.
echo  ⏳ Staging files...
git add .
if errorlevel 1 (
    echo  ❌ Failed to stage files
    pause
    exit /b 1
)
echo  ✅ Files staged

REM Commit
echo.
echo  ⏳ Creating commit: "%commit_msg%"
git commit -m "%commit_msg%"
if errorlevel 1 (
    echo  ❌ Failed to commit (maybe nothing changed?)
    pause
    exit /b 1
)
echo  ✅ Commit created

REM Push
echo.
echo  ⏳ Pushing to GitHub (this may take a moment)...
git push -u origin main
if errorlevel 1 (
    echo.
    echo  ❌ Push failed! Check the error above
    echo.
    echo  Possible solutions:
    echo  1. Verify remote is configured: git remote -v
    echo  2. Check GitHub credentials
    echo  3. Ensure repository exists on GitHub
    echo  4. Check internet connection
    echo.
    pause
    exit /b 1
)

echo.
echo.
echo  ╔════════════════════════════════════════════════════════════╗
echo  ║  ✅ SUCCESS! Code pushed to GitHub                        ║
echo  ╚════════════════════════════════════════════════════════════╝
echo.
echo  📍 Next Steps:
echo     1. Verify on GitHub: https://github.com/YOUR_USERNAME/YOUR_REPO
echo     2. Deploy to Render: https://render.com
echo     3. Monitor logs and performance
echo.

REM Show recent commits
echo  📝 Recent Commits:
echo.
git log --oneline -5
echo.

timeout /t 5 /nobreak

