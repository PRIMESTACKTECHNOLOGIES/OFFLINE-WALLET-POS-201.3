@echo off
setlocal enabledelayedexpansion

:: ======================================================================
:: AM GLOBAL POS - QUICK DASHBOARD ACCESS
:: ======================================================================

set "POS_DASHBOARD_URL=https://pos-offline-system.onrender.com"
set "RENDER_CONTROL_PANEL=https://dashboard.render.com"

echo.
echo ==========================================================
echo    AM GLOBAL POS - CONNECTING TO ALL DASHBOARDS...
echo ==========================================================
echo.
echo 1. Opening POS DASHBOARD: %POS_DASHBOARD_URL%
echo 2. Opening RENDER CONTROL PANEL: %RENDER_CONTROL_PANEL%
echo.
echo Note: If this is the first time today, it may take 
echo 50-60 seconds to wake up the Render server.
echo.

:: Open the POS Dashboard
start "" "%POS_DASHBOARD_URL%"

:: Open the Render Control Panel (so they can see logs if needed)
start "" "%RENDER_CONTROL_PANEL%"

echo Dashboards launched successfully!
echo.
echo Press any key to close this window...
pause > nul
