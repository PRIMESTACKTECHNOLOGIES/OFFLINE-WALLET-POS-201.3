# 🚀 GitHub Push & Deployment Guide

This guide helps you push the POS Offline system with Crypto Wallet to GitHub and deploy to production.

## Prerequisites

1. **Git installed** - Download from https://git-scm.com/
2. **GitHub account** - https://github.com
3. **GitHub repository created** - Create an empty repo (don't initialize with README)
4. **GitHub Personal Access Token** - For authentication

## Step 1: Create GitHub Repository

1. Go to https://github.com/new
2. Enter Repository name: `pos-offline-system` (or your choice)
3. Select **Private** (recommended) or **Public**
4. Click "Create repository"
5. Copy the repository URL (e.g., `https://github.com/yourname/pos-offline-system.git`)

## Step 2: Generate GitHub Personal Access Token

1. Go to https://github.com/settings/tokens/new
2. Select scopes: `repo`, `workflow`
3. Click "Generate token"
4. **Copy the token** (you won't see it again!)

## Step 3: Initialize Git Repository (First Time Only)

```bash
cd "C:\POS OFFLINE SFTWR"
git init
git config user.name "Your Name"
git config user.email "your.email@example.com"
git add .
git commit -m "Initial commit: POS Offline System v201.3 with Crypto Wallet"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/pos-offline-system.git
git push -u origin main
```

## Step 4: Use the Quick Push Script

Create `PUSH_TO_GITHUB.bat` in the root directory and run it:

```batch
@echo off
REM This script pushes all changes to GitHub

cd /d "%~dp0"

echo.
echo Checking git status...
git status

echo.
set /p message="Enter commit message (or press Enter for 'Auto-update'): "
if "%message%"=="" set "message=Auto-update: POS system changes"

echo.
echo Staging files...
git add .

echo.
echo Committing...
git commit -m "%message%"

echo.
echo Pushing to GitHub...
git push origin main

echo.
echo ✅ Push complete!
echo.
pause
```

## Step 5: Push to GitHub

### Option A: Using the Bat Script (Easiest)

Simply run: `PUSH_TO_GITHUB.bat`

### Option B: Manual Git Commands

```bash
cd "C:\POS OFFLINE SFTWR"

# Check what changed
git status

# Stage all changes
git add .

# Commit with message
git commit -m "Update: Added crypto wallet system, updated startup scripts"

# Push to GitHub
git push origin main
```

### Option C: Using Git GUI

1. Install GitHub Desktop from https://desktop.github.com
2. Open the repository
3. Review changes
4. Write commit message
5. Click "Commit to main"
6. Click "Push origin"

## What Gets Pushed

✅ **Included:**
- Backend services (Node.js + TypeScript)
- Frontend (React app)
- Android POS app source
- Configuration files
- Documentation
- Startup scripts
- Crypto wallet integration

❌ **NOT Included (in .gitignore):**
- `node_modules/` (too large - npm install will download)
- Database files (`.sqlite`)
- `.env` file (secrets - use `.env.example` instead)
- Build outputs (`dist/`, `build/`)
- IDE files (`.vscode/`, `.idea/`)

## Deployment to Render

After pushing to GitHub, deploy to Render:

1. Go to https://render.com
2. Connect your GitHub account
3. Create new **Web Service**
4. Select `pos-offline-system` repository
5. Configure:
   - **Name:** `pos-offline-system`
   - **Environment:** `Node`
   - **Build Command:** `cd backend && npm install && npm run build && cd ../client && npm install && npm run build`
   - **Start Command:** `cd backend && npm run start`
6. Add Environment Variables:
   ```
   DATABASE_PATH=/var/data/database.sqlite
   NODE_ENV=production
   JWT_SECRET=your-secret-key
   TRANSAK_API_KEY=your-key
   TRANSAK_WEBHOOK_SECRET=your-secret
   ```
7. Click "Create Web Service"

## Common Issues

### Issue: "fatal: not a git repository"

**Solution:**
```bash
cd "C:\POS OFFLINE SFTWR"
git init
```

### Issue: "Permission denied" when pushing

**Solution:**
1. Go to https://github.com/settings/tokens
2. Regenerate token
3. Use token as password when git prompts

### Issue: Large files error

**Solution:**
The `.gitignore` should prevent large files. If you get an error:
```bash
git rm --cached large_file.db
git commit -m "Remove large database file"
git push
```

### Issue: "Updates were rejected"

**Solution:**
```bash
git pull origin main
# Fix conflicts if any
git add .
git commit -m "Merge remote changes"
git push origin main
```

## Verify Push

1. Go to https://github.com/yourname/pos-offline-system
2. Check that files are there
3. Verify recent commits
4. Check that `.env` file is NOT there (security!)

## Branch Strategy (Optional)

For team development:

```bash
# Create feature branch
git checkout -b feature/crypto-wallet-improvements

# Make changes
git add .
git commit -m "Improve crypto wallet UI"

# Push to GitHub
git push origin feature/crypto-wallet-improvements

# Create Pull Request on GitHub
# After review, merge to main
```

## Next Steps

1. ✅ Push to GitHub (this guide)
2. ✅ Deploy to Render (production)
3. ✅ Set up CI/CD pipeline (auto-deploy on push)
4. ✅ Monitor logs on Render dashboard

## Security Checklist

- [ ] `.env` file is in `.gitignore` (don't push secrets!)
- [ ] No API keys in code comments
- [ ] Database files are ignored
- [ ] Private keys are not committed
- [ ] Use environment variables for secrets

---

**Ready to push?** Run `PUSH_TO_GITHUB.bat` and your POS system will be on GitHub!
