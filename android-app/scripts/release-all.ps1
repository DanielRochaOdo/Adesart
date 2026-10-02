param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^\d+\.\d+\.\d+$')]
    [string]$VersionName,

    [Parameter(Mandatory = $true)]
    [ValidateRange(1, 2147483647)]
    [int]$VersionCode,

    [ValidateSet('development', 'ad-hoc', 'app-store-connect')]
    [string]$IosExportMethod = 'development',

    [string]$OutputDirectory = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Assert-Command {
    param([Parameter(Mandatory = $true)][string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Comando '$Name' nao encontrado. Instale-o antes de continuar."
    }
}

Assert-Command git
Assert-Command gh

& gh auth status | Out-Host
if ($LASTEXITCODE -ne 0) {
    throw "GitHub CLI nao autenticado. Execute: gh auth login"
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
        throw "A branch '$branch' ainda nao existe no origin. Execute git push -u origin $branch."
    }
    $remoteHead = ($remoteLine -split '\s+')[0]
    if ($remoteHead -ne $head) {
        throw "Seu HEAD local ainda nao esta no origin. Execute git push antes de gerar o release."
    }

    $changes = @(& git status --porcelain)
    $unexpected = @(
        $changes | Where-Object {
            $_ -and ($_ -notmatch 'android-app[/\\]version\.properties$')
        }
    )
    if ($unexpected.Count -gt 0) {
        Write-Host ''
        Write-Host 'Existem alteracoes locais que nao entrariam no GitHub Actions:' -ForegroundColor Yellow
        $unexpected | ForEach-Object { Write-Host "  $_" }
        throw 'Commit/push essas alteracoes antes do release.'
    }

    $mode = switch ($IosExportMethod) {
        'development' { 'dev' }
        'ad-hoc' { 'adhoc' }
        'app-store-connect' { 'store' }
    }

    $timestamp = Get-Date -Format 'yyyyMMddHHmmss'
    $tag = "mobile-release-$mode-v$VersionName-b$VersionCode-$timestamp"

    Write-Host "Criando release $VersionName ($VersionCode)..." -ForegroundColor Cyan
    Write-Host "Branch: $branch"
    Write-Host "Tag:    $tag"

    & git tag -a $tag -m "Venda+ mobile $VersionName ($VersionCode)" $head
    if ($LASTEXITCODE -ne 0) {
        throw 'Falha ao criar a tag de release.'
    }

    try {
        & git push origin $tag
        if ($LASTEXITCODE -ne 0) {
            throw 'Falha ao enviar a tag de release.'
        }
    }
    catch {
        & git tag -d $tag | Out-Null
        throw
    }

    $runTitle = "Mobile Release $tag"
    $runId = $null

    Write-Host 'Aguardando o GitHub Actions iniciar...' -ForegroundColor Cyan
    for ($attempt = 0; $attempt -lt 30 -and -not $runId; $attempt++) {
        Start-Sleep -Seconds 3
        $runsJson = & gh run list --workflow mobile-release.yml --limit 30 --json databaseId,displayTitle,headSha,status,conclusion
        if ($LASTEXITCODE -ne 0) {
            continue
        }
        $runs = $runsJson | ConvertFrom-Json
        $match = $runs |
            Where-Object { $_.displayTitle -eq $runTitle -and $_.headSha -eq $head } |
            Select-Object -First 1
        if ($match) {
            $runId = [string]$match.databaseId
        }
    }

    if (-not $runId) {
        throw "O workflow nao foi localizado. Confira a aba Actions e a tag '$tag'."
    }

    Write-Host "GitHub Actions run: $runId" -ForegroundColor Green
    & gh run watch $runId --exit-status
    $workflowExit = $LASTEXITCODE

    if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
        $OutputDirectory = Join-Path $repoRoot "android-app\release-downloads\v$VersionName-b$VersionCode"
    }
    New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

    Write-Host 'Baixando artefatos gerados...' -ForegroundColor Cyan
    & gh run download $runId --dir $OutputDirectory
    $downloadExit = $LASTEXITCODE

    Write-Host ''
    if (Test-Path $OutputDirectory) {
        Get-ChildItem -Path $OutputDirectory -Recurse -File |
            Where-Object { $_.Extension -in '.apk', '.aab', '.ipa' } |
            Select-Object FullName, Length |
            Format-Table -AutoSize
    }

    if ($workflowExit -ne 0) {
        throw "O GitHub Actions terminou com erro. Abra: gh run view $runId --log-failed"
    }
    if ($downloadExit -ne 0) {
        throw "O build terminou, mas houve falha ao baixar os artefatos. Execute: gh run download $runId"
    }

    Write-Host ''
    Write-Host "Release concluido. Arquivos em: $OutputDirectory" -ForegroundColor Green
}
finally {
    Pop-Location
}
