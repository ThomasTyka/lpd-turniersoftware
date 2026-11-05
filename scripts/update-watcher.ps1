# Runs directly on the Windows host (NOT inside Docker) - the backend
# container has no git or docker access of its own, so AdminEndpoints.cs
# drops a trigger file here and this script does the actual git pull +
# docker rebuild + restart, reporting back through the same shared folder.
# Registered to start hidden at Windows logon (see docs/update-watcher.md for
# the scheduled-task command) so it's always available while the PC is on.

$RepoRoot = Split-Path -Parent $PSScriptRoot
$IpcDir = Join-Path $RepoRoot "update-ipc"
$TriggerPath = Join-Path $IpcDir "trigger.json"
$StatusPath = Join-Path $IpcDir "status.json"
$Branch = "main"

New-Item -ItemType Directory -Force -Path $IpcDir | Out-Null

function Write-Status {
    param([string]$State, [string]$Message)
    $payload = @{ state = $State; message = $Message; at = (Get-Date).ToUniversalTime().ToString("o") }
    $payload | ConvertTo-Json | Set-Content -Path $StatusPath -Encoding utf8
}

function Run-Update {
    Set-Location $RepoRoot
    try {
        Write-Status "running" "Prüfe auf Internetverbindung zum Repository..."
        git fetch origin $Branch 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Keine Verbindung zum Repository - Update nicht möglich. Läuft dieser Rechner gerade offline?"
        }

        $local = (git rev-parse HEAD).Trim()
        $remote = (git rev-parse "origin/$Branch").Trim()
        if ($local -eq $remote) {
            Write-Status "success" "Bereits auf dem neuesten Stand."
            return
        }

        Write-Status "running" "Hole neuesten Stand..."
        git pull origin $Branch 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Git-Pull fehlgeschlagen - lokale Änderungen im Weg?" }

        Write-Status "running" "Baue neue Version (kann einige Minuten dauern)..."
        docker compose build 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Docker-Build fehlgeschlagen." }

        Write-Status "running" "Starte Server neu..."
        docker compose up -d 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Server-Neustart fehlgeschlagen." }

        # The container that reads this next is the freshly-restarted one -
        # this confirms the whole chain actually worked, not just that this
        # script thinks it did.
        Write-Status "success" "Update erfolgreich installiert."
    }
    catch {
        Write-Status "error" $_.Exception.Message
    }
}

Write-Status "idle" "Bereit."

while ($true) {
    if (Test-Path $TriggerPath) {
        Remove-Item $TriggerPath -Force
        Run-Update
    }
    Start-Sleep -Seconds 2
}
