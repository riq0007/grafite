## Context

Cada módulo tem o `.cabecalho` dele no CSS (flex, quebra, alinhamento ao centro, o espaço e a linha embaixo) e o monta à mão: o `TituloDaJanela`, às vezes num grupo com o selo e o detalhe, e os botões logo depois. Sem um lugar para as ações, elas ficam grudadas no título.

O `Carimbo` (componentes-v3) já é o título de seção da ficha do ativo. As outras fichas usam rótulos com o CSS de cada módulo.

## Goals / Non-Goals

**Goals:**
- O mesmo cabeçalho em todas as telas, com as ações num lugar só, à direita.
- As seções das fichas com o mesmo título.
- Os dados das fichas com o mesmo desenho de rótulo e valor.

**Non-Goals:**
- Esconder ações num menu de três pontos: o ANTISLOP pede as ações frequentes à vista.
- Mudar os textos, a ordem das ações ou o comportamento.
- Redesenhar o conteúdo de cada tela.

## Decisions

### 1. O cabeçalho da página

```tsx
<CabecalhoDaPagina
  marca={<Icone … />}            // opcional: o ícone do tipo ou a foto
  titulo="OS 3"                   // o texto do TituloDaJanela
  selos={<RotuloDeSituacao … />}  // opcional: ao lado do título
  detalhe="PAT-00139 · Impressora 139" // opcional: embaixo, no texto secundário
  acoes={<>…</>}                  // opcional: à direita
/>
```

O componente desenha o `TituloDaJanela`, que continua o `h1` que recebe o foco. O cabeçalho é um `div` com a linha fina embaixo, como os `.cabecalho` dos módulos, e não um `header`: dentro da página, o `header` vira um segundo `banner`, ao lado do da barra de cima. As ações ficam num grupo com `justify-content: flex-end`, que quebra para baixo, alinhado à direita, quando a largura não comporta.

O título aceita um nó, para os títulos com a contagem, como "Alertas abertos 1 aberto".

### 2. A migração

As 46 telas com o `.cabecalho` passam ao `CabecalhoDaPagina`, módulo por módulo. Cada uma leva:
- o título, os selos e o detalhe aos lugares deles;
- as ações, na ordem de hoje, ao grupo da direita.

As telas só com o título, como as listas sem ação e os cadastros novos, também passam a ele, para a linha embaixo do título ser a mesma em todas. Os estados de carregamento, de erro e sem acesso continuam só com o `TituloDaJanela`.

Os `.cabecalho`, os `.titulo` e os `.tituloDaFicha` que ficarem sem uso saem do CSS dos módulos.

### 3. As seções e a lista de dados

- **As seções:** os títulos de seção das fichas da ordem de serviço, da solicitação, do consumível, do perfil e da regra passam ao `Carimbo`, no nível que eles têm hoje. Na seção com uma ação, como o Estoque na ficha do consumível e os indicadores da organização, o carimbo segue até a ação, à direita. Os títulos de seção das outras telas, como o Início do Operação, o cadastro das salas e as tarefas, também. As partes da Administração, cujo título recebe o foco, ficam com o elemento delas e o desenho do carimbo, como as do Ativos.
- **A lista de dados:** `ListaDeDados({ itens })`, com `itens: { rotulo, valor }[]`, desenha um `dl` em grade: o rótulo numa coluna de 10 passos, no texto secundário, e o valor ao lado. Abaixo de 480 px, pela consulta do contêiner, o rótulo fica em cima. A ordem de serviço, a solicitação, o consumível, o segredo e o fornecedor passam a usá-la, cada um com o travessão onde falta o valor, como hoje.

## Risks / Trade-offs

**Muitas telas mudam de uma vez.** Os testes das telas procuram o título pelo papel e pelo nome, e os botões pelo nome. A migração não muda nenhum dos dois, e os testes de cada módulo rodam a cada passo.

## Migration Plan

Nada a migrar.

## Open Questions

Nenhuma.
