param([switch]$StopOnly)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot
$exe=(Resolve-Path (Join-Path $root 'target/release/keybi.exe')).Path
$port=if($env:FOLIO_PORT){[int]$env:FOLIO_PORT}else{4317}
$serviceRoot=Join-Path $root "target/local-server/$port"
$slots=@((Join-Path $serviceRoot 'a/keybi.exe'),(Join-Path $serviceRoot 'b/keybi.exe'))
$previousSlots=@((Join-Path $root 'target/release/folio-studio.exe'),(Join-Path $serviceRoot 'a/folio-studio.exe'),(Join-Path $serviceRoot 'b/folio-studio.exe'))
$listeners=Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
$owners=@($listeners.OwningProcess | Where-Object {$_} | Select-Object -Unique | ForEach-Object {Get-Process -Id $_})
foreach($process in $owners){
  if($process.Path -notin (@($exe)+$slots+$previousSlots)){throw "Port $port belongs to another executable."}
}
if(!$StopOnly){
  # Windows locks a running executable. Stage the next release before stopping
  # the current listener so the normal Cargo output stays writable during use.
  $next=$slots | Where-Object {$_ -notin $owners.Path} | Select-Object -First 1
  if(!$next){throw "Both local server slots are in use."}
  [IO.Directory]::CreateDirectory((Split-Path $next)) | Out-Null
  Copy-Item -LiteralPath $exe -Destination $next -Force
}
foreach($process in $owners){
  $process.Kill()
  if(!$process.WaitForExit(5000)){throw "The previous local server is still running."}
}
if($StopOnly){return}
$instance=Start-Process -FilePath $next -WorkingDirectory $root -WindowStyle Hidden -PassThru
for($attempt=0;$attempt -lt 30;$attempt++){
  if($instance.HasExited){throw "Studio exited during startup."}
  try{$response=Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$port/api/reports" -TimeoutSec 2;if($response.StatusCode -eq 200){Write-Output "Studio listening on port $port (PID $($instance.Id))";return}}catch{}
  Start-Sleep -Milliseconds 150
}
throw "Studio did not become ready."
