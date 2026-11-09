## Why

O usuário achou as tabelas muito inconsistentes (29/10). O levantamento das 33 telas com tabela, no `pnpm dev`, achou:
- **números desalinhados:** no Estoque e nas Movimentações, o cabeçalho do Saldo, do Mínimo e da Quantidade fica à direita e o valor à esquerda, porque a coluna e a célula têm o alinhamento separado;
- **linhas altas:** os botões de ação quebram em duas ou três linhas, e a linha passa de 52 px para 89 px nos Alertas, no Estoque e nos Painéis, e para 137 px no Software; o cabeçalho é "Ação" em umas telas e "Ações" em outras;
- **situação sem o selo:** a situação é texto solto nos Alertas, no Software e no cadastro dos Painéis, e selo no resto;
- **identificadores sem a fonte mono:** o patrimônio e o endereço dos painéis vêm na mono, mas o CNPJ, a matrícula, as faixas de IP, a versão, o IP e o código de rastreio da auditoria e o número das ordens e das solicitações, não;
- **tempo em três escritas:** "Agora" e "Há 1 d" nos coletores e nos agentes, "há 1 d" nas ordens e nas solicitações;
- **uma tabela fora do componente:** "Últimos 30 dias", dos backups do Control iD, é uma tabela HTML com o estilo dela;
- **contagem:** umas listas dizem "4 pessoas", e outras não dizem quantos itens têm.

Esta change completa o subprojeto D1 · Linguagem visual v3 da spec mestre, nas tabelas. Fica fora dela o painel da operação (`apps/painel`), que tem a casca e as tabelas dele.

## What Changes

- **A espécie da coluna:** a coluna declara o que mostra: texto, número, código, data, situação ou ações. A célula segue a coluna, sem repetir o alinhamento:
  - o número fica à direita, na mono, com algarismos tabulares, no cabeçalho e no valor;
  - o código fica na mono;
  - a data fica numa linha, com algarismos tabulares;
  - as ações ficam à direita, numa linha só, e a coluna se chama "Ações".
- **A situação no selo:** toda coluna Situação usa o rótulo de situação.
- **O tempo numa escrita:** "Agora", "Há 32 min", "Há 1 h" e "Há 2 d", pela mesma função do `@grafite/ui`.
- **Os últimos dias no componente:** a tabela dos backups do Control iD passa à tabela base.
- **A contagem em toda lista:** cada lista diz quantos itens tem, como "4 pessoas", pelo mesmo componente.
- **As telas:** as 33 telas declaram a espécie das colunas.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `componentes-base`: a espécie da coluna da tabela, a situação, o tempo e a contagem nas tabelas.

## Impact

- `packages/ui/src/componentes/tabela`: a espécie na coluna e na célula, e a contagem.
- `packages/ui/src/inicio/ocorrencias.ts`: a escrita do tempo.
- `apps/web/src/modulos`: as telas com tabela.
