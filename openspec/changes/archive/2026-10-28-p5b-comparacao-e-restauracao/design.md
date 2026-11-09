## Context

A P5a deixou o backup do Control iD como um pedido ao coletor (`GET /coleta/pedidos`, ZIP pelo `PUT /coleta/pedidos/{id}/arquivo`, falha pelo `POST .../falha`), com o ZIP no formato do PMG guardado no armazenamento da API. O PMG compara e restaura pelo servidor dele, que fala direto com o controle. No Grafite quem fala com o controle é o coletor.

## Goals / Non-Goals

**Goals:** a comparação com o controle, a restauração com as dependências e o comparador de dois lados.

**Non-Goals:** o indicador dos backups em dia, que vai com os indicadores criáveis, e apagar no controle o que não está no backup, que fica fora: a restauração só cria.

## Decisions

1. **A tabela `operacoes_do_control_id`** (migration 0042) guarda:
   - o backup, que sai em cascata com ele, e o controle de destino;
   - o tipo (`restauracao`, `comparacao`) e as categorias escolhidas (texto[], nulo para todas);
   - quem pediu, os momentos e o coletor;
   - o resultado (JSONB por categoria), o aviso do modelo e o erro.

   Ela tem as situações e o fim coerente do backup, o índice único da operação aberta por controle e o RLS forçado.

2. **Os mesmos pedidos ao coletor.**
   - O `GET /coleta/pedidos` passa a entregar também as operações na fila, depois dos backups, com o `tipo`, o `backupId` e as categorias.
   - O coletor baixa o ZIP por `GET /coleta/pedidos/{id}/arquivo`, só do pedido em andamento com ele.
   - Ele responde com `POST /coleta/pedidos/{id}/resultado` (as categorias) ou com a falha de sempre.
   - A rota da falha passa a achar o pedido nas duas tabelas, porque os ids não se repetem.
   - A expiração da P5a passa a cobrir as operações.

3. **A comparação e a restauração no domínio:**
   - a ordem da restauração;
   - a chave de cada item: o id, ou os ids ligados nas categorias de ligação;
   - `compararCategoria`, sem `password` nem `salt`;
   - `resultadoDaOperacao`, pelas categorias processadas.

   O coletor usa o domínio. O comparador da API usa a `compararTabelas`, com os campos divergentes, e a `lerCsvDoControlId`, que lê o bloco `cid_data` do CSV do controle, como o PMG.

4. **A restauração no coletor:**
   - entra no controle e, para cada categoria escolhida na ordem, lê o que ele tem pelo `load_objects.fcgi` e cria o que falta pelo `create_objects.fcgi`, um item por vez, com `values` em lista;
   - manda as fotos pelo `user_set_image.fcgi?user_id=<id>`, com o JPEG no corpo;
   - a categoria que não se lê no controle segue criando, e o erro de cada item fica com o id.

5. **O código do app na restauração.**
   - O pedido leva o `codigo`, conferido pelo `conferirCodigoDaConta` da liberação do Cofre, que já grava a tentativa.
   - O código de recuperação é recusado como incorreto.
   - É uma confirmação de uso único, sem janela de liberação.

6. **O comparador na API.**
   - O arquivo enviado vai em bytes (`application/zip` ou `text/csv`) para `POST /controlid/comparador/arquivos` e fica num mapa na memória por 30 minutos, com um id. Assim ele não toca o banco nem o disco.
   - O `POST /controlid/comparador` recebe os dois lados, cada um `{ backup }` ou `{ arquivo }`, lê as tabelas e devolve o resultado das pessoas e dos cartões.

7. **Na web:**
   - "Comparar com o controle" e "Restaurar…" nas ações do backup, conforme a permissão. O diálogo da restauração tem o controle de destino, as categorias, o aviso do modelo e o código do app.
   - As operações recentes do controle aparecem na seção Backups, com o resultado por categoria.
   - A tela "Comparar backups" fica no menu Control iD, com os dois lados, cada um um backup do histórico ou um arquivo.

## Risks / Trade-offs

- [O `create_objects` com o id do backup pode ser recusado por um firmware] → O erro do item fica no resultado com o id, e a restauração segue.
- [O CSV do controle muda entre os firmwares] → A leitura segue a do PMG, que já lê os CSV da empresa.

## Migration Plan

A migration 0042 só cria a tabela. Ninguém ganha `controlid.restaurar` sozinho, fora o Administrador.

## Open Questions

Nenhuma.
