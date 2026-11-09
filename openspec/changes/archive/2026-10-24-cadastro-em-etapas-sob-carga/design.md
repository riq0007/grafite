## Context

A suíte da web roda com `testTimeout: 30_000` no `vitest.config.ts` (testes-sob-carga, decisão 1), e cada `findBy` e `waitFor` espera a tela por até 10 s (decisão 2). Um limite passado ao `it` vale no lugar do da suíte, para mais ou para menos. Na web, só o teste "cadastra com o modelo, os valores e a trava, de etapa em etapa" tem um, de 15 s.

O teste passa pelas sete etapas da impressora: o tipo, o modelo pela busca, o patrimônio com a trava, o local pelo painel, o IP, a criticidade e o cadastro, que leva à ficha do ativo criado. Nenhum módulo da web carrega sob demanda: o tempo de cada teste é a CPU das telas, e a carga da máquina o multiplica.

Os tempos do teste e do arquivo nos logs do job dos unitários, nas 13 execuções da suíte da web no CI desde o cadastro em etapas (19/10):

| Run | Arquivo | Este teste | O mais longo dos outros |
|---|---|---|---|
| 39725202392 (sem carga) | 20,0 s | 1,8 s | 2,6 s |
| 39663246994 | 68,9 s | 10,5 s | 7,8 s |
| 39364310602 | 99,6 s | 9,7 s | 11,8 s |
| 39813618350, 1ª tentativa | 143,8 s | reprovado aos 15 s | 14,8 s |
| 39813618350, 2ª tentativa | 20,7 s | 1,9 s | 2,6 s |

No PC-DEV sem carga, os testes do arquivo somam 10,2 s, e este leva 0,9 s.

A falha se reproduz com o arquivo preso a um núcleo, disputado por processos que só gastam CPU, em prioridade baixa, com o resto da máquina livre. Com 7 processos, os testes do arquivo somaram 163 s, perto dos 144 s do run reprovado:

| Processos | Este teste, com o limite de 15 s | Este teste, com 30 s |
|---|---|---|
| 7 | passou em 14,6 s | — |
| 9 | "Test timed out in 15000ms" | passou em 26,4 s |
| 11 | "Test timed out in 15000ms" | "Test timed out in 30000ms" |

## Goals / Non-Goals

**Goals:**
- O teste tem, com a máquina carregada, o mesmo tempo que os outros testes da web.
- A conferência dos outros testes longos do arquivo fica registrada, com os tempos.

**Non-Goals:**
- Mudar o que os testes conferem ou o limite da suíte.

## Decisions

### 1. O teste com o limite da suíte

O teste deixa o limite próprio e fica com os 30 s da suíte. Os 15 s só existiam para passar dos 5 s do padrão, e, abaixo dos 30 s, deixavam o teste com metade do tempo dos outros.

Com 30 s, o teste tem o dobro do que levou numa carga parecida com a do run reprovado: com 7 processos, 14,6 s. Com 9, em que os 15 s reprovam, ele passou em 26,4 s.

O comentário do `testTimeout` no `vitest.config.ts` da web passa a dizer que o limite no `it` vale no lugar dele. Assim, o próximo teste que pedir um limite próprio sabe que ele só serve para dar mais tempo.

Alternativa descartada: um limite próprio maior, como 60 s. Foi um valor próprio que ficou para trás quando o padrão mudou. E o tempo a mais não protege o arquivo: com 11 processos, o "o Fornecedor…" também chega aos 30 s, e, no run reprovado, outros arquivos da suíte tiveram testes de até 24,7 s.

Alternativa descartada: dividir o teste. Ele confere o corpo do cadastro com o que cada etapa preencheu, e as partes perderiam isso.

### 2. Os outros testes longos do arquivo como estão

Nenhum outro teste do `AtivoNovo.test.tsx` tem limite próprio. No run reprovado, os mais longos foram:
- "o Responsável cadastra a pessoa numa aba…", 14,8 s;
- "o arquivo e a imagem aparecem…", 13,6 s;
- "Continuar para …" e "Voltar"…, 12,4 s;
- "o modelo é procurado pelo nome…", 12,1 s;
- "o Fornecedor escolhe entre os ativos…", 11,1 s;
- "a recusa da API abre a etapa do campo…", 10,4 s.

Todos ficaram abaixo da metade dos 30 s, e, nas 13 execuções, nenhum outro teste do arquivo passou de 14,8 s. Com 7 processos, o mais longo depois deste foi o "o Fornecedor…", com 12,1 s.

O primeiro teste do arquivo sente mais o núcleo único, porque o aquecimento do código também fica nele: com 7 processos, passou dos 30 s. No CI, onde o aquecimento usa os outros núcleos, ele levou no máximo 11,8 s nas 13 execuções, e 5,4 s no run reprovado.

## Risks / Trade-offs

- [Uma carga bem maior que a do run reprovado ainda reprova testes longos da web aos 30 s, deste arquivo ou de outros] → o limite da suíte é da testes-sob-carga, e uma change própria o revê com os tempos dos runs, se acontecer. A carga do run reprovado veio de fora do CI, que roda um job de cada vez: na 2ª tentativa do mesmo commit, o arquivo levou 20,7 s. A operação evita rodar suítes pesadas na máquina ao lado do CI.
- [Um travamento nesse teste leva 30 s para reprovar, no lugar de 15 s] → o mesmo dos outros testes da web, e cada espera do teste reprova antes, aos 10 s.
