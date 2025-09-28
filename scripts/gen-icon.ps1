Param()
$ErrorActionPreference = 'Stop'

# Source PNG candidates
$root = Split-Path -Parent $MyInvocation.MyCommand.Path | Split-Path -Parent
Set-Location $root
$pngCandidates = @('xilehudico.png','xilehudICO.png','icon.png')
$png = $null
foreach($c in $pngCandidates){ if(Test-Path $c){ $png = (Resolve-Path $c).Path; break } }
if(-not $png){ Write-Host '[gen-icon] No PNG found, skipping.'; exit 0 }

$buildDir = Join-Path $root 'build'
if(-not (Test-Path $buildDir)){ New-Item -ItemType Directory -Path $buildDir | Out-Null }
$ico = Join-Path $buildDir 'icon.ico'

# Try ImageMagick if available for best quality
$magick = Get-Command magick -ErrorAction SilentlyContinue
if($magick){
  Write-Host '[gen-icon] Using ImageMagick to generate multi-size icon'
  & magick convert $png -resize 256x256 -define icon:auto-resize=16,24,32,48,64,128,256 $ico
  if(Test-Path $ico){ Write-Host "[gen-icon] Generated $ico"; exit 0 }
}

Add-Type -AssemblyName System.Drawing
$baseImg = [System.Drawing.Image]::FromFile($png)
if($baseImg.Width -lt 256 -or $baseImg.Height -lt 256){
  $up = New-Object System.Drawing.Bitmap 256,256
  $g0 = [System.Drawing.Graphics]::FromImage($up)
  $g0.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g0.DrawImage($baseImg,0,0,256,256)
  $baseImg.Dispose(); $baseImg = $up
}
$sizes = @(16,24,32,48,64,128,256)
$pngFiles = @()
foreach($s in $sizes){
  $bmp = New-Object System.Drawing.Bitmap $s,$s
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($baseImg,0,0,$s,$s)
  $tmp = Join-Path $env:TEMP ("icon_${s}_" + [System.Guid]::NewGuid().ToString() + '.png')
  $bmp.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose(); $pngFiles += $tmp
}
$baseImg.Dispose()

# Build multi-image ICO (PNG-compressed entries)
try {
  $fs = [System.IO.File]::Open($ico, [System.IO.FileMode]::Create)
  $bw = New-Object System.IO.BinaryWriter($fs)
  $bw.Write([UInt16]0)    # reserved
  $bw.Write([UInt16]1)    # type icon
  $bw.Write([UInt16]$pngFiles.Count)
  $dirEntrySize = 16
  $dataOffset = 6 + ($dirEntrySize * $pngFiles.Count)
  $entriesBytes = @()
  $dataBytes = @()
  foreach($pf in $pngFiles){
    $bytes = [System.IO.File]::ReadAllBytes($pf)
    $img = [System.Drawing.Image]::FromFile($pf)
    $w = [byte]($img.Width -band 0xFF); if($img.Width -ge 256){ $w = 0 }
    $h = [byte]($img.Height -band 0xFF); if($img.Height -ge 256){ $h = 0 }
    $img.Dispose()
    $entry = New-Object System.IO.MemoryStream
    $ew = New-Object System.IO.BinaryWriter($entry)
    $ew.Write($w)
    $ew.Write($h)
    $ew.Write([byte]0) # color count
    $ew.Write([byte]0) # reserved
    $ew.Write([UInt16]0) # planes
    $ew.Write([UInt16]32) # bitcount
    $ew.Write([UInt32]$bytes.Length)
    $ew.Write([UInt32]$dataOffset)
    $ew.Flush()
    $entriesBytes += ,$entry.ToArray()
    $dataBytes += ,@{Bytes=$bytes;Offset=$dataOffset}
    $dataOffset += $bytes.Length
  }
  foreach($e in $entriesBytes){ $bw.Write($e) }
  foreach($d in $dataBytes){ $bw.Write($d.Bytes) }
  $bw.Flush(); $fs.Close()
  Write-Host "[gen-icon] Generated multi-size icon $ico"
} catch {
  Write-Warning "[gen-icon] Failed multi-size ICO build: $($_.Exception.Message)"
}
