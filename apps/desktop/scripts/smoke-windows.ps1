param(
  [string]$InstallerPath = ''
)

$ErrorActionPreference = 'Stop'
$appRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$outRoot = [IO.Path]::GetFullPath((Join-Path $appRoot 'out'))
$smokeRoot = [IO.Path]::GetFullPath((Join-Path $outRoot 'smoke-windows'))
$appVersion = (Get-Content -LiteralPath (Join-Path $appRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
if ($appVersion -notmatch '^\d+\.\d+\.\d+$') { throw "desktop package version is not stable semver: $appVersion" }
if (-not $smokeRoot.StartsWith($outRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'desktop smoke root escaped apps/desktop/out'
}
if ($InstallerPath -eq '') {
  $installers = @(Get-ChildItem -LiteralPath (Join-Path $outRoot 'make/squirrel.windows') -Recurse -File -Filter "LasmeX-Setup-$appVersion-*.exe" -ErrorAction SilentlyContinue)
  if ($installers.Count -ne 1) { throw "expected one LasmeX $appVersion installer, found $($installers.Count)" }
  $InstallerPath = $installers[0].FullName
}
$installer = [IO.Path]::GetFullPath($InstallerPath)
if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) {
  throw "LasmeX installer not found: $installer"
}

$installRoot = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'LasmeX'
$uninstallKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\LasmeX'
if ((Test-Path -LiteralPath $installRoot) -or (Test-Path -LiteralPath $uninstallKey)) {
  throw 'desktop installer smoke requires a machine without an existing LasmeX installation'
}
$previousUserData = $env:LASMEX_DESKTOP_USER_DATA_DIR
$previousLasmexHome = $env:LASMEX_HOME
$installedExecutable = $null
$updateExecutable = $null

try {
  Remove-Item -LiteralPath $smokeRoot -Recurse -Force -ErrorAction SilentlyContinue
  $env:LASMEX_DESKTOP_USER_DATA_DIR = Join-Path $smokeRoot 'UserData'
  $env:LASMEX_HOME = Join-Path $smokeRoot 'LasmexHome'

  $setup = Start-Process -FilePath $installer -ArgumentList '--silent' -Wait -PassThru
  if ($setup.ExitCode -ne 0) { throw "LasmeX installer exited with code $($setup.ExitCode)" }

  $installDeadline = [DateTime]::UtcNow.AddSeconds(60)
  while ($null -eq $installedExecutable -and [DateTime]::UtcNow -lt $installDeadline) {
    $installedExecutable = Get-ChildItem -LiteralPath $installRoot -Recurse -File -Filter 'LasmeX.exe' -ErrorAction SilentlyContinue |
      Where-Object { $_.Directory.Name -like "app-$appVersion*" } |
      Select-Object -First 1 -ExpandProperty FullName
    if ($null -eq $installedExecutable) { Start-Sleep -Milliseconds 250 }
  }
  if ($null -eq $installedExecutable) { throw "LasmeX installer did not create an app-$appVersion*/LasmeX.exe payload" }
  $updateExecutable = Join-Path (Split-Path -Parent (Split-Path -Parent $installedExecutable)) 'Update.exe'
  if (-not (Test-Path -LiteralPath $updateExecutable -PathType Leaf)) {
    throw 'LasmeX installer did not create the Squirrel Update.exe runtime'
  }

  $version = (Get-Item -LiteralPath $installedExecutable).VersionInfo
  if ($version.ProductName -ne 'LasmeX' -or $version.ProductVersion -ne $appVersion) {
    throw "installed executable metadata is invalid: $($version.ProductName) $($version.ProductVersion)"
  }

  $existing = Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $installedExecutable }
  if ($null -eq $existing) { Start-Process -FilePath $installedExecutable | Out-Null }
  $deadline = [DateTime]::UtcNow.AddSeconds(60)
  $ready = $false
  while ([DateTime]::UtcNow -lt $deadline) {
    $owned = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $installedExecutable })
    $root = $owned | Where-Object { $_.CommandLine -notmatch '--type=' } | Select-Object -First 1
    $renderer = $owned | Where-Object { $_.CommandLine -match '--type=renderer' } | Select-Object -First 1
    $windowTitle = if ($null -eq $root) { '' } else { (Get-Process -Id $root.ProcessId -ErrorAction SilentlyContinue).MainWindowTitle }
    if ($null -ne $root -and $null -ne $renderer -and $windowTitle -eq 'LasmeX') {
      $ready = $true
      break
    }
    Start-Sleep -Milliseconds 250
  }
  if (-not $ready) { throw 'installed LasmeX did not expose a window and sandboxed renderer within 60 seconds' }

  Write-Output "LasmeX installer smoke passed: $installedExecutable"
  Write-Output "Version: $appVersion; window: LasmeX; renderer: running"
} finally {
  if ($null -ne $installedExecutable) {
    Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $installedExecutable } |
      ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  }
  if ($null -ne $updateExecutable -and (Test-Path -LiteralPath $updateExecutable -PathType Leaf)) {
    Start-Process -FilePath $updateExecutable -ArgumentList '--uninstall', '-s' -Wait -ErrorAction SilentlyContinue
  }
  if (Test-Path -LiteralPath $installRoot) {
    Remove-Item -LiteralPath $installRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
  $env:LASMEX_DESKTOP_USER_DATA_DIR = $previousUserData
  $env:LASMEX_HOME = $previousLasmexHome
  Remove-Item -LiteralPath $smokeRoot -Recurse -Force -ErrorAction SilentlyContinue
}
