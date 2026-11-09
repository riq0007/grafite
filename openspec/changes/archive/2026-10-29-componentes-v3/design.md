## Context

Os componentes base ficam em `packages/ui/src/componentes`, e o dock em `packages/ui/src/casca/Dock.module.css`. Todos usam só variáveis. A fundamentos-v3 trouxe as variáveis que esta change usa:
- a superfície afundada;
- as situações com o fundo e a borda (`--cor-{situação}-fundo` e `--cor-{situação}-borda`);
- a legenda de 11 px.

O gerador garante o contraste do texto sobre a superfície afundada e o de cada situação sobre o próprio fundo.

## Goals / Non-Goals

**Goals:**
- Os componentes com o acabamento de prancheta: linhas finas, poços e selos.
- O contraste garantido pelos papéis do gerador, sem cor nova.
- O mesmo comportamento, os mesmos papéis ARIA e os mesmos testes de interação.

**Non-Goals:**
- Mudar o comportamento, a API dos componentes, os textos ou a densidade.
- Redesenhar as telas dos módulos.

## Decisions

### 1. O selo de situação

O rótulo fica com `background: var(--cor-{situação}-fundo)` e `border: 1px solid var(--cor-{situação}-borda)`, no lugar do `color-mix`. O texto vai em 11 px (legenda), maiúsculas, com 0,04 em de espaçamento e o peso forte. O raio continua o do rótulo.

O neutro mantém o fundo do texto secundário a 10%, e a borda vira a linha forte. O contraste do texto sobre o fundo sutil é o que o gerador garante.

### 2. Os botões

- **O secundário:** fica com `border-color: var(--cor-linha-forte)` sobre a superfície 2. A borda de controle (3:1) é para o campo, que precisa da fronteira para ser achado. O botão tem o rótulo, que já o identifica (WCAG 1.4.11).
- **O destrutivo:** fica com `border-color: var(--cor-critico-borda)` e o texto crítico.

### 3. Os campos como poços

A `.entrada` passa ao `background-color: var(--cor-superficie-afundada)`. A borda de controle continua: ela tem 3:1 contra a superfície ao redor, que é a cor vizinha. O texto e o de exemplo sobre a afundada têm o contraste garantido pelo gerador.

### 4. A tabela

- **O cabeçalho:** `.coluna` passa à legenda, com 11 px, maiúsculas, 0,04 em e o peso forte, no texto secundário, com a linha forte embaixo.
- **A linha selecionada:** soma ao fundo do destaque a 13% a marca `box-shadow: inset 2px 0 0 var(--cor-destaque)`. No destaque monocromático, a seleção fica visível sem depender da tinta.

### 5. O carimbo de seção

`Carimbo({ nivel = 2, children })` desenha o título de seção, como o carimbo de uma prancha:
- o texto em legenda, maiúsculas e o texto secundário;
- a linha fina, que segue até a borda.

Ele é um `h2`, ou o nível pedido, porque é título de verdade, para o leitor de tela e para a busca de títulos.

Na ficha do ativo, os títulos dos blocos dos painéis (`tituloDaParte`) passam ao mesmo desenho, pelo CSS, sem trocar o elemento.

### 6. A placa do dock

O `.item` ganha o fundo da camada de hover (`--cor-hover`) em repouso e a de pressionado no hover, com o ícone no `--cor-texto`. O módulo atual (`aria-current="page"`) ganha a borda `1px solid var(--cor-linha-forte)`. O ponto continua.

A ampliação e o movimento não mudam.

## Risks / Trade-offs

**As capturas mudam em quase todo o catálogo.** São regravadas numa tarefa própria, apagando antes as referências e conferindo por amostra.

## Migration Plan

Nada a migrar.

## Open Questions

Nenhuma.
