## ADDED Requirements

### Requirement: Executores do CI

O CI e o workflow das versões SHALL rodar só em executores descartáveis hospedados pelo GitHub, que começam cada job numa máquina nova. Nenhum executor próprio SHALL estar ligado ao repositório: nenhum PR, nem um vindo de um fork, SHALL rodar código numa máquina da equipe. Um job SHALL NOT encontrar arquivos, caches nem imagens deixados por outro run, e o resultado de um PR SHALL NOT mudar o de um run seguinte, nem o da branch principal ou o de uma tag.

#### Scenario: PR de um fork pede um executor próprio
- **WHEN** alguém de fora abre um PR que muda um workflow para rodar num executor próprio
- **THEN** nenhuma máquina da equipe roda o job, porque o repositório não tem executor próprio

#### Scenario: Release da versão
- **WHEN** a tag de uma versão é criada
- **THEN** os pacotes para Windows e para Linux são montados, instalados do zero e publicados na release por executores do GitHub, sem passar por uma máquina da equipe

#### Scenario: Run seguinte começa limpo
- **WHEN** o job de um PR deixa arquivos, caches ou imagens de contêiner na máquina em que rodou
- **THEN** o run seguinte, inclusive o da branch principal e o de uma tag, começa sem eles

### Requirement: Sintaxe dos passos em PowerShell conferida

Os testes unitários SHALL passar cada passo em PowerShell dos workflows pelo parser do PowerShell e SHALL reprovar o passo que não passa, com o workflow, o job e o passo. Um passo que roda no Windows PowerShell 5.1 SHALL ser recusado também quando usa uma sintaxe que só o PowerShell 7 aceita, inclusive onde só o PowerShell 7 está instalado para conferir.

#### Scenario: Variável seguida de dois-pontos num passo do Windows
- **WHEN** um passo em PowerShell de um workflow escreve `"$LASTEXITCODE: nova tentativa"`, que o PowerShell lê como uma variável com unidade
- **THEN** o `pnpm test` reprova, com o workflow, o job, o passo e a mensagem do parser, antes de o job rodar no GitHub

#### Scenario: Sintaxe do PowerShell 7 num passo do 5.1
- **WHEN** um passo que roda no Windows PowerShell 5.1 usa o `??` ou o `&&`
- **THEN** o `pnpm test` reprova, no Windows pelo parser do 5.1 e no Linux pelo do PowerShell 7
