## Why

A fundamentos-v3 passou a gerar cada tema a partir de poucas entradas (o tom, a base, o contraste e o destaque), com o contraste garantido pelo gerador. A escolha, porém, continua presa aos seis temas e aos quatro destaques de fábrica. O usuário pediu mais controle na mão de quem usa.

O gerador já roda no navegador. Com ele, cada conta pode montar o próprio tema e o próprio destaque sem perder o mínimo de contraste da WCAG.

Esta change é a quinta etapa do subprojeto D1 · Linguagem visual v3 da spec mestre, na parte do tema personalizado. Ficam fora dela:
- o Início ajustável, que vem na change seguinte;
- os temas da organização com nome, para todos escolherem: os padrões da organização já podem trazer o tema personalizado como um ajuste qualquer.

## What Changes

- **O tema Personalizado:** um sétimo tema na seção Aparência. Quem o escolhe ajusta:
  - o tom, escuro ou claro;
  - a matiz da base, de 0 a 359 graus;
  - o tingimento dos cinzas, de 0 a 100%;
  - o contraste, de 0 a 100, com a dureza do lápis ao lado do número: de 2H, o mais leve, a 4B, o mais forte, com o HB no meio.
- **O destaque Personalizado:** um quinto destaque, com a matiz e a intensidade, que vale com qualquer tema. A intensidade 0 é o monocromático.
- **A leitura do contraste:** a seção mostra a razão de contraste do texto, do texto secundário e do destaque contra a superfície, como "Texto 15,2:1".
- **A aplicação:** a web gera as variáveis de cor do tema e do destaque personalizados com o gerador do `@grafite/ui` e as aplica no `<html>`. O tema de fábrica do mesmo tom fica por baixo, para o resto dos tokens.
- **A primeira pintura:** o script anti-flash passa a aceitar as variáveis de cor e de sombra, com os valores conferidos, para o tema personalizado aparecer já na primeira pintura.
- **As preferências:** a aparência ganha o `personalizado` e o `destaquePersonalizado`, validados campo a campo no domínio e na API, com os números presos aos limites.
- **O controle deslizante:** ganha o grau como unidade, o texto do valor feito por quem usa e a trilha pintada, como a das matizes.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `preferencias-da-interface`: os campos do tema e do destaque personalizados, os padrões de fábrica deles e a validação.
- `ajustes-do-sistema`: o tema e o destaque Personalizado na seção Aparência, com a leitura do contraste.
- `design-tokens`: o tema e o destaque gerados em tempo de execução, e a primeira pintura com eles.
- `componentes-base`: o grau, o texto do valor e a trilha pintada no controle deslizante.

## Impact

- `packages/domain/src/preferencias`: o modelo, os leitores e os padrões.
- `apps/api/src/preferencias/esquemas.ts` e o contrato gerado (`packages/api-client`).
- `packages/ui/src/tokens`: as declarações de cor separadas do gerador do CSS, para rodar no navegador.
- `packages/ui/src/componentes/deslizante`: o controle deslizante.
- `apps/web/src/preferencias` e `apps/web/index.html`: os atributos, a aplicação e o anti-flash.
- `apps/web/src/modulos/ajustes/secoes/Aparencia.tsx`: a seção Aparência.
