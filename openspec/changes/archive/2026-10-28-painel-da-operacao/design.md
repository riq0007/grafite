## Context

A motivação está em `proposal.md` (Why), e os requisitos, nas specs desta change.

Como está hoje:
- **O comando de operação** é TypeScript, em `apps/operacao/src`. O `executarComando` recebe o ambiente com as peças de cada plataforma: o console, os serviços, a saúde, o backup e a plataforma.
- **O console** (`Console`) pergunta, pergunta sem eco, confirma o texto digitado e escreve. O menu (`src/windows/menu.ts`) declara cada tarefa como uma lista de perguntas mais os argumentos que ela monta, e roda o `executarComando` com o mesmo ambiente.
- **O `servicos estado`** escreve uma linha de texto por serviço, a partir de uma lista fixa (`SERVICOS`) e do `Servicos.estado` da plataforma. A peça `Servicos` já sabe iniciar e parar.
- **O estado da instalação** fica no `operacao.json`, com os endereços, a porta, a versão atual e a anterior de cada ambiente, o mapa do teste e o certificado. A configuração de cada ambiente fica no `config.env` dele, com as variáveis do backup e do e-mail.
- **A organização** é achada pelo endereço de acesso, que fica no banco (spec isolamento-organizacoes).
- **Os lançadores:**
  - no Windows, o `Grafite.cmd` se eleva e roda o `grafite.ps1 menu`;
  - no Linux, o `grafite` roda o comando num contêiner da imagem `grafite/operacao` da versão, com as pastas montadas e sem porta publicada.
- **A web** (`apps/web`) é React com Vite, o `@grafite/ui` e o TanStack Query.
- **O "Menu da operação"** entra na spec com a instalador-e-menu-da-operacao, ainda aberta quando esta change foi escrita. Esta change o modifica, então ela é arquivada depois daquela.

## Goals / Non-Goals

**Goals:**
- **Um caminho só:** o painel roda o mesmo `executarComando`, com um console do painel. Nenhuma regra da operação é escrita de novo na página.
- **Seguro por padrão:** o painel atende só em 127.0.0.1 e só abre com o código de uso único. Ele confere o `Host` e a origem, roda uma tarefa por vez e encerra sozinho.
- **Testável:** o servidor e as tarefas são testados com as peças simuladas, e a página, contra um servidor simulado.

**Non-Goals:**
- O acesso pela rede, que precisaria de login próprio e fica para depois.
- Mudar o que cada comando faz, além das confirmações novas da volta e da troca da chave e dos comandos novos.
- Gráficos de histórico, como o uso de processador e de memória.

## Decisions

1. **O servidor do painel é o próprio comando de operação.**
   - O `grafite painel` sobe um servidor `node:http` em 127.0.0.1, numa porta livre, e o encerra no fim.
   - Ele serve os arquivos compilados da página, por uma lista fechada; uma API JSON; e um canal de eventos (SSE) para o andamento.
   - Alternativa: um serviço do Windows sempre ligado. Descartada, porque ficaria rodando com a elevação o tempo todo. O painel só existe enquanto alguém o usa.
   - Alternativa: o painel dentro do app. Descartada, porque o painel precisa funcionar com o app parado e mexer nos serviços como administrador.
2. **O código de uso único vira uma sessão.**
   - O comando gera um código aleatório de 32 bytes e abre `http://127.0.0.1:<porta>/#<código>`. O fragmento não vai para o servidor nem para os logs.
   - A página troca o código por um cookie `HttpOnly`, com `SameSite=Strict`, e tira o fragmento do endereço. O código vale uma vez só.
   - Cada pedido precisa do cookie, e o servidor confere que o `Host` e a origem são `127.0.0.1:<porta>`. Isso barra o DNS rebinding e o pedido feito por outro site.
3. **O console do painel.** Ele implementa o `Console`:
   - o `escrever` vira um evento de andamento;
   - o `perguntar`, o `perguntarSegredo` e o `confirmarDigitado` viram um evento de pergunta. A página mostra o diálogo e responde por um `POST`, e o comando espera a resposta;
   - cancelar responde como o Ctrl+C: "Cancelado.";
   - o segredo não volta em evento nem vai para o log.
4. **As tarefas são declaradas, como as do menu.**
   - Uma lista liga os campos de cada formulário aos argumentos do `executarComando`. Onde as tarefas coincidem, ela reaproveita as funções do menu que montam os argumentos.
   - Uma trava deixa rodar uma tarefa por vez. A leitura do estado não passa pela trava.
5. **O estado do servidor em dados.** O `estadoDoServidor()` junta:
   - **os serviços:** saem de uma declaração única, o `servicosDaInstalacao()`, que o `servicos estado` também passa a usar. Um serviço novo entra ali e aparece nos dois;
   - **as versões:** saem do `operacao.json`;
   - **o último backup:** sai do `manifesto.json` mais novo de cada destino;
   - **o último teste de restauração:** sai do banco da produção, quando ele está no ar. Senão, aparece "sem informação";
   - **o certificado:** a data de vencimento é lida no aperto de mão TLS em 127.0.0.1:443, com o nome do primeiro endereço da produção, como a saúde já faz;
   - **o disco:** o espaço livre sai do `fs.statfs` da raiz da instalação.
6. **A página fica num app novo, o `apps/painel`.**
   - É React com Vite, o `@grafite/ui` e o TanStack Query, compilado em arquivos estáticos.
   - O zip do Windows leva a página em `painel/`, e a imagem do comando no Linux também a leva.
   - O visual usa os tokens e os componentes do Grafite, numa página só, sem a casca. Segue o ANTISLOP: o estado é sempre escrito, e a animação só marca uma mudança de estado.
   - Um componente que serve a outros apps vai para o `packages/ui`, com a história dele.
7. **Abrir o navegador.**
   - **No Windows:** o processo elevado chama `explorer.exe "<endereço>"`. O Explorer entrega o endereço à sessão de quem está logado, e o navegador não abre elevado.
   - **No Linux:** o lançador escolhe a porta e publica `--publish 127.0.0.1:<porta>:<porta>`. Depois que o contêiner diz o endereço, ele roda `xdg-open` como o `SUDO_USER`, na sessão gráfica dele. Sem uma sessão gráfica, ele para antes de subir o contêiner.
   - **Nos testes e no CI:** o `--sem-navegador` só escreve o endereço.
8. **Os comandos novos vêm antes do painel, com teste antes do código.**
   - `servicos parar` e `servicos iniciar`, `backup configurar`, `certificado configurar` e `enderecos acrescentar` e `enderecos tirar`.
   - O `enderecos` muda os endereços de acesso da organização pelo comando da API da versão de cada ambiente, como o `organizacao` e o `conta` já fazem. O comando de operação não escreve no banco direto.
   - As confirmações digitadas na volta da produção e na troca da chave do cofre.
   - Os roteiros do CI que chamam a volta da produção e a troca da chave ganham o `--confirmar`.
9. **Os logs vêm pela peça da plataforma.**
   - No Windows, são os arquivos do WinSW na pasta `logs` de cada ambiente: as últimas linhas e a busca por um texto.
   - No Linux, é o `docker logs --tail` do contêiner do serviço.
10. **Os testes:**
    - **unitários:** o servidor (o código, o `Host`, a origem, a trava e os eventos), o console do painel, os argumentos de cada tarefa e o estado, com as peças simuladas;
    - **a página:**
      - as histórias dos componentes novos;
      - os testes de ponta a ponta com o Playwright, contra o servidor simulado. Esse servidor também deixa ver a página em localhost durante o desenvolvimento;
    - **o CI:** a instalação de teste no Windows e no Linux sobe o `painel --sem-navegador`, abre a sessão com o código e confere o `/api/estado`.

## Risks / Trade-offs

- **[Risco] O Windows Server 2019 vem com o Internet Explorer 11, sem o Edge, e a página não roda nele.**
  - O runbook manda instalar o Microsoft Edge no 2019. O 2022 e o 2025 já o trazem.
  - O comando diz no terminal o endereço do painel, para colar noutro navegador do servidor.
- **[Risco] Outro programa do próprio servidor tenta usar o painel.**
  - Ele só entra com a sessão do código de uso único, que vai só para o navegador aberto pelo comando. O `Host` e a origem são conferidos, e o painel encerra depois de 30 minutos sem uso.
  - Um programa que já roda como administrador no servidor roda os comandos de qualquer jeito.
- **[Risco] O servidor do painel roda elevado, então um defeito nele é um defeito de administrador.**
  - Ele é mínimo: só os arquivos compilados, pela lista, o corpo dos pedidos limitado e nenhum caminho de arquivo vindo da página.
  - Cada recusa tem um teste.
- **[Risco] Quem fecha a janela do comando no meio de uma atualização a interrompe.**
  - Com uma tarefa rodando, a página avisa antes de fechar, e a janela do comando diz para não fechá-la.
  - Uma atualização interrompida segue o "Atualização que falhou" do runbook, como pelo comando.
- **[Trade-off] Uma página no navegador, e não uma janela própria.** Ela precisa de um navegador moderno no servidor. Em troca, tem o mesmo visual do Grafite e os mesmos testes da web.

## Migration Plan

- Sai numa versão depois da v0.1.1.
- A atualização da produção troca o `Grafite.cmd` pelo da versão nova, como a instalador-e-menu-da-operacao já faz, e o atalho passa a abrir o painel.
- A volta à versão anterior devolve o `Grafite.cmd` do menu.
- Esta change é arquivada depois da instalador-e-menu-da-operacao, porque modifica o "Menu da operação" que aquela acrescenta.
