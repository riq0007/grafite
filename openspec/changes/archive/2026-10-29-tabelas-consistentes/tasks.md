## 1. A tabela base

- [x] 1.1 Escrever primeiro a história e depois a espécie na `Coluna` e na `Celula`, com o desenho de cada espécie e a `ColunaDeAcoes` (design, decisões 1 e 2). Verificar: a história "Espécies das colunas" passa com "Número alinhado" e "Ações numa linha", sem violação de acessibilidade.
- [x] 1.2 Escrever primeiro os testes e depois o `haQuantoTempo` e a `ContagemDaLista` (decisão 3). Verificar: os testes passam com "Último contato do coletor".

## 2. As telas

- [x] 2.1 Declarar a espécie das colunas da Administração, da Gestão de ativos, do Cofre, das Salas e dos Painéis, com a situação no selo, o tempo pelo `haQuantoTempo` e a contagem (decisões 1 e 3). Verificar: os testes dessas telas passam, e a dos perfis diz "3 perfis" com três perfis.
- [x] 2.2 Declarar a espécie das colunas do Alertas, do Operação, dos Indicadores e do Ativos, com a situação dos alertas no selo, o tempo e a contagem, e passar os "Últimos dias" à tabela base (decisões 1, 3 e 4). Verificar: os testes dessas telas passam com "Situação do alerta", e o `pnpm dev` mostra o saldo do estoque alinhado e as ações dos alertas numa linha.

  Feito em 29/10: no `pnpm dev`, o saldo do estoque fica à direita, na mono, embaixo do cabeçalho, e as linhas com ações do Estoque, dos Alertas, do Software, dos Painéis e das Salas têm 52 px, com os botões lado a lado; antes, 89 e 137 px. O contêiner que a tela põe nas ações, como o dos alertas, quebrava a linha, e a tabela passou a impedir isso.

## 3. Fechamento

- [x] 3.1 Regravar as capturas da regressão visual das tabelas, apagando antes as referências delas. Verificar: o `pnpm test:visual` passa.

  Feito em 29/10: as 48 referências das tabelas, apagadas, voltaram iguais, porque as histórias delas não declaram espécie. A história das espécies, que tem interação e ficava fora da regressão, ganhou a marca de captura e as 6 referências dela. As 707 capturas passam.
- [x] 3.2 Conferir as verificações:
  - `pnpm lint`;
  - `pnpm typecheck`;
  - `pnpm test`;
  - `pnpm test:stories`;
  - `openspec validate tabelas-consistentes --strict`.

  Verificar: os comandos passam.

  Feito em 29/10: o lint, o typecheck, as 556 histórias do catálogo e a validação passaram. Nos testes, o das Salas falhou por depender da hora (reservava às 20:00 e rodou depois das 20:00); o relógio do teste foi fixado, e os dez pacotes passaram, a web com os 1.726 testes.
