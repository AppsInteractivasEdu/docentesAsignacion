param([int]$Puerto = 8765)
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
$tipos = @{ '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.json'='application/json; charset=utf-8'; '.svg'='image/svg+xml'; '.png'='image/png'; '.xlsx'='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'; '.docx'='application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
$l = New-Object System.Net.HttpListener
$l.Prefixes.Add("http://127.0.0.1:$Puerto/")
$l.Start()
Write-Host "Aplicación disponible en http://localhost:$Puerto/index.html  (cierre esta ventana para detener)"
while ($l.IsListening) {
  $ctx = $l.GetContext()
  try {
    $ruta = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
    if ($ruta -eq '') { $ruta = 'index.html' }
    $archivo = [System.IO.Path]::GetFullPath((Join-Path $raiz $ruta))
    if ($archivo.StartsWith($raiz) -and (Test-Path $archivo -PathType Leaf)) {
      $bytes = [System.IO.File]::ReadAllBytes($archivo)
      $ext = [System.IO.Path]::GetExtension($archivo).ToLower()
      $ctx.Response.ContentType = $(if ($tipos.ContainsKey($ext)) { $tipos[$ext] } else { 'application/octet-stream' })
      $ctx.Response.Headers.Add('Cache-Control', 'no-store')
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else { $ctx.Response.StatusCode = 404 }
  } catch { $ctx.Response.StatusCode = 500 }
  $ctx.Response.Close()
}
