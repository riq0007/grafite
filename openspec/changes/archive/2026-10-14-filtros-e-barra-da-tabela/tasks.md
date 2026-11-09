## 1. API e domínio

- [x] 1.1 Escrever primeiro os testes de integração e depois `GET /ativos/contagens`, com a busca, os filtros menos o da própria coluna, o escopo e os restritos (design, decisão 2), e a busca de modelos por tipos. Verificar: os testes de integração passam, inclusive o desempenho com 10 mil ativos.
- [x] 1.2 Escrever primeiro os testes e depois a ordem dos grupos pelos tipos filtrados em `colunasDosAtivos` (decisão 4). Verificar: os testes do domínio passam.

## 2. Biblioteca

- [x] 2.1 Escrever primeiro as histórias com os testes de interação e depois o painel de filtros em duas colunas e o editor com as contagens, "(0)", "Mostrar mais" e o botão com o resultado (decisões 1 e 2). Verificar: `pnpm test:stories` passa.
- [x] 2.2 Escrever primeiro as histórias com os testes de interação e depois os filtros ativos com o operador e a edição no lugar, a barra em duas faixas com as ações em lote, e o carregamento com o esqueleto e as linhas mantidas (decisões 3, 5 e 6). Verificar: `pnpm test:stories` passa.

## 3. Web

- [x] 3.1 Escrever primeiro os testes e depois a tabela dos ativos com o painel novo, o "Filtrar…" preso ao cabeçalho, as contagens e o encadeamento do Tipo para o Modelo e para os painéis. Verificar: os testes da web passam com os cenários das specs.
- [x] 3.2 Escrever primeiro os testes e depois a barra em duas faixas, com a contagem, as ações em lote e o carregamento. Verificar: os testes da web passam.

## 4. Ponta a ponta

- [x] 4.1 A ponta a ponta simulada filtra pelo painel com a contagem, edita um filtro pelo rótulo e imprime as etiquetas pela barra da seleção, e as referências visuais da tabela são regravadas. Verificar: `pnpm test:e2e` e `pnpm test:visual` passam.

## 5. Fechamento

- [x] 5.1 O contrato de módulo, na tabela configurável, e o mapa. Verificar: `pnpm test` passa, com o teste-guarda do mapa.
- [x] 5.2 Conferir as verificações: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:stories`, `pnpm test:e2e`, `pnpm test:e2e:pilha` e `pnpm test:visual` verdes, `contrato:verificar` em dia, e `openspec validate filtros-e-barra-da-tabela --strict` sem erros. Verificar: os comandos passam, e o CI do PR fica verde.
