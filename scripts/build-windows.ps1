param([switch]$SkipDesktop)
$ErrorActionPreference = 'Stop'
if (-not [Environment]::Is64BitProcess) { throw 'Use 64-bit PowerShell.' }
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
    & cmake -S native -B native/build -G 'Visual Studio 17 2022' -A x64 -DBUILD_TESTING=ON
    if ($LASTEXITCODE) { throw 'Native configuration failed. Install Visual Studio 2022 C++ tools and Windows 11 SDK.' }
    & cmake --build native/build --config Release --parallel
    if ($LASTEXITCODE) { throw 'Native compilation failed.' }
    & ctest --test-dir native/build -C Release --output-on-failure
    if ($LASTEXITCODE) { throw 'Native transport tests failed.' }
    if (-not $SkipDesktop) {
        & npm ci
        if ($LASTEXITCODE) { throw 'Dependency installation failed.' }
        & npm test
        if ($LASTEXITCODE) { throw 'Desktop tests failed.' }
        & npm run build
        if ($LASTEXITCODE) { throw 'Desktop build failed.' }
    }
    Write-Host 'Build complete. Native output: native/build/Release. Next: install-native.ps1 as administrator.'
} finally { Pop-Location }
