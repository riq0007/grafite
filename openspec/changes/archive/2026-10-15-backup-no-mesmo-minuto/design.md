## Context

O motivo está em `proposal.md`. O ponto de partida, em `packages/operacao`:

- **O nome:** `nomeDoBackup` dá o minuto em UTC, e o `fazerBackup` monta a `.parcial` no primeiro destino com esse nome. Depois, o `distribuirBackup` copia o backup para os outros destinos com o mesmo nome.
- **A leitura dos nomes:**
  - o `backupsProntosNoDestino` reconhece só `AAAA-MM-DDTHHmmZ` e ordena pelo texto;
  - o mais novo é o último da lista, que a restauração, o teste de restauração e os registros pegam com `.at(-1)`;
  - a retenção tira o momento do nome.
- **A restauração pelo nome** junta o nome pedido à pasta dos backups do primeiro destino, sem conferir o formato.

## Goals / Non-Goals

**Goals:**
- Um backup novo nunca reaproveita o nome de um backup pronto, em nenhum destino.
- Os nomes de hoje, sem sufixo, continuam lidos e ordenados como antes.

**Non-Goals:**
- Serializar dois backups ao mesmo tempo: o backup agendado e o pedido pelo comando já não correm juntos.

## Decisions

### 1. O nome livre antes da `.parcial`

O `fazerBackup` escolhe o nome antes de montar a `.parcial`, por uma função nova da distribuição, `nomeLivre(destinos, nome)`:
- ela devolve o nome do minuto quando nenhum destino tem um backup pronto com ele;
- senão, devolve o primeiro `nome-N` livre em todos os destinos, a partir de N = 2.

O nome escolhido vale para todos os destinos, e o `distribuirBackup` não muda.

**Alternativa:** os segundos no nome de todo backup. Isso mudaria o formato que o runbook, a ajuda do comando e a restauração pelo nome citam, para resolver um caso de borda.

**Alternativa:** esperar o minuto virar. O comando ficaria parado até 60 s sem motivo visível para quem opera.

### 2. O padrão e a ordem dos nomes

- **O padrão:** passa a `^(\d{4}-\d{2}-\d{2})T(\d{2})(\d{2})Z(?:-(\d+))?$`, e o momento continua vindo do minuto.
- **A ordem:** compara o nome sem o sufixo e, empatado, o número do sufixo, com o nome sem sufixo valendo 1. Ordenar pelo texto puro poria o `-10` antes do `-2`.
- **A retenção:** o momento vem do minuto do nome, e o sufixo o desempata em milissegundos: o `-2` vale 1 ms depois do nome sem sufixo. Sem esse desempate, os dois teriam o mesmo momento, e a retenção, que guarda o primeiro de cada período no empate, veria o nome sem sufixo como o mais novo e poderia apagar o `-2` recém-feito.

### 3. A restrição da pasta no banco

A tabela `operacao.backups` guarda a pasta de cada backup, e a restrição `backups_pasta_valida` aceitava só `AAAA-MM-DDTHHmmZ`. A migration `0032_backups_no_mesmo_minuto` a troca por `^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{4}Z(-[0-9]+)?$`, o mesmo padrão da distribuição. As linhas que já existem continuam válidas.

## Risks / Trade-offs

- **Dois backups começando juntos:** dois processos, no mesmo instante, podem escolher o mesmo nome livre, porque a escolha e a renomeação não são atômicas. O backup agendado e o pedido pelo comando não correm juntos, e o caso fica de fora (Non-Goals).
