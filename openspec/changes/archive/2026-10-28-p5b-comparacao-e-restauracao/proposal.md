## Why

A P5a guarda os backups dos controles Control iD, mas, sem a comparação e a restauração, eles não servem a nada na hora do problema. Quando um controle é trocado ou resetado, a TI precisa:
- conferir o que mudou;
- devolver as pessoas, os cartões, a biometria, as regras e as fotos ao controle, sem duplicar o que já está nele.

Esta change é a segunda metade do P5 · Control iD da spec mestre (seção 3.2), com o comparador de arquivos do PMG (`comparador-backups`) e a restauração dele (`controlid-restauracao`).

## What Changes

- **As operações no controle.** A restauração e a comparação são pedidos ao coletor, como o backup, e ficam numa tabela própria com a situação, as categorias e o resultado. O coletor busca o pedido, baixa o ZIP do backup pela API, fala com o controle e responde com o resultado por categoria.
- **Comparar com o controle.** Para cada categoria, a comparação conta:
  - os itens iguais nos dois lados;
  - os que estão só no backup;
  - os que estão só no controle;
  - os divergentes.
- **Restaurar.**
  - O backup vai a um controle com o backup ligado: o mesmo, ou outro que entra no lugar dele.
  - As categorias seguem a ordem das dependências: usuários, grupos, usuários dos grupos, horários, intervalos, regras de acesso, regras dos grupos, horários das regras, cartões, biometria e, por último, as fotos.
  - Dá para escolher as categorias.
  - O que já existe no controle pelo id é contado como ignorado, sem duplicar.
  - O modelo diferente gera um aviso, sem bloquear.
  - A restauração pede o código do app autenticador da conta e entra na auditoria no pedido e no resultado.
- **O comparador de backups.** Dois lados, cada um um backup do histórico ou um arquivo enviado: o ZIP do Grafite ou do PMG, ou o CSV exportado pelo próprio controle. Ele mostra, para as pessoas e os cartões:
  - quantos são idênticos;
  - os divergentes, com os campos lado a lado;
  - os que estão só de um lado.

  A senha e o sal ficam de fora da comparação.
- **A permissão `controlid.restaurar`,** por local, que inclui ver, e o evento `controlid.mudaram` nas operações.
- **Na web:**
  - "Comparar com o controle" e "Restaurar…" nas ações do backup;
  - as operações recentes na seção Backups da ficha, com o resultado;
  - a tela "Comparar backups" no menu Control iD do Ativos.

## Capabilities

### New Capabilities
- `comparacao-e-restauracao-do-control-id`: as operações no controle, a comparação com ele, a restauração, o comparador de backups e a permissão.

### Modified Capabilities
Nenhuma: os pedidos ao coletor (spec coletor-local) já cobrem as operações novas.

## Impact

- **Domínio:** a ordem da restauração, a comparação das categorias e dos arquivos, a leitura do CSV do controle, o resultado das operações, a permissão, a auditoria e o evento.
- **Banco:** a migration 0042, com as operações do Control iD e o RLS forçado.
- **API:**
  - os pedidos, a restauração com o código do app e a comparação;
  - o ZIP do pedido para o coletor e o resultado;
  - o envio dos arquivos para comparar e o comparador.
- **Coletor:** a restauração e a comparação no controle, lendo o ZIP baixado.
- **Web:** as ações do backup, as operações na ficha e a tela "Comparar backups".
- **Fora desta change:** o indicador dos backups em dia vai com os indicadores criáveis (change regras-indicadores-e-tarefas), como uma medida do catálogo.
