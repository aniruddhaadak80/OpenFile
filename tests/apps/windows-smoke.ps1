# Installs the OpenFile desktop app from a release installer, launches it, checks it stays alive, takes a
# screenshot, then uninstalls. Used by .github/workflows/cross-platform-test.yml on windows-2022 and windows-2025.
#   -Kind msi   installs with msiexec /qn (per machine, Program Files)
#   -Kind nsis  installs with the setup .exe /S (current user, LocalAppData)
param(
  [Parameter(Mandatory = $true)][ValidateSet('msi', 'nsis')][string]$Kind,
  [Parameter(Mandatory = $true)][string]$Installer,
  [string]$OutDir = 'app-smoke',
  [int]$WaitSeconds = 20
)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$Installer = (Resolve-Path $Installer).Path
$started = Get-Date

function Find-AppExe {
  $roots = @("$env:ProgramFiles\OpenFile", "${env:ProgramFiles(x86)}\OpenFile", "$env:LOCALAPPDATA\OpenFile", "$env:LOCALAPPDATA\Programs\OpenFile")
  foreach ($r in $roots) { if (Test-Path "$r\openfile.exe") { return "$r\openfile.exe" } }
  $hit = Get-ChildItem -Path $env:ProgramFiles, $env:LOCALAPPDATA -Filter openfile.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($hit) { return $hit.FullName }
  return $null
}

function Save-Screenshot([string]$file) {
  try {
    Add-Type -AssemblyName System.Windows.Forms, System.Drawing
    $b = [System.Windows.Forms.SystemInformation]::VirtualScreen
    $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($b.Left, $b.Top, 0, 0, $bmp.Size)
    $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
    Write-Host "Screenshot saved: $file"
  } catch { Write-Warning "Screenshot failed: $($_.Exception.Message)" }
}

function Get-CrashEvents {
  Get-WinEvent -FilterHashtable @{ LogName = 'Application'; StartTime = $started } -ErrorAction SilentlyContinue |
    Where-Object { ($_.ProviderName -in 'Application Error', 'Windows Error Reporting', '.NET Runtime') -and $_.Message -match 'openfile' }
}

Write-Host "OS: $((Get-CimInstance Win32_OperatingSystem).Caption) build $([Environment]::OSVersion.Version)"
$wv = Get-ItemProperty 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}' -ErrorAction SilentlyContinue
Write-Host "WebView2 runtime: $(if ($wv) { $wv.pv } else { 'not found in registry' })"

# ---- install
Write-Host "Installing ($Kind): $Installer"
if ($Kind -eq 'msi') {
  $p = Start-Process msiexec.exe -ArgumentList @('/i', "`"$Installer`"", '/qn', '/norestart', '/l*v', "`"$OutDir\msi-install.log`"") -Wait -PassThru
} else {
  $p = Start-Process $Installer -ArgumentList '/S' -Wait -PassThru
}
Write-Host "Installer exit code: $($p.ExitCode)"
if ($p.ExitCode -ne 0 -and $p.ExitCode -ne 3010) { throw "Installer failed with exit code $($p.ExitCode)" }

$exe = $null
for ($i = 0; $i -lt 30 -and -not $exe; $i++) { $exe = Find-AppExe; if (-not $exe) { Start-Sleep 1 } }
if (-not $exe) { throw 'openfile.exe was not found after install' }
Write-Host "Installed at: $exe"

# ---- launch
$app = Start-Process $exe -PassThru
Write-Host "Launched PID $($app.Id), waiting $WaitSeconds s"
Start-Sleep -Seconds $WaitSeconds
Save-Screenshot "$OutDir\openfile-$Kind.png"

$alive = Get-Process -Id $app.Id -ErrorAction SilentlyContinue
$wer = Get-Process -Name WerFault, WerFaultSecure -ErrorAction SilentlyContinue
$crashes = @(Get-CrashEvents)
$children = Get-CimInstance Win32_Process -Filter "ParentProcessId=$($app.Id)" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name
Write-Host "Child processes: $($children -join ', ')"
if ($alive) { Write-Host "Main window title: '$($alive.MainWindowTitle)'  responding: $($alive.Responding)" }
$crashes | ForEach-Object { Write-Host "Crash event: $($_.ProviderName) $($_.Message)" }

$failed = $false
if (-not $alive) { $app.Refresh(); Write-Host "::error::OpenFile exited early with code $($app.ExitCode)"; $failed = $true }
if ($wer) { Write-Host '::error::A Windows Error Reporting (crash) dialog is open'; $failed = $true }
if ($crashes.Count) { Write-Host "::error::$($crashes.Count) crash event(s) for openfile.exe in the Application log"; $failed = $true }

# ---- stop and uninstall
if ($alive) { Stop-Process -Id $app.Id -Force -ErrorAction SilentlyContinue }
Get-Process -Name openfile -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep 2
Write-Host 'Uninstalling'
if ($Kind -eq 'msi') {
  $u = Start-Process msiexec.exe -ArgumentList @('/x', "`"$Installer`"", '/qn', '/norestart', '/l*v', "`"$OutDir\msi-uninstall.log`"") -Wait -PassThru
} else {
  $un = Join-Path (Split-Path $exe) 'uninstall.exe'
  if (-not (Test-Path $un)) { throw "NSIS uninstaller not found at $un" }
  $u = Start-Process $un -ArgumentList '/S' -Wait -PassThru
}
Write-Host "Uninstaller exit code: $($u.ExitCode)"
if ($u.ExitCode -ne 0 -and $u.ExitCode -ne 3010) { Write-Host "::error::Uninstall failed with exit code $($u.ExitCode)"; $failed = $true }
# The NSIS uninstaller copies itself to TEMP and returns early; give it a moment before checking.
for ($i = 0; $i -lt 20 -and (Test-Path $exe); $i++) { Start-Sleep 1 }
if (Test-Path $exe) { Write-Host "::error::$exe is still present after uninstall"; $failed = $true } else { Write-Host 'Uninstall removed the app' }

if ($failed) { exit 1 }
Write-Host "PASS: $Kind install, launch ($WaitSeconds s alive, no crash) and uninstall"
