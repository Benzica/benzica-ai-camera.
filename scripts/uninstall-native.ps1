#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'
if (-not [Environment]::Is64BitProcess) { throw 'Use 64-bit PowerShell.' }
if (Get-Process -Name BenZicaCameraHost -ErrorAction SilentlyContinue) { throw 'Close BenZica AI Camera before uninstalling.' }
$destination = Join-Path $env:ProgramFiles 'BenZica AI Camera\Native'
$key = 'HKLM:\SOFTWARE\Classes\CLSID\{AF297AF1-8265-4CA2-8A36-E06D117BD152}'
if (Test-Path "$key\InprocServer32") {
    $registered = (Get-Item "$key\InprocServer32").GetValue('')
    if ($registered -ne (Join-Path $destination 'BenZicaCameraSource.dll')) { throw 'Unexpected registration path; nothing removed.' }
    Remove-Item -LiteralPath $key -Recurse -Force
}
foreach ($name in @('BenZicaCameraSource.dll','BenZicaCameraHost.exe','LICENSE-MICROSOFT.txt')) {
    $file = Join-Path $destination $name
    if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file -Force }
}
Write-Host 'Native COM registration and files removed. Session cameras disappear when the app closes.'
