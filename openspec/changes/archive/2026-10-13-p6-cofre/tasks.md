## 1. Spec mestre e domínio

- [x] 1.1 Atualizar a spec mestre: na seção 9.2, a confirmação pelo código do app que libera revelar e copiar por 5 minutos na sessão, e o acesso por segredo, a conta, o grupo ou o perfil.

  Verificar: o teste do mapa passa, com as seções citadas ainda com título.
- [x] 1.2 Domínio, o segredo, com o teste antes:
  - os tipos e as classificações, com os rótulos em pt-BR e os códigos do PMG ao lado, para o P8;
  - a conferência dos campos: o nome, o identificador, o endereço, as notas e o valor, com os limites e as recusas da spec;
  - a validade e a rotação: "Vencido" e "Rotação atrasada" pela data de hoje no fuso.

  Verificar: os testes do domínio passam, com os cenários da spec.
- [x] 1.3 Domínio, o acesso e o resto, com o teste antes:
  - `alcancaOSegredo`, pela conta, pelos grupos e pelos perfis da conta;
  - as permissões `cofre.usar` e `cofre.administrar`, esta incluindo aquela;
  - o evento `cofre.mudou`, com o público, e as ações do cofre na auditoria;
  - o Cofre nos módulos opcionais;
  - a duração da liberação, 5 minutos.

  Verificar: os testes do domínio passam, com o catálogo de permissões conferido.

## 2. Banco

- [x] 2.1 A migration 0025, com o teste de integração antes:
  - `segredos`, `acessos_aos_segredos`, com um titular só por linha, e `segredos_dos_ativos`, com o isolamento e as chaves compostas com o `org_id`;
  - `cofre_liberado_ate` na sessão;
  - as exportações.

  Verificar: `pnpm --filter @grafite/db test:integration` passa, com o teste-guarda do isolamento.

## 3. API

Cada tarefa entra com os esquemas das rotas dela e o cliente gerado de novo (`pnpm contrato:gerar`).

- [x] 3.1 A cifra em duas camadas e a configuração, com o teste antes:
  - cifrar e decifrar o conteúdo e a chave do segredo, com os dados associados, e a recusa do valor copiado para outro segredo;
  - a impressão da chave mestra;
  - `GRAFITE_CHAVE_DO_COFRE` obrigatória e a anterior opcional, validadas na partida, com as recusas da spec, sem mostrar a chave.

  Verificar: os testes unitários da cifra e da configuração passam.
- [x] 3.2 A lista, a ficha e o cadastro dos segredos, com o teste de integração antes:
  - `GET /cofre/segredos`, com o alcance, a busca e os filtros;
  - `GET /cofre/segredos/:id`, sem o valor;
  - `POST` e `PATCH`, com a troca do valor, o acesso de quem cadastra, os vínculos com a pessoa e os ativos ativos e as recusas;
  - a recusa sem os dois passos e com o módulo desligado;
  - a auditoria e o evento `cofre.mudou`.

  Verificar: os testes de integração passam, com os cenários do segredo, do acesso e da verificação.
- [x] 3.3 O acesso, os titulares e a situação, com o teste de integração antes:
  - `PUT /cofre/segredos/:id/acesso`, com o "antes → depois" na auditoria;
  - `GET /cofre/titulares` e `GET /cofre/pessoas`, só os ativos e só os nomes;
  - a inativação e a reativação.

  Verificar: os testes de integração passam, com o acesso por grupo, por perfil em qualquer escopo e o acesso tirado.
- [x] 3.4 A liberação e o revelar e copiar, com o teste de integração antes:
  - `POST /cofre/liberacao` com o código do app, a recusa do código usado, do errado e do de recuperação, e o limite de requisições;
  - `GET /cofre/liberacao`;
  - a revelação e a cópia, com o cofre liberado, o segredo ativo e o alcance, sem cache, e a recusa gravada na auditoria;
  - o fim da liberação ao desativar, remover ou cadastrar de novo os dois passos;
  - o segredo cuja chave não abre.

  Verificar: os testes de integração passam, com os cenários da liberação e da revelação.
- [x] 3.5 Os segredos na ficha do ativo, com o teste de integração antes: só os que a conta vê no cofre, só com o módulo ligado, `cofre.usar` e os dois passos ativos, sem nenhum valor.

  Verificar: os testes de integração da ficha do ativo passam.
- [x] 3.6 O comando `cofre trocar-chave`, com o teste de integração antes:
  - as duas organizações recifradas;
  - a segunda execução sem mudança;
  - o segredo que não abre, listado e intacto;
  - a recusa sem as duas chaves;
  - a auditoria de cada organização e os valores iguais depois.

  Verificar: os testes de integração do comando passam.

## 4. Web

- [x] 4.1 O módulo Cofre e a lista, com o teste antes:
  - o registro, o dock, as permissões, o módulo opcional e a tela sem permissão;
  - a frase da conta sem os dois passos;
  - a lista, com as colunas, a busca, os filtros, a validade e os vazios.

  Verificar: os testes do módulo e da lista passam.
- [x] 4.2 O cadastro e a ficha, com o teste antes:
  - o formulário, com o valor escondido;
  - "Trocar o valor", a inativação com a confirmação e a reativação;
  - o acesso, com os titulares;
  - os vínculos com a pessoa e os ativos;
  - os retornos da spec.

  Verificar: os testes da ficha passam.
- [x] 4.3 Revelar e copiar, a busca e o evento, com o teste antes:
  - o pedido do código, que continua a ação pedida;
  - "Cofre liberado até", com o fim da liberação;
  - o valor revelado por 30 segundos e o copiar sem mostrar;
  - o provedor da busca e "Novo segredo";
  - a releitura pelo `cofre.mudou`.

  Verificar: os testes passam, com o relógio falso para a liberação e os 30 segundos.
- [x] 4.4 A seção dos segredos na ficha do ativo, com o teste antes: o nome, o tipo, o identificador e o caminho até o Cofre, sem nenhum valor.

  Verificar: os testes da ficha do ativo passam.

## 5. Desenvolvimento e operação

- [x] 5.1 O `pnpm dev` e as pontas a ponta com a chave do cofre, com o teste antes:
  - a chave gerada uma vez no `.env` e nunca trocada;
  - a chave passada pelo `subir.ts` da pilha.

  Verificar: os testes do `scripts/dev.ts` passam, e o `pnpm dev` sobe a API com o cofre.
- [x] 5.2 A instalação e a atualização com a chave do cofre, com o teste antes:
  - a chave gerada na instalação, a mesma nos dois `config.env`;
  - a atualização do teste que completa a configuração dos dois ambientes uma vez só, antes de iniciar o teste.

  Verificar: os testes do comando de operação passam.
- [x] 5.3 `.\grafite.ps1 cofre trocar-chave`, com o teste antes:
  - a sequência: a chave nova e a anterior, o reinício, o comando nos dois ambientes, a retirada da anterior e o reinício;
  - a falha no meio, que deixa as duas chaves;
  - a ajuda;
  - o runbook, com a guarda e a troca da chave do cofre.

  Verificar: os testes do comando de operação e do runbook passam.

## 6. Ponta a ponta

- [x] 6.1 Estender a ponta a ponta com a API simulada. A simulação ganha o cofre. Os cenários:
  - cadastrar um segredo e dar o acesso a um grupo;
  - liberar o cofre com o código, revelar e copiar;
  - a frase da conta sem os dois passos;
  - o segredo na ficha do ativo.

  Verificar: `pnpm test:e2e` passa.
- [x] 6.2 Estender a ponta a ponta da pilha:
  - a administradora cadastra um segredo ligado à PAT-00412;
  - ela libera o cofre com o código do app, revela e copia;
  - a auditoria mostra a revelação sem o valor;
  - a ficha da PAT-00412 mostra o segredo.

  Verificar: `pnpm test:e2e:pilha` passa.

## 7. Fechamento

- [x] 7.1 Documentação:
  - os termos novos e a change no mapa (as capacidades `cofre-de-segredos` e `modulo-cofre` entram no mapa no arquivamento, junto com a sincronização das specs);
  - o contrato de módulo, com um módulo que pede a confirmação pelo código do app;
  - o CLAUDE.md, com a chave do cofre no `pnpm dev`.

  Verificar: o teste do mapa e o do contrato de módulo passam.
- [x] 7.2 Conferir:
  - verdes: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:stories`, `pnpm test:e2e`, `pnpm test:e2e:pilha` e `pnpm test:visual`;
  - em dia: `tokens:verificar`, `marca:verificar`, `contrato:verificar` e `fila:verificar`;
  - sem erros: `openspec validate p6-cofre --strict`.

  Verificar: os comandos passam, e o CI fica verde no PR para a `main`.
  - Fechado em 28/10/2026: o #27 entrou em 13/10 com os jobs reprovados sem nenhum passo, no dia em que os executores hospedados do GitHub pararam pela cobrança da conta, e não pelo código. Desde então, o CI da `main` no executor próprio passou com o Cofre dentro, como no run 40620440639 (b44878f6, 27/10), com os sete jobs verdes. O escopo do P6 na spec mestre (os segredos, o acesso por pessoa, grupo ou perfil, o revelar e o copiar com o código do app e a auditoria, e a troca da chave mestra) está todo na spec cofre-de-segredos.
