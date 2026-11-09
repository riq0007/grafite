# A preparação do servidor Windows pelo atalho de instalação (change instalador-e-menu-da-operacao,
# design, decisão 2). Roda do pacote extraído, antes de existir o Node, e decide só o que não pode
# esperar por ele:
# 1. lê o prerequisitos.json do pacote;
# 2. procura o Node no C:\Program Files\nodejs e no PATH. Com o Node 24, segue; com outra versão
#    maior, para, sem trocar o Node de outros programas. Sem o Node, usa o .msi da pasta do zip ou o
#    baixa do nodejs.org, só com o SHA-256 conferido (o baixado que não confere é apagado), e o
#    instala em silêncio;
# 3. chama "grafite instalar <zip> --preparar" pelo caminho completo do node.exe, porque o PATH
#    desta janela ainda é o de antes do Node. O resto da preparação é do comando, em TypeScript.
# Uso: .\preparar-servidor.ps1 <zip do pacote> [--respostas <arquivo>]
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Parar([string]$mensagem) {
  [Console]::Error.WriteLine($mensagem)
  exit 1
}

$identidade = [Security.Principal.WindowsIdentity]::GetCurrent()
$administrador = (New-Object Security.Principal.WindowsPrincipal $identidade).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $administrador) {
  Parar 'O preparar-servidor.ps1 precisa de um PowerShell aberto como administrador.'
}
if ($args.Count -lt 1) {
  Parar 'Uso: .\preparar-servidor.ps1 <zip do pacote> [--respostas <arquivo>]'
}
$zip = (Resolve-Path -LiteralPath $args[0]).Path
$resto = @($args | Select-Object -Skip 1)
$pastaDoZip = Split-Path -Parent $zip

# No pacote, o comando fica em apps\operacao; no repositório, ao lado da pasta dos lançadores.
$operacao = @((Join-Path $PSScriptRoot 'apps\operacao'), (Join-Path $PSScriptRoot '..')) |
  Where-Object { Test-Path -LiteralPath (Join-Path $_ 'prerequisitos.json') } |
  Select-Object -First 1
if (-not $operacao) {
  Parar "O prerequisitos.json do Grafite não está ao lado de $PSScriptRoot."
}
$prerequisitos = [IO.File]::ReadAllText((Join-Path $operacao 'prerequisitos.json'), [Text.Encoding]::UTF8) |
  ConvertFrom-Json
$fixado = $prerequisitos.node
$maior = $fixado.versao.Split('.')[0]

# A versão do Node de um caminho, como 24.22.1, ou nada se ele não responder.
function VersaoDoNode([string]$caminho) {
  if (-not (Test-Path -LiteralPath $caminho)) { return $null }
  $ErrorActionPreference = 'Continue'
  $saida = & $caminho --version 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $saida) { return $null }
  return "$saida".Trim().TrimStart('v')
}

$doSistema = Join-Path $env:ProgramFiles 'nodejs\node.exe'
$candidatos = @($doSistema)
$noPath = Get-Command node.exe -ErrorAction SilentlyContinue
if ($noPath) { $candidatos += $noPath.Source }
$node = $null
foreach ($candidato in $candidatos) {
  $versao = VersaoDoNode $candidato
  if (-not $versao) { continue }
  if ($versao.Split('.')[0] -ne $maior) {
    Parar "Este servidor tem o Node $versao em $candidato, e a produção do Grafite precisa do Node $maior. O atalho não troca o Node de outros programas: instale o Node $maior à mão e rode a instalação pelo comando, como diz o runbook."
  }
  $node = $candidato
  Write-Output "O Node $versao já está instalado em ${candidato}: fica como está."
  break
}

if (-not $node) {
  $msi = Join-Path $pastaDoZip $fixado.arquivo
  $sha256 = { (Get-FileHash -LiteralPath $msi -Algorithm SHA256).Hash.ToLowerInvariant() }
  if (Test-Path -LiteralPath $msi) {
    if ((& $sha256) -ne $fixado.sha256) {
      Parar "O $($fixado.arquivo) da pasta do zip não confere com o hash fixado no pacote: troque-o pelo instalador oficial, de $($fixado.url), ou apague-o para o atalho baixá-lo."
    }
    Write-Output "$($fixado.arquivo) conferido, da pasta do zip."
  } else {
    Write-Output "Baixando o $($fixado.arquivo) de $($fixado.url)..."
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $ProgressPreference = 'SilentlyContinue'
    try {
      Invoke-WebRequest -Uri $fixado.url -OutFile $msi -UseBasicParsing
    } catch {
      Remove-Item -LiteralPath $msi -Force -ErrorAction SilentlyContinue
      Parar "Falta o $($fixado.arquivo) na pasta do zip ($pastaDoZip), e o download falhou: $($_.Exception.Message) Baixe-o de $($fixado.url), ponha-o nessa pasta e rode o atalho de novo."
    }
    if ((& $sha256) -ne $fixado.sha256) {
      Remove-Item -LiteralPath $msi -Force
      Parar "O $($fixado.arquivo) baixado de $($fixado.url) não confere com o hash fixado no pacote e foi apagado. Nada foi instalado."
    }
    Write-Output "$($fixado.arquivo) baixado e conferido."
  }
  Write-Output "Instalando o Node $($fixado.versao) em silêncio..."
  $instalacao = Start-Process -FilePath 'msiexec.exe' -ArgumentList @('/i', "`"$msi`"", '/qn', '/norestart') -Wait -PassThru
  # O 3010 é o "instalado, falta reiniciar", que o Node não precisa para rodar.
  if ($instalacao.ExitCode -ne 0 -and $instalacao.ExitCode -ne 3010) {
    Parar "O instalador do Node terminou com o código $($instalacao.ExitCode)."
  }
  if (-not (VersaoDoNode $doSistema)) {
    Parar "O instalador do Node terminou, mas o $doSistema não responde."
  }
  $node = $doSistema
  Write-Output "Node $($fixado.versao) instalado."
}

& $node (Join-Path $operacao 'src\grafite.ts') instalar $zip --preparar @resto
exit $LASTEXITCODE
