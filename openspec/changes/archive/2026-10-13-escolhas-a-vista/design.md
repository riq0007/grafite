## Context

O motivo está em `proposal.md`. O ponto de partida, pelo inventário do handoff (`relatorio-01`, seção B):

- **A busca com sugestões** (`packages/ui/src/componentes/busca/BuscaComSugestoes.tsx`) é o `ComboBox` do React Aria com `menuTrigger="input"`, sem botão. Com `sugestoesDeFora`, ela mostra o que a tela manda, e abre quando as sugestões novas chegam com o campo em foco.
- **Os seletores da Administração** são feitos sobre ela:
  - o `SeletorDeLocal` carrega todos os locais ativos e mostra o caminho "A › B", em ordem alfabética;
  - o `SeletorDeConta` busca na API a cada mudança do texto e não busca com o texto vazio.
- **Na aba Acesso da pessoa**, "Incluir num grupo" é um diálogo com uma `Selecao`, que carrega os grupos só ao abrir. "Atribuir perfil" é outro diálogo: o perfil numa `Selecao`, o escopo em rádios e o local no `SeletorDeLocal`. O aviso das permissões que não valem num local só chega depois de gravar.
- **A biblioteca** já tem a `Arvore` (o `Tree` do React Aria), a `Gaveta`, o `ControleSegmentado`, os rádios com descrição e o `RotuloDeSituacao`.

## Goals / Non-Goals

**Goals:**
- Nenhuma escolha entre opções conhecidas exige digitar para ver as opções.
- O efeito de uma escolha que dá acesso aparece em texto antes de ela ser gravada.
- O mesmo comportamento em toda tela que usa a busca com sugestões, pela mudança no componente da biblioteca.

**Non-Goals:**
- "Recentes", criar registro de dentro da escolha e contagens por opção nos filtros da tabela.
- Mudar a estética: nenhuma cor, raio, sombra ou material novo; o painel continua a camada flutuante de hoje.

## Decisions

### 1. A busca com sugestões abre pelo clique, pelo botão e pelas setas

O `ComboBox` continua com `menuTrigger="input"`, para digitar abrir e filtrar como hoje, e ganha:
- o botão de abrir, à direita do campo, com o ícone de seta e o rótulo acessível "Mostrar as opções de <rótulo>";
- a abertura ao clicar no campo, pelo estado do `ComboBox`, com todas as opções;
- as setas e Alt+↓, que o React Aria já trata.

**Alternativa:** `menuTrigger="focus"`. Ela abre a lista a cada vez que a tabulação passa pelo campo, o que atrapalha quem preenche o formulário pelo teclado. Por isso a spec pede o clique, as setas e o botão, e não o foco.

### 2. Seções e rodapé no painel

As props ganham:
- `sugeridas`: as chaves das opções sugeridas e a origem em texto, mostradas numa seção "Sugeridos" antes das outras;
- `total`: o total que a API conhece, para o rodapé "Digite para buscar entre N" quando as sugestões de fora são menos que o total.

As outras opções vêm em ordem alfabética do português (`localeCompare` com `pt-BR` e sensibilidade de base), salvo quando a tela já manda a ordem. O rodapé é um texto do painel, fora da lista, para não virar uma opção.

A "seção" das sugeridas é visual, numa lista só:
- o cabeçalho "Sugeridos", com a origem, fica no painel, acima da lista, enquanto a primeira opção à vista é uma sugerida;
- uma linha separa a última sugerida da primeira das outras;
- cada sugerida tem a descrição "Sugerido" ou "Sugerido: <origem>" para o leitor de tela.

**Alternativa:** as seções do React Aria (`ListBoxSection`). Com elas, estreitar a lista enquanto se digita quebrava o rastro de desempenho do React em desenvolvimento, que lê as propriedades dos nós da coleção, e o catálogo reprovava.

### 3. A escolha em árvore

Um componente novo, `EscolhaEmArvore`, em `packages/ui`, mostra no campo o caminho do escolhido e um botão de abrir. O painel flutuante traz:
- o campo de filtro;
- a seção "Sugerido", quando há;
- a `Arvore` com seleção única.

Ao filtrar, a árvore vira a lista dos que casam pelo caminho completo, sem diferenciar acento e maiúsculas, para o caminho mostrar onde cada um está. Escolher fecha o painel e devolve o foco ao campo.

O `SeletorDeLocal` passa a usá-lo, com a sugestão vinda da tela (`sugerido: { id, origem }`).

### 4. As escolhas que vêm da API sem o texto

| Rota | Sem o texto |
|---|---|
| `GET /pessoas/nomes` | as primeiras 20 em ordem alfabética, com `local` as do ramo primeiro e marcadas, e o total |
| `GET /pessoas?conta=com` (Incluir conta no grupo) | já aceita a busca vazia; a tela passa a pedir sem o texto |
| `GET /auditoria/contas` (Quem fez) | as primeiras em ordem alfabética |
| `GET /modelos/fabricantes` | os fabricantes já usados, os do tipo primeiro quando ele vem |

A resposta dos nomes ganha `total` e `doMesmoLocal`. O cliente é gerado de novo, e as telas que já a usam mudam junto.

### 5. Os grupos da conta como tabela

A lista dos grupos (`GET /grupos`) ganha, em cada grupo, os perfis em vigor, com o nome e o escopo. A aba Acesso cruza essa lista com as participações da conta, que ela já carrega, e monta a tabela:

| Coluna | Conteúdo |
|---|---|
| Grupo | o nome, que leva à ficha do grupo |
| Perfis que o grupo dá | "Técnico · organização inteira", "Operador · Jundiaí › Almoxarifado" |
| Situação da conta | "Participa desde 03/10/2026" ou "Não participa", em texto |
| Ação | "Incluir" ou "Retirar", para quem administra os acessos |

"Incluir" e "Retirar" abrem a confirmação com o efeito, calculado no cliente pelas atribuições da conta e pelos perfis do grupo:
- "passa a ter";
- "deixa de ter";
- "já tem pelo grupo X".

Retirar continua destrutivo na confirmação, e não na linha: o botão da linha é secundário.

### 6. A gaveta de atribuir perfil

A gaveta substitui o diálogo, na ficha da pessoa e na do grupo:
- os perfis vêm de `GET /perfis`, que já traz a descrição e as permissões;
- o "Resultado" é calculado no cliente com o catálogo de permissões do domínio, que diz as que só valem na organização inteira, e com as atribuições em vigor da conta ou do grupo.

A API continua conferindo tudo e respondendo como hoje. O cálculo da tela só antecipa o que a API diria, e a recusa da API, se vier, aparece na gaveta.

### 7. As regras de escolha no contrato de módulo

O contrato de módulo (`docs/casca/modulos.md`) ganha a seção "Escolhas", com a regra de qual controle usar:
- até 5 opções, rádios, ou o segmentado para modos de vista;
- múltipla até cerca de 15, checkboxes;
- de 6 a 15, com um padrão claro e pouco espaço, a seleção fechada;
- até cerca de 300 na memória, a busca com sugestões aberta pelo clique;
- acima disso ou fora da memória, a busca na API com as sugestões do contexto;
- locais, a escolha em árvore;
- escolhas que dão acesso, sempre com o efeito em texto antes de confirmar.

## Risks / Trade-offs

- **[Os testes que digitam para abrir]** → As histórias, a ponta a ponta e a regressão visual mudam junto, numa tarefa só. As referências visuais dos campos com o botão novo são regravadas apagando antes as que mudam, porque o `--atualizar` só regrava a captura que reprova.
- **[A lista grande aberta pelo clique]** → O fuso tem centenas de opções: a lista do React Aria é virtualizada só com o `Virtualizer`. O painel mantém a altura máxima de hoje, com rolagem, e o filtro continua a um toque.
- **[O "do mesmo local" para quem não vê pessoas]** → A escolha do responsável diz só que a pessoa é do mesmo local do ativo, nunca qual é o local de cada pessoa, e só para quem já pode editar o ativo.

## Migration Plan

Sem migration. A resposta dos nomes das pessoas muda junto com o cliente gerado e com as telas que a usam.
