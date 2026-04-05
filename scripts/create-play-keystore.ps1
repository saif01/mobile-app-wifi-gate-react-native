# Creates an upload keystore for Google Play and writes android/keystore.properties.
# Run from the repo root: powershell -File scripts/create-play-keystore.ps1
# Back up upload-keystore.jks and your passwords; loss means you cannot ship updates with the same key.

param(
    [string]$JksName = "upload-keystore.jks",
    [string]$KeyAlias = "upload",
    [Parameter(Mandatory = $true)][string]$StorePassword,
    [Parameter(Mandatory = $true)][string]$KeyPassword,
    [string]$DName = "CN=WiFiGate, OU=Mobile, O=Unknown, L=City, ST=State, C=US"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$appDir = Join-Path $root "android/app"
$androidDir = Join-Path $root "android"
New-Item -ItemType Directory -Force -Path $appDir | Out-Null

$jksPath = Join-Path $appDir $JksName
if (Test-Path $jksPath) {
    Write-Error "Already exists: $jksPath - delete it first or pick another -JksName"
}

$javaHome = $env:JAVA_HOME
if (-not $javaHome -or -not (Test-Path (Join-Path $javaHome "bin/keytool.exe"))) {
    $jbr = "${env:ProgramFiles}\Android\Android Studio\jbr"
    if (Test-Path (Join-Path $jbr "bin/keytool.exe")) {
        $javaHome = $jbr
    }
}
if (-not $javaHome) {
    Write-Error "Set JAVA_HOME or install Android Studio (JBR) so keytool.exe is available."
}

$keytool = Join-Path $javaHome "bin/keytool.exe"
& $keytool -genkeypair -v `
    -storetype JKS `
    -keyalg RSA `
    -keysize 2048 `
    -validity 10000 `
    -alias $KeyAlias `
    -keystore $jksPath `
    -storepass $StorePassword `
    -keypass $KeyPassword `
    -dname $DName

$propsPath = Join-Path $androidDir "keystore.properties"
$lines = @(
    "storeFile=$JksName",
    "storePassword=$StorePassword",
    "keyAlias=$KeyAlias",
    "keyPassword=$KeyPassword"
)
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllLines($propsPath, $lines, $utf8NoBom)
Write-Host "Created keystore: $jksPath"
Write-Host "Created properties: $propsPath"
