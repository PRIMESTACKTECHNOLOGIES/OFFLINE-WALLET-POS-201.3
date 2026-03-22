# POS-201.3 Flutter Build Script
# Run this script to build the release APK

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  POS-201.3 Flutter Build Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Flutter is installed
try {
    $flutterVersion = flutter --version
    Write-Host "Flutter found" -ForegroundColor Green
} catch {
    Write-Host "Flutter not found. Please install Flutter first." -ForegroundColor Red
    Write-Host "Visit: https://docs.flutter.dev/get-started/install" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "Step 1: Cleaning previous builds..." -ForegroundColor Yellow
flutter clean

Write-Host ""
Write-Host "Step 2: Getting dependencies..." -ForegroundColor Yellow
flutter pub get

Write-Host ""
Write-Host "Step 3: Analyzing code..." -ForegroundColor Yellow
flutter analyze

Write-Host ""
Write-Host "Step 4: Running tests..." -ForegroundColor Yellow
flutter test

Write-Host ""
Write-Host "Step 5: Building Release APK..." -ForegroundColor Yellow
flutter build apk --release

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  BUILD SUCCESSFUL!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "APK Location:" -ForegroundColor Cyan
    Write-Host "  build\app\outputs\flutter-apk\app-release.apk" -ForegroundColor White
    Write-Host ""
    
    $apkPath = "build\app\outputs\flutter-apk\app-release.apk"
    if (Test-Path $apkPath) {
        $size = (Get-Item $apkPath).Length / 1MB
        Write-Host "APK Size: $([math]::Round($size, 2)) MB" -ForegroundColor Cyan
    }
    
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "  1. Install on device: adb install build\app\outputs\flutter-apk\app-release.apk" -ForegroundColor White
    Write-Host "  2. Or copy APK to device and install manually" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "  BUILD FAILED!" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Check the error messages above." -ForegroundColor Yellow
    exit 1
}
