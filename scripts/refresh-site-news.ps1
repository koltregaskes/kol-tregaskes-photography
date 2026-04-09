[CmdletBinding()]
param(
    [switch]$WithScrape,
    [switch]$SkipCommit,
    [switch]$SkipPush
)

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$estateRoot = 'W:\Websites'
$scrapeScript = Join-Path $estateRoot 'scripts\run-news-scrape.ps1'
$filterScript = Join-Path $estateRoot 'scripts\filter-articles-per-site.mjs'
$publishScript = Join-Path $PSScriptRoot 'publish-digests.ps1'

function Invoke-Step {
    param(
        [string]$Label,
        [scriptblock]$Action
    )

    Write-Host "==> $Label"
    $global:LASTEXITCODE = 0
    & $Action
    if ($global:LASTEXITCODE -ne 0) {
        throw "$Label failed with exit code $global:LASTEXITCODE."
    }
}

Set-Location $repoRoot

if ($WithScrape) {
    Invoke-Step 'Scraping upstream news sources' {
        powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scrapeScript
    }
}

Invoke-Step 'Filtering news into site digests' {
    node $filterScript
}

$publishArgs = @()
if ($SkipCommit) {
    $publishArgs += '-SkipCommit'
}
if ($SkipPush) {
    $publishArgs += '-SkipPush'
}

Invoke-Step 'Publishing photography digests' {
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File $publishScript @publishArgs
}
