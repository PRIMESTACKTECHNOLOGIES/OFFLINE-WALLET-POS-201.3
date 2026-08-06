@echo off
title Building POS Debug APK...
echo.
echo ╔══════════════════════════════════════════╗
echo ║     Building POS Android Debug APK       ║
echo ╚══════════════════════════════════════════╝
echo.

cd /d "%~dp0android_pos_app"

echo Running Gradle assembleDebug...
call gradlew.bat assembleDebug

if errorlevel 1 (
    echo.
    echo ❌ Build FAILED. Check errors above.
    pause
    exit /b 1
)

echo.
echo ✅ Build SUCCESS!
echo.
echo APK location:
echo   %~dp0android_pos_app\app\build\outputs\apk\debug\app-debug.apk
echo.

:: Copy APK to root folder for easy access
copy /Y "app\build\outputs\apk\debug\app-debug.apk" "%~dp0POS-App-Debug.apk" >nul 2>&1
if not errorlevel 1 (
    echo   Also copied to: %~dp0POS-App-Debug.apk
)

echo.
echo Install on connected Android device? (make sure USB debugging is ON)
set /p INSTALL="Press Y to install via ADB, any other key to skip: "
if /i "%INSTALL%"=="Y" (
    adb install -r "%~dp0POS-App-Debug.apk"
)

echo.
pause
