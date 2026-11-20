# wav → m4a(AAC) 변환. Windows 내장 인코더(Media Foundation)를 쓰므로 따로 설치할 프로그램이 없다.
# 사용: powershell -NoProfile -ExecutionPolicy Bypass -File encode-m4a.ps1 -List <목록 파일> [-Bitrate 96000]
# 목록 파일은 한 줄에 "원본 wav 경로<TAB>만들 m4a 경로". 소리 자체(길이·음량·앞뒤 무음)는 바꾸지 않고 형식만 바꾼다.
param(
  [Parameter(Mandatory = $true)][string]$List,
  [int]$Bitrate = 96000
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$methods = [System.WindowsRuntimeSystemExtensions].GetMethods()
$asTaskOp = ($methods | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
$asTaskProgress = ($methods | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncActionWithProgress`1' })[0]
function Await($operation, [Type]$type) {
  $task = $asTaskOp.MakeGenericMethod($type).Invoke($null, @($operation))
  $task.Wait(-1) | Out-Null
  $task.Result
}
[Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Transcoding.MediaTranscoder, Windows.Media.Transcoding, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.MediaProperties.MediaEncodingProfile, Windows.Media.MediaProperties, ContentType = WindowsRuntime] | Out-Null

$transcoder = New-Object Windows.Media.Transcoding.MediaTranscoder
$done = 0
foreach ($line in [System.IO.File]::ReadAllLines($List, [System.Text.Encoding]::UTF8)) {
  if (-not $line.Trim()) { continue }
  $parts = $line.Split("`t")
  $in = $parts[0]; $out = $parts[1]
  $source = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($in)) ([Windows.Storage.StorageFile])
  $folder = Await ([Windows.Storage.StorageFolder]::GetFolderFromPathAsync([System.IO.Path]::GetDirectoryName($out))) ([Windows.Storage.StorageFolder])
  $target = Await ($folder.CreateFileAsync([System.IO.Path]::GetFileName($out), [Windows.Storage.CreationCollisionOption]::ReplaceExisting)) ([Windows.Storage.StorageFile])
  $profile = [Windows.Media.MediaProperties.MediaEncodingProfile]::CreateM4a([Windows.Media.MediaProperties.AudioEncodingQuality]::High)
  $profile.Audio.Bitrate = $Bitrate
  $profile.Audio.ChannelCount = 1
  $prepared = Await ($transcoder.PrepareFileTranscodeAsync($source, $target, $profile)) ([Windows.Media.Transcoding.PrepareTranscodeResult])
  if (-not $prepared.CanTranscode) { throw "cannot transcode ${in}: $($prepared.FailureReason)" }
  $task = $asTaskProgress.MakeGenericMethod([double]).Invoke($null, @($prepared.TranscodeAsync()))
  $task.Wait(-1) | Out-Null
  $done++
}
Write-Output "encoded $done"
