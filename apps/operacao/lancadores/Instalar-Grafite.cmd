@echo off
rem O atalho de instalacao do Grafite (change instalador-e-menu-da-operacao, design, decisao 1; spec
rem operacao-servicos, "Atalho de instalacao"). Fica ao lado do zip e do .sha256 da release e faz o
rem minimo, porque o que esta fora do zip nao e conferido pelo hash do pacote: pede a elevacao,
rem confere o zip pelo .sha256, o extrai ao lado e chama o preparar-servidor.ps1 do pacote extraido.
rem A parte em PowerShell, depois da marca, vai para um .ps1 temporario, que recebe os argumentos.
rem No repositorio, com LF, como todo texto; o empacotar.ts o grava com CRLF, que o cmd.exe exige.
rem Uso: Instalar-Grafite.cmd [--respostas <arquivo>]
setlocal
set "GRAFITE_ATALHO=%~f0"
set "GRAFITE_SCRIPT=%TEMP%\Instalar-Grafite-%RANDOM%%RANDOM%.ps1"
powershell.exe -NoProfile -NonInteractive -Command "$t = [IO.File]::ReadAllText($env:GRAFITE_ATALHO, [Text.Encoding]::UTF8); [IO.File]::WriteAllText($env:GRAFITE_SCRIPT, $t.Substring($t.IndexOf('#' + '#POWERSHELL')), (New-Object Text.UTF8Encoding $true))"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%GRAFITE_SCRIPT%" %*
set "CODIGO=%ERRORLEVEL%"
del "%GRAFITE_SCRIPT%" >nul 2>&1
endlocal & exit /b %CODIGO%
##POWERSHELL
# A parte em PowerShell do atalho de instalação, que o Instalar-Grafite.cmd grava numa pasta
# temporária e roda com os argumentos dele.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$atalho = $env:GRAFITE_ATALHO
$pasta = Split-Path -Parent $atalho
# Os dois cliques não têm argumentos: a janela fica aberta no fim, para ninguém perder a senha
# temporária da primeira conta.
$segurar = $args.Count -eq 0

function Fim([int]$codigo, [string]$mensagem) {
  if ($mensagem -and $codigo -eq 0) { Write-Output $mensagem }
  elseif ($mensagem) { [Console]::Error.WriteLine($mensagem) }
  if ($segurar) { [void](Read-Host 'Tecle Enter para fechar esta janela') }
  exit $codigo
}

$identidade = [Security.Principal.WindowsIdentity]::GetCurrent()
$administrador = (New-Object Security.Principal.WindowsPrincipal $identidade).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $administrador) {
  # O atalho se abre de novo como administrador, com os mesmos argumentos, e esta janela fecha.
  try {
    if ($args.Count -gt 0) {
      Start-Process -FilePath $atalho -ArgumentList @($args | ForEach-Object { "`"$_`"" }) -Verb RunAs
    } else {
      Start-Process -FilePath $atalho -Verb RunAs
    }
  } catch {
    Fim 1 'A instalação do Grafite precisa da elevação de administrador: rode o atalho de novo e aceite o pedido do Windows.'
  }
  exit 0
}

$zips = @(Get-ChildItem -LiteralPath $pasta -Filter 'grafite-*-windows-x64.zip' -File)
if ($zips.Count -eq 0) {
  Fim 1 "Não há o zip do Grafite (grafite-x.y.z-windows-x64.zip) em ${pasta}: baixe-o da release para a mesma pasta deste atalho."
}
if ($zips.Count -gt 1) {
  Fim 1 "Há mais de um zip do Grafite em ${pasta}: deixe só o da versão que vai instalar."
}
$zip = $zips[0]
$hash = "$($zip.FullName).sha256"
if (-not (Test-Path -LiteralPath $hash)) {
  Fim 1 "Falta o $($zip.Name).sha256 ao lado do zip: baixe-o da release para a mesma pasta."
}
$esperado = ([IO.File]::ReadAllText($hash).Trim() -split '\s+')[0].ToLowerInvariant()
$calculado = (Get-FileHash -LiteralPath $zip.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
if ($esperado -ne $calculado) {
  Fim 1 "O pacote $($zip.Name) não confere com o .sha256: baixe-o de novo da release. Nada foi mudado neste servidor."
}
Write-Output "Pacote $($zip.Name) conferido."

# A extração vai sempre de novo, do zip conferido, numa pasta .parcial renomeada no fim.
$destino = Join-Path $pasta ($zip.BaseName -replace '-windows-x64$', '')
$parcial = "$destino.parcial"
Write-Output "Extraindo o pacote em $destino..."
foreach ($velha in @($parcial, $destino)) {
  if (Test-Path -LiteralPath $velha) { Remove-Item -LiteralPath $velha -Recurse -Force }
}
$ProgressPreference = 'SilentlyContinue'
Expand-Archive -LiteralPath $zip.FullName -DestinationPath $parcial -Force
Rename-Item -LiteralPath $parcial -NewName (Split-Path -Leaf $destino)

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $destino 'preparar-servidor.ps1') $zip.FullName @args
$codigo = $LASTEXITCODE
if ($codigo -eq 0) { Fim 0 '' }
Fim $codigo 'A instalação parou: corrija o que está acima e rode o atalho de novo.'
