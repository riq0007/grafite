## Context

O P2c deixou o coletor entrando nos controles de acesso com o login do cofre (`login.fcgi`, `system_information.fcgi` e `logout.fcgi`) e a API mandando a porta, o usuário e a senha na configuração da coleta. O PMG faz o backup pela API do controle (`load_objects.fcgi` por categoria, mais o `user_get_image.fcgi` de cada usuário) e grava um ZIP com o `metadata.json`, um JSON por categoria e as fotos. A spec mestre põe o backup no coletor (6.2), o arquivo no armazenamento da API (4.2) e a retenção em 7 diários, 4 semanais e 12 mensais (6.7).

O prazo é o fim de outubro. O CI fica de lado, e a verificação é a dos testes locais.

## Goals / Non-Goals

**Goals:**
- O backup manual, em lote e agendado, feito pelo coletor que alcança o controle.
- O ZIP no formato do PMG, para os backups do PMG e os do Grafite serem lidos do mesmo jeito na P5b e na migração (P8).
- O histórico, a retenção, o download, a exclusão e o conteúdo na tela.

**Non-Goals:**
- A comparação, o comparador de arquivos, a restauração e o indicador (P5b).
- Um agendamento por controle: o horário é do tipo.

## Decisions

1. **A capacidade usa a saúde do Control iD.** O `controlid.backup` pede o `controlid.saude` no mesmo tipo e lê o campo de IP, a porta e o login dele. A configuração própria é só o `horario`. O domínio confere os dois juntos em `capacidadesPedidas`. A outra opção, repetir o IP e o login no backup, deixaria dois logins para o mesmo controle.

2. **Uma tabela, `backups_do_control_id`, é o pedido e o histórico.** As situações são `na-fila`, `em-andamento`, `sucesso`, `parcial` e `falha`, com a checagem de cada uma. O backup guarda:
   - a origem (`manual`, `agendado`), quem pediu, os momentos do pedido, do início e do fim e o coletor;
   - a chave do arquivo no armazenamento, o tamanho, os registros e as fotos;
   - a série, o firmware e o modelo;
   - as categorias (JSONB) e o erro.

   O índice único parcial `(org_id, ativo_id) where situacao in ('na-fila','em-andamento')` garante um pedido aberto por controle. A tabela tem RLS forçado. O papel da aplicação apaga, pela retenção e pela exclusão.

3. **Os pedidos são buscados pelo coletor.**
   - `GET /coleta/pedidos` pega, num `UPDATE … RETURNING`, até 2 backups na fila dos controles que são do coletor pela regra de alcance de `alvosDaColeta`, e os marca em andamento.
   - A resposta traz o IP, a porta, o usuário e a senha decifrados pelo `controlIdDosAlvos`, como a configuração.
   - O coletor responde com `PUT /coleta/pedidos/{id}/arquivo` (corpo `application/zip`, até 512 MB) ou `POST /coleta/pedidos/{id}/falha`.
   - A API lê o `metadata.json` do ZIP para o resultado, então o arquivo e o resultado não se separam.

   Um pedido por vez no coletor, a cada 15 s. A outra opção, os pedidos na configuração, de 5 em 5 minutos, deixaria o "Fazer backup agora" lento demais.

4. **O backup no coletor.**
   - O cliente HTTP da sondagem (`control-id.ts`) passa a servir também o `load_objects.fcgi` e o `user_get_image.fcgi`, com o tempo de 10 s (15 s nas fotos) e uma nova tentativa.
   - O ZIP é montado na memória pelo `yazl`, o mesmo do `@grafite/operacao`.
   - O resultado por categoria e a situação vêm de uma função pura do domínio, `resultadoDoBackup`, que a API também usa para conferir o `metadata.json`.

5. **A agenda e a expiração numa tarefa da fila.** A `backups-do-control-id` roda a cada 5 minutos, no fuso de São Paulo, e para cada organização ativa:
   - expira os pedidos (2 h na fila, 30 min em andamento);
   - põe na fila o agendado de cada controle cujo horário do tipo já passou hoje e que ainda não tem o agendado do dia.

   O dia é a data em São Paulo do `pedido_em`. Assim, a API parada no horário põe o backup quando volta, no mesmo dia, e nunca duas vezes.

6. **A retenção é uma função pura.** `backupsQueSaem(backups, agora)` recebe os backups de um controle e devolve os ids que saem:
   - fica o mais recente;
   - fica o último bom de cada dia dos últimos 7, de cada semana ISO das últimas 4 e de cada mês dos últimos 12, no fuso de São Paulo;
   - saem as falhas com mais de 30 dias.

   A API aplica a função na transação do resultado e apaga os arquivos depois do commit.

7. **O arquivo no armazenamento da API.** O ZIP é gravado por `armazenamento.gravar` com a chave `controlid/<org>/<backup>.zip`, sem entrar na tabela `arquivos`, porque ele não é um anexo de ninguém. O download lê pela chave e responde com o `Content-Disposition` do nome do controle.

8. **O conteúdo é lido do ZIP guardado.**
   - O `GET /controlid/backups/{id}/conteudo?aba=pessoas|grupos|regras|horarios&busca=&cursor=` abre o ZIP pelo `yauzl` e lê só os JSON.
   - As pessoas juntam `users`, `user_groups`, `groups` e `cards` e tiram `password` e `salt`.
   - A página tem 100 linhas, e o cursor é o deslocamento.
   - A foto vem de `GET /controlid/backups/{id}/fotos/{usuarioId}`, com o cache privado de 1 dia.

9. **As permissões, a auditoria e o evento.**
   - `controlid.ver` e `controlid.backup` são por local: o local do backup é o do controle.
   - As ações da auditoria são `controlid.backup-pedido`, `controlid.backup-concluido`, `controlid.backup-baixado`, `controlid.backup-apagado` e `controlid.backups-retidos`, este com a contagem.
   - O evento `controlid.mudaram` vai a quem vê o local do controle.

10. **Na web**, tudo dentro do Ativos:
    - a seção Backups da ficha, para o tipo com a capacidade;
    - a tela "Backups do Control iD", com o menu Control iD do Ativos;
    - o visualizador do conteúdo, numa janela sobreposta com as abas.

    O "Baixar os filtrados" pede a confirmação com a quantidade e baixa um por um, por âncoras.

## Risks / Trade-offs

- [Muitas fotos num controle grande deixam o ZIP com dezenas de MB] → O limite é de 512 MB, e o envio vai em fluxo.
- [O `create_objects` e as fotos são testados contra o simulador, e não contra um controle real] → O simulador segue as respostas do PMG. O primeiro backup real fica para quem opera conferir.
- [O CI está de lado pelo prazo] → Rodam os testes do domínio, da API (integração), do coletor e da web que a change toca.

## Migration Plan

A migration 0041 só cria a tabela. Nenhum tipo liga o backup sozinho: quem administra o liga no tipo.

## Open Questions

Nenhuma.
