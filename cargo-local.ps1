param([Parameter(ValueFromRemainingArguments=$true)][string[]]$CargoArgs)
$ErrorActionPreference = 'Stop'
$toolchain = Join-Path $PSScriptRoot '.toolchain'
if (Test-Path (Join-Path $toolchain 'cargo/bin/cargo.exe')) {
    $env:RUSTUP_HOME = Join-Path $toolchain 'rustup'
    $env:CARGO_HOME = Join-Path $toolchain 'cargo'
    $env:Path = (Join-Path $env:CARGO_HOME 'bin') + ';' + $env:Path
    $gcc = Join-Path $toolchain 'mingw64/bin'
    if (Test-Path $gcc) { $env:Path = $gcc + ';' + $env:Path }
}
cargo @CargoArgs
exit $LASTEXITCODE
