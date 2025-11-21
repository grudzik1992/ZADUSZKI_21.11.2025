$out='vendor/alphatab/font'
New-Item -ItemType Directory -Path $out -Force | Out-Null
$urls = @(
 'https://raw.githubusercontent.com/steinbergmedia/bravura/master/redist/woff/Bravura.woff2',
 'https://raw.githubusercontent.com/steinbergmedia/bravura/master/redist/woff/Bravura.woff',
 'https://raw.githubusercontent.com/steinbergmedia/bravura/master/redist/otf/Bravura.otf'
)
foreach ($u in $urls) {
  $file = Join-Path $out (Split-Path $u -Leaf)
  Write-Host "Downloading $u -> $file"
  try {
    Invoke-WebRequest -Uri $u -OutFile $file -UseBasicParsing -ErrorAction Stop
    Write-Host "Saved $file"
  } catch {
    Write-Host "Failed to download $u : $($_.Exception.Message)"
  }
}