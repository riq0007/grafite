## Why

A spec mestre manda que cada subprojeto passe pelo fluxo do OpenSpec e que o `CLAUDE.md` traga as regras e os comandos (seção 12.1), e, da paridade em diante, que o trabalho se divida entre o orquestrador e agentes de feature em worktrees (seção 12.3). O P1 é a fase 2, e o contexto ficou caro:

- três documentos longos sem sumário (a spec mestre, o `docs/ANTISLOP.md` e o `docs/casca/modulos.md`), lidos inteiros por quem precisa de uma seção;
- as 42 specs de `openspec/specs/` sem índice, sem glossário e sem dizer quais mudam juntas;
- as Referências do `CLAUDE.md`, que vai em todo turno, viraram um registro das changes, com uma descrição longa por change arquivada;
- nenhum documento diz como um agente de feature é despachado e o que ele entrega.

Esta change não implementa um subprojeto da seção 3.2: ela aplica a forma de trabalho da seção 12 à fase 2. Fica fora dela qualquer mudança de código, de spec ou da casca.

## What Changes

- **`docs/mapa.md`:** o mapa dos documentos, das specs e das changes, com o glossário. Ele aponta para o arquivo que decide e não repete o conteúdo.
- **Teste-guarda do mapa:** um teste no `pnpm test` reprova a capacidade que falta na tabela, a que não existe, o caminho que não existe, a seção da spec mestre que não existe e o termo do glossário que aponta para o que não existe.
- **`CLAUDE.md`:** as Referências começam pelo mapa, e cada change arquivada fica só com o nome e o caminho; a descrição dela vai para o mapa. A regra 7 aponta para o `docs/agentes.md`.
- **`docs/agentes.md`:** os papéis do orquestrador e do agente de feature, uma sessão por change numa worktree, o pedido de mudança compartilhada, a entrega, o esforço, o ritmo pela janela de uso e o brief do agente.
- O conteúdo da spec mestre, do ANTISLOP, do contrato de módulo e das specs não muda.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

Nenhuma: nenhum requisito muda, e a change declara `skip_specs: true`.

## Impact

- Documentação: `docs/mapa.md` e `docs/agentes.md` novos; `CLAUDE.md` nas Referências e na regra 7.
- Testes: `apps/web/src/modulos/mapa.test.ts`, ao lado do teste que já confere o contrato de módulo.
- Processo: da próxima change em diante, a sessão orquestradora não implementa tarefa de feature.
