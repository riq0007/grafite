## 1. As preferências

- [x] 1.1 Escrever primeiro os testes e depois, no domínio, o tema e o destaque personalizados: o `personalizado` no tema e no destaque, os campos `personalizado` e `destaquePersonalizado`, os padrões de fábrica e os leitores, com os limites (design, decisão 1). Verificar: os testes do domínio passam com "Matiz fora do intervalo" e "Tom desconhecido".
- [x] 1.2 Escrever primeiro o teste e depois os esquemas da API para os campos novos, e regerar o contrato. Verificar: o teste da gravação passa com "Gravação de um tom desconhecido", e o `pnpm contrato:verificar` passa.

  Feito em 29/10: o teste falhou com 400 antes dos esquemas, que entraram no commit da 1.1 porque o tipo novo do domínio não compila sem eles, e passou depois. O contrato está em dia.

## 2. Os tokens e o controle

- [x] 2.1 Separar as declarações de cor do `gerar.ts` em `declaracoes.ts` e escrever primeiro os testes e depois o `temaPersonalizado`, o `destaquePersonalizado`, o `variaveisDeCor`, o `lapisDoContraste` e o `trilhaDasMatizes` (decisões 2 e 6). Verificar: o `pnpm tokens:verificar` passa sem mudar o `tokens.css`, e os testes passam com o tema personalizado igual ao Grafite nos padrões.
- [x] 2.2 Escrever primeiro os testes e depois o grau, o texto do valor, o texto para o leitor e a trilha pintada no `ControleDeslizante`, com a história (decisão 7). Verificar: o teste passa com "Texto do valor dado por quem usa", e o `pnpm test:stories` do controle passa sem violação de acessibilidade.

## 3. A web

- [x] 3.1 Escrever primeiro os testes e depois os atributos e a aplicação do tema e do destaque personalizados no `<html>`, e a regra das cores no anti-flash (decisões 3 e 4). Verificar: os testes passam com "Reabertura com o tema personalizado", "Volta a um tema de fábrica" e "Valor estranho na cópia".
- [x] 3.2 Escrever primeiro os testes e depois, na seção Aparência, o tema e o destaque Personalizado, o construtor, o lápis e a leitura do contraste (decisões 5 e 6). Verificar: os testes passam com "Montar o próprio tema", "Lápis do contraste" e "Destaque monocromático pela intensidade", e o `pnpm dev` mostra o construtor.

  Feito em 29/10: no `pnpm dev`, o Personalizado abre o tom, a matiz em graus, o tingimento e o contraste com "HB, 45 de 100"; com o Claro e a matiz 80, o `<html>` passa ao Névoa por baixo, com o fundo quente gerado, e a leitura mostra "Texto 18,4:1 · Secundário 7,1:1 · Destaque 5,5:1". A conta de desenvolvimento voltou ao Grafite.

## 4. Fechamento

- [x] 4.1 Atualizar a spec mestre (a seção 7.2 e o Apêndice A) e o mapa. Verificar: os testes do mapa e da documentação passam.
- [x] 4.2 Conferir as verificações:
  - `pnpm lint`;
  - `pnpm typecheck`;
  - `pnpm test`;
  - `openspec validate tema-personalizado --strict`.

  Verificar: os comandos passam.

  Feito em 29/10: o lint, o typecheck, os testes dos dez pacotes e a validação passaram.
