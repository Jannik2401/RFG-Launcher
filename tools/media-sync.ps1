<#
.SYNOPSIS
    Baut den Medien-Index (site/media/media.json) aus site/media/images und
    site/media/videos und erzeugt optimierte Web-Versionen.

.DESCRIPTION
    Fuer jedes Bild:
      - skaliert auf max. 2000 px Breite und komprimiert (PNG verlustfrei,
        JPG/WebP mit Qualitaetsstufe)
      - legt eine Vorschau mit max. 640 px Breite ab
    Fuer jedes Video:
      - erzeugt ein Posterbild (Frame bei 1 s oder 10 % der Laufzeit) als WebP
      - protokolliert, wenn ffmpeg fehlt
    Videos werden NICHT umkodiert (das dauert zu lange und ist selten noetig).
    Bilder werden nur neu geschrieben, wenn die Quelle groesser als das Ziel
    ist - vorhandene Optimierungen bleiben damit unangetastet.

.PARAMETER NoOptimize
    Nur den Index neu schreiben, keine Bildbearbeitung.

.PARAMETER Force
    Bildbearbeitung auch fuer bereits optimierte Dateien ausfuehren.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File tools\media-sync.ps1

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File tools\media-sync.ps1 -Force -Verbose
#>

[CmdletBinding()]
param(
    [switch]$NoOptimize,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

$repoRoot   = Split-Path -Parent $PSScriptRoot
$mediaRoot  = Join-Path $repoRoot 'site\media'
$imagesDir  = Join-Path $mediaRoot 'images'
$videosDir  = Join-Path $mediaRoot 'videos'
# Abgeleitete Dateien liegen neben images/videos, nicht darin - sonst
# wuerden sie beim naechsten Lauf als eigene Galerie-Eintraege auftauchen.
$previewsDir= Join-Path $mediaRoot '.previews'
$postersDir = Join-Path $mediaRoot '.posters'
$manifestPath = Join-Path $mediaRoot 'media.json'

$imageExt = @('.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif')
$videoExt = @('.mp4', '.webm', '.mov', '.m4v', '.ogv')

$MAX_IMAGE_WIDTH = 2000
$PREVIEW_WIDTH   = 640

Add-Type -AssemblyName System.Drawing

function Write-Step { param([string]$Text) Write-Host "==> $Text" -ForegroundColor Cyan }
function Write-Info { param([string]$Text) Write-Host "    $Text" }
function Write-Warn2 { param([string]$Text) Write-Host "    $Text" -ForegroundColor Yellow }

function Format-Bytes {
    param([long]$Bytes)
    if ($Bytes -ge 1MB) { return ('{0:N1} MB' -f ($Bytes / 1MB)) }
    if ($Bytes -ge 1KB) { return ('{0:N0} KB' -f ($Bytes / 1KB)) }
    return "$Bytes B"
}

function Test-ImageDimensions {
    param([string]$Path)
    $img = [System.Drawing.Image]::FromFile($Path)
    try { return @{ Width = $img.Width; Height = $img.Height } }
    finally { $img.Dispose() }
}

function Optimize-Image {
    <# Verkleinert auf max. Breite und speichert mit passendem Format. #>
    param([string]$Path, [int]$MaxWidth)

    $ext = [System.IO.Path]::GetExtension($Path).ToLowerInvariant()
    $dims = Test-ImageDimensions -Path $Path
    if ($dims.Width -le $MaxWidth -and $ext -ne '.png') { return $false }

    $before = (Get-Item $Path).Length
    $src = [System.Drawing.Image]::FromFile($Path)
    try {
        $scale = [Math]::Min($MaxWidth / $src.Width, 1.0)
        $w = [int][Math]::Round($src.Width * $scale)
        $h = [int][Math]::Round($src.Height * $scale)

        $bmp = New-Object System.Drawing.Bitmap $w, $h
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $g.Clear([System.Drawing.Color]::Transparent)
        $g.DrawImage($src, 0, 0, $w, $h)
        $g.Dispose()

        # PNG verlustfrei (Screenshots/KI-Arte), JPG mit Qualitaet
        switch ($ext) {
            '.png'  { $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png) }
            '.gif'  { $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Gif) }
            default {
                $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
                         Where-Object { $_.MimeType -eq 'image/jpeg' }
                $ep = New-Object System.Drawing.Imaging.EncoderParameters 1
                $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
                    [System.Drawing.Imaging.Encoder]::Quality, 88L)
                $bmp.Save($Path, $codec, $ep)
            }
        }
        $bmp.Dispose()
    }
    finally { $src.Dispose() }

    $after = (Get-Item $Path).Length
    if ($before -gt 0) {
        $delta = [Math]::Round(100 * (1 - $after / $before))
        Write-Info ("{0}: {1} -> {2} ({3}% kleiner)" -f
            [System.IO.Path]::GetFileName($Path), (Format-Bytes $before), (Format-Bytes $after), $delta)
    }
    return $true
}

function New-Preview {
    param([string]$Path)
    $name = [System.IO.Path]::GetFileNameWithoutExtension($Path) + '.webp'
    $dest = Join-Path $previewsDir $name
    $ffmpeg = Get-Command ffmpeg -ErrorAction SilentlyContinue
    if (-not $ffmpeg) { return '' }

    $src = [System.Drawing.Image]::FromFile($Path)
    try {
        $scale = [Math]::Min($PREVIEW_WIDTH / $src.Width, 1.0)
        $w = [int][Math]::Round($src.Width * $scale)
        $tmp = Join-Path $previewsDir ('tmp-' + [System.IO.Path]::GetFileName($Path))
        $bmp = New-Object System.Drawing.Bitmap $w, ([int][Math]::Round($src.Height * $scale))
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.DrawImage($src, 0, 0, $bmp.Width, $bmp.Height)
        $g.Dispose()
        $bmp.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png)
        $bmp.Dispose()
    }
    finally { $src.Dispose() }

    & $ffmpeg.Source -y -loglevel error -i $tmp -c:v libwebp -quality 78 $dest
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    if (Test-Path $dest) { return ('.previews/' + $name) }
    return ''
}

function New-VideoPoster {
    param([string]$Path)
    $name = [System.IO.Path]::GetFileNameWithoutExtension($Path) + '-poster.webp'
    $dest = Join-Path $postersDir $name
    $ffmpeg = Get-Command ffmpeg -ErrorAction SilentlyContinue
    if (-not $ffmpeg) { return '' }

    # Frame bei 1 s, sonst 10 % der Laufzeit
    & $ffmpeg.Source -y -loglevel error -ss 1 -i $Path -frames:v 1 `
        -vf "scale='min(1280,iw)':-2" -c:v libwebp -quality 80 $dest 2>$null

    if (-not (Test-Path $dest)) {
        & $ffmpeg.Source -y -loglevel error -ss 0.1 -i $Path -frames:v 1 `
            -vf "scale='min(1280,iw)':-2" -c:v libwebp -quality 80 $dest 2>$null
    }
    if (Test-Path $dest) { return ('.posters/' + $name) }
    return ''
}

function Get-Title {
    <# "karussell-nachts" -> "Karussell nachts".
       Alles-Grossbuchstaben wie "SCREENSHOT01" werden als normaler Text
       behandelt, damit der Titel lesbar bleibt. #>
    param([string]$Path)
    $base = [System.IO.Path]::GetFileNameWithoutExtension($Path)
    $base = $base -replace '[-_]+', ' '
    $base = $base -replace '\s+', ' '
    $base = $base.Trim()
    if (-not $base) { return $base }

    # Ersten Buchstaben gross, den Rest in Kleinschreibung - ausser bei
    # komplett geschriebenen Woertern, die bleiben wie sie sind.
    $isShouted = $base -cmatch '^[A-Z0-9\s]+$'
    if ($isShouted) { return $base }
    return ($base.Substring(0, 1).ToUpperInvariant() + $base.Substring(1).ToLowerInvariant())
}

# ---------------------------------------------------------------- Start

foreach ($dir in @($mediaRoot, $imagesDir, $videosDir, $previewsDir, $postersDir)) {
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
}

Write-Step "Medien-Index wird aktualisiert"
Write-Info "Quelle: $mediaRoot"

# .previews und .posters sind abgeleitete Dateien und gehoeren nicht in den Index.
$imageFiles = @(Get-ChildItem -Path $imagesDir -File -Recurse |
    Where-Object {
        $_.Extension.ToLowerInvariant() -in $imageExt -and
        $_.FullName -notmatch '[\\/]\.(previews|posters)[\\/]'
    })
$videoFiles = @(Get-ChildItem -Path $videosDir -File -Recurse |
    Where-Object { $videoExt -contains $_.Extension.ToLowerInvariant() })

Write-Info ("{0} Bilder, {1} Videos gefunden" -f $imageFiles.Count, $videoFiles.Count)

# --------------------------------------------------------- Bilder
$images = @()
foreach ($file in ($imageFiles | Sort-Object Name)) {
    $rel = $file.FullName.Substring($imagesDir.Length + 1).Replace('\', '/')
    $entry = [ordered]@{
        src   = "images/$rel"
        title = (Get-Title $file.FullName)
        date  = $file.LastWriteTime.ToString('yyyy-MM-dd')
        size  = $file.Length
    }

    if (-not $NoOptimize) {
        $needs = $Force
        if (-not $needs) {
            $dims = Test-ImageDimensions -Path $file.FullName
            $needs = $dims.Width -gt $MAX_IMAGE_WIDTH
        }
        if ($needs) { $null = Optimize-Image -Path $file.FullName -MaxWidth $MAX_IMAGE_WIDTH }
    }

    # Vorschau nur fuer Bilder, nicht fuer bereits erzeugte Poster
    if (-not $NoOptimize) {
        $preview = New-Preview -Path $file.FullName
        if ($preview) { $entry.preview = $preview }
    }

    $images += [pscustomobject]$entry
}

# --------------------------------------------------------- Videos
$videos = @()
foreach ($file in ($videoFiles | Sort-Object Name)) {
    $rel = $file.FullName.Substring($videosDir.Length + 1).Replace('\', '/')
    $entry = [ordered]@{
        src   = "videos/$rel"
        title = (Get-Title $file.FullName)
        date  = $file.LastWriteTime.ToString('yyyy-MM-dd')
        size  = $file.Length
    }

    if (-not $NoOptimize) {
        $poster = New-VideoPoster -Path $file.FullName
        if ($poster) { $entry.poster = $poster }
    }

    $videos += [pscustomobject]$entry
}

# --------------------------------------------------------- Manifest
# Hinweis: Measure-Object liefert bei leerer Eingabe kein -Sum, daher der Fallback.
$allEntries = @($images) + @($videos)
$totalBytes = 0
foreach ($e in $allEntries) { $totalBytes += [long]$e.size }

$manifest = [ordered]@{
    generated = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    count     = $images.Count + $videos.Count
    totalSize = $totalBytes
    images    = $images
    videos    = $videos
}

$json = $manifest | ConvertTo-Json -Depth 5
Set-Content -LiteralPath $manifestPath -Value $json -Encoding UTF8

Write-Step "Fertig"
Write-Info ("{0} Bilder, {1} Videos, gesamt {2}" -f `
    $images.Count, $videos.Count, (Format-Bytes ([long]$totalBytes)))
Write-Info "Index: $manifestPath"
Write-Host ""
Write-Host "Naechster Schritt: Dateien committen und pushen." -ForegroundColor Green
