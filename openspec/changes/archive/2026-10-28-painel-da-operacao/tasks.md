## 1. Os comandos novos

- [x] 1.1 Escrever primeiro os testes e depois o `servicos parar` e o `servicos iniciar` (design, decisão 8): por ambiente, a produção com o coletor, a confirmação digitada ao parar a produção e a saúde conferida ao iniciar, no Windows e no Linux. Verificar: os testes passam com o cenário "Produção desligada pelo comando" e com a confirmação que não confere.
- [x] 1.2 Escrever primeiro os testes e depois a confirmação digitada da volta da produção e da troca da chave do cofre, com o `--confirmar` no roteiro automático. Levar o `--confirmar` aos passos do `versao.yml` que voltam a produção ou trocam a chave. Verificar: os testes passam com "Volta da produção sem a confirmação" e "Troca sem a confirmação", e os de antes continuam passando.
- [x] 1.3 Escrever primeiro os testes e depois o `backup configurar` (destinos, janela, retenção e frequência do teste): a conferência de cada destino antes de gravar, a gravação no `config.env` da produção, o reinício e a saúde. Verificar: os testes passam com "Destino do backup que não grava" e com um valor fora do formato.
- [x] 1.4 Escrever primeiro os testes e depois o `certificado configurar`:
  - o modo interno, com a AC do proxy ou com os arquivos da empresa;
  - o modo público, com o token pedido sem eco e gravado só no `caddy\config.env`;
  - a configuração do proxy gerada de novo, o reinício e a saúde pelo HTTPS.

  Verificar: os testes passam com "Certificado público pelo comando", e o token não aparece em nenhuma saída simulada.
- [x] 1.5 Escrever primeiro os testes e depois o `enderecos acrescentar` e o `enderecos tirar`:
  - o endereço do teste perguntado, com o padrão proposto;
  - o `operacao.json` e o mapa do teste;
  - os endereços de acesso da organização que opera o servidor, nos dois bancos, por um comando novo da API, com o teste de integração dele;
  - o proxy gerado de novo e a saúde;
  - o aviso do DNS;
  - a recusa de tirar o último endereço.

  Verificar: os testes passam com "Endereço acrescentado" e "Último endereço".
- [x] 1.6 Levar os comandos novos à ajuda dos dois servidores e ao lançador do Linux. Verificar: os testes do comando no Linux e o do runbook passam com os comandos novos na ajuda.

## 2. O estado do servidor em dados

- [x] 2.1 Escrever primeiro os testes e depois o `servicosDaInstalacao()`, a declaração única dos serviços, que o `servicos estado` passa a usar (decisão 5). Verificar: o `servicos estado` escreve as mesmas linhas de antes, e um serviço acrescentado à declaração aparece nele.
- [x] 2.2 Escrever primeiro os testes e depois o `estadoDoServidor()`, com as peças simuladas. Ele junta:
  - os serviços e as versões;
  - o último backup de cada destino;
  - o último teste de restauração, ou "sem informação" com o banco parado;
  - o vencimento do certificado pelo aperto de mão TLS;
  - o espaço livre no disco;
  - os avisos.

  Verificar: os testes passam com os cenários "Serviço parado", "Certificado perto de vencer" e "Serviço novo na instalação".
- [x] 2.3 Escrever primeiro os testes e depois os logs pela peça da plataforma (decisão 9): as últimas linhas e a busca, dos arquivos do WinSW no Windows e do `docker logs --tail` no Linux. Verificar: os testes passam nos dois, com os arquivos e o Docker simulados.

## 3. O servidor do painel

- [x] 3.1 Escrever primeiro os testes e depois o servidor mínimo (decisão 1):
  - o `node:http` em 127.0.0.1;
  - os arquivos da página por uma lista fechada;
  - o corpo dos pedidos limitado;
  - a recusa do `Host` e da origem que não são os do painel.

  Verificar: os testes passam com um caminho fora da lista, um `Host` de outro nome e uma origem de outro site.
- [x] 3.2 Escrever primeiro os testes e depois o código de uso único e a sessão (decisão 2): a troca do código pelo cookie, uma vez só, e a recusa de cada pedido sem a sessão. Verificar: os testes passam com o cenário "Pedido sem o código" e com o código usado duas vezes.
- [x] 3.3 Escrever primeiro os testes e depois o console do painel (decisão 3):
  - o andamento pelos eventos;
  - as perguntas e as respostas;
  - o segredo fora dos eventos e do log;
  - o cancelamento.

  Verificar: os testes passam com uma confirmação digitada que confere, uma que não confere e uma senha, que não aparece nos eventos.
- [x] 3.4 Escrever primeiro os testes e depois as tarefas declaradas e a trava (decisão 4), reaproveitando as funções do menu que montam os argumentos. Verificar: os testes passam com os argumentos de cada tarefa e com o cenário "Duas tarefas ao mesmo tempo".
- [x] 3.5 Escrever primeiro os testes e depois o comando `painel` (decisão 7):
  - a porta livre;
  - o navegador aberto pela plataforma, ou o `--sem-navegador`;
  - o fim depois de 30 minutos sem uso;
  - o aviso de não fechar a janela com uma tarefa rodando.

  Verificar: os testes passam com o navegador simulado, e o `grafite painel --sem-navegador` na máquina de desenvolvimento escreve o endereço e responde ao `/api/estado` com a sessão.

## 4. A página

- [x] 4.1 Criar o `apps/painel` (decisão 6), com o React, o Vite, o `@grafite/ui` e o TanStack Query, e o servidor simulado para o desenvolvimento e os testes. Verificar: `pnpm --filter @grafite/painel dev` abre a página em localhost com o estado simulado, e o `pnpm typecheck` passa.
- [x] 4.2 Escrever primeiro os testes e depois a tela principal: os serviços com o estado escrito e os botões, as versões, o backup, o certificado, o disco e a faixa de avisos, lidos de novo a cada 30 segundos. Verificar: os testes passam com "Serviço parado", "Certificado perto de vencer" e "Grafite parado", e o verificador de cores literais passa.
- [x] 4.3 Escrever primeiro os testes e depois o andamento das tarefas e os diálogos das perguntas, da confirmação digitada e da senha, com o aviso antes de fechar a página no meio de uma tarefa. Verificar: os testes passam com "Tarefa que falha" e "Desligar a produção".
- [x] 4.4 Escrever primeiro os testes e depois a atualização: o pacote das pastas de Downloads e de `C:\Temp` ou digitado, o teste antes da produção e o resultado com o backup de antes. Verificar: os testes passam com "Atualização pelo painel".
- [x] 4.5 Escrever primeiro os testes e depois os backups (agora, a lista e o teste), a preparação do teste e os logs, com a busca. Verificar: os testes passam com cada tarefa contra o servidor simulado.
- [x] 4.6 Escrever primeiro os testes e depois as operações sensíveis: a restauração por um backup da lista, a volta e a troca da chave, cada uma explicando o que faz e pedindo o nome do banco. Verificar: os testes passam com "Restauração pelo painel" e "Confirmação que não confere".
- [x] 4.7 Escrever primeiro os testes e depois as configurações:
  - o e-mail, com o teste;
  - o backup;
  - o certificado;
  - os endereços;
  - as contas e os acessos.

  Os segredos ficam fora da página. Verificar: os testes passam com "Destino do backup acrescentado", "Senha do e-mail fora da página" e "Conta criada pelo painel".
- [x] 4.8 Escrever os testes de ponta a ponta com o Playwright, contra o servidor simulado, e levar as histórias dos componentes novos do `packages/ui` à regressão visual. Verificar: `pnpm test:e2e` e `pnpm test:stories` passam, e o `pnpm test:visual` passa com as capturas novas.

## 5. Lançadores, pacote e CI

- [x] 5.1 Mudar o `Grafite.cmd` para abrir o painel, com o menu pelo `grafite.ps1 menu`, e o fim da lista do menu para dizer que a restauração, a volta e a troca da chave estão no painel e no comando. Verificar: os testes do menu passam com "Restauração fora do menu" e "Menu pelo comando", e, num Windows elevado, o `Grafite.cmd` abre o painel no navegador.
- [x] 5.2 Mudar o lançador do Linux para o `painel`:
  - a porta escolhida e publicada só em 127.0.0.1;
  - o `xdg-open` como o `SUDO_USER`;
  - a recusa sem sessão gráfica, antes de subir o contêiner.

  Verificar: os testes do `lancadores.test.ts` passam com "Painel no Linux com interface" e "Painel sem interface gráfica".
- [x] 5.3 Levar o painel compilado ao zip do Windows e à imagem do comando no Linux. Verificar: os testes do pacote passam com o `painel/` no zip, e a imagem do comando tem a página.
- [x] 5.4 Mudar o `versao.yml`: a instalação de teste no Windows e no Linux sobe o `painel --sem-navegador`, abre a sessão com o código e confere o `/api/estado`. Verificar: o job do `versao.yml` no PR passa nos dois.

## 6. Fechamento

- [x] 6.1 Atualizar a documentação:
  - o runbook: o painel no Windows e no Linux, o Edge no Windows Server 2019, o menu pelo comando, os comandos novos e as confirmações novas;
  - a spec mestre, nas seções 3.1, 4.3 e 12.2;
  - o `CLAUDE.md`: o `painel`, os comandos novos e o `apps/painel`;
  - o `docs/mapa.md`: a change.

  Verificar: `pnpm test` passa, com os testes do mapa e do runbook.
- [x] 6.2 Conferir as verificações: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:stories` e `pnpm test:e2e` verdes, e `openspec validate painel-da-operacao --strict` sem erros. Verificar: os comandos passam, e o CI do PR, com o job do `versao.yml`, fica verde.

  Feito em 28/10: os comandos passaram aqui, e o `pnpm test:visual` também, com 635 capturas. O CI do PR #74 ficou de fora, como o /goal de 28/10 pede.
- [ ] 6.3 Verificar à mão, no servidor de teste com o Windows Server 2019 e o Edge:
  - o painel abre pelo atalho;
  - o teste liga e desliga;
  - o teste se atualiza pelo painel;
  - o e-mail se configura e manda o teste.

  Verificar: anotar o resultado e as telas no PR que arquiva a change.

  Pendente no arquivamento de 28/10: a VM do usuário confere com o zip da v0.1.2 (o roteiro está no PR #74). Uma falha vira uma change de conserto.
