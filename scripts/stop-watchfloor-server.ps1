# Called by stop-watchfloor-server.cmd.
$loops = Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" | Where-Object { $_.CommandLine -match 'watchfloor-server-loop' }
foreach ($l in $loops) { Stop-Process -Id $l.ProcessId -Force -ErrorAction SilentlyContinue }
$listener = Get-NetTCPConnection -LocalPort 8088 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) { Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue }
if ($loops -or $listener) { 'Watchfloor server stopped.' } else { 'Watchfloor server was not running.' }
