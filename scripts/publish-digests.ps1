[CmdletBinding()]
param(
    [switch]$SkipCommit,
    [switch]$SkipPush
)

$ErrorActionPreference = 'Stop'
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $repoRoot

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

Invoke-Step 'Updating news manifest' { node scripts/update-news-manifest.mjs }
Invoke-Step 'Regenerating sitemap' { node scripts/generate-sitemap.mjs }
Invoke-Step 'Validating site state' { node scripts/validate-site.mjs }

$stagedBefore = git diff --cached --name-only
if ($stagedBefore) {
    throw 'publish-digests.ps1 will not run while unrelated staged changes exist. Clear the index first.'
}

Invoke-Step 'Staging digest outputs' { git add -A -- news-digests sitemap.xml }
$hasChanges = $LASTEXITCODE -eq 0
if (-not $hasChanges) {
    throw 'git add failed while staging digest outputs.'
}

& git diff --cached --quiet --exit-code
if ($LASTEXITCODE -eq 0) {
    Write-Host 'No digest changes to publish.'
    exit 0
}

$latestDigest = Get-ChildItem news-digests -Filter 'digest-*.md' | Sort-Object Name -Descending | Select-Object -First 1
$publishDate = if ($latestDigest) {
    [System.IO.Path]::GetFileNameWithoutExtension($latestDigest.Name).Replace('digest-', '')
} else {
    Get-Date -Format 'yyyy-MM-dd'
}

if (-not $SkipCommit) {
    Invoke-Step 'Creating commit' { git commit -m "chore: refresh photography digests ($publishDate)" }
}

if (-not $SkipPush) {
    Invoke-Step 'Pushing to origin/main' { git push origin HEAD:main }
}
