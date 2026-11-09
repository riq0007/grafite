## Why

O P4b deixou o catálogo dos consumíveis, mas a organização ainda não sabe quantos toners tem nem onde estão. A troca do toner depende de achar um na hora, e a decisão do indicador do toner, "deixar toner de reserva nos locais que mais esperam" (spec mestre, seção 7.6), precisa de um estoque por local.

A P4c · Estoque é a terceira change do P4 (spec mestre, seção 3.2): o livro-razão por local, o saldo e o mínimo. Em 21/10, o usuário escolheu o mínimo na tela do estoque e em "O que resolver agora", as permissões por local e a entrada das pendências da P4b.

## What Changes

- **Livro-razão do estoque**, no módulo Operação:
  - quatro movimentações, que nunca se editam nem se apagam: a entrada, com o fornecedor e a nota fiscal; a saída para um ativo; a transferência entre dois locais; e o ajuste, para acrescentar ou retirar, com o motivo;
  - cada movimentação guarda o consumível, a quantidade, os locais, quem lançou e quando;
  - a saída para uma impressora guarda o total de páginas lido naquele momento, quando há leitura;
  - o saldo nunca fica negativo, nem com dois lançamentos ao mesmo tempo.
- **Saldo e mínimo:**
  - o saldo de cada consumível em cada local, com o mínimo, que quem movimenta define;
  - a situação em texto: "Sem estoque", "Abaixo do mínimo" ou "Em estoque";
  - cada consumível abaixo do mínimo num local vira uma ocorrência em "O que resolver agora".
- **Telas:**
  - "Estoque", com os saldos, os filtros e as ações de lançar;
  - "Movimentações", com o livro-razão e os filtros;
  - os formulários de cada movimentação numa gaveta, com "Cadastrar novo consumível" e "Cadastrar novo fornecedor" nos campos;
  - a seção "Estoque" na ficha do consumível;
  - no cartão "Consumíveis compatíveis" da ficha do ativo, o saldo de cada um e "Registrar saída".
- **Permissões** `estoque.ver` e `estoque.movimentar`, com escopo de local. A transferência pede `estoque.movimentar` nos dois locais.
- **Pendências da P4b:**
  - a busca dos consumíveis no Ctrl+K, pelo código e pelo nome;
  - o Novo consumível numa aba, pedido pelo campo do consumível;
  - os consumíveis do fornecedor e as entradas dele no estoque, na ficha do fornecedor.
- **Banco:** a migration 0037 cria o livro-razão e os saldos. O papel da aplicação não altera nem apaga uma movimentação.
- **Auditoria e evento:** cada movimentação e cada mínimo vão para a auditoria, e o evento `estoque.mudou` chega a quem vê o estoque dos locais dela.

**Fora desta change:**
- o alerta do estoque, com a notificação, o e-mail e o push, porque o motor dos alertas fala só de ativos e coletores;
- o custo das entradas e o valor do estoque;
- o estorno de uma movimentação, porque o ajuste com o motivo corrige o saldo sem apagar nada;
- o estoque de peças que não são consumíveis, que entra com as OS (P4e), e as solicitações (P4d);
- as páginas por toner, da P4f, que vão usar o contador guardado na saída.

## Capabilities

### New Capabilities

- `estoque`: o livro-razão por local, com as quatro movimentações, as recusas, o saldo que nunca fica negativo, o mínimo, o contador de páginas da saída e quem vê e quem movimenta.

### Modified Capabilities

- `modulo-operacao`:
  - "Operação no dock" passa a mostrar o estoque e as movimentações, a busca dos consumíveis e as ações de lançar;
  - entram as telas do estoque e das movimentações, os formulários de lançamento e o estoque abaixo do mínimo no Início;
  - a ficha do consumível ganha a seção Estoque;
  - a atualização pelos eventos ganha `estoque.mudou`.
- `consumiveis`: o Novo consumível numa aba; o consumível como referência para quem vê o estoque.
- `fornecedores`: os consumíveis do fornecedor e as entradas dele no estoque, na ficha.
- `cadastro-de-ativos`: o saldo de cada consumível compatível e "Registrar saída" no cartão da ficha do ativo.
- `permissoes`: `estoque.ver` e `estoque.movimentar` no catálogo.
- `auditoria`: as movimentações e o mínimo registrados.
- `eventos-em-tempo-real`: o evento `estoque.mudou`.
- `modulos-da-organizacao`: a descrição do Operação, com o estoque.
- `tela-inicial`: a ocorrência que fala de um registro que não é um ativo, como o consumível.

## Impact

- **Domínio (`packages/domain`):** as movimentações, as recusas, o efeito no saldo e a situação; as permissões, as ações da auditoria e o evento.
- **Banco (`packages/db`):** a migration 0037, com o livro-razão só de inclusão e os saldos com o mínimo, e o teste-guarda do RLS.
- **API (`apps/api`):** as rotas do estoque no escopo do Operação; a escolha dos consumíveis; o estoque na ficha do consumível e na do ativo; os consumíveis do fornecedor; o contrato e o cliente gerados de novo.
- **Web (`apps/web`):**
  - o módulo Operação, com as telas, os formulários, o Novo consumível numa aba, a busca, a fonte de ocorrências e a relação na ficha do fornecedor;
  - o cartão da ficha do ativo, no Ativos.
- **Documentação:** a spec mestre (seções 3.2 e 5.1), o runbook ("A versão com o estoque"), o contrato de módulo e o mapa.
- **Depois da atualização:** quem administra dá as permissões, lança o inventário inicial pelo ajuste com o motivo Inventário e define os mínimos.
