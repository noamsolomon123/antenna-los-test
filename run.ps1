# Antenna LOS - robust Windows launcher.
# Finds a free port, starts the local server (correct MIME), waits until it is
# actually listening, THEN opens the browser. Falls back to the online version.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$pages = 'https://noamsolomon123.github.io/antenna-los-test/'

function Test-PortFree([int]$p) {
  $l = $null
  try { $l = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $p); $l.Start(); return $true }
  catch { return $false }
  finally { if ($l) { $l.Stop() } }
}

# pick the first free port from a small list
$port = $null
foreach ($p in 8080, 8090, 8099, 8123, 8765) { if (Test-PortFree $p) { $port = $p; break } }
if (-not $port) { $port = 8080 }
$url = "http://localhost:$port/"

# choose a runtime: Python (serve.py) preferred, then Node (server.js)
$cmd = $null; $args = $null
if (Get-Command py -ErrorAction SilentlyContinue)          { $cmd = 'py';     $args = @('serve.py', "$port") }
elseif (Get-Command python -ErrorAction SilentlyContinue)  { $cmd = 'python'; $args = @('serve.py', "$port") }
elseif (Get-Command node -ErrorAction SilentlyContinue)    { $cmd = 'node';   $args = @('server.js', "$port") }

if (-not $cmd) {
  Write-Host 'No Python or Node found - opening the online version instead.'
  Start-Process $pages
  return
}

Write-Host "Starting Antenna LOS on $url ..."
$proc = Start-Process -FilePath $cmd -ArgumentList $args -NoNewWindow -PassThru

# wait (up to ~10s) until the server is accepting connections, then open the browser
$ready = $false
for ($i = 0; $i -lt 50; $i++) {
  Start-Sleep -Milliseconds 200
  try { $c = [System.Net.Sockets.TcpClient]::new('127.0.0.1', $port); if ($c.Connected) { $c.Close(); $ready = $true; break } } catch {}
}
if (-not $ready) { Write-Host 'Server did not start in time - opening the online version.'; Start-Process $pages; return }

Start-Process $url
Write-Host "Antenna LOS is running. Close this window to stop the server."
Wait-Process -Id $proc.Id
