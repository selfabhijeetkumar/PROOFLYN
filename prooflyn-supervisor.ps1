<#
 PROOFLYN supervisor: external model-failover loop around the Antigravity CLI (agy).
 Uses only documented agy flags: -p, --model, --dangerously-skip-permissions.
 NOT TESTED on your machine. Run with -Smoke first.

 Usage:
   1) Install + authenticate agy once interactively. Run: agy models   (copy exact slugs)
   2) Save PROOFLYN_MASTER_PROMPT.md to C:\WHACKIEST\docs\
   3) Smoke test:  .\prooflyn-supervisor.ps1 -Models "<gemini-slug>","<claude-slug>" -Smoke
   4) Real run:    .\prooflyn-supervisor.ps1 -Models "<gemini-slug>","<claude-slug>","<claude-slug-2>" -SkipPermissions -MaxHours 9

 -SkipPermissions = agy runs all tools without prompting. Needed for unattended work, but it is
 a real risk. Keep the run inside the workspace, keep git push disabled/unauthenticated, and
 do not run this on a machine holding secrets you cannot lose.
#>
[CmdletBinding()]
param(
  [string]$Workspace = 'C:\WHACKIEST',
  [Parameter(Mandatory)][string[]]$Models,
  [double]$MaxHours = 9,
  [int]$RunTimeoutMinutes = 120,
  [int]$CooldownMinutes = 45,
  [switch]$SkipPermissions,
  [switch]$Smoke
)

$ErrorActionPreference = 'Stop'
$agy = (Get-Command agy -ErrorAction Stop).Source
$docs = Join-Path $Workspace 'docs'
$handoff = Join-Path $docs 'PROOFLYN_MODEL_HANDOFF.md'
$master = Join-Path $docs 'PROOFLYN_MASTER_PROMPT.md'
$logDir = Join-Path $Workspace '.supervisor'
New-Item -ItemType Directory -Force -Path $docs, $logDir | Out-Null
$log = Join-Path $logDir 'supervisor.log'

function Log([string]$m) {
  $l = "{0:s} {1}" -f (Get-Date), $m
  Add-Content -Path $log -Value $l
  Write-Host $l
}

function Invoke-Agy([string]$ArgString, [int]$TimeoutMin, [string]$Tag) {
  $out = Join-Path $logDir "$Tag.out.txt"
  $err = Join-Path $logDir "$Tag.err.txt"
  $p = Start-Process -FilePath $agy -ArgumentList $ArgString -WorkingDirectory $Workspace `
        -NoNewWindow -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
  $null = $p.Handle   # cache handle so ExitCode is readable
  if (-not $p.WaitForExit($TimeoutMin * 60000)) {
    & taskkill /PID $p.Id /T /F | Out-Null
    return @{ Exit = -999; TimedOut = $true; Out = $out; Err = $err }
  }
  return @{ Exit = $p.ExitCode; TimedOut = $false; Out = $out; Err = $err }
}

function Tail-Text($r) {
  $t = ''
  foreach ($f in @($r.Out, $r.Err)) {
    if (Test-Path $f) { $t += (Get-Content $f -Tail 60 -ErrorAction SilentlyContinue) -join "`n" }
    $t += "`n"
  }
  return $t
}

# Strict signatures only: the agent's own prose may legitimately say "quota".
$quotaRx = 'RESOURCE_EXHAUSTED|MODEL_CAPACITY_EXHAUSTED|Resource has been exhausted|model unreachable'

if ($Smoke) {
  foreach ($m in $Models) {
    $a = "-p `"Reply with the single word OK. Do not edit any file.`" --model $m"
    if ($SkipPermissions) { $a += ' --dangerously-skip-permissions' }
    $r = Invoke-Agy $a 5 ("smoke-" + ($m -replace '[^\w\.-]', '_'))
    Log "SMOKE model=$m exit=$($r.Exit) timedOut=$($r.TimedOut)"
    Log ("SMOKE tail: " + ((Tail-Text $r) -replace "`r?`n", ' | '))
  }
  return
}

if (-not (Test-Path $master)) { throw "Missing $master. Save the master prompt there first." }
if (-not (Test-Path $handoff)) {
  Set-Content -Path $handoff -Value "STATUS: NOT_STARTED`n# PROOFLYN MODEL HANDOFF`nNEXT ACTION: Begin M0 per master prompt."
}

$deadline = (Get-Date).AddHours($MaxHours)
$cool = @{}
$stalls = @{}
$run = 0
$prompt = "Read $master and $handoff, then continue from NEXT ACTION exactly as the master prompt requires. Update the handoff file after every milestone. ULTRATHINK"

Log "START models=$($Models -join ',') deadline=$deadline skipPerms=$($SkipPermissions.IsPresent)"

while ((Get-Date) -lt $deadline) {
  $first = Get-Content $handoff -TotalCount 1
  if ($first -match '^STATUS:\s*(COMPLETE|BLOCKED_NEEDS_USER)') {
    Log "STOP handoff status = $($Matches[1])"
    break
  }

  $now = Get-Date
  $m = $Models | Where-Object { -not $cool.ContainsKey($_) -or $cool[$_] -lt $now } | Select-Object -First 1
  if (-not $m) {
    $next = ($cool.Values | Sort-Object | Select-Object -First 1)
    $waitMin = [math]::Min([math]::Max(1, ($next - $now).TotalMinutes), 15)
    Log "ALL MODELS COOLING. sleeping $([int]$waitMin) min"
    Start-Sleep -Seconds ([int]($waitMin * 60))
    continue
  }

  $run++
  $hashBefore = (Get-FileHash $handoff -Algorithm SHA256).Hash
  $a = "-p `"$prompt`" --model $m"
  if ($SkipPermissions) { $a += ' --dangerously-skip-permissions' }
  Log "RUN $run model=$m"
  $r = Invoke-Agy $a $RunTimeoutMinutes ("run{0:D3}" -f $run)
  $text = Tail-Text $r
  $hashAfter = (Get-FileHash $handoff -Algorithm SHA256).Hash
  Log "RUN $run done exit=$($r.Exit) timedOut=$($r.TimedOut) handoffChanged=$($hashBefore -ne $hashAfter)"

  if ($text -match $quotaRx) {
    $cool[$m] = (Get-Date).AddMinutes($CooldownMinutes)
    Log "QUOTA/CAPACITY signature on $m. cooling until $($cool[$m])"
    Add-Content -Path $handoff -Value "`n## SUPERVISOR NOTE $(Get-Date -Format s): run $run on model $m ended with quota/capacity error. Handoff may be stale. Run git status, git diff --stat, re-run last tests, then continue from NEXT ACTION."
    continue
  }

  if ($hashBefore -eq $hashAfter -or $r.TimedOut -or $r.Exit -ne 0) {
    if (-not $stalls.ContainsKey($m)) { $stalls[$m] = 0 }
    $stalls[$m]++
    Log "NO PROGRESS or failure on $m (count=$($stalls[$m]))"
    Add-Content -Path $handoff -Value "`n## SUPERVISOR NOTE $(Get-Date -Format s): run $run on model $m made no handoff progress or failed (exit $($r.Exit)). Verify repo state before continuing."
    if ($stalls[$m] -ge 2) {
      $cool[$m] = (Get-Date).AddMinutes($CooldownMinutes)
      $stalls[$m] = 0
      Log "ROTATING away from $m after repeated stalls"
    }
    Start-Sleep -Seconds 60
  } else {
    $stalls[$m] = 0
  }
}

Log "END runs=$run"
