# A instalação do Grafite (design do F2d, decisão 6), rodada de um pacote desempacotado. Este
# lançador só confere se o PowerShell está como administrador e chama "grafite instalar" com o Node
# do servidor.
# Uso: .\instalar.ps1 <zip do pacote> [--respostas <arquivo>]
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$identidade = [Security.Principal.WindowsIdentity]::GetCurrent()
$administrador = (New-Object Security.Principal.WindowsPrincipal $identidade).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $administrador) {
  [Console]::Error.WriteLine('O instalar.ps1 precisa de um PowerShell aberto como administrador.')
  exit 1
}

# No pacote ou, no repositório, ao lado da pasta src.
$candidatos = @(
  (Join-Path $PSScriptRoot 'apps\operacao\src\grafite.ts'),
  (Join-Path $PSScriptRoot '..\src\grafite.ts')
)
$comando = $candidatos | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $comando) {
  [Console]::Error.WriteLine("O comando do Grafite não está ao lado de $PSScriptRoot.")
  exit 1
}

& node $comando instalar @args
exit $LASTEXITCODE
