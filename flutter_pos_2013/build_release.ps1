# POS-201.3 Flutter Build Script
# Run this to build the release APK

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  POS-201.3 Flutter Release Builder" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Flutter is installed
try {
    $flutterVersion = flutter --version 2>&1 | Select-Object -First 1
    Write-Host "✓ Flutter found: $flutterVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ Flutter not found! Install Flutter first:" -ForegroundColor Red
    Write-Host "  https://docs.flutter.dev/get-started/install" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "Step 1: Cleaning previous build..." -ForegroundColor Yellow
flutter clean
if ($LASTEXITCODE -ne 0) {
    Write-Host "Warning: Clean failed, continuing anyway..." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Step 2: Getting dependencies..." -ForegroundColor Yellow
flutter pub get
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Failed to get dependencies!" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Dependencies installed" -ForegroundColor Green

Write-Host ""
Write-Host "Step 3: Running flutter doctor..." -ForegroundColor Yellow
flutter doctor

Write-Host ""
Write-Host "Step 4: Building release APK..." -ForegroundColor Yellow
Write-Host "  (This may take 2-5 minutes...)" -ForegroundColor Gray
flutter build apk --release

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "=========================================" -ForegroundColor Green
    Write-Host "  ✓ BUILD SUCCESSFUL!" -ForegroundColor Green
    Write-Host "=========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "APK Location:" -ForegroundColor Cyan
    Write-Host "  build\app\outputs\flutter-apk\app-release.apk" -ForegroundColor White
    Write-Host ""
    Write-Host "APK Size:" -ForegroundColor Cyan
    $apkPath = "build\app\outputs\flutter-apk\app-release.apk"
    if (Test-Path $apkPath) {
        $size = (Get-Item $apkPath).Length / 1MB
        Write-Host "  $([math]::Round($size, 2)) MB" -ForegroundColor White
    }
    Write-Host ""
    Write-Host "Next Steps:" -ForegroundColor Yellow
    Write-Host "  1. Install on Android device" -ForegroundColor White
    Write-Host "  2. Configure MyFatoorah token in Settings" -ForegroundColor White
    Write-Host "  3. Test payment flow" -ForegroundColor White
} else {
    Write-Host ""
    Write-Host "=========================================" -ForegroundColor Red
    Write-Host "  ✗ BUILD FAILED!" -ForegroundColor Red
    Write-Host "=========================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Check the error messages above." -ForegroundColor Yellow
    Write-Host "Common fixes:" -ForegroundColor Yellow
    Write-Host "  - Run: flutter doctor" -ForegroundColor White
    Write-Host "  - Check Android SDK path" -ForegroundColor White
    Write-Host "  - Update dependencies: flutter pub upgrade" -ForegroundColor White
}

Write-Host ""
Write-Host "Press any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
