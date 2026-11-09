## Why

O Grafite já sonda os controles de acesso Control iD (P2c), mas não guarda o que está dentro deles. Se um controle queima ou é resetado, as pessoas, os cartões, a biometria, as fotos e as regras de acesso se perdem. Hoje o backup ainda é feito no PMG, que guarda só o último de cada controle.

Esta change é a primeira metade do P5 · Control iD da spec mestre (seções 3.2, 5.4, 6.2 e 6.7). Ela faz o backup:
- manual, em lote e agendado;
- com histórico e retenção;
- com o download e a visualização do conteúdo.

A comparação e a restauração ficam para a P5b.

## What Changes

- **A capacidade `controlid.backup` (Backup do Control iD):**
  - ligada no tipo junto com a saúde do Control iD, cujo IP, porta e login ela usa;
  - com o horário do backup diário, às 02:00 por padrão.
- **Os pedidos ao coletor.** O coletor busca na API, a cada 15 segundos, os backups na fila dos controles que ele alcança. Para cada um, ele:
  - entra no controle;
  - lê as informações do sistema e as dez categorias (usuários, grupos, usuários dos grupos, cartões, biometria, regras de acesso, regras dos grupos, horários, intervalos e horários das regras), além das fotos;
  - monta o ZIP no formato do PMG e o envia à API.

  Uma categoria que falha não para as outras. Um backup é Sucesso, Parcial ou Falha.
- **O backup na fila:**
  - pedido pela ficha do controle ("Fazer backup agora") ou pela tela dos backups ("Backup de todos os controles");
  - ou posto na fila pela agenda, uma vez por dia, no horário do tipo, no fuso de São Paulo.

  Um backup que o coletor não busca em 2 horas, ou não termina em 30 minutos, vira Falha, com o motivo.
- **A retenção da spec mestre (6.7):** de cada controle ficam o backup bom de cada um dos últimos 7 dias, de cada uma das últimas 4 semanas e de cada um dos últimos 12 meses, e sempre o mais recente. As falhas ficam 30 dias.
- **O histórico:**
  - na ficha do controle e na tela "Backups do Control iD" do Ativos, com o filtro pelo controle e pela situação;
  - com o download do ZIP e a exclusão.
- **O conteúdo do backup na tela.** As pessoas aparecem com a foto, a matrícula, os cartões e os grupos. Também aparecem os grupos, as regras de acesso e os horários, com a busca, sem baixar o arquivo.
- **As permissões:**
  - `controlid.ver`: ver os backups e o conteúdo deles;
  - `controlid.backup`: fazer e apagar.

  As duas valem no local do controle.
- **O evento `controlid.mudaram`** e a auditoria do pedido, do resultado, do download e da exclusão.

## Capabilities

### New Capabilities
- `backup-do-control-id`: a capacidade, os pedidos, o arquivo, a retenção, a agenda, o histórico, o download, o conteúdo, as permissões e o evento.

### Modified Capabilities
- `coletor-local`: os pedidos que o coletor busca e responde, além da configuração e dos lotes.

## Impact

- **Domínio (`packages/domain`):**
  - a capacidade no catálogo;
  - as categorias e a ordem delas;
  - o resultado do backup;
  - a retenção;
  - as permissões, as ações da auditoria e o evento.
- **Banco (`packages/db`):** a migration 0041, com os backups do Control iD e o RLS forçado.
- **API (`apps/api`):**
  - os pedidos e o arquivo do coletor;
  - a lista, o pedido, o download, o conteúdo, as fotos e a exclusão;
  - a agenda e a expiração na fila de tarefas;
  - o contrato e o cliente gerados de novo.
- **Coletor (`apps/collector`):** a busca dos pedidos, a leitura do controle, o ZIP pelo `yazl` e o envio.
- **Web (`apps/web`):** a seção Backups na ficha do controle, a tela "Backups do Control iD" e o visualizador do conteúdo.
- **Fora desta change:** a comparação, o comparador de arquivos, a restauração e o indicador dos backups ficam para a P5b.
