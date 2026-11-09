## Context

A motivação está em `proposal.md`, e os requisitos, nas specs desta change. Pontos de partida:
- **O backup (`packages/operacao/src/backup.ts`):** grava o dump, o zip e o manifesto numa pasta `.parcial` do primeiro destino e a renomeia no fim, para um backup pela metade nunca aparecer como pronto.
- **A distribuição (`packages/operacao/src/distribuicao.ts`):** copia o backup para os outros destinos, também numa `.parcial` renomeada no fim.
- **O pacote da versão (`apps/operacao/src/pacote.ts`):** desempacota o zip numa `.parcial` e a renomeia para a pasta da versão.
- **A falha do CI:** `EPERM: operation not permitted, rename '…\2026-10-10T0256Z.parcial' -> '…\2026-10-10T0256Z'`, no backup antes da atualização da produção, num Windows do GitHub Actions.

## Goals / Non-Goals

**Goals:**
- A pasta recém-gravada ganha o nome final mesmo com o antivírus ou o indexador conferindo os arquivos dela por um instante.
- O erro que não é passageiro continua subindo na hora, com o motivo do sistema.

**Non-Goals:**
- Mudar as outras renomeações do comando, de um arquivo só, como o Caddyfile e o estado da instalação. Elas não renomeiam uma pasta cheia de arquivos novos.

## Decisions

### 1. Uma função que insiste nos erros passageiros
- **Escolha:**
  - `renomearComPaciencia(origem, destino)`, no `packages/operacao`, tenta de novo quando o erro é EPERM, EACCES ou EBUSY.
  - As esperas começam em 100 ms e dobram até 1 s. Ela desiste quando a próxima espera passaria de 10 s somadas, e sobe o erro como veio.
  - A renomeação e a espera podem ser trocadas, para os testes não esperarem de verdade.
- **Por quê:**
  - Os três códigos são os que o Windows dá enquanto um arquivo da pasta está aberto por outro programa. Num erro de permissão de verdade, eles vêm do mesmo jeito, mas a espera tem limite, e o motivo sobe igual.
  - 10 s cobrem a conferência do antivírus nos arquivos do backup e da versão, e o backup e a atualização não ficam presos.
- **Alternativas:**
  - **O `graceful-fs`:** faz o mesmo por até 60 s, mas troca o `fs` do processo inteiro. Uma dependência para uma função de poucas linhas.
  - **Copiar no lugar de renomear:** a cópia não é atômica, e um backup pela metade poderia aparecer como pronto.

## Risks / Trade-offs

- **[Erro de permissão de verdade demora a aparecer]** → até 10 s a mais antes da mensagem, que é a mesma do sistema.
