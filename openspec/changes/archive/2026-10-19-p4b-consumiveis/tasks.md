## 1. Domínio

- [x] 1.1 Escrever primeiro os testes e depois o consumível no domínio (design, decisão 1): os tipos e as cores com os rótulos, o código normalizado, a conferência campo a campo com as mensagens da spec, os limites dos fornecedores e dos modelos, o rendimento escrito, a ordem dos compatíveis e o resumo do cartão. Verificar: os testes do domínio passam com os cenários "Código com outra grafia", "Rendimento fora do limite", "Kit sem cor nem rendimento" e "Resumo dos consumíveis compatíveis".
- [x] 1.2 Escrever primeiro os testes e depois a capacidade `consumiveis.compatibilidade` nas `CAPACIDADES` e o módulo `operacao` nos `MODULOS_OPCIONAIS` (decisão 3), com o trecho dos `MODULOS_OPCIONAIS` no contrato de módulo. Verificar: os testes do domínio passam com os cenários "Consumíveis compatíveis ligados na impressora" e "Operação numa organização que já existia", e o teste dos trechos do contrato passa.
- [x] 1.3 Escrever primeiro os testes e depois `consumiveis.ver` e `consumiveis.editar` no catálogo de permissões, as ações dos consumíveis na auditoria, com os rótulos, e o evento `consumiveis.mudaram`, para toda a organização. Verificar: os testes do domínio passam com o cenário "Permissão nova no Administrador", com as dezoito.

## 2. Banco

- [x] 2.1 Escrever primeiro o teste de integração e depois as três tabelas na migration 0036 (decisão 2): o RLS forçado, o código normalizado único na organização, as checagens, as ligações com os fornecedores e os modelos pela chave estrangeira, únicas por par, e os índices pelo fornecedor e pelo modelo. Verificar: os testes de integração do banco passam, com o teste-guarda do RLS.

## 3. API

Cada tarefa entra com os esquemas das rotas dela e o cliente gerado de novo (`pnpm contrato:gerar`).

- [x] 3.1 Escrever primeiro o teste de integração e depois as rotas dos consumíveis (decisões 3 e 4): o escopo guardado pelo Operação, a lista com a busca, os filtros, o cursor e a contagem dos modelos, a ficha, o cadastro, a edição, a inativação e a reativação, com os fornecedores, as recusas no campo, a auditoria com as listas pelo nome, o evento e o 403. Verificar: os testes de integração passam com os cenários "Código com outra grafia", "Fornecedor inativado", "Toner que saiu de linha", "Edição sem a permissão", "Modelo incluído", "Busca pelo código sem o hífen" e "Filtro da cor".
- [x] 3.2 Escrever primeiro o teste de integração e depois a compatibilidade (decisões 4 e 5): os modelos para escolher, a conferência do modelo que entra, `GET /modelos/{id}/consumiveis` como referência e `consumiveisCompativeis` na ficha do ativo, nulo sem a capacidade ou com o Operação desligado. Verificar: os testes de integração passam com os cenários "Toner em dois modelos", "Modelo de outro tipo", "Compatibilidade desligada", "Técnico sem a permissão" e "Operação desligado".

## 4. Web

- [x] 4.1 Escrever primeiro os testes e depois o módulo Operação com a lista (decisões 6 e 7):
  - o registro, depois do Alertas, com o menu e "Mais" no celular;
  - a tela sem permissão;
  - a lista com a busca, os filtros do tipo, da cor e da situação, o "carregar mais" e a lista vazia;
  - a atualização pelos eventos.

  Verificar: os testes da web passam com os cenários "Conta sem a permissão", "Busca pelo código sem o hífen", "Filtro da cor" e "Consumível cadastrado com a lista aberta".
- [x] 4.2 Escrever primeiro os testes e depois o cadastro e a ficha do consumível (decisão 6):
  - "Novo consumível" na lista, também na lista vazia, e na busca, e a linha da lista, que abre a ficha;
  - o formulário, com as listas dos fornecedores e dos modelos e "Cadastrar novo fornecedor" na busca dos fornecedores;
  - a ficha, com os links dos fornecedores e dos modelos;
  - a inativação confirmada e a reativação, com os retornos;
  - quem só vê;
  - a ficha relida pelos eventos, sem perder o que foi digitado.

  Verificar: os testes da web passam com os cenários "Primeiro consumível", "Novo consumível pela busca", "Cadastro com o fornecedor e o modelo", "Fornecedor criado pelo consumível", "Quem só vê" e "Modelo renomeado com a ficha aberta".
- [x] 4.3 Escrever primeiro os testes e depois os compatíveis fora do módulo (decisões 5 a 7): a seção na ficha do modelo, o cartão "Consumíveis compatíveis" na ficha do ativo, com o painel, o resumo e o link para quem vê os consumíveis, `consumiveis.mudaram` no registro do Ativos e o alvo "Consumível" na tela da auditoria. Verificar: os testes da web passam com os cenários "Toners da M404", "Modelo de notebook", "Toner da impressora", "Impressora sem modelo", "Resumo dos consumíveis compatíveis" e "Toner incluído com a ficha da impressora aberta".

## 5. Ponta a ponta

- [x] 5.1 A ponta a ponta com a API simulada:
  - o Operação com a lista, o cadastro com o fornecedor e o modelo, a recusa do código repetido e a inativação;
  - a ficha do modelo com os compatíveis;
  - o cartão "Consumíveis compatíveis" da ficha da impressora, com o resumo.

  Verificar: `pnpm test:e2e` passa.
- [x] 5.2 A ponta a ponta da pilha: a administradora liga os consumíveis compatíveis no tipo das impressoras, cadastra o "CF258A" com a "HP Brasil" e a "HP LaserJet M404" e o vê no cartão "Consumíveis compatíveis" da PAT-00412. Verificar: `pnpm test:e2e:pilha` passa.

## 6. Fechamento

- [x] 6.1 Atualizar a documentação:
  - a spec mestre: a P4b na divisão do P4 (seção 3.2) e a capacidade `consumiveis.compatibilidade` (seção 5.4);
  - o runbook, com o que fazer depois da atualização: as permissões, a capacidade no tipo e os consumíveis;
  - o contrato de módulo (`docs/casca/modulos.md`), com o painel de uma capacidade e a seção da ficha do modelo com os dados de outro módulo, que valem também para quem não vê esse módulo;
  - o mapa (`docs/mapa.md`), com a change e o glossário;
  - os comandos do `CLAUDE.md`, se a ponta a ponta simulada passar a simular os consumíveis.

  Verificar: `pnpm test` passa, com o teste-guarda do mapa e o dos trechos do contrato.
- [x] 6.2 Conferir as verificações: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:stories`, `pnpm test:e2e`, `pnpm test:e2e:pilha` e `pnpm test:visual` verdes; `contrato:verificar` em dia; `openspec validate p4b-consumiveis --strict` sem erros. Verificar: os comandos passam, e o CI do PR fica verde.
