## Context

A motivação está no `proposal.md`. O `CLAUDE.md` vai em todo turno; os outros documentos são lidos quando a tarefa pede. O `apps/web/src/modulos/documentacao.test.ts` já confere um documento contra o código, e o mapa ganha um teste do mesmo jeito.

## Goals / Non-Goals

**Goals:**

- Quem chega a uma tarefa acha pelo mapa a seção, a spec e o documento que ela toca, e abre só esses.
- O `CLAUDE.md` fica menor e para de crescer com cada change arquivada.
- O mapa não envelhece calado: o teste reprova a referência que deixou de existir.

**Non-Goals:**

- Encurtar a spec mestre, o ANTISLOP, o contrato de módulo ou as specs.
- Pôr índice dentro de `openspec/specs/`.

## Decisions

1. **O sumário é ponteiro, e o arquivo é a verdade.** Cada linha do mapa diz o que a seção decide e onde está, sem repetir o conteúdo. O que o mapa disser diferente do arquivo é erro do mapa. A alternativa, resumir o conteúdo, criaria uma segunda versão das regras que envelhece sem aviso.
2. **Só o `CLAUDE.md` muda entre os documentos que já existem, e só nas Referências e na regra 7.** O mapa e o `docs/agentes.md` são novos. Nada de spec colada no `CLAUDE.md`: ele aponta e não contém, porque é carregado em todo turno, e o mapa só quando a tarefa pede.
3. **As changes arquivadas ficam no `CLAUDE.md` só com o nome e o caminho, numa linha por fase.** A descrição de cada uma vai para o mapa, sem mudar o texto. Uma linha por change não deixaria o arquivo com menos linhas, como a verificação pede, porque o mapa entra como uma linha nova.
4. **A spec mestre é citada pelo número da seção, nunca pela linha.** O mapa tem uma linha por seção de 1 a 15 e por apêndice, e as subseções só onde uma decisão isolada é procurada com frequência: 3.2, 4.4, 5.2, 5.3, 5.4, 7.2, 7.4 e 12.3.
5. **"Muda junto com" sai das changes arquivadas.** Duas specs que mudaram juntas em duas ou mais changes se citam, na ordem de quantas vezes mudaram juntas.
6. **O teste-guarda nasce antes do mapa ficar completo.** Cada um dos cinco casos confere um exemplo com o erro, o que prova que ele reprova, e depois o mapa do repositório. Os casos são vistos falhando com o conferidor ainda vazio, e o mapa é completado pelo que o teste aponta. O teste lê o disco a partir da raiz do repositório e roda no `pnpm test`.
7. **O brief do agente de feature fica no `docs/agentes.md`,** copiado da proposta que originou esta change. Ele é a primeira mensagem da sessão do agente.

## Risks / Trade-offs

- [O mapa envelhece quando uma seção muda de assunto sem mudar de número] → O teste pega o que deixa de existir; o assunto é conferido por quem muda a seção, que atualiza a linha do mapa na mesma change.
- [A coluna "muda junto com" das specs centrais fica longa] → Ela segue o critério das duas changes, e a ordem por frequência põe primeiro o que mais importa.
