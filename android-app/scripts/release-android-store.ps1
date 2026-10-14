param(
    [string]$Repository = 'DanielRochaOdo/Adesart',

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^\d+\.\d+\.\d+$')]
    [string]$VersionName,

    [Parameter(Mandatory = $true)]
    [ValidateRange(1, 2147483647)]
    [int]$VersionCode,

    [string]$OutputDirectory = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Assert-Command {
    param([Parameter(Mandatory = $true)][string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Comando '$Name' nao encontrado."
    }
}

Assert-Command git
Assert-Command gh

& gh auth status | Out-Host
if ($LASTEXITCODE -ne 0) {
    throw 'GitHub CLI nao autenticado. Execute: gh auth login'
}

$repoRoot = (& git rev-parse --show-toplevel).Trim()
if (-not $repoRoot) {
    throw 'Execute o comando dentro do repositorio Adesart.'
}

Push-Location $repoRoot
try {
    $branch = (& git branch --show-current).Trim()
    if (-not $branch) {
        throw 'Nao foi possivel identificar a branch atual.'
    }

    $head = (& git rev-parse HEAD).Trim()
    $remoteLine = (& git ls-remote origin "refs/heads/$branch").Trim()
    if (-not $remoteLine) {
        throw "A branch '$branch' ainda nao existe no origin."
    }

    $remoteHead = ($remoteLine -split '\s+')[0]
    if ($remoteHead -ne $head) {
        throw 'Seu HEAD local ainda nao esta no origin. Execute git push antes de publicar.'
    }

    $changes = @(& git status --porcelain)
    $unexpected = @(
        $changes | Where-Object {
            $_ -and ($_ -notmatch 'android-app[/\\]version\.properties$')
        }
    )
    if ($unexpected.Count -gt 0) {
        Write-Host 'Existem alteracoes locais que nao entrariam no GitHub Actions:' -ForegroundColor Yellow
        $unexpected | ForEach-Object { Write-Host "  $_" }
        throw 'Commit/push essas alteracoes antes da publicacao.'
    }

    $timestamp = Get-Date -Format 'yyyyMMddHHmmss'
    $tag = "android-store-v$VersionName-b$VersionCode-$timestamp"

    Write-Host "Publicacao Android $VersionName ($VersionCode)" -ForegroundColor Cyan
    Write-Host "Branch: $branch"
    Write-Host "Tag:    $tag"
    Write-Host "Destino: Google Play / production"

    & git tag -a $tag -m "Venda+ Android Store $VersionName ($VersionCode)" $head
    if ($LASTEXITCODE -ne 0) {
        throw 'Falha ao criar a tag Android Store.'
    }

    try {
        & git push origin $tag
        if ($LASTEXITCODE -ne 0) {
            throw 'Falha ao enviar a tag Android Store.'
        }
    }
    catch {
        & git tag -d $tag | Out-Null
        throw
    }

    $runTitle = "Android Store Release $tag"
    $runId = $null

    Write-Host 'Aguardando o GitHub Actions iniciar...' -ForegroundColor Cyan
    for ($attempt = 0; $attempt -lt 40 -and -not $runId; $attempt++) {
        Start-Sleep -Seconds 3
        $runsJson = & gh run list -R $Repository --workflow android-store-release.yml --limit 30 --json databaseId,displayTitle,headSha
        if ($LASTEXITCODE -ne 0) { continue }

        $runs = $runsJson | ConvertFrom-Json
        $match = $runs |
            Where-Object { $_.displayTitle -eq $runTitle -and $_.headSha -eq $head } |
            Select-Object -First 1

        if ($match) {
            $runId = [string]$match.databaseId
        }
    }

    if (-not $runId) {
        throw "Workflow Android Store nao localizado. Confira a tag '$tag'."
    }

    Write-Host "GitHub Actions run: $runId" -ForegroundColor Green
    & gh run watch $runId -R $Repository --exit-status
    if ($LASTEXITCODE -ne 0) {
        throw "Publicacao Android falhou. Execute: gh run view $runId -R $Repository --log-failed"
    }

    if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
        $OutputDirectory = Join-Path $repoRoot "android-app\release-downloads\google-play\v$VersionName-b$VersionCode"
    }
    New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

    & gh run download $runId -R $Repository -n "vendamais-android-store-v$VersionName" -D $OutputDirectory
    if ($LASTEXITCODE -ne 0) {
        Write-Host 'Publicacao concluida no Google Play, mas houve falha ao baixar a copia local dos artefatos.' -ForegroundColor Yellow
    }

    Write-Host ''
    Write-Host "Android $VersionName ($VersionCode) enviado ao Google Play production." -ForegroundColor Green
    Write-Host "Run: $runId"
}
finally {
    Pop-Location
}
