# Print SHA1 (and SHA256) for your upload keystore so you can match Play Console.
# Usage (repo root):
#   powershell -File scripts/show-keystore-sha1.ps1
#   powershell -File scripts/show-keystore-sha1.ps1 -Keystore "C:\path\to\my-upload.jks" -Alias "myalias"

param(
    [string]$Keystore = "",
    [string]$Alias = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
if (-not $Keystore) {
    $Keystore = Join-Path $root "android\app\upload-keystore.jks"
}

$javaHome = $env:JAVA_HOME
if (-not $javaHome -or -not (Test-Path (Join-Path $javaHome "bin\keytool.exe"))) {
    $jbr = "${env:ProgramFiles}\Android\Android Studio\jbr"
    if (Test-Path (Join-Path $jbr "bin\keytool.exe")) { $javaHome = $jbr }
}
if (-not $javaHome) {
    Write-Error "Set JAVA_HOME or install Android Studio (JBR)."
}

$keytool = Join-Path $javaHome "bin\keytool.exe"
if (-not (Test-Path $Keystore)) {
    Write-Error "Keystore not found: $Keystore"
}

Write-Host "Keystore: $Keystore"
Write-Host ""
if ($Alias) {
    & $keytool -list -v -keystore $Keystore -alias $Alias
} else {
    & $keytool -list -v -keystore $Keystore
}
Write-Host ""
Write-Host "In Play Console: Release > Setup > App signing. Compare 'App signing key certificate'"
Write-Host "or upload key fingerprint with SHA1 above (ignore colons/spacing when comparing)."
