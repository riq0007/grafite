## Why

O usuário reclamou que, para escolher um grupo, um local ou uma pessoa, "tem que escrever uma letra para começar a mostrar as opções". A análise do handoff de 2026-10-13 confirmou no código:
- a busca com sugestões da biblioteca só abre a lista depois de o texto mudar;
- o seletor de local tem todos os locais na memória e não os mostra;
- o seletor de conta não busca nada com o campo vazio;
- "Incluir num grupo" esconde num diálogo uma escolha que pede contexto: o que cada grupo dá e de quais a conta já participa;
- "Atribuir perfil" pede o local digitado e só avisa o efeito depois de gravar.

A change pertence ao F0 (componentes base) e ao F2b (as telas de acesso da Administração), seção 3.2 da spec mestre. Ela aplica à interface a primeira proposta do handoff ("Escolhas à vista"), sem mudar a estética: os mesmos tokens, componentes e camadas.

Ficam fora desta change:
- as visões da tabela que ficam com a conta, os filtros com contagens e as relações com cartões, que são outras propostas do handoff;
- "Recentes" nas escolhas, que pedem uma guarda nova por conta;
- criar um registro de dentro de uma escolha, como "Cadastrar nova pessoa…".

## What Changes

- **A busca com sugestões abre ao clicar ou ao focar** e mostra as opções antes de qualquer tecla, com um botão para abrir:
  - as opções que estão na memória aparecem inteiras, com os sugeridos primeiro;
  - as que vêm da API aparecem pelas sugestões do contexto, como as pessoas do mesmo local, seguidas das primeiras em ordem alfabética e de "Digite para buscar entre N";
  - ela nunca abre vazia.
- **A escolha de local** mostra a árvore dos locais no painel, com o filtro sem acento e o caminho completo, e o local sugerido pelo contexto no topo, com a origem em texto, como "Sugerido: local de trabalho de Bruno".
- **A API dos nomes das pessoas** responde também sem a busca: as primeiras em ordem alfabética, as do local pedido primeiro, e o total.
- **Os grupos da conta** viram uma tabela na aba Acesso da pessoa, com:
  - todos os grupos ativos;
  - os perfis que cada um dá, com o escopo;
  - a situação da conta em cada um, "Participa desde 03/10/2026" ou "Não participa";
  - "Incluir" ou "Retirar" na linha, com o efeito em texto antes de confirmar;
  - o filtro da lista quando há mais de 10 grupos.
- **"Atribuir perfil"** vira uma gaveta, que mantém a ficha à vista:
  - os perfis em rádios, com a descrição e quantas permissões cada um tem;
  - o escopo num segmentado;
  - o local na árvore, com o local de trabalho da pessoa sugerido;
  - um bloco "Resultado", antes de confirmar, com o que a conta passa a ter, as permissões que não valem num local e a atribuição igual que já está em vigor.
- **As escolhas que já usam a busca com sugestões** passam ao comportamento novo: o fuso horário em Ajustes, com os do Brasil sugeridos, a ação e "Quem fez" na auditoria, o grupo do campo e o fabricante do modelo.
- **O contrato de módulo** ganha as regras de escolha: que controle usar conforme o número de opções e de onde elas vêm.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `componentes-base`: a busca com sugestões abre com as opções à vista, e a escolha de local em árvore.
- `administracao-de-pessoas`: os grupos da conta como tabela, com o efeito de incluir e retirar, e os nomes das pessoas sem a busca.
- `modulo-administracao`: a atribuição de perfil numa gaveta, com o resultado antes de confirmar.

## Impact

- **`packages/ui`:** `BuscaComSugestoes`, com o botão, as seções e o rodapé, e a escolha de local em árvore, com as histórias e os testes do catálogo.
- **`apps/api`:**
  - `/pessoas/nomes` e a busca das contas sem o texto, com o local primeiro e o total;
  - a lista dos grupos com os perfis de cada um.

  O contrato e o cliente são gerados de novo.
- **`apps/web`:**
  - os seletores de local, de pessoa e de conta;
  - a aba Acesso da pessoa e a gaveta da atribuição;
  - o fuso horário, os filtros da auditoria, o grupo do campo e o fabricante.
- **Testes:** as histórias, a ponta a ponta e a regressão visual que hoje digitam para abrir as listas passam a abrir pelo clique.
- **Documentação:** o contrato de módulo (`docs/casca/modulos.md`) e o mapa.
