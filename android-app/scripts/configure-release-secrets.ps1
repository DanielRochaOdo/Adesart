param(
    [string]$Repository = 'DanielRochaOdo/Adesart',
    [string]$AndroidKeystore = '',
    [string]$IosCertificateP12 = '',
    [string]$IosProvisioningProfile = '',
    [string]$IosTeamId = '',
    [ValidateSet('development', 'app-store-connect')]
    [string]$IosSigningMode = 'development'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw "GitHub CLI nao encontrado. Instale com: winget install --id GitHub.cli"
}
& gh auth status | Out-Host
if ($LASTEXITCODE -ne 0) {
    throw 'Execute gh auth login antes de configurar os secrets.'
}

$androidRoot = Split-Path -Parent $PSScriptRoot
$propertiesPath = Join-Path $androidRoot 'local.properties'

function Read-PropertiesFile {
    param([string]$Path)
    $result = @{}
    if (-not (Test-Path $Path)) { return $result }

    foreach ($line in Get-Content $Path) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
        $index = $trimmed.IndexOf('=')
        if ($index -lt 1) { continue }
        $key = $trimmed.Substring(0, $index).Trim()
        $value = $trimmed.Substring($index + 1).Trim()
        $value = $value -replace '\\:', ':'
        $value = $value -replace '\\\\', '\'
        $result[$key] = $value
    }
    return $result
}

function Set-GitHubSecret {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Value
    )
    if ([string]::IsNullOrWhiteSpace($Value)) {
        throw "Valor vazio para secret $Name."
    }
    $Value | & gh secret set $Name -R $Repository
    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao gravar GitHub Secret $Name."
    }
    Write-Host "OK: $Name" -ForegroundColor Green
}

$props = Read-PropertiesFile $propertiesPath

if (-not $AndroidKeystore) {
    $relative = $props['releaseStoreFile']
    if ($relative) {
        $AndroidKeystore = Join-Path $androidRoot $relative
    }
}

if (-not $AndroidKeystore -or -not (Test-Path $AndroidKeystore)) {
    throw 'Informe -AndroidKeystore apontando para o JKS de producao.'
}

$keystoreBase64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Resolve-Path $AndroidKeystore)))
Set-GitHubSecret 'ANDROID_KEYSTORE_BASE64' $keystoreBase64
Set-GitHubSecret 'ANDROID_KEYSTORE_PASSWORD' $props['releaseStorePassword']
Set-GitHubSecret 'ANDROID_KEY_ALIAS' $props['releaseKeyAlias']
Set-GitHubSecret 'ANDROID_KEY_PASSWORD' $props['releaseKeyPassword']
Set-GitHubSecret 'SUPABASE_URL' $props['supabaseUrl']
Set-GitHubSecret 'SUPABASE_ANON_KEY' $props['supabaseAnonKey']

if ($props['publicAppUrl']) {
    $props['publicAppUrl'] | & gh variable set PUBLIC_APP_URL -R $Repository
    if ($LASTEXITCODE -ne 0) {
        throw 'Falha ao gravar PUBLIC_APP_URL.'
    }
    Write-Host 'OK: PUBLIC_APP_URL' -ForegroundColor Green
}

$iosValues = @($IosCertificateP12, $IosProvisioningProfile, $IosTeamId)
$iosProvided = @($iosValues | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }).Count

if ($iosProvided -eq 0) {
    Write-Host ''
    Write-Host 'Android configurado. iOS ainda nao foi configurado porque nenhum certificado/profile Apple foi informado.' -ForegroundColor Yellow
    Write-Host 'Quando tiver os arquivos Apple, rode este script novamente com -IosCertificateP12, -IosProvisioningProfile e -IosTeamId.'
    exit 0
}

if ($iosProvided -ne 3) {
    throw 'Para iOS informe juntos: -IosCertificateP12, -IosProvisioningProfile e -IosTeamId.'
}
if (-not (Test-Path $IosCertificateP12)) {
    throw "P12 nao encontrado: $IosCertificateP12"
}
if (-not (Test-Path $IosProvisioningProfile)) {
    throw "Provisioning profile nao encontrado: $IosProvisioningProfile"
}

$securePassword = Read-Host 'Senha do certificado .p12' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
    $p12Password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
}
finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}

$p12Base64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Resolve-Path $IosCertificateP12)))
$profileBase64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Resolve-Path $IosProvisioningProfile)))

if ($IosSigningMode -eq 'app-store-connect') {
    Set-GitHubSecret 'IOS_APPSTORE_CERTIFICATE_P12_BASE64' $p12Base64
    Set-GitHubSecret 'IOS_APPSTORE_CERTIFICATE_PASSWORD' $p12Password
    Set-GitHubSecret 'IOS_APPSTORE_PROVISIONING_PROFILE_BASE64' $profileBase64
}
else {
    Set-GitHubSecret 'IOS_CERTIFICATE_P12_BASE64' $p12Base64
    Set-GitHubSecret 'IOS_CERTIFICATE_PASSWORD' $p12Password
    Set-GitHubSecret 'IOS_PROVISIONING_PROFILE_BASE64' $profileBase64
}
Set-GitHubSecret 'IOS_TEAM_ID' $IosTeamId

Write-Host ''
Write-Host "Secrets Android + iOS ($IosSigningMode) configurados." -ForegroundColor Green
