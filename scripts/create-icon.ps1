Add-Type -AssemblyName System.Drawing
$assetDir = Join-Path $PSScriptRoot '../build'
New-Item -ItemType Directory -Force $assetDir | Out-Null
$bitmap = [System.Drawing.Bitmap]::new(256,256)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::FromArgb(21,24,32))
$brush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(181,240,96))
$points = [System.Drawing.Point[]]@([System.Drawing.Point]::new(48,60),[System.Drawing.Point]::new(91,60),[System.Drawing.Point]::new(126,106),[System.Drawing.Point]::new(161,60),[System.Drawing.Point]::new(204,60),[System.Drawing.Point]::new(149,132),[System.Drawing.Point]::new(204,204),[System.Drawing.Point]::new(161,204),[System.Drawing.Point]::new(126,158),[System.Drawing.Point]::new(91,204),[System.Drawing.Point]::new(48,204),[System.Drawing.Point]::new(103,132))
$graphics.FillPolygon($brush,$points)
$graphics.FillEllipse($brush,211,188,18,18)
$bitmap.Save((Join-Path $assetDir 'icon.png'),[System.Drawing.Imaging.ImageFormat]::Png)
# PNG-backed 256px ICO, supported by Windows Vista and later.
$png = [System.IO.File]::ReadAllBytes((Join-Path $assetDir 'icon.png'))
$file = [System.IO.File]::Create((Join-Path $assetDir 'icon.ico'))
$writer = [System.IO.BinaryWriter]::new($file)
$writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]1)
$writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0)
$writer.Write([uint16]1); $writer.Write([uint16]32); $writer.Write([uint32]$png.Length); $writer.Write([uint32]22); $writer.Write($png)
$writer.Dispose(); $graphics.Dispose(); $brush.Dispose(); $bitmap.Dispose()
