## Context

A motivação está em `proposal.md` (Why), e os requisitos, na spec desta change. O que importa do F2d (`openspec/changes/archive/2026-10-08-f2d-operacao/design.md`):
- **O comando de operação** é TypeScript em `apps/operacao/src`. O `grafite.ts` monta as peças de verdade e chama `executarComando`. As peças do Windows ficam atrás de interfaces simuladas nos testes: os serviços, as junções, as ferramentas do PostgreSQL, o firewall, as portas e o console, que pergunta, pergunta sem eco e confirma o digitado.
- **Os lançadores** (`apps/operacao/lancadores/grafite.ps1` e `instalar.ps1`) só conferem a elevação e chamam o Node. O `grafite.ps1` vai para a raiz da instalação.
- **A instalação** confere o Node 24, o PostgreSQL 18 (pela pasta dos binários, `C:\Program Files\PostgreSQL\18\bin` por padrão) e as portas 80 e 443 antes de criar qualquer coisa. Com uma porta ocupada, ela para.
- **O F2d deixou de fora, de propósito,** a instalação do Node e do PostgreSQL ("pré-requisitos do runbook"). A spec diz que o servidor não baixa dependências. Esta change revê as duas coisas só para os pré-requisitos.
- **O pacote** sai do `empacotar.ts`, e a release, do `versao.yml`, que publica o que está em `pacote/`. A verificação da instalação roda no executor `instalacao`, que tem o Node. O job instala o PostgreSQL 18 pelo Chocolatey antes da instalação e o tira no fim (change ci-no-executor-proprio).

Depois desta change ser proposta, a change servidor-linux-com-docker mudou três coisas que ela usa:
- **O mesmo comando de operação roda também no servidor Linux,** num contêiner. O que muda entre os dois servidores fica na peça da plataforma (`PlataformaDaInstalacao`), que a atualização, a restauração e os outros fluxos chamam. As peças do Windows ficam em `apps/operacao/src/windows`.
- **Os pacotes passam de um job ao outro pela pasta do executor,** sem artefato do Actions, e a release publica o pacote para Windows ao lado do pacote para Linux.
- **A v0.1.0 sai da `main` de 26/10,** com o pacote para Linux. A tag de 21/10, que não chegou a ter release, foi movida.

Depois da implementação, em 27/10: o runbook pede o Windows Server 2022 ou 2025, os que a EDB testa com o PostgreSQL 18, e a produção roda o Windows Server 2019.

## Goals / Non-Goals

**Goals:**
- **Lógica testável:** toda a lógica nova (o que falta, a ordem, as perguntas do menu e o comando que cada tarefa monta) fica no TypeScript, com teste antes do código. O PowerShell fica só com o que precisa rodar antes de existir o Node.
- **Arquivos conferidos:** o que vem de fora do zip conferido pelo hash é o mínimo: o atalho só eleva, confere e extrai.
- **Um caminho só:** o menu roda o mesmo `executarComando` da linha de comando, então as conferências e as confirmações são as mesmas.

**Non-Goals:**
- Outra porta do PostgreSQL no atalho. Quem precisa disso instala o PostgreSQL à mão, como hoje.
- Mudar a pasta dos dados de um PostgreSQL que já existe.
- Atualizar o Node ou o PostgreSQL de um servidor que já os tem.
- Um atalho que eleve sozinho pelo `.lnk`. A marca "executar como administrador" fica dentro do binário do `.lnk`. O `.cmd` se eleva e basta.

## Decisions

### 1. O atalho de instalação: pouco fora do zip, o resto dentro

**Escolha:**
- **O nome:** `Instalar-Grafite.cmd`, sem espaço. O GitHub troca o espaço do nome de um arquivo da release por ponto.
- **O conteúdo:** um `.cmd` com um trecho de PowerShell. O trecho:
  1. confere a elevação e, sem ela, se relança com `Start-Process -Verb RunAs`;
  2. acha o `grafite-*-windows-x64.zip` da própria pasta (com mais de um, para e pede só um);
  3. confere o hash pelo `.sha256`;
  4. extrai o zip com `Expand-Archive` para `grafite-x.y.z\`, ao lado;
  5. chama o `preparar-servidor.ps1` do pacote extraído, passando a pasta do zip e os argumentos que recebeu.
- **Uso pelo roteiro:** o `--respostas <arquivo>` passa até a instalação, para o CI. Sem argumentos, que é o caso dos dois cliques, o atalho segura a janela no fim com a mensagem, para ninguém perder a senha temporária.

**Por quê:** o que fica fora do zip não é conferido pelo hash do pacote, então faz o mínimo. Todo o resto vem do pacote já conferido. O CI confere que o atalho de fora é igual ao de dentro.

**Alternativas:**
- **O atalho inteiro fora do zip:** mais código sem conferência.
- **Um `.msi` ou um `.exe`:** precisa de assinatura para não esbarrar no SmartScreen, e de outra ferramenta de montagem.

### 2. O Node primeiro, no PowerShell

**Escolha:** o `preparar-servidor.ps1` (em `apps/operacao/lancadores`) faz, nesta ordem:
1. **Lê** o `prerequisitos.json` do pacote.
2. **Procura o Node:** no `C:\Program Files\nodejs\node.exe` e no PATH.
   - Com o Node 24, segue.
   - Com outra versão maior, para e diz que a produção precisa do Node 24. Ele não troca o Node de outros programas.
   - Sem o Node, pega o `.msi` na pasta do zip ou o baixa do nodejs.org, pelo `Invoke-WebRequest` com TLS 1.2. Confere o SHA-256, apaga o arquivo se não conferir e instala com `msiexec /i <msi> /qn /norestart`.
3. **Chama o comando** pelo caminho completo do `node.exe`, porque o PATH da janela ainda é o de antes: `grafite instalar <zip> --preparar`, com os argumentos recebidos.

**Por quê:** sem o Node não há o comando em TypeScript. O PowerShell fica com a única decisão que não pode esperar.

**Alternativas:**
- **Levar um Node portátil no pacote:** os serviços precisam do Node instalado no sistema, para o WinSW e para o `grafite.ps1` da raiz. Seriam dois Nodes.

### 3. O PostgreSQL e o IIS na preparação da instalação

**Escolha:** a instalação ganha a opção `--preparar`, que o `preparar-servidor.ps1` passa. Com ela, antes das conferências de hoje, a instalação roda a preparação do servidor (`apps/operacao/src/windows/preparar.ts`), que procura os instaladores na pasta do zip. Sem a opção, a instalação é a de hoje.

**Só no Windows:** no servidor Linux, a instalação recusa o `--preparar` antes de mudar qualquer coisa, dizendo que a opção é do servidor Windows. Lá, o Docker é o único pré-requisito, e o `instalar.sh` o confere.

- **PostgreSQL:**
  - **Detecção:** a pasta dos binários padrão com o `pg_ctl --version`, e o serviço `postgresql-x64-18`.
    - Com o 18, segue.
    - Com outra versão, para antes de instalar qualquer coisa.
    - Sem o PostgreSQL, instala.
  - **A pasta dos dados:**
    - é perguntada pelo `perguntar`, com o padrão `D:\PostgreSQL\18\data` quando há um disco D: fixo, e `C:\Program Files\PostgreSQL\18\data` quando não há;
    - o disco D: é procurado entre os discos fixos (`Get-CimInstance Win32_LogicalDisk` com o tipo 3), numa peça `Discos` atrás de interface. Um D: de CD ou de rede não conta;
    - uma pasta que existe e tem arquivos é recusada, e a pergunta volta. A pasta que não existe o instalador da EDB cria e dá a ela a permissão da conta do serviço;
    - os programas continuam na pasta padrão, `C:\Program Files\PostgreSQL\18`, que é o `pgBin` que a instalação de hoje já propõe.
    - **Por quê:** a VM de testes pedida à infraestrutura tem o C: para o Windows e o D: em SSD para o Grafite, os bancos e os backups. Separar os discos impede que as atualizações do Windows encham o disco do banco, e o PostgreSQL para de gravar quando o disco enche.
  - **Instalação:**
    - pergunta a senha do `postgres` duas vezes, pelo `perguntarSegredo`;
    - pega o instalador na pasta do zip ou o baixa, gravando em disco e calculando o SHA-256 enquanto grava;
    - roda o instalador da EDB em modo silencioso: `--mode unattended --unattendedmodeui none --optionfile <arquivo>`, com a porta 5432, a pasta dos dados escolhida (`datadir`) e só os componentes servidor e linha de comando.
  - **A senha:** vai no arquivo de opções, numa pasta temporária com a ACL só dos administradores (a `restringirPasta` que já existe), apagado num `finally`. Assim ela não fica nos argumentos do processo.
  - **Depois:**
    - troca o `listen_addresses` do `postgresql.conf` por `'localhost'`;
    - reinicia o serviço;
    - deixa o início automático.
  - **Na instalação do zero:** a preparação e a instalação rodam no mesmo processo, então a senha digitada segue só na memória até a instalação, que não a pergunta de novo.
- **IIS:**
  - Com as portas 80 ou 443 ocupadas (a `portasOcupadas` que já existe) e o serviço `W3SVC` rodando, pergunta se pode desligá-lo.
  - Com o sim, para o serviço e desliga o início automático pelo `sc.exe`.
  - Confere as portas de novo. Ainda ocupadas, ou ocupadas por outro programa, a mensagem é a de hoje.
- **Peças novas atrás de interfaces:**
  - `Baixador`: baixar para um arquivo e devolver o SHA-256;
  - `InstaladorDoPostgres`: rodar o instalador e editar a configuração;
  - `ServicosDoSistema`: o estado, a parada e o início automático de um serviço do Windows que não é do Grafite;
  - `Discos`: os discos fixos do servidor e se uma pasta existe com arquivos.
  - Os testes as simulam.
  - Elas ficam em `apps/operacao/src/windows`, com as outras peças do Windows. O `grafite.ts` as monta e as passa ao comando num campo `windows` do ambiente, como o `linux` que o lançador do servidor Linux preenche.

**Por quê:** a lógica arriscada (a ordem, o que fazer com outra versão, a senha que não vaza) fica testável no Vitest, como a do F2d.

**Alternativas:**
- **Tudo no PowerShell:** sem teste, contra o objetivo do F2d.
- **Instalar o PostgreSQL pelo `winget`:** o Windows Server 2019 e o 2022 não trazem o `winget`, e a versão viria de um manifesto de terceiros.

### 4. Os pré-requisitos com versão e hash fixados

**Escolha:**
- **O arquivo:** `apps/operacao/prerequisitos.json` traz, para o Node e para o PostgreSQL, a versão, o nome do arquivo, a URL oficial e o SHA-256.
- **Os hashes:**
  - o do Node vem do `SHASUMS256.txt` do nodejs.org;
  - o do PostgreSQL é calculado ao fixar a versão, porque a EDB não publica o hash. É como o hash do WinSW, que vem do manifesto do Scoop.
- **O script de conferência:** `apps/operacao/scripts/prerequisitos.ts --conferir` baixa os dois e confere os hashes. Ele roda quando a versão fixada muda.
- **Na montagem:** o `empacotar.ts` copia o arquivo para o pacote. Um teste confere a forma do arquivo: a versão maior 24 e 18 e o hash com 64 caracteres hexadecimais.

**Por quê:** a mesma versão em todo servidor, nada rodando sem conferência, e o servidor sem internet servido pelos arquivos na pasta do zip.

### 5. O menu no comando: tarefas que montam a linha de comando

**Escolha:** `grafite menu`, em `apps/operacao/src/windows/menu.ts`.
- **Só no Windows:** as tarefas usam o que só o servidor Windows tem, como o zip na pasta de Downloads e o Explorer. No servidor Linux, a ajuda não mostra o `menu`, e `sudo grafite menu` diz que o menu é do servidor Windows e que lá a operação é pelos comandos do `sudo grafite --ajuda`.
- **As tarefas** são uma lista declarativa. Cada uma tem o rótulo, as perguntas (com o padrão, a obrigatoriedade e as opções) e uma função que monta os argumentos do comando a partir das respostas. Por exemplo:
  - **Criar conta:** `conta criar --ambiente producao --endereco <padrão> --pessoa ... --usuario ... [--email ...] [--administrador]`;
  - **Atualizar:** `atualizar <zip> --ambiente teste|producao`. O padrão do zip é o `grafite-*-windows-x64.zip` mais novo da pasta de Downloads de quem roda e de `C:\Temp`.
- **A execução:** o menu chama `executarComando(argumentos, ambiente)` com o mesmo ambiente, então as confirmações digitadas e as mensagens são as do comando. O resultado (o código e o erro) aparece, e a lista volta.
- **"Abrir os logs":** roda `explorer.exe <raiz>\producao\logs`.
- **"0" sai do menu.** O fim da lista diz o que fica só no comando: a restauração, a volta e a troca da chave do cofre.
- **Os padrões vêm do `operacao.json`:** o endereço da organização que opera o servidor e os ambientes. Sem instalação, o menu diz que o Grafite não está instalado neste servidor e sai.

**Por quê:** cada tarefa é uma função pura das respostas para os argumentos, testável sem o Windows, e o menu nunca tem um caminho diferente do comando.

**Alternativa:** chamar as funções de cada comando direto. Seriam dois caminhos para manter iguais.

### 6. O atalho do menu: `Grafite.cmd` e o `.lnk` público

**Escolha:**
- **`<raiz>\Grafite.cmd`:**
  - se eleva como o atalho de instalação;
  - roda `powershell -NoProfile -ExecutionPolicy Bypass -File "<raiz>\grafite.ps1" menu`;
  - segura a janela no fim.
- **`<raiz>\grafite.ico`:** copiado da marca (o mesmo do favicon).
- **O atalho:** `C:\Users\Public\Desktop\Grafite.lnk` aponta para o `Grafite.cmd`, com o ícone. É criado pelo `WScript.Shell` (`CreateShortcut`), numa peça `Atalhos` atrás de interface.
- **Na instalação:** o passo vem depois dos serviços.
- **Na atualização da produção:**
  - o `Grafite.cmd` e o ícone são trocados pelos da versão nova;
  - o `.lnk` só é criado quando falta, para não desfazer o que quem opera mudou nele;
  - a atualização é a mesma nos dois servidores, então o passo vai pela peça da plataforma: a do Windows faz os três, e a do Linux não tem atalho a criar.

**Por quê:** a área de trabalho pública aparece para todos os administradores do servidor, e o `.cmd` resolve a elevação sem mexer no binário do `.lnk`.

### 7. O pacote, a release e a verificação

**Escolha:**
- **O pacote:** o `empacotar.ts` leva o `Instalar-Grafite.cmd`, o `preparar-servidor.ps1`, o `Grafite.cmd`, o `grafite.ico` e o `prerequisitos.json`.
  - **Os `.cmd` com CRLF:** o `cmd.exe` se perde num `.cmd` só com LF, que ele relê do ponto errado depois de rodar um programa. No repositório, eles ficam com LF, como todo texto (spec plataforma-base), e o `empacotar.ts` os grava com CRLF no pacote e ao lado do zip.
- **A release:** o `empacotar.ts` põe uma cópia do `Instalar-Grafite.cmd` em `pacote/`, ao lado do zip. A release publica os três arquivos, ao lado do pacote para Linux e do `.sha256` dele.
- **Os pacotes entre os jobs:** passam pela pasta do executor, como desde a change servidor-linux-com-docker, sem artefato do Actions. Assim, nada fica guardado na cota de armazenamento, que estourou em 21/10 com os pacotes dos PRs e barrou a primeira tentativa da release da v0.1.0.
  - **Saem só quando o job passa:** cada instalação de teste apaga os seus pacotes, e a release, a pasta da execução, só quando o job passa. Na falha, eles ficam para a nova tentativa só dos jobs que falharam, que o GitHub roda sem montar os pacotes de novo. No PR #72, a limpeza da falha os apagou, e as duas instalações da nova tentativa pararam sem eles. A montagem seguinte apaga os de mais de um dia.
  - **Conferidos antes de tudo:** cada instalação de teste confere, no primeiro passo, que os pacotes da execução estão na pasta. Sem eles, para na hora e diz para rodar a execução inteira de novo, antes de mexer no PostgreSQL do executor.
- **A verificação no executor `instalacao`:**
  - entra pelo `Instalar-Grafite.cmd --respostas respostas.json`, com o Node e o PostgreSQL já presentes;
  - confere que o atalho do menu foi criado;
  - roda uma tarefa do menu pelo roteiro (o estado dos serviços), com as respostas pela entrada padrão;
  - no fim, apaga o `.lnk`, junto com o resto da instalação de teste.
- **O caminho do zero** (sem Node, sem PostgreSQL, com o IIS) não roda no executor, que é uma estação de trabalho. Ele é verificado à mão numa máquina virtual limpa do Windows Server 2019, antes da tag.
- **As versões do Windows Server: 2019, 2022 e 2025.**
  - Nada no atalho nem no comando depende da versão: nenhum dos dois a confere, e o `preparar-servidor.ps1` já força o TLS 1.2 para baixar o Node.
  - A EDB só testa o PostgreSQL 18 no 2022 e no 2025, e o CI roda num Windows 11. O 2019 entra pela verificação do caminho do zero, feita nele, e o runbook avisa que a EDB não o testa.
  - Se o PostgreSQL ou o Node falharem no 2019, ele fica fora da lista, e o runbook continua pedindo o 2022 ou o 2025.
  - A produção roda o Windows Server 2019, que tem atualizações de segurança até janeiro de 2029.

## Risks / Trade-offs

- **[Risco] A EDB republica o instalador com o mesmo nome e outro conteúdo, ou tira a URL do ar.** → O hash não confere, e o atalho para sem instalar. A saída é pôr o instalador certo na pasta do zip ou subir a versão fixada pelo script de conferência.
- **[Risco] O arquivo de opções com a senha fica no disco se o processo morrer no meio.** → Fica numa pasta com a ACL só dos administradores, e a execução seguinte a apaga antes de tudo.
- **[Risco] Os arquivos baixados da internet vêm marcados (Mark of the Web), e o Windows pergunta antes de rodar o `.cmd`.** → O runbook diz para desbloquear o arquivo nas propriedades. O PowerShell roda com `-ExecutionPolicy Bypass`, como hoje.
- **[Risco] O caminho do zero não é testado no CI.** → Ele é verificado à mão numa máquina virtual limpa antes da tag. O PowerShell só decide o Node, e o resto tem teste.
- **[Risco] A EDB não testa o PostgreSQL 18 no Windows Server 2019, e uma atualização dele ou do Windows o quebra.** → A saúde dos serviços e o teste de restauração semanal mostram a falha. A saída é o 2022 ou o 2025, ou o servidor Linux.
- **[Risco] Os dados do PostgreSQL ficam fora de `C:\Program Files`, e o antivírus ou uma política do domínio tira a permissão da conta do serviço na pasta nova.** → O instalador da EDB dá a permissão na criação, e a instalação do Grafite já confere a saúde do PostgreSQL antes de seguir. O runbook diz para tirar da verificação em tempo real a pasta dos dados escolhida, e não só a padrão.
- **[Trade-off] O menu no terminal não é uma janela gráfica.** → Ele roda os comandos testados e fica no mesmo console das confirmações digitadas. Uma janela pode vir depois, por cima das mesmas tarefas.

## Migration Plan

1. **A v0.1.0 sai antes,** da `main` de 26/10, com a instalação de hoje e o pacote para Linux.
2. **Num servidor na v0.1.0,** a v0.1.1 entra pela atualização de sempre: primeiro o teste, depois a produção. A atualização da produção cria o `Grafite.cmd` e o atalho "Grafite".
3. **Servidor novo:** entra direto pelo `Instalar-Grafite.cmd`.
4. **A volta para a v0.1.0** deixa o atalho na área de trabalho, e o `grafite.ps1` da v0.1.0 não tem o `menu`. O atalho então mostra "Comando desconhecido: menu" e a ajuda, sem mudar nada. O runbook diz para apagar o atalho nesse caso.

## Open Questions

- Quais versões fixar do Node 24 e do PostgreSQL 18: as mais novas no dia da implementação. Isso não muda a spec nem as tarefas.
