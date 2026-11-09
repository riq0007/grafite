# P1b · Cadastro de ativos — plano de implementação

**Objetivo:** a organização cadastra, edita, inativa e reativa os ativos, com os campos comuns e os do tipo, cada valor com a origem, o momento, o autor e a trava, o acesso pelo local do ativo, a lista simples e a ficha básica; e liga e desliga o módulo Ativos.

**Arquitetura:**
- **`packages/domain`:**
  - os campos comuns, os campos de um ativo, a conferência dos valores, o estado e as travas;
  - os módulos opcionais;
  - as permissões, as ações da auditoria e os eventos novos.
- **`packages/db`:** a tabela `ativos` e os módulos desligados na organização.
- **`apps/api`:** as rotas dos ativos, dos nomes das pessoas e dos módulos, e a recusa das rotas de um módulo desligado.
- **`packages/ui`:** o estado de um campo.
- **`apps/web`:** a lista, o cadastro e a ficha dos ativos, a escolha da pessoa e a do ativo, e a seção Módulos.

**Tecnologias:**
- o Node 24 com TypeScript;
- o Fastify com o Zod, o Drizzle e o PostgreSQL 18;
- o React com o React Aria e o TanStack Query;
- o Vitest, o Storybook e o Playwright.

**Spec:** `proposal.md`, `specs/` e `design.md` desta change. Cada tarefa cita a decisão do design que segue.

## Restrições globais

- **Limites:**
  - os textos dos campos comuns seguem o motor de campos: até 200 caracteres;
  - `valores` e `estado` têm até 256 KB cada;
  - a busca dos nomes das pessoas devolve até 20.
- **Chaves fixas:**
  - os campos comuns: `ativo.nome`, `ativo.patrimonio`, `ativo.serie`, `ativo.hostname`, `ativo.uso`, `ativo.local`, `ativo.responsavel`, `ativo.fornecedor`, `ativo.nota-fiscal`, `ativo.data-de-compra`, `ativo.valor-de-compra`, `ativo.garantia`, `ativo.propriedade`, `ativo.contrato`, `ativo.custo-mensal`, `ativo.centro-de-custo` e `ativo.vida-util`;
  - o modelo, no estado: `ativo.modelo`;
  - os usos: `em-uso`, `em-estoque` e `em-manutencao`; as propriedades: `proprio`, `alugado` e `comodato`;
  - as origens: `manual`, `planilha`, `coleta` e `api`;
  - o módulo opcional: `ativos`.
- **Textos da interface, exatamente:**
  - **recusas:**
    - "Já existe um ativo com este patrimônio.";
    - "Preencha este campo.";
    - "Este campo não é do tipo do ativo.";
    - "O campo <rótulo> está inativo.";
    - "O tipo <nome> está inativo.";
    - "O modelo escolhido não é do tipo do ativo.";
    - "O modelo escolhido está inativo. Escolha um modelo ativo.";
    - "O local escolhido está inativo. Escolha um local ativo.";
    - "A pessoa escolhida está inativa. Escolha uma pessoa ativa.";
    - "O ativo escolhido está inativo.";
    - "Um ativo não pode se referir a si mesmo.";
    - "Este rótulo é de um campo que todo ativo já tem.";
    - "Este rótulo é de um campo da capacidade <nome>.";
    - "O módulo Ativos está desligado nesta organização.";
  - **estados vazios:** "Nenhum ativo encontrado." e "Nenhum tipo de ativo ainda.";
  - **retornos:** "Ativo cadastrado.", "Ativo salvo.", "Ativo inativado.", "Ativo reativado.", "Módulo ligado." e "Módulo desligado.";
  - **outros:** "Ativo fora do seu acesso"; o grupo "Outros"; as origens "Manual", "Planilha", "Coleta" e "API".
- **Commits:** um por tarefa, no padrão `tipo(escopo): assunto`, com "Tarefa X.Y do p1b-cadastro-de-ativos." no corpo (regra 8). Esta sessão é a orquestradora: os pacotes compartilhados mudam aqui (regra 7).

## Foco da revisão

Situações que as specs implicam e que nenhum cenário cobre, cada uma com o teste na tarefa dona:
1. **A opção inativa guardada:** editar outro campo do ativo mantém a opção; escolhê-la de novo é recusado (tarefas 2.2 e 4.3).
2. **O valor pedido igual ao guardado:** não conta como mudança. O estado, a auditoria e o evento não mudam (tarefas 2.2 e 4.3).
3. **Vários ativos sem patrimônio:** o patrimônio vazio não conta para a unicidade (tarefa 3.1).
4. **O ativo sem local:** só quem tem a permissão na organização inteira o vê, o cadastra e o edita (tarefas 4.2 e 4.3).
5. **O campo que vira restrito:** a resposta e o evento não levam o valor a quem não pode vê-lo. A lista não acha o ativo pelo valor restrito depois da gravação seguinte (tarefas 4.2 e 4.3).
6. **Duas edições do mesmo ativo ao mesmo tempo:** a linha travada faz a segunda gravar sobre a primeira, sem perder as chaves que a primeira mudou (tarefa 4.3).
7. **O modelo de outro tipo:** recusado pela API e também pelo banco (tarefas 3.1 e 4.3).
8. **O módulo desligado com uma tela aberta:** a próxima leitura da tela é recusada, e a tela diz que o módulo está desligado, sem quebrar a casca (tarefas 4.6 e 6.6).

## 1. Spec mestre

- [x] 1.1 Atualizar a spec mestre conforme o design:
  - **seção 4.4, item 4:** o Ativos como o primeiro módulo opcional, ligado por padrão, e o efeito de desligar;
  - **seção 5.2, decisão 4:** os campos comuns com a chave fixa, em colunas ou no JSONB, e o estado de todos pela chave;
  - **seção 5.4:** a lista dos campos comuns, com a situação de uso e a propriedade como listas fixas;
  - **seção 9.3:** o escopo pelo local do ativo, os campos restritos e os nomes das pessoas para a escolha.

  Verificar: o diff da spec mestre bate com as specs e o design desta change.

## 2. Domínio

- [x] 2.1 Escrever os testes e depois os campos comuns (decisões 2 e 11):
  - `CAMPOS_DO_ATIVO`, com as chaves, os rótulos, os tipos, as configurações, os grupos e as colunas;
  - `USOS_DO_ATIVO` e `PROPRIEDADES_DO_ATIVO`, lidas e mostradas pelo motor de campos;
  - `rotuloDoAtivo`;
  - `rotuloReservado`, para os comuns e os das capacidades, sem diferenciar acento e maiúsculas.

  Verificar: os testes do `packages/domain` passam.
- [x] 2.2 Escrever os testes e depois os campos de um ativo e a conferência dos valores (decisões 3 e 4):
  - `camposDoAtivo`, com a ordem dos grupos, o grupo "Outros", os campos inativos fora e um grupo por capacidade;
  - `conferirValoresDoAtivo`:
    - a chave fora do tipo, o campo inativo, o obrigatório no cadastro e o esvaziado na edição;
    - as recusas do motor, pela chave;
    - só as chaves pedidas, sem contar o valor igual ao guardado (focos 1 e 2).

  Verificar: os testes do `packages/domain` passam.
- [x] 2.3 Escrever os testes e depois o estado e as travas (decisão 5): `registrarGravacao`, `aplicarTravas` e `podeGravar`, com a trava mantida pela gravação manual e o campo só manual fechado às outras origens.

  Verificar: os testes do `packages/domain` passam.
- [x] 2.4 Escrever os testes e depois os catálogos (decisões 9 e 12):
  - as permissões `ativos.ver`, `ativos.editar` e `ativos.restritos`, com o escopo e as inclusões, e a descrição nova de `organizacao.editar`;
  - as ações `ativo.*` e `modulo.*`, com o rótulo e o evento de cada uma;
  - os eventos `ativos.mudaram`, com o público dado por quem grava, e `modulos.mudaram`, para toda sessão;
  - `MODULOS_OPCIONAIS`.

  Verificar: os testes do `packages/domain` passam.

## 3. Banco

- [x] 3.1 Escrever os testes de integração e depois a migration (decisões 1 e 12):
  - a tabela `ativos`, com `orgScoped()` e `app.isolar_por_organizacao`;
  - as referências com o `org_id`, e o modelo por `(org_id, modelo_id, tipo_id)`, com o `unique (org_id, id, tipo_id)` nos modelos (foco 7);
  - o patrimônio único pela forma normalizada, só onde existe (foco 3);
  - as conferências do uso, da situação e do tamanho e da forma de `valores` e `estado`;
  - `organizacoes.modulos_desligados`, vazio por padrão.

  Verificar:
  - o teste-guarda e o das chaves com `org_id` passam com a tabela nova;
  - o modelo de outro tipo e a referência a um local de outra organização são recusados pelo banco;
  - `pnpm test:integration` passa no `packages/db`.

## 4. API

- [x] 4.1 Escrever os testes de integração e depois `GET /pessoas/nomes` (decisão 10): `referencia`, só as pessoas ativas, só o id e o nome, até 20, em ordem alfabética, com a busca sem diferenciar acento e maiúsculas.

  Verificar: `pnpm test:integration` passa no `apps/api`, e `pnpm contrato:verificar` está em dia depois do `pnpm contrato:gerar`.
- [x] 4.2 Escrever os testes de integração e depois a leitura dos ativos (decisões 6, 7 e 8):
  - **`GET /ativos`:**
    - o escopo pelo local, com o ativo sem local só para a organização inteira (foco 4);
    - os filtros de tipo, de local com o ramo, de situação e de uso;
    - a busca no ativo e no modelo, palavra a palavra;
    - os cadastrados por último primeiro, com o cursor;
    - o `permite.cadastrar`;
  - **`GET /ativos/:id`:**
    - os valores e o estado, com o nome do autor;
    - as referências pelo nome, e o ativo fora do acesso;
    - os restritos fora da resposta para quem não tem `ativos.restritos` (foco 5);
    - o `permite`.

  Verificar: `pnpm test:integration` passa no `apps/api`, e `pnpm contrato:verificar` está em dia.
- [x] 4.3 Escrever os testes de integração e depois a escrita dos ativos (decisões 4 a 9):
  - **`POST /ativos`:** o tipo ativo, o modelo do tipo e ativo, os valores conferidos pelo domínio, os obrigatórios e o uso padrão;
  - **`PATCH /ativos/:id`:**
    - só as chaves pedidas (focos 1 e 2);
    - o modelo, as travas e o estado de cada chave gravada;
    - a linha travada (foco 6);
  - **referências:** o local, a pessoa e o ativo, ativos e não o próprio;
  - **escopo:** o cadastro no local pedido, a mudança de local nos dois locais, os restritos com 403 (foco 5);
  - **unicidade:** o patrimônio repetido em 409, também com outra caixa;
  - **auditoria e evento:** o antes → depois pelos rótulos e pelos valores mostrados, as travas, e o `ativos.mudaram` para os locais de antes e de depois;
  - **recusa:** a conta sem a permissão recusada com 403 e auditada.

  Verificar: `pnpm test:integration` passa no `apps/api`, e `pnpm contrato:verificar` está em dia.
- [x] 4.4 Escrever os testes de integração e depois a inativação e a reativação (decisões 8 e 9), com o escopo, a auditoria e o evento.

  Verificar: `pnpm test:integration` passa no `apps/api`.
- [x] 4.5 Escrever os testes de integração e depois os rótulos reservados nos campos (decisão 11):
  - `POST` e `PATCH /campos` recusam o rótulo de um campo comum e o de um campo de capacidade, em 400 no rótulo;
  - os exemplos do P1a com "Propriedade" passam a "Criticidade".

  Verificar: `pnpm test:integration` passa no `apps/api`, e os testes da web e as pontas a ponta do catálogo continuam passando.
- [x] 4.6 Escrever os testes de integração e depois os módulos (decisão 12):
  - `GET /organizacao/modulos` e `PUT /organizacao/modulos/:id`, com `organizacao.editar`, a auditoria e o evento `modulos.mudaram`;
  - `modulosDesligados` no estado da sessão;
  - as rotas do catálogo e dos ativos no escopo com a guarda do módulo (`exigirModuloLigado`), recusadas com 403 (`modulo-desligado`) com o Ativos desligado, e de volta ao ligar, com os dados (foco 8).

  Verificar: `pnpm test:integration` passa no `apps/api`, e `pnpm contrato:verificar` está em dia.
- [x] 4.7 Escrever os testes e depois os endereços da web servidos pela API (spec plataforma-base): com a web compilada, o pedido de página fora do `/api` recebe o `index.html`, mesmo no endereço de uma rota da API, como `/ativos` e `/ativos/novo`, e o `/health` continua com a API.

  Verificar: `web.test.ts` passa no `apps/api`.

## 5. UI

- [x] 5.1 Escrever os testes e depois o `EstadoDoCampo` no `packages/ui` (decisão 14):
  - a origem, o autor e o momento em texto;
  - a trava como botão com o nome do campo e o estado em texto, só para quem edita;
  - as histórias, com os testes de interação e de acessibilidade.

  Verificar: `pnpm test:stories` e os testes do `packages/ui` passam, e `pnpm test:visual --atualizar` grava as referências novas.

## 6. Web

- [x] 6.1 Escrever os testes de componente e depois o `CampoDoAtivo` (decisão 13):
  - um campo de entrada para cada tipo de campo, com a leitura pelo motor e a recusa no campo;
  - a lista com "Nenhum" nos opcionais e a opção inativa guardada à vista;
  - a escolha da pessoa, sobre `/pessoas/nomes`, e a do ativo, sobre `GET /ativos`, sem o próprio, pelo seletor de registros da Administração (`SeletorDeConta`);
  - o `EstadoDoCampo` e a trava junto de cada campo.

  Verificar: os testes de componente passam.
- [x] 6.2 Escrever os testes de componente e depois a lista dos ativos (decisões 8 e 13):
  - a miniatura, o nome com o tipo, o patrimônio, o local e a situação em texto;
  - a busca e os filtros de tipo, de local e de situação no endereço, com os filtros ativos;
  - a contagem e "Carregar mais";
  - o estado vazio, com "Limpar filtros" ou "Novo ativo".

  Verificar: os testes de componente passam.
- [x] 6.3 Escrever os testes de componente e depois o cadastro (decisão 13):
  - o tipo primeiro, entre os ativos, e "Nenhum tipo de ativo ainda." sem nenhum;
  - o modelo do tipo, os campos nos grupos da ficha e os obrigatórios;
  - as recusas da API no campo, com o formulário preenchido.

  Verificar: os testes de componente passam.
- [x] 6.4 Escrever os testes de componente e depois a ficha (decisões 5, 6 e 13):
  - o nome, a situação, o patrimônio e a miniatura no título;
  - os grupos, o estado e a trava de cada campo, e só as chaves mudadas no envio;
  - os restritos com a marca, só para quem os vê;
  - inativar e reativar com confirmação;
  - só leitura sem `ativos.editar`.

  Verificar: os testes de componente passam.
- [x] 6.5 Escrever os testes e depois o módulo Ativos com os ativos (decisões 9 e 13):
  - **a entrada:** o menu com Ativos e o Catálogo, cada um com a permissão dele, e o endereço que leva à lista ou, sem `ativos.ver`, aos tipos;
  - **a busca:** "Novo ativo" e o provedor dos ativos, com o contrato de módulo aceitando vários provedores, cada um no seu grupo;
  - **os eventos:** `ativos.mudaram`, `catalogo.mudou`, `locais.mudaram` e `pessoas.mudaram` atualizam a lista e a ficha.

  Verificar: `registro.test.ts`, `documentacao.test.ts` e os testes da web passam.
- [x] 6.6 Escrever os testes e depois os módulos na web (decisão 12):
  - a seção Módulos da Administração, com o interruptor, a confirmação ao desligar e as recusas;
  - o registro da conta sem os módulos desligados, e `modulos.mudaram` validando a sessão;
  - a tela de um módulo desligado aberta pelo endereço (foco 8);
  - **o contrato de módulo (`docs/casca/modulos.md`):** o módulo opcional.

  Verificar: `registro.test.ts`, `documentacao.test.ts` e os testes da web passam.
- [x] 6.7 Estender a ponta a ponta com a API simulada:
  - o cadastro de uma impressora com o modelo, os campos do tipo e um obrigatório recusado;
  - a ficha com o estado de um campo, a trava e a inativação;
  - a lista com a busca e o filtro de local;
  - o ativo pela busca;
  - o Ativos desligado na seção Módulos, que some do dock.

  Verificar: `pnpm test:e2e` passa.
- [x] 6.8 Estender a ponta a ponta da pilha: com as duas contas em dois navegadores, o ativo cadastrado por uma aparece na lista aberta da outra, pelo evento `ativos.mudaram`, e o Ativos desligado pela administradora some do dock da outra sem recarregar. Verificar: `pnpm test:e2e:pilha` passa.

## 7. Fechamento

- [x] 7.1 Atualizar o `CLAUDE.md`, com o P1b nas referências, e conferir as verificações:
  - `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:stories`, `pnpm test:e2e`, `pnpm test:e2e:pilha` e `pnpm test:visual` verdes;
  - `pnpm tokens:verificar`, `pnpm marca:verificar`, `pnpm contrato:verificar` e `pnpm fila:verificar` em dia;
  - `openspec validate p1b-cadastro-de-ativos --strict` sem erros.

  Verificar: os comandos passam, e o CI fica verde no PR.
