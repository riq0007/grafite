## Why

No Linux, o roteiro de instalação, o `instalar.sh`, só existe dentro do pacote. Antes de instalar, quem opera precisa tirá-lo do tar com `tar -xf … instalar.sh`. No Windows, o atalho de instalação já vem ao lado do zip, na release. Em 27/10, o usuário pediu que a release mais atual e as seguintes tragam o `.sh` para começar o Grafite no Linux da mesma forma.

Esta change continua o F2d · Operação da spec mestre: a seção 3.1, a operação na seção 4.3 e o pacote da versão na 12.2. Ela também segue a spec operacao-em-linux.

Ficam fora desta change:
- um menu ou um atalho de área de trabalho no Linux: a operação continua pelos comandos do `grafite`;
- a instalação do Docker pelo roteiro: ele continua só conferindo o Docker e o plugin compose, que são pré-requisitos do runbook;
- qualquer outra mudança no `instalar.sh`, além de achar o pacote e das mensagens.

## What Changes

- **O roteiro ao lado do pacote:** o empacotamento do Linux põe uma cópia do `instalar.sh` ao lado do tar e do `.sha256`, igual à de dentro do pacote, e a release publica os três.
- **O pacote achado na pasta:** sem o pacote nos argumentos, o `instalar.sh` usa o único `grafite-x.y.z-linux-x64.tar` da pasta dele.
  - Se a pasta não tiver nenhum pacote, ou tiver mais de um, ele para antes de mudar qualquer coisa e diz o que fazer.
  - O pacote nos argumentos continua valendo, como no roteiro automático.
- **`sudo bash instalar.sh`:** o arquivo baixado da release vem sem a permissão de execução. As mensagens do roteiro e o runbook passam a dizer `sudo bash instalar.sh`.
- **A instalação de teste no Linux pelo CI** passa a rodar a cópia de fora, a mesma que vai na release, e confere que ela é igual à de dentro do pacote.
- **As releases de hoje:** a v0.1.0, que é a mais recente, e a pré-release `ensaio-v0.1.1-92` recebem o `instalar.sh` do próprio pacote como arquivo da release. O pacote e o `.sha256` delas não mudam.

## Capabilities

### New Capabilities
(nenhuma)

### Modified Capabilities
- `operacao-em-linux`: no "Pacote da versão para Linux", a release passa a publicar o roteiro de instalação ao lado do pacote, e o roteiro passa a achar o pacote na pasta dele.

## Impact

- **Código, com os testes de cada um:**
  - `apps/operacao/lancadores/instalar.sh`: o pacote achado na pasta e as mensagens;
  - `apps/operacao/scripts/empacotar-linux.ts`: a cópia ao lado do tar.
- **CI (`versao.yml`):**
  - a release já publica todos os arquivos da pasta do pacote, então leva o `instalar.sh`;
  - as notas da release passam a citá-lo;
  - a instalação de teste no Linux usa a cópia de fora.
- **Releases:** o `instalar.sh` acrescentado à v0.1.0 e à `ensaio-v0.1.1-92` pelo `gh release upload`.
- **Documentação:**
  - o runbook, na instalação no Linux;
  - a spec mestre, nas seções 3.1, 4.3 e 12.2;
  - o `CLAUDE.md`, no empacotamento e na instalação no Linux;
  - o `docs/mapa.md`.
- **Versão:** sai na v0.1.1, junto da instalador-e-menu-da-operacao, sem dependências novas.
