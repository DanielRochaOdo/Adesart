$ErrorActionPreference = "Stop"

$jdkPath = "C:\Program Files\Microsoft\jdk-21.0.10.7-hotspot"

if (!(Test-Path $jdkPath)) {
    throw "JDK nao encontrado em '$jdkPath'."
}

$env:JAVA_HOME = $jdkPath
$env:Path = "$jdkPath\bin;$env:Path"

& "$PSScriptRoot\gradlew.bat" assembleDebug
