# Installs only the native component. Run after a successful Windows build.
# Requires elevation to register the COM source for the Windows Frame Server.
# No security settings or execution policies are changed by this script.
#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'
$build = [int](Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion').CurrentBuildNumber
if ($build -lt 22000 -or -not [Environment]::Is64BitProcess -or $env:PROCESSOR_ARCHITECTURE -ne 'AMD64') { throw 'Windows 11 x64 is required.' }
$root = Split-Path -Parent $PSScriptRoot
$output = Join-Path $root 'native\build\Release'
$destination = Join-Path $env:ProgramFiles 'BenZica AI Camera\Native'
$clsid = '{AF297AF1-8265-4CA2-8A36-E06D117BD152}'
$key = "HKLM:\SOFTWARE\Classes\CLSID\$clsid"
$files = @('BenZicaCameraSource.dll', 'BenZicaCameraHost.exe')
foreach ($file in $files) {
    if (-not (Test-Path -LiteralPath (Join-Path $output $file) -PathType Leaf)) { throw "Missing $file. Run build-windows.ps1 first." }
}
if (Get-Process -Name BenZicaCameraHost -ErrorAction SilentlyContinue) { throw 'Close BenZica AI Camera before installing.' }
if (Test-Path $key) { throw 'A native component is already registered. Run uninstall-native.ps1 before replacing it.' }
New-Item -ItemType Directory -Path $destination -Force | Out-Null
foreach ($file in $files) { Copy-Item -LiteralPath (Join-Path $output $file) -Destination $destination -Force }
Copy-Item -LiteralPath (Join-Path $root 'native\source\LICENSE-MICROSOFT.txt') -Destination $destination -Force
try {
    New-Item -Path $key -Force | Out-Null
    Set-Item -Path $key -Value 'BenZica AI Camera source'
    New-Item -Path "$key\InprocServer32" -Force | Out-Null
    Set-Item -Path "$key\InprocServer32" -Value (Join-Path $destination 'BenZicaCameraSource.dll')
    New-ItemProperty -Path "$key\InprocServer32" -Name ThreadingModel -Value Both -PropertyType String -Force | Out-Null
} catch {
    Remove-Item -LiteralPath $key -Recurse -Force -ErrorAction SilentlyContinue
    throw
}
Write-Host 'Native files installed and registered. Start the desktop app as your normal user.'
Write-Host 'In the app: Start AI preview, then Enable virtual camera. A successful remote call is still required to validate WhatsApp support.'
