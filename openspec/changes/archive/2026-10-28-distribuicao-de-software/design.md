## Context

A tarefa Deploy do agente do GLPI fala com o servidor pelo cliente "Fusion", por GET, com os argumentos na query string. Os argumentos de hash vão como `task[Deploy]=3.0`, e a resposta é JSON. A sequência é esta:

1. **`getConfig`.** O agente manda `action=getConfig&machineid=<deviceid>&task[Deploy]=<versão>` ao endereço do servidor e espera `{ "schedule": [ { "task": "Deploy", "remote": "<url>" } ] }`.
2. **`getJobs`.** Ele manda `action=getJobs&machineid=<deviceid>&version=<versão>` ao `remote` e espera:
   - `jobs`: cada job com o `uuid` (hexadecimal e hífens), `checks`, `actions` e `associatedFiles` (a lista dos SHA-512);
   - `associatedFiles`: o mapa pelo SHA-512 do arquivo inteiro, com `name`, `multiparts` (os SHA-512 das partes), `mirrors`, `p2p`, `p2p-retention-duration` e `uncompress`.
3. **As partes.** Cada parte é baixada por GET em `<mirror>/<a>/<ab>/<sha512>` e conferida pelo SHA-512.
4. **A montagem.** O agente lê as partes com o `gzopen` e as junta na ordem, no arquivo com o `name`. O arquivo montado é conferido pelo SHA-512 da chave.
5. **A ação `cmd`.** Ela roda o `exec` como o sistema. Os `retChecks` (`okCode` com os `values`) decidem o sucesso, e as últimas linhas da saída vão para a mensagem.
6. **O `setStatus`.** Cada passo vai por GET ao `remote`:
   - os campos são `action=setStatus`, `machineid`, `part=job`, `uuid`, `currentStep`, `status` (ok ou ko, só quando há) e `msg`;
   - o passo final vem sem o `currentStep`, com `status=ok` e `msg=job successfully completed`.

O agente escuta na porta 62354. O `/now` faz ele rodar na hora, para os servidores em que ele confia.

## Goals / Non-Goals

**Goals:**
- a base dos pacotes, com o arquivo pronto para o agente;
- a distribuição a várias máquinas, com a situação, o log e o histórico;
- o atendimento fiel ao Deploy do agente, sem instalar nada novo nas máquinas.

**Non-Goals:**
- As verificações antes da instalação (`checks`) e as interações com o usuário. Os jobs vão com `checks` vazio.
- O P2P entre agentes. Os jobs vão com `p2p` 0.
- O agendamento da distribuição para uma data, e a repetição.
- Desinstalar e atualizar pelo inventário. O pacote de desinstalação é só outro pacote.

## Decisions

1. **As partes são guardadas prontas.**
   - No envio, o arquivo é cortado em pedaços de 8 MB, e cada pedaço é comprimido pelo gzip.
   - O SHA-512 é calculado sobre o pedaço comprimido, que é o que o agente baixa e confere.
   - As partes vão para o armazenamento em `<org>/<pacote>/parte-<n>`, e o índice fica em `partes_dos_pacotes`.
   - O SHA-512 do arquivo inteiro fica no pacote.
   - O `gzopen` do agente lê as partes comprimidas e devolve o arquivo original.
2. **O Deploy usa o mesmo endereço dos agentes,** por GET, com a `action`:
   - o `remote` do `getConfig` é o próprio endereço, como a tela o gerou, com o `/api` (no desenvolvimento, o proxy da web tira o `/api` antes de a API ver o caminho);
   - o espelho é `<endereço>/partes/`;
   - a rota das partes confere o token e serve só as partes dos pacotes da organização.
3. **O job tem uma ação `cmd`:**
   - o `exec` é o comando do pacote;
   - os `retChecks` são `[{ type: 'okCode', values: [códigos] }]`;
   - o `logLineLimit` é 20;
   - sem arquivo, o job vai com a lista `associatedFiles` vazia, que o agente exige.
   - O `uuid` do job é o id da máquina na distribuição.
4. **A situação da máquina vem dos passos.**
   - O `getJobs` passa a máquina de "aguardando" a "em andamento".
   - Cada `setStatus` grava a etapa (o `currentStep`) e uma linha do log: a etapa, o `status` e a `msg`.
   - O `status` "ko" leva a "falhou".
   - A mensagem "job successfully completed" com o `status` "ok" leva a "concluída".
   - O log fica num `text[]` com as últimas 200 linhas.
5. **O "Pedir agora" sai da API,** com um GET em `http://<ip>:62354/now` para cada máquina aguardando, em paralelo e com 5 s de prazo. O IP é o último que o agente informou.
6. **A tela fica em Ativos › Software,** com as abas Base e Distribuições.
   - A Base tem a busca, a tabela, o "Novo pacote" e o "Distribuir".
   - A distribuição escolhe as máquinas pela busca dos ativos que têm o agente ligado.
   - A ficha da distribuição tem a tabela das máquinas, com o log aberto por máquina.
   - A ficha do ativo ganha "Distribuições" na aba Softwares.
7. **O upload do arquivo é `PUT /software/pacotes/:id/arquivo`,** com o corpo binário, até 512 MB e o nome na query `nome`, como nos outros envios de arquivo. O `GET` no mesmo caminho devolve o arquivo montado das partes, para quem vê a base conferir o que as máquinas recebem.

## Risks / Trade-offs

- **[O comando roda como o sistema em várias máquinas]** → Só quem tem `software.administrar` cria e muda o comando. Cada distribuição fica na auditoria, com quem a criou e as máquinas.
- **[O arquivo grande na memória durante o envio]** → O limite é 512 MB, e as partes são gravadas uma a uma.
- **[O agente não confia no Grafite para o `/now`]** → O "Pedir agora" diz quantos responderam. Os outros pegam a tarefa no próximo contato.
