## 1. A documentação

- [x] 1.1 Escrever o ANTISLOP v3, a regra 3 do `CLAUDE.md` e a spec mestre.
  - No ANTISLOP v3:
    - o "O que mudou da v2" e os quatro princípios, com a pergunta de cada um;
    - a seção 12, com a cor gerada e o destaque Grafite;
    - a seção 13, com as situações completas;
    - a seção 14, com o numeral e a legenda;
    - a seção 15, com o raio de fábrica de 10 px;
    - a seção 16, com a elevação em quatro superfícies;
    - a seção 31, com a paleta de dados e as tintas;
    - a seção 42, com as três camadas e o catálogo em Fundamentos.
  - Na spec mestre: o D1 na seção 3.2 e o Apêndice A apontando para o gerador, com as entradas dos temas e dos destaques.
  - No mapa: a change em andamento.

  Verificar: o `scripts/mapa.test.ts` passa.

## 2. O gerador

- [x] 2.1 Escrever primeiro os testes e depois o `oklch.ts`:
  - a conversão do OKLCH para o sRGB em hexadecimal e de volta;
  - a perda de croma fora do gamute, com a luminosidade e a matiz iguais.

  Verificar: o `oklch.test.ts` passa com o branco, o preto, o vermelho do sRGB e uma cor fora do gamute.
- [x] 2.2 Escrever primeiro os testes e depois o `gerador.ts` dos temas:
  - os papéis por tom e por contraste (design, decisão 3);
  - o `garantirContraste`;
  - o fundo do OLED.

  Verificar: os testes passam com a varredura de matizes de 0 a 360, em passos de 15, do croma da base de 0 a 0,06 e do contraste de 0 a 100, e com os mínimos de todos os pares.
- [x] 2.3 Escrever primeiro os testes e depois os destaques gerados (decisão 5):
  - o monocromático e o com croma;
  - o texto sobre o preenchimento;
  - o texto do destaque e o foco.

  Verificar: os testes passam, inclusive com o amarelo de croma 0,2 no Papel e no OLED.
- [x] 2.4 Escrever primeiro os testes e depois as situações completas e a paleta de dados, com as séries e as tintas (decisões 7 e 8). Verificar: os testes dos mínimos passam em todos os temas e na varredura.

## 3. Os tokens

- [x] 3.1 Passar os seis temas e os quatro destaques a entradas do gerador (`temas.ts` e `destaques.ts`), com os pares do `contraste-pares.ts` e o relatório. Verificar: o `pnpm tokens:contraste` grava as 24 combinações aprovadas, e os testes de contraste passam.
- [x] 3.2 Escrever primeiro os testes e depois o `gerar.ts`, com as variáveis novas e o raio de fábrica de 10 px.
  - As variáveis novas: as superfícies, as sombras, as situações completas, as séries, as tintas, o numeral e a legenda.
  - Rodar o `pnpm tokens:gerar`.

  Verificar: o `gerar.test.ts` passa, e o `pnpm tokens:verificar` não acusa diferença.

## 4. Os padrões de fábrica

- [x] 4.1 Escrever primeiro os testes e depois o destaque Grafite e o raio de 10 px:
  - nos padrões do domínio;
  - no anti-flash;
  - na ordem dos destaques da Aparência, com o Grafite primeiro.

  Ajustar os testes da web e os ponta a ponta que contam com o azul de fábrica.

  Verificar: os testes de preferências e da Aparência passam, e os specs mudados do `pnpm test:e2e` também.

## 5. O catálogo

- [x] 5.1 Criar as páginas de Fundamentos no catálogo:
  - a cor, com os papéis de cada tema;
  - a elevação;
  - as situações;
  - os dados, com as séries e as tintas;
  - a tipografia, com a escala, o numeral e a legenda.

  Verificar: o `pnpm test:stories` passa com as páginas novas.

## 6. Fechamento

- [x] 6.1 Regravar todas as capturas da regressão visual, que mudam de cor, apagando antes as referências. Conferir por amostra o Grafite e a Névoa. Verificar: o `pnpm test:visual` passa.
- [x] 6.2 Conferir as verificações:
  - `pnpm lint`;
  - `pnpm typecheck`;
  - `pnpm test`;
  - `openspec validate fundamentos-v3 --strict`;
  - no `pnpm dev`, a casca no tema de fábrica.

  Verificar: os comandos passam, e a tela mostra o destaque Grafite.

  Feito em 29/10: o lint, o typecheck, os testes dos dez pacotes e a validação passaram. No `pnpm dev`, a conta de desenvolvimento, que tem o azul e o raio de 8 px salvos, continua com eles na paleta nova, como no cenário "Quem já escolheu o azul". O tema e o destaque Grafite da própria tela dão o `#eeeff1` sobre o `#0c0e10`, e a raiz do CSS tem o raio de 10 px.
