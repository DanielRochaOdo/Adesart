$ErrorActionPreference = "Stop"

$emulatorName = "VendaMais_API_35"
$emulatorExe = Join-Path $env:LOCALAPPDATA "Android\Sdk\emulator\emulator.exe"
$avdDir = Join-Path $env:USERPROFILE ".android\avd\$emulatorName.avd"

if (!(Test-Path $emulatorExe)) {
    throw "Emulator nao encontrado em '$emulatorExe'."
}

Get-Process | Where-Object {
    $_.ProcessName -in @("emulator", "qemu-system-x86_64")
} | Stop-Process -Force -ErrorAction SilentlyContinue

if (Test-Path $avdDir) {
    Get-ChildItem $avdDir -Filter "*.lock" -Recurse -ErrorAction SilentlyContinue |
        Remove-Item -Force -Recurse -ErrorAction SilentlyContinue
}

Start-Process -FilePath $emulatorExe -ArgumentList @(
    "-avd", $emulatorName,
    "-no-snapshot-load",
    "-gpu", "swiftshader_indirect"
)
