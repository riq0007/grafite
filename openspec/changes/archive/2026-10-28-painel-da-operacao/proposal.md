## Why

Hoje o servidor é operado pelo menu do terminal, que o atalho "Grafite" abre, ou pelos comandos do `grafite.ps1` e do `grafite`. O menu numera as tarefas, mas:
- não mostra o estado do servidor de uma vez;
- não acompanha uma atualização com clareza;
- não cobre as configurações nem as operações sensíveis.

O usuário opera o servidor sozinho. Em 27/10, ele pediu um painel para ligar, desligar, atualizar e configurar o Grafite sem decorar comandos.

Esta change continua o F2d · Operação da spec mestre: a seção 3.1, a operação na seção 4.3 e o pacote da versão na 12.2. Ela vem depois da v0.1.1.

Ficam fora desta change:
- **Outro computador:** abrir o painel de outro computador fica para depois. Por enquanto, ele abre só no próprio servidor.
- **Programa próprio:** nada de `.exe` nem de janela nativa. O painel é uma página no navegador do servidor.
- **Chat e chamados:** o chat no estilo do Teams e o painel de chamados são módulos futuros do próprio app.
- **Servidor sem interface gráfica:** no Windows sem a Experiência Desktop e no Linux sem desktop, continuam o menu e os comandos.

## What Changes

- **O painel da operação:** uma página local, servida pelo próprio comando de operação (`grafite painel`).
  - Ele atende só em 127.0.0.1 e só abre com o código de uso único que o comando gera ao abrir o navegador.
  - Funciona com o Grafite parado, porque não faz parte do app.
  - No Windows, o atalho "Grafite" da área de trabalho passa a abrir o painel, com a elevação. O menu continua pelo comando `grafite.ps1 menu`.
  - No Linux com interface, o `sudo grafite painel` abre o painel no navegador de quem chamou o comando.
- **A tela principal:**
  - cada serviço, com o estado escrito por extenso e os botões de ligar, desligar e reiniciar. A lista vem da instalação, então um serviço novo aparece sem mudar o painel;
  - a versão em uso e a anterior de cada ambiente;
  - o último backup, o último teste de restauração e a validade do certificado;
  - o espaço livre no disco da instalação;
  - uma faixa de avisos: certificado perto de vencer, backup que falhou ou atrasou, disco quase cheio e serviço parado.
- **As tarefas, com o andamento de cada uma ao vivo:**
  - a atualização: você escolhe o pacote, ele passa pelo teste e depois pela produção;
  - o backup agora, a lista dos backups e o teste de restauração;
  - a preparação do teste;
  - os logs de cada serviço.
- **As operações sensíveis:** a restauração de um backup, a volta à versão anterior e a troca da chave do cofre. Cada uma pede o nome do banco digitado, como o comando pede.
- **As configurações:**
  - o e-mail, com o envio de teste;
  - o backup: os destinos, a janela de horário, a retenção e o dia do teste;
  - o certificado: o modo e o token;
  - os endereços da produção e do teste;
  - as contas e os acessos: criar uma conta e redefinir um acesso.
- **Os mesmos comandos:** cada ação do painel roda o comando de operação, com as mesmas conferências e confirmações, e mostra a mensagem dele no fim. Os comandos novos que o painel usa também ficam na linha de comando:
  - `servicos parar` e `servicos iniciar`;
  - `backup configurar`;
  - `certificado configurar`;
  - `enderecos acrescentar` e `enderecos tirar`.

## Capabilities

### New Capabilities
- `painel-da-operacao`: o painel local que mostra o estado do servidor e roda as tarefas da operação pelos mesmos comandos da linha de comando.

### Modified Capabilities
- `operacao-servicos`:
  - um requisito novo trata dos comandos para ligar e desligar os serviços e para configurar o backup, o certificado e os endereços;
  - no "Menu da operação", que vem da instalador-e-menu-da-operacao, o atalho "Grafite" passa a abrir o painel, e o menu fica pelo comando.
- `operacao-em-linux`: o "Comando de operação no Linux" ganha o `painel` e os comandos novos.

## Impact

- **Código:**
  - `apps/operacao/src`:
    - o comando `painel`: o servidor local, o código de uso único, o console do painel e o estado do servidor em dados;
    - os comandos novos;
    - as peças de cada plataforma: abrir o navegador, o espaço em disco e os logs.
  - `apps/api`: o comando da API que acrescenta e tira os endereços de acesso da organização, chamado pelo `enderecos`, como o `organizacao` e o `conta` já são.
  - `apps/painel`: a página, em React com o `@grafite/ui`, compilada e levada no pacote.
  - `apps/operacao/lancadores`:
    - o `Grafite.cmd` passa a abrir o painel;
    - o `grafite` do Linux publica a porta do painel só em 127.0.0.1 e abre o navegador de quem chamou o `sudo`.
- **Pacotes:** o zip do Windows e a imagem do comando no Linux levam o painel compilado.
- **CI:**
  - a instalação de teste no Windows e no Linux abre o painel e confere o estado pela API dele;
  - os testes de ponta a ponta do painel rodam contra um servidor simulado.
- **Documentação:**
  - o runbook, com o painel no Windows e no Linux;
  - a spec mestre, nas seções 3.1, 4.3 e 12.2;
  - o `CLAUDE.md`;
  - o `docs/mapa.md`.
- **Versão:** sai numa versão depois da v0.1.1. As dependências da página são as que o `apps/web` já usa.
