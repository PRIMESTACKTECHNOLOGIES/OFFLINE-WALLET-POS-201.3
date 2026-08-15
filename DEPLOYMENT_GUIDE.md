# Deployment Guide

## 1. Backend hosting

### Option A: Render
1. Push this repository to GitHub.
2. Create a new Web Service on Render.
3. Use the root folder as the repository root.
4. Set the build command to:
   npm install --prefix backend && npm --prefix backend run build
5. Set the start command to:
   npm --prefix backend start
6. Add these environment variables:
   - PORT=10000
   - JWT_SECRET=<strong-random-string>
   - ALLOWED_ORIGINS=https://your-frontend-domain.com

### Option B: Docker
Run:

```bash
docker compose up -d --build
```

The API will be exposed on port 7000.

## 2. Frontend configuration

Set this environment variable for the web dashboard:

```env
VITE_API_URL=https://your-backend-domain.com
```

## 3. Android app

Open the app settings and enter the same backend URL, for example:

```text
https://your-backend-domain.com
```

## 4. Verify

Open:

```text
https://your-backend-domain.com/health
```

It should return a JSON response with status ok.
