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
# Evita que mensagens informativas do ADB em stderr sejam tratadas como excecao no PowerShell.
Set-Variable -Name PSNativeCommandUseErrorActionPreference -Value $false -ErrorAction SilentlyContinue

function Resolve-SdkPath {
    $localPropsPath = Join-Path (Split-Path $PSScriptRoot -Parent) "local.properties"
    if (Test-Path $localPropsPath) {
        $sdkLine = Get-Content $localPropsPath | Where-Object { $_ -match "^sdk\.dir=" } | Select-Object -First 1
        if ($sdkLine) {
            $raw = $sdkLine.Substring("sdk.dir=".Length)
            $normalized = $raw -replace "\\:", ":" -replace "\\\\", "\"
            if (Test-Path $normalized) {
                return $normalized
            }
        }
    }

    $fallback = Join-Path $env:LOCALAPPDATA "Android\Sdk"
    if (Test-Path $fallback) {
        return $fallback
    }

    throw "Android SDK nao encontrado. Configure sdk.dir em android-app/local.properties."
}

function Get-OnlineEmulatorSerial([string]$adbPath) {
    $lines = & $adbPath devices
    foreach ($line in $lines) {
        if ($line -match "^(emulator-\d+)\s+device\b") {
            return $matches[1]
        }
    }
    return $null
}

function Wait-ForEmulatorOnline([string]$adbPath, [int]$timeoutSec) {
    $deadline = (Get-Date).AddSeconds($timeoutSec)
    do {
        $serial = Get-OnlineEmulatorSerial -adbPath $adbPath
        if ($serial) {
            return $serial
        }
        Start-Sleep -Seconds 6
    } while ((Get-Date) -lt $deadline)

    throw "Nenhum emulador entrou em estado 'device' dentro de $timeoutSec segundos."
}

function Wait-ForBootComplete([string]$adbPath, [string]$serial, [int]$timeoutSec) {
    $deadline = (Get-Date).AddSeconds($timeoutSec)
    do {
        $bootCompleted = (& $adbPath -s $serial shell getprop sys.boot_completed 2>$null)
        if ($bootCompleted -and $bootCompleted.Trim() -eq "1") {
            return
        }
        Start-Sleep -Seconds 6
    } while ((Get-Date) -lt $deadline)

    throw "Emulador $serial nao finalizou boot (sys.boot_completed=1) dentro de $timeoutSec segundos."
}

function Start-EmulatorProcess(
    [string]$emulatorPath,
    [string]$avdName,
    [switch]$headless,
    [switch]$noSnapshotLoad
) {
    $args = @(
        "-avd", $avdName,
        "-gpu", "swiftshader_indirect",
        "-no-boot-anim",
        "-no-audio"
    )

    if ($noSnapshotLoad) {
        $args += "-no-snapshot-load"
    }

    if ($headless) {
        $args += "-no-window"
    }

    Start-Process -FilePath $emulatorPath -ArgumentList $args | Out-Null
}

$projectRoot = Split-Path $PSScriptRoot -Parent
$sdkPath = Resolve-SdkPath
$adbPath = Join-Path $sdkPath "platform-tools\adb.exe"
$emulatorPath = Join-Path $sdkPath "emulator\emulator.exe"
$gradlePath = Join-Path $projectRoot "gradlew.bat"

if (-not (Test-Path $adbPath)) {
    throw "adb.exe nao encontrado em: $adbPath"
}
if (-not (Test-Path $emulatorPath)) {
    throw "emulator.exe nao encontrado em: $emulatorPath"
}
if (-not (Test-Path $gradlePath)) {
    throw "gradlew.bat nao encontrado em: $gradlePath"
}

if ($CleanEmulator) {
    Get-Process | Where-Object {
        $_.ProcessName -eq "emulator" -or $_.ProcessName -like "qemu-system-*"
    } | Stop-Process -Force
}

& $adbPath kill-server | Out-Null 2>$null
& $adbPath start-server | Out-Null 2>$null

$serial = Get-OnlineEmulatorSerial -adbPath $adbPath
if (-not $serial) {
    Start-EmulatorProcess -emulatorPath $emulatorPath -avdName $AvdName -headless:$Headless -noSnapshotLoad:$NoSnapshotLoad
    $serial = Wait-ForEmulatorOnline -adbPath $adbPath -timeoutSec $BootTimeoutSec
}

Wait-ForBootComplete -adbPath $adbPath -serial $serial -timeoutSec $BootTimeoutSec

Push-Location $projectRoot
try {
    & $gradlePath $InstallTask
} finally {
    Pop-Location
}

if ([string]::IsNullOrWhiteSpace($DeepLinkUrl)) {
    & $adbPath -s $serial shell am start -n "$PackageName/$ActivityName" | Out-Null
} else {
    & $adbPath -s $serial shell am start -a android.intent.action.VIEW -d $DeepLinkUrl | Out-Null
}

Write-Output "OK: emulador=$serial, app instalada e aberta."
