## Why

Instalar e operar o Grafite no servidor Windows hoje é uma sequência de comandos copiados do runbook:
- instalar o Node 24 e o PostgreSQL 18 à mão;
- editar o `postgresql.conf` e desligar o IIS;
- extrair o zip;
- rodar o `instalar.ps1` com a política de execução;
- depois, cada `grafite.ps1 conta criar ...`, `email configurar ...` e `atualizar ...` com as opções certas.

Quem opera o servidor pediu um caminho de dois cliques, para não colar comandos. A primeira instalação na empresa está chegando, então agora é a hora.

Esta change continua o F2d · Operação da spec mestre (seção 3.1; a operação na seção 4.3 e o pacote da versão na 12.2). Ela revê uma decisão do F2d: a instalação do Node e do PostgreSQL da produção, que o F2d deixou para o runbook, passa a ser feita pelo atalho de instalação. Sai na v0.1.1. A v0.1.0 sai antes, com a instalação de hoje e o pacote para Linux.

Ficam fora desta change:
- um `.exe`: sem assinatura digital, ele esbarra no SmartScreen e no antivírus. Um executável assinado pode vir depois, por cima dos mesmos comandos;
- uma janela gráfica: o menu é no terminal;
- a restauração, a volta à versão anterior e a troca da chave do cofre no menu: são raras e sensíveis, e continuam só pelo comando, como manda o runbook;
- o DNS, o token da Cloudflare, o túnel e o Access: continuam no runbook;
- a atualização pelo atalho do pacote: ela fica no menu, que já pergunta o zip;
- o servidor Linux (spec operacao-em-linux): lá, a operação continua pelos comandos do `grafite`, sem o menu e sem o atalho.

## What Changes

- **O atalho de instalação, `Instalar-Grafite.cmd`:**
  - vai na release, ao lado do zip e do `.sha256`, e também dentro do pacote;
  - com dois cliques, pede a elevação de administrador;
  - acha o zip na mesma pasta, confere o hash antes de extrair e o extrai ao lado;
  - instala o Node 24, se faltar;
  - instala o PostgreSQL 18, se faltar, com a senha do `postgres` pedida sem eco e confirmada, já atendendo só no próprio servidor. Ele pergunta a pasta dos dados e propõe `D:\PostgreSQL\18\data` quando o servidor tem um disco D:, para o banco não dividir o disco do Windows;
  - se o IIS ocupa a porta 80 ou a 443, pergunta se pode parar e desligar o serviço dele;
  - por fim, chama a instalação de hoje, que segue com as perguntas dela.
- **Os pré-requisitos, com versão fixada:** o pacote leva a versão e o SHA-256 dos instaladores oficiais do Node 24 e do PostgreSQL 18. O atalho usa o instalador que estiver na mesma pasta, para o servidor sem internet. Senão, baixa da fonte oficial. Nos dois casos, só roda o instalador cujo hash confere. As dependências do Grafite continuam todas no pacote: o servidor nunca as baixa.
- **O menu da operação:**
  - o comando `grafite menu` mostra as tarefas numeradas:
    - o estado dos serviços;
    - criar uma conta e redefinir um acesso;
    - o backup agora e a lista dos backups;
    - configurar e testar o e-mail;
    - atualizar um ambiente;
    - preparar o teste;
    - reiniciar um ambiente;
    - abrir a pasta dos logs.
  - Cada tarefa pergunta os campos, com padrões tirados da instalação, como o endereço da organização que opera o servidor. Depois roda o mesmo comando que a linha de comando roda, com as mesmas confirmações.
- **O atalho do menu:**
  - a instalação cria o `Grafite.cmd` na raiz da instalação e o atalho "Grafite" na área de trabalho de todos os usuários;
  - o atalho pede a elevação e abre o menu;
  - a atualização da produção cria os dois numa instalação de antes do menu.
- **O runbook:** a instalação passa a começar pelo atalho, e a operação, pelo menu. Os comandos continuam documentados para o roteiro e para o que fica fora do menu.
- **O Windows Server 2019:** o runbook passa a aceitar o 2019, ao lado do 2022 e do 2025, porque é o da produção. A EDB só testa o PostgreSQL 18 no 2022 e no 2025, então o 2019 entra pela verificação à mão do caminho do zero, feita nele.

## Capabilities

### New Capabilities
(nenhuma)

### Modified Capabilities
- `operacao-servicos`:
  - o "Pacote da versão" ganha o atalho de instalação e os pré-requisitos com versão e hash fixados;
  - a "Instalação do zero" passa a poder começar pelo atalho, que instala o Node 24 e o PostgreSQL 18 que faltam;
  - um requisito novo trata do menu da operação e do atalho dele;
  - a "Atualização pelo teste antes da produção" cria o atalho do menu numa instalação de antes dele;
  - o "Runbook da operação" passa a guiar pelo atalho e pelo menu.

## Impact

- **Código:**
  - `apps/operacao/src/windows`, ao lado das outras peças do Windows:
    - o comando `menu`;
    - a preparação do servidor na instalação (`--preparar`), que instala o PostgreSQL e desliga o IIS;
    - a criação do `Grafite.cmd` e do atalho na instalação e, pela peça da plataforma do Windows, na atualização;
    - as peças do Windows novas atrás de interfaces: o instalador do PostgreSQL, o IIS e o atalho.
  - `apps/operacao/src/comando.ts`: no servidor Linux, o `menu` e o `--preparar` respondem que são do servidor Windows.
  - `apps/operacao/lancadores`: o `Instalar-Grafite.cmd`, que eleva, confere o hash, extrai, instala o Node e chama o comando, e o `Grafite.cmd`.
  - `apps/operacao/prerequisitos.json`: as versões e os hashes dos instaladores do Node 24 e do PostgreSQL 18.
  - `apps/operacao/scripts/empacotar.ts`: o atalho e os pré-requisitos no pacote, e o atalho ao lado do zip.
- **CI:** o `versao.yml` publica o `Instalar-Grafite.cmd` na release, ao lado do zip, do `.sha256` e do pacote para Linux. Os pacotes passam de um job ao outro pela pasta do executor, sem artefato, como desde a change servidor-linux-com-docker. A verificação da instalação no executor passa a entrar pelo atalho, com o Node e o PostgreSQL já presentes.
- **Documentação:**
  - o runbook (`docs/operacao/runbook.md`), com o Windows Server 2019 nos pré-requisitos;
  - a spec mestre (seções 3.1, 4.3 e 12.2);
  - o `CLAUDE.md` (o comando `menu` e o atalho);
  - o `docs/mapa.md`.
- **Versão:** `apps/api/package.json` passa a 0.1.1, para a tag `v0.1.1`.
- **Dependências novas:** nenhuma no Grafite. O servidor ganha o Node 24 e o PostgreSQL 18 pelos instaladores oficiais.
