## Why

O usuário pediu, no redesenho de 29/10, mais criatividade para mostrar a quantidade de toner, os Face ID e os backups. A visualizacoes-de-dados criou os instrumentos (o cartucho, a faixa de dias, a tendência, a contagem e o medidor). Agora eles entram nas telas de quem opera:

- **O toner:** o painel Suprimentos da ficha mostra uma tabela, com uma barra igual para todas as cores. A coluna da lista mostra só o menor nível em texto. Ninguém sabe quando o toner acaba, embora o Grafite guarde 30 dias de leituras.
- **Os Face ID:** a contagem de rostos e de usuários de cada controle existe em cada backup, nas categorias "Fotos" e "Usuários", mas só aparece dentro do conteúdo do backup.
- **Os backups:** a ficha e a tela de backups listam um backup por linha. Um dia sem backup não aparece em lugar nenhum, e não dá para ver de relance qual controle está sem backup.

Esta change é a terceira etapa do subprojeto D1 · Linguagem visual v3 da spec mestre. Ela também mexe no P2b (impressoras por SNMP) e no P5 (Control iD). Ficam fora dela:
- o estoque de toner, com a cobertura do estoque pelo consumo;
- o limite da regra de alerta nos cartuchos;
- a capacidade de rostos de cada modelo, que o Grafite não sabe.

## What Changes

- **A série dos suprimentos:** `GET /ativos/{id}/suprimentos/serie` devolve, por suprimento, o último nível válido de cada dia dos últimos 30 dias, das leituras guardadas.
- **A estimativa de quando o toner acaba.** O domínio estima, pela série, em quantos dias o nível chega a zero:
  - a regressão linear desde a última troca, que é a subida de mais de 10 pontos;
  - pelo menos 3 leituras em 3 dias, e nível caindo.

  Sem isso, não há estimativa.
- **O painel Suprimentos com cartuchos.** O painel deixa a tabela e mostra os suprimentos como cartuchos, na ordem da impressora:
  - a tinta sai da descrição, como "Black" e "Ciano";
  - o cilindro e o fusor ficam sem tinta;
  - a estimativa vai escrita como estimativa, como "Acaba em cerca de 21 dias".

  A coluna da lista ganha o medidor compacto do menor nível, na tinta dele.
- **O resumo dos backups:** `GET /controlid/backups/resumo` devolve, para cada controle que a conta vê:
  - os dias dos últimos 30, em São Paulo, com a melhor situação do dia (concluído, parcial, falha ou nada);
  - o último backup com os usuários e os rostos;
  - a série dos rostos.

  O filtro `ativo` dá o de um controle só.
- **Na ficha do controle**, acima da lista de backups:
  - a contagem dos rostos e a dos usuários, com a variação desde o backup anterior;
  - a tendência dos rostos;
  - a faixa dos 30 dias.
- **Na tela "Backups do Control iD"**, acima da lista: os últimos 30 dias de cada controle, com a faixa, os rostos, os usuários e a idade do último backup.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `impressoras-por-snmp`: o painel Suprimentos com os cartuchos e a estimativa, a série dos suprimentos e o medidor na coluna da lista.
- `backup-do-control-id`: o resumo dos backups por controle, com os dias, os rostos e os usuários, na ficha e na tela de backups.

## Impact

- **`packages/domain`:**
  - a tinta pela descrição do suprimento;
  - a estimativa de quando acaba;
  - os dias dos backups em São Paulo;
  - os rostos e os usuários pelas categorias.
- **`apps/api`:** as duas rotas, com os esquemas, as permissões de hoje (a ficha do ativo e `controlid.ver`) e os testes de integração.
- **`packages/api-client`:** o contrato regenerado.
- **`apps/web`:**
  - o painel Suprimentos e a célula da lista;
  - a seção Backups da ficha do controle;
  - a tela "Backups do Control iD";
  - os testes.
- O banco e o coletor não mudam.
