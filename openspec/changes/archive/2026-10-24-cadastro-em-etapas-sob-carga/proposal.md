## Why

No CI do #66 (run 39813618350), o job "Lint, tipos, unitários e contratos" reprovou num teste só, sem defeito no código: o "cadastra com o modelo, os valores e a trava, de etapa em etapa", do `AtivoNovo.test.tsx`, deu "Test timed out in 15000ms". A máquina estava carregada: o arquivo levou 143,8 s, contra 20,7 s na nova tentativa do mesmo commit, e o job levou 12,5 min.

O limite de 15 s é do próprio teste. A escolhas-a-vista o deu em 13/10, quando o padrão do Vitest ainda era 5 s, porque a escolha do local pelo painel deixou o fluxo mais longo. No dia seguinte, a testes-sob-carga passou a suíte da web a 30 s. Só que o limite próprio vale mais que o da suíte, e o cadastro em etapas o manteve.

Assim, o fluxo mais longo do arquivo ficou com metade do tempo dos outros testes da web. No mesmo run, 15 testes da web levaram de 15 s a 24,7 s e passaram; só ele reprovou, aos 15 s.

A change pertence ao esqueleto técnico do F0 e à seção 12.2 da spec mestre, como a testes-sob-carga e a integracao-sob-carga, e nenhum requisito muda: o CI verifica as mesmas coisas, com o tempo da máquina carregada.

Ficam fora desta change:
- o limite da suíte da web, de 30 s, que é da testes-sob-carga: o teste mais longo dela no run reprovado levou 24,7 s, e mudá-lo pede uma change própria se outros arquivos reprovarem;
- o teste da fila da API com o limite próprio de 20 s, abaixo dos 30 s da integração (`fila.int.test.ts`), que nunca reprovou;
- deixar o cadastro mais rápido nos testes, como dividir o fluxo: o teste existe para conferir o cadastro inteiro, de etapa em etapa;
- rodar suítes pesadas na máquina do CI enquanto ele roda, que é a origem da carga e um cuidado da operação.

## What Changes

- **O limite do cadastro de etapa em etapa:** o teste deixa o limite próprio de 15 s e fica com os 30 s da suíte da web, como os outros; sai o comentário que falava dos 5 s.
- **Os outros testes longos do `AtivoNovo.test.tsx`:** conferidos, nenhum tem limite próprio, e todos ficaram abaixo da metade dos 30 s no run reprovado; nada muda neles.
- **Mapa:** o `docs/mapa.md` traz a change em andamento.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

Nenhuma: as verificações a cada PR (spec plataforma-base, "Qualidade verificada antes do commit e em cada PR") continuam as mesmas, e a change declara `skip_specs: true`.

## Impact

- **Testes:** `apps/web/src/modulos/ativos/cadastro/AtivoNovo.test.tsx`.
- **CI:** nenhum arquivo do workflow muda; o job "Lint, tipos, unitários e contratos" deixa de reprovar por esse limite.
- **Documentação:** o mapa.
