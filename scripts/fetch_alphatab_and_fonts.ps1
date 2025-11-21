# fetch_alphatab_and_fonts.ps1
# Pobiera AlphaTab (UMD) i czcionki Bravura do katalogu vendor/alphatab
# Uruchom w katalogu głównym projektu: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\fetch_alphatab_and_fonts.ps1

$ErrorActionPreference = 'Stop'
$base = Get-Location
$vendor = Join-Path $base 'vendor\alphatab'
$fontDir = Join-Path $vendor 'font'

New-Item -ItemType Directory -Path $fontDir -Force | Out-Null

function Try-Download($url, $outPath) {
    Write-Host "Trying: $url"
    try {
        Invoke-WebRequest -Uri $url -OutFile $outPath -UseBasicParsing -ErrorAction Stop
        if ((Test-Path $outPath) -and ((Get-Item $outPath).Length -gt 0)) {
            Write-Host "OK: saved to $outPath"
            return $true
        } else {
            Write-Host "Failed: empty file saved for $url"
            Remove-Item -Path $outPath -ErrorAction SilentlyContinue
            return $false
        }
    } catch {
        Write-Host "Error downloading $url : $($_.Exception.Message)"
        if (Test-Path $outPath) { Remove-Item -Path $outPath -ErrorAction SilentlyContinue }
        return $false
    }
}

# Candidate URLs for AlphaTab UMD (try several common locations)
$alphaCandidates = @(
    'https://cdn.jsdelivr.net/npm/alphatab@1.16.1/dist/alphaTab.min.js',
    'https://unpkg.com/alphatab@1.16.1/dist/alphaTab.min.js',
    'https://cdn.jsdelivr.net/npm/alphatab/dist/alphaTab.min.js',
    'https://unpkg.com/alphatab/dist/alphaTab.min.js',
    'https://raw.githubusercontent.com/AlphaTab/AlphaTab/master/dist/alphaTab.min.js'
)

$alphaOut = Join-Path $vendor 'alphaTab.min.js'
$alphaSuccess = $false
foreach ($url in $alphaCandidates) {
    if (Try-Download $url $alphaOut) { $alphaSuccess = $true; break }
}

# Candidate URLs for Bravura fonts
$fontCandidates = @{
    'Bravura.woff2' = @(
        'https://raw.githubusercontent.com/steinbergmedia/bravura/master/redist/Bravura.woff2',
        'https://unpkg.com/bravura@1.0.0/redist/Bravura.woff2',
        'https://cdn.jsdelivr.net/npm/bravura@1.0.0/redist/Bravura.woff2'
    )
    'Bravura.woff' = @(
        'https://raw.githubusercontent.com/steinbergmedia/bravura/master/redist/Bravura.woff',
        'https://unpkg.com/bravura@1.0.0/redist/Bravura.woff',
        'https://cdn.jsdelivr.net/npm/bravura@1.0.0/redist/Bravura.woff'
    )
    'Bravura.otf' = @(
        'https://raw.githubusercontent.com/steinbergmedia/bravura/master/redist/Bravura.otf',
        'https://unpkg.com/bravura@1.0.0/redist/Bravura.otf',
        'https://cdn.jsdelivr.net/npm/bravura@1.0.0/redist/Bravura.otf'
    )
}

$fontResults = @{}
foreach ($name in $fontCandidates.Keys) {
    $outPath = Join-Path $fontDir $name
    $ok = $false
    foreach ($url in $fontCandidates[$name]) {
        if (Try-Download $url $outPath) { $ok = $true; break }
    }
    $fontResults[$name] = $ok
}

Write-Host "\nSummary:\nAlphaTab UMD present: $alphaSuccess"
foreach ($k in $fontResults.Keys) { Write-Host "$k : $($fontResults[$k])" }

if (-not $alphaSuccess) {
    Write-Host "\nAlphaTab UMD not found automatically. Please download a UMD build (alphaTab.min.js) manually and place it in vendor/alphatab/alphaTab.min.js"
}

Write-Host "Done."