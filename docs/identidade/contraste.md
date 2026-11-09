# Relatório de contraste dos tokens

Gerado por `pnpm tokens:contraste` (`packages/ui/src/tokens/relatorio-contraste.ts`). Não edite à mão.

| | |
|---|---|
| Combinações | 6 temas × 4 destaques = 24 |
| Pares de uso | 45 |
| Medições | 1080 |
| Reprovadas | 0 |

## Menor razão de cada uso

Entre as 24 combinações. Texto exige 4,5:1; componentes e bordas exigem 3:1.

| Uso | Mínimo | Menor razão | Onde |
|---|---|---|---|
| texto sobre o fundo | 4,50:1 | 14,81:1 | papel / grafite |
| texto sobre a superfície | 4,50:1 | 15,57:1 | meia-noite / grafite |
| texto sobre a superfície 2 | 4,50:1 | 14,01:1 | meia-noite / grafite |
| texto secundário sobre o fundo | 4,50:1 | 5,69:1 | papel / grafite |
| texto secundário sobre a superfície | 4,50:1 | 7,08:1 | papel / grafite |
| texto secundário sobre a superfície 2 | 4,50:1 | 6,52:1 | papel / grafite |
| texto sobre o material | 4,50:1 | 13,80:1 | meia-noite / grafite |
| texto secundário sobre o material | 4,50:1 | 6,47:1 | grafite / grafite |
| texto sobre a barra superior | 4,50:1 | 15,83:1 | meia-noite / grafite |
| texto secundário sobre a barra superior | 4,50:1 | 6,68:1 | papel / grafite |
| texto sobre linha alternada | 4,50:1 | 14,65:1 | meia-noite / grafite |
| texto do destaque sobre o fundo | 4,50:1 | 4,52:1 | alto-contraste / verde |
| texto do destaque sobre a superfície | 4,50:1 | 5,62:1 | nevoa / verde |
| texto do destaque sobre a superfície 2 | 4,50:1 | 5,19:1 | nevoa / verde |
| texto do destaque sobre o material | 4,50:1 | 5,29:1 | nevoa / verde |
| texto sobre o destaque (botão primário) | 4,50:1 | 5,15:1 | nevoa / verde |
| texto sobre o destaque em hover (botão primário) | 4,50:1 | 6,11:1 | nevoa / verde |
| texto sobre o destaque pressionado (botão primário) | 4,50:1 | 7,19:1 | nevoa / verde |
| texto sobre a superfície 2 pressionada (botão secundário) | 4,50:1 | 10,53:1 | grafite / grafite |
| texto sobre o fundo pressionado (botão terciário) | 4,50:1 | 12,10:1 | papel / grafite |
| texto crítico sobre a superfície 2 pressionada (botão destrutivo) | 4,50:1 | 5,13:1 | nevoa / grafite |
| texto crítico sobre o fundo pressionado (botão destrutivo) | 4,50:1 | 4,50:1 | papel / grafite |
| texto sobre a linha selecionada | 4,50:1 | 11,01:1 | grafite / grafite |
| destaque contra a superfície (seleção) | 3,00:1 | 5,06:1 | nevoa / verde |
| anel de foco contra o fundo | 3,00:1 | 3,86:1 | alto-contraste / verde |
| anel de foco contra a superfície 2 | 3,00:1 | 4,60:1 | alto-contraste / verde |
| borda de controle contra a superfície | 3,00:1 | 3,44:1 | meia-noite / grafite |
| anel do cursor contra o fundo | 3,00:1 | 3,84:1 | papel / grafite |
| anel do cursor contra a superfície | 3,00:1 | 4,04:1 | meia-noite / grafite |
| anel do cursor contra a superfície 2 | 3,00:1 | 3,95:1 | grafite / grafite |
| borda de controle contra a superfície 2 | 3,00:1 | 3,09:1 | meia-noite / grafite |
| rótulo de sucesso sobre a superfície tingida | 4,50:1 | 5,42:1 | nevoa / grafite |
| rótulo de sucesso sobre a superfície 2 tingida | 4,50:1 | 5,02:1 | papel / grafite |
| texto de sucesso sobre o material (aviso e menu) | 4,50:1 | 6,43:1 | nevoa / grafite |
| rótulo de atenção sobre a superfície tingida | 4,50:1 | 5,44:1 | nevoa / grafite |
| rótulo de atenção sobre a superfície 2 tingida | 4,50:1 | 5,08:1 | nevoa / grafite |
| texto de atenção sobre o material (aviso e menu) | 4,50:1 | 6,43:1 | nevoa / grafite |
| rótulo crítico sobre a superfície tingida | 4,50:1 | 5,31:1 | nevoa / grafite |
| rótulo crítico sobre a superfície 2 tingida | 4,50:1 | 4,94:1 | nevoa / grafite |
| texto crítico sobre o material (aviso e menu) | 4,50:1 | 6,44:1 | nevoa / grafite |
| rótulo de informação sobre a superfície tingida | 4,50:1 | 5,43:1 | nevoa / grafite |
| rótulo de informação sobre a superfície 2 tingida | 4,50:1 | 5,03:1 | papel / grafite |
| texto de informação sobre o material (aviso e menu) | 4,50:1 | 6,47:1 | nevoa / grafite |
| rótulo neutro sobre a superfície tingida | 4,50:1 | 6,10:1 | papel / grafite |
| rótulo neutro sobre a superfície 2 tingida | 4,50:1 | 5,53:1 | grafite / grafite |

## Como o contraste é garantido

Desde o D1 (change fundamentos-v3), as cores saem do gerador em OKLCH (`gerador.ts`). Ele move a luminosidade de cada papel, sem mudar a matiz, até o mínimo contra as superfícies em que o papel aparece.

Este relatório confere os pares de uso nas 24 combinações. Os testes do gerador conferem também a varredura de entradas: as matizes de 0 a 360, o croma da base de 0 a 0,06 e o contraste de 0 a 100. Os ajustes feitos à mão no F0 ficam no histórico do repositório.
