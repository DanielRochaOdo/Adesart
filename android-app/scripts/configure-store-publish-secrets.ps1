param(
    [string]$Repository = 'DanielRochaOdo/Adesart',
    [string]$GooglePlayServiceAccountJson = '',
    [string]$AppStoreConnectApiKeyP8 = '',
    [string]$AppStoreConnectKeyId = '',
    [string]$AppStoreConnectIssuerId = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw 'GitHub CLI nao encontrado.'
}

& gh auth status | Out-Host
if ($LASTEXITCODE -ne 0) {
    throw 'Execute gh auth login antes de configurar os secrets.'
}

function Resolve-FileSystemPath {
    param([Parameter(Mandatory = $true)][string]$Path)

    $resolved = Resolve-Path -LiteralPath $Path
    if ($resolved.Provider.Name -ne 'FileSystem') {
        throw "O caminho nao pertence ao FileSystem: $Path"
    }
    return $resolved.ProviderPath
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

$configured = 0

if (-not [string]::IsNullOrWhiteSpace($GooglePlayServiceAccountJson)) {
    if (-not (Test-Path -LiteralPath $GooglePlayServiceAccountJson)) {
        throw "Arquivo de service account Google Play nao encontrado: $GooglePlayServiceAccountJson"
    }

    $googlePath = Resolve-FileSystemPath $GooglePlayServiceAccountJson
    $googleJson = [IO.File]::ReadAllText($googlePath)

    try {
        $googleData = $googleJson | ConvertFrom-Json
    }
    catch {
        throw 'O arquivo informado em -GooglePlayServiceAccountJson nao e um JSON valido.'
    }

    if (-not $googleData.client_email -or -not $googleData.private_key -or -not $googleData.project_id) {
        throw 'JSON da service account Google Play nao possui client_email, private_key e project_id.'
    }

    Set-GitHubSecret 'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON' $googleJson
    $configured++
}

$appleValues = @($AppStoreConnectApiKeyP8, $AppStoreConnectKeyId, $AppStoreConnectIssuerId)
$appleProvided = @($appleValues | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }).Count

if ($appleProvided -gt 0) {
    if ($appleProvided -ne 3) {
        throw 'Para Apple informe juntos: -AppStoreConnectApiKeyP8, -AppStoreConnectKeyId e -AppStoreConnectIssuerId.'
    }

    if (-not (Test-Path -LiteralPath $AppStoreConnectApiKeyP8)) {
        throw "Arquivo .p8 nao encontrado: $AppStoreConnectApiKeyP8"
    }

    $p8Path = Resolve-FileSystemPath $AppStoreConnectApiKeyP8
    $p8Text = [IO.File]::ReadAllText($p8Path)
    if ($p8Text -notmatch 'BEGIN PRIVATE KEY') {
        throw 'O arquivo .p8 nao parece ser uma App Store Connect API Key valida.'
    }

    $p8Base64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($p8Path))
    Set-GitHubSecret 'APPSTORE_CONNECT_API_KEY_P8_BASE64' $p8Base64
    Set-GitHubSecret 'APPSTORE_CONNECT_KEY_ID' $AppStoreConnectKeyId
    Set-GitHubSecret 'APPSTORE_CONNECT_ISSUER_ID' $AppStoreConnectIssuerId
    $configured++
}

if ($configured -eq 0) {
    throw 'Informe credenciais Google Play e/ou App Store Connect.'
}

Write-Host ''
Write-Host 'Credenciais de publicacao configuradas no GitHub.' -ForegroundColor Green
