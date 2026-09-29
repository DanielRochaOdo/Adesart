param(
    [string]$AvdName = "VendaMais_API_35",
    [string]$PackageName = "br.com.vendamais.mobile",
    [string]$ActivityName = ".MainActivity",
    [string]$InstallTask = ":app:installDebug",
    [string]$DeepLinkUrl = "",
    [int]$BootTimeoutSec = 420,
    [switch]$CleanEmulator,
    [switch]$Headless,
    [switch]$NoSnapshotLoad = $true
)

$ErrorActionPreference = "Stop"

$runnerPath = Join-Path $PSScriptRoot "scripts\run-mobile.ps1"
if (-not (Test-Path $runnerPath)) {
    throw "Script base nao encontrado: $runnerPath"
}

& $runnerPath `
    -AvdName $AvdName `
    -PackageName $PackageName `
    -ActivityName $ActivityName `
    -InstallTask $InstallTask `
    -DeepLinkUrl $DeepLinkUrl `
    -BootTimeoutSec $BootTimeoutSec `
    -CleanEmulator:$CleanEmulator `
    -Headless:$Headless `
    -NoSnapshotLoad:$NoSnapshotLoad
