param(
  [int]$Port = 5175,
  [string]$BaseUrl = "",
  [switch]$FullPage
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$OutDir = Join-Path $Root "tmp\captures"
$ServerScript = Join-Path $Root "web-preview\preview-server.js"
$LogDir = Join-Path $Root "tmp"
$StartedServer = $null

New-Item -ItemType Directory -Force $OutDir | Out-Null
New-Item -ItemType Directory -Force $LogDir | Out-Null

if ([string]::IsNullOrWhiteSpace($BaseUrl)) {
  $BaseUrl = "http://localhost:$Port/"
}

function Test-PreviewServer {
  param([string]$Url)

  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
    return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500)
  } catch {
    return $false
  }
}

function Start-PreviewServer {
  $stdout = Join-Path $LogDir "web-preview-capture-$Port.out.log"
  $stderr = Join-Path $LogDir "web-preview-capture-$Port.err.log"
  $previousPort = $env:PORT

  try {
    $env:PORT = "$Port"
    return Start-Process `
      -FilePath "node" `
      -ArgumentList @($ServerScript) `
      -WorkingDirectory $Root `
      -WindowStyle Hidden `
      -RedirectStandardOutput $stdout `
      -RedirectStandardError $stderr `
      -PassThru
  } finally {
    $env:PORT = $previousPort
  }
}

if (-not (Test-PreviewServer $BaseUrl)) {
  $StartedServer = Start-PreviewServer

  $ready = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Milliseconds 250
    if (Test-PreviewServer $BaseUrl) {
      $ready = $true
      break
    }
  }

  if (-not $ready) {
    throw "Preview server did not become available at $BaseUrl"
  }
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$desktop = Join-Path $OutDir "desktop-$timestamp.png"
$mobile = Join-Path $OutDir "mobile-$timestamp.png"
$latestDesktop = Join-Path $OutDir "desktop-latest.png"
$latestMobile = Join-Path $OutDir "mobile-latest.png"
$fullPageFlag = @()

if ($FullPage) {
  $fullPageFlag = @("--full-page")
}

& npx --yes playwright install chromium
if ($LASTEXITCODE -ne 0) {
  throw "Could not install or verify the Playwright Chromium browser."
}

& npx --yes playwright screenshot --viewport-size=1440,1100 @fullPageFlag --wait-for-timeout=800 $BaseUrl $desktop
if ($LASTEXITCODE -ne 0) {
  throw "Desktop screenshot failed."
}

& npx --yes playwright screenshot --viewport-size=390,844 @fullPageFlag --wait-for-timeout=800 $BaseUrl $mobile
if ($LASTEXITCODE -ne 0) {
  throw "Mobile screenshot failed."
}

Copy-Item -Force $desktop $latestDesktop
Copy-Item -Force $mobile $latestMobile

Write-Host "Desktop capture: $desktop"
Write-Host "Mobile capture:  $mobile"
Write-Host "Latest desktop:  $latestDesktop"
Write-Host "Latest mobile:   $latestMobile"

if ($StartedServer -ne $null) {
  Write-Host "Started preview server on $BaseUrl with PID $($StartedServer.Id)."
}
