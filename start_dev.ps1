$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$backendDir = Join-Path $root 'backend'
$clientDir = Join-Path $root 'client'
$clientPort = 7001

for ($port = 7001; $port -le 7020; $port++) {
    $listener = $null
    try {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
        $listener.Start()
        $listener.Stop()
        $clientPort = $port
        break
    }
    catch {
        continue
    }
    finally {
        if ($listener) { $listener.Stop() }
    }
}

Write-Host "Starting backend..."
Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "cd /d `"$backendDir`" && npm install && npm run dev" -WindowStyle Normal

Write-Host "Building and starting client on port $clientPort..."
Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "cd /d `"$clientDir`" && npm install && npm run build && npm run dev -- --host 0.0.0.0 --port $clientPort" -WindowStyle Normal

Start-Sleep -Seconds 6
$clientUrl = "http://localhost:$clientPort/login"
try {
    Invoke-WebRequest -Uri $clientUrl -UseBasicParsing -TimeoutSec 3 | Out-Null
    Write-Host "Opening $clientUrl"
    Start-Process $clientUrl
    [console]::beep(1400, 180)
}
catch {
    Write-Host "Client is still starting. Open $clientUrl manually if needed."
    [console]::beep(800, 220)
}
