@echo off
SETLOCAL EnableExtensions EnableDelayedExpansion
title RAWBANK-VISA-BATCH-20260816-1LIV Updater
set "ROOT=%~dp0"
set "BATCH=%ROOT%RAWBANK-VISA-BATCH-20260816-1LIV.csv"
set "APPROVAL=%~1"
if "%APPROVAL%"=="" (
  echo.
  echo   Usage: update_batch_approval_1LIV.bat ^<4-digit-code^>
  echo   Example: update_batch_approval_1LIV.bat 7482
  echo.
  goto :end
)
echo %APPROVAL%| findstr /r "^[0-9][0-9]*$" >nul
if errorlevel 1 (
  echo   [FAIL] Not a numeric 4-digit code: %APPROVAL%
  goto :end
)
if not "%APPROVAL:~4,1%"=="" (
  echo   [FAIL] Code must be exactly 4 digits: %APPROVAL% (len %APPROVAL: =%)
  goto :end
)
if not exist "%BATCH%" (
  echo   [FAIL] Batch CSV NOT FOUND at %BATCH%
  goto :end
)
powershell -NoProfile -Command ^
  "$p='%BATCH%'; $code='%APPROVAL%'; $c=Get-Content $p -Raw; if($c -match '(?<=,TXN,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,)[0-9A-Za-z]{4}(?=,MANUAL,)'){ $c=$c -replace '(?<=,TXN,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,)[0-9A-Za-z]{4}(?=,MANUAL,)',$code; Set-Content $p $c -NoNewline; Write-Host ('   [OK] Batch CSV {0} updated -> approval = {1}' -f (Split-Path $p -Leaf), $code) } else { Write-Host '   [WARN] CSV pattern not matched (may already be updated or corrupted)' }" 2>&1
:end
echo.
pause
