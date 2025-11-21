$ErrorActionPreference = 'Continue'
$ts = Get-Date -Format yyyyMMdd-HHmmss
$bk = "backup-before-sync-$ts"
$bkdir = "backup-revert-$ts"
Write-Host "Creating backup dir $bkdir"
New-Item -ItemType Directory -Path $bkdir -Force | Out-Null

# Copy everything except .git into backup dir
Write-Host 'Copying project files to backup directory (this may take a moment)...'
Get-ChildItem -Force | Where-Object { $_.Name -ne '.git' } | ForEach-Object {
  try {
    Copy-Item -Path $_.FullName -Destination (Join-Path $PWD.Path $bkdir) -Recurse -Force -ErrorAction Stop
  } catch {
    Write-Host "Copy failed for $($_.Name): $($_.Exception.Message)"
  }
}

# Stage and commit current changes (if any)
Write-Host 'Staging changes...'
try { git add -A } catch { Write-Host 'git add failed' }
Write-Host 'Committing changes (if any)...'
try {
  git commit -m "WIP backup before sync $ts"
} catch {
  Write-Host 'No changes to commit or commit failed (continuing)'
}

# Create backup branch
Write-Host "Creating branch $bk"
try { git branch $bk } catch { Write-Host 'git branch failed (branch may already exist)'}

# Push backup branch to new-origin
Write-Host "Pushing branch $bk to new-origin (may prompt for credentials)..."
try { git push -u new-origin $bk } catch { Write-Host 'git push failed (maybe branch exists on remote)'}

# Fetch remote and reset main
Write-Host 'Fetching new-origin/main...'
try { git fetch new-origin main } catch { Write-Host 'git fetch failed'}

Write-Host 'Checking out main...'
try { git checkout main } catch { Write-Host 'git checkout main failed'}

Write-Host 'Resetting local main to new-origin/main (hard reset)...'
try { git reset --hard new-origin/main } catch { Write-Host 'git reset failed'}

# Remove untracked files/directories to match remote working tree
Write-Host 'Removing untracked files (git clean -fd)...'
try { git clean -fd } catch { Write-Host 'git clean failed'}

Write-Host 'Final git status (porcelain):'
try { git status --porcelain } catch { Write-Host 'git status failed'}

Write-Host "Backup directory created at: $bkdir"
Write-Host 'Done.'
