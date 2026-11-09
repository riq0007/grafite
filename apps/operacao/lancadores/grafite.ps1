# O comando de operação do Grafite (design do F2d, decisão 4). Este lançador só confere se o
# PowerShell está como administrador e chama o comando, em TypeScript, com o Node do servidor. Num
# pacote desempacotado, roda o comando dele; na pasta da instalação, o da versão da produção.
# Uso: .\grafite.ps1 <comando> [opções]   (.\grafite.ps1 --ajuda mostra os comandos)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$ajuda = ($args -contains '--ajuda') -or ($args -contains '-h')
$identidade = [Security.Principal.WindowsIdentity]::GetCurrent()
$administrador = (New-Object Security.Principal.WindowsPrincipal $identidade).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $ajuda -and -not $administrador) {
  [Console]::Error.WriteLine('O grafite.ps1 precisa de um PowerShell aberto como administrador.')
  exit 1
}

# No pacote, na pasta da instalação ou, no repositório, ao lado da pasta src.
$candidatos = @(
  (Join-Path $PSScriptRoot 'apps\operacao\src\grafite.ts'),
  (Join-Path $PSScriptRoot 'producao\atual\apps\operacao\src\grafite.ts'),
  (Join-Path $PSScriptRoot '..\src\grafite.ts')
)
$comando = $candidatos | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $comando) {
  [Console]::Error.WriteLine("O comando do Grafite não está ao lado de $PSScriptRoot.")
  exit 1
}

& node $comando @args
exit $LASTEXITCODE
