## Why

O usuário reclamou que, quando escolhe as colunas da tabela dos ativos, "o pré-set não fica salvo". A análise do handoff de 2026-10-13 (`relatorio-02`) achou a causa em duas decisões do P1c:
- a tabela abre, para quase todo mundo, em "Todos os ativos", a visão de fábrica, que não aceita "Salvar alterações";
- as mudanças não salvas vivem só no endereço, que o dock, o menu e a busca descartam ao voltar à tabela.

Quase tudo marca a visão como "Alterada", até a largura de uma coluna, e nem as visões da própria conta gravam sem "Salvar alterações". Os produtos de referência (Linear, Jira, ServiceNow, HubSpot, Datadog) resolvem isso com uma camada pessoal que grava sozinha por cima do que é compartilhado, com "voltar ao padrão" à vista, e deixam o "Salvar" explícito só para o que muda a tabela de outras pessoas.

A change pertence ao P1c · Tabela e visões, seção 3.2 da spec mestre, e ao nível do usuário nas preferências (seção 5.2, decisão 9). Ela aplica a segunda proposta do handoff ("As mudanças ficam com a conta").

Ficam fora desta change:
- as visões como abas fixadas na barra da tabela;
- a tabela dentro de uma ficha (os ativos de um local ou de uma pessoa);
- as visões nas tabelas de pessoas e da auditoria;
- os conjuntos de colunas reutilizáveis.

## What Changes

- **As mudanças da conta sobre uma visão:**
  - as colunas, a largura, a ordem, a ordenação e os filtros mudados sobre a visão de fábrica ou sobre uma da organização são gravados na conta, no servidor, por visão, sem uma ação do usuário;
  - ao voltar à tabela pelo dock, pelo menu, pela busca ou noutro aparelho, a visão abre com essas mudanças;
  - a visão aparece como "Personalizada", em texto, com "Restaurar a visão" e "Salvar como nova visão…" à vista, numa linha sob a barra.
- **As visões da conta gravam direto:** mudar uma visão de "Minhas visões" grava a própria visão, sem a marca de alterada e sem "Salvar alterações".
- **A visão da organização** muda para todos só pela publicação explícita: quem tem `organizacao.editar` vê "Salvar na visão da organização", e "Restaurar a visão" descarta as mudanças, como para todos.
- **"Duplicar…"** cria uma visão da conta a partir da aberta, com as mudanças da conta, em qualquer visão.
- **Um link com mudanças** mostra a tabela do link nessa visita, como "Do link", e a primeira mudança do usuário sobre ele passa a gravar na conta.
- **Em Ajustes › Tabelas,** "Restaurar as minhas mudanças nas tabelas" apaga as mudanças da conta em todas as visões.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `visoes-de-tabela`:
  - a tabela alterada passa a ser a visão personalizada pela conta;
  - as visões da conta gravam direto, e a publicação explícita fica só na da organização;
  - "Duplicar…";
  - o estado no endereço com as mudanças da conta;
  - a atualização das outras sessões;
  - a remoção e a anonimização apagam as mudanças da conta.
- `ajustes-do-sistema`: a seção Tabelas ganha "Restaurar as minhas mudanças nas tabelas".
- `componentes-base`: a escolha da visão mostra "Personalizada" ou "Do link", em texto, no lugar de "Alterada".

## Impact

- **`packages/domain`:** a camada da conta sobre a definição da visão, com os mesmos limites da visão, e as regras de quando gravar.
- **`packages/db`:**
  - a tabela das mudanças da conta por visão, com o isolamento por organização;
  - a migration.
- **`apps/api`:**
  - `GET /visoes` com as mudanças da conta;
  - as rotas de gravar e restaurar as mudanças;
  - o evento para as sessões da própria conta;
  - a remoção e a anonimização.

  O contrato e o cliente são gerados de novo.
- **`apps/web`:**
  - o estado da tabela, que compõe o endereço, as mudanças da conta e a visão;
  - o menu da visão e a linha de estado;
  - Ajustes › Tabelas.
- **`packages/ui`:** a escolha da visão com "Personalizada", "Do link" e as ações novas.
- **Documentação:** o contrato de módulo, na seção da tabela configurável, e o mapa.
