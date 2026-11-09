## Why

Em 28/10 o usuário apontou o visual como "desconexo, sem grade, mal justificado e com informação pequena":
- as tabelas ficam do lado esquerdo e não ocupam a janela quando têm poucas colunas;
- o texto e os controles são pequenos;
- as ações principais, como "Nova solicitação" e "Nova OS", ficam longe do foco, no canto da tela;
- a ficha do ativo espalha os blocos sem uma grade.

Os componentes do catálogo (Storybook) estão bons. O problema é como as telas os arrumam. Esta change reorganiza o layout de todas as abas, sem trocar os componentes. Ela é ligada ao F0 (identidade e design system) e ao F1 (casca) da spec mestre, nas seções 7.8 e 7.10 (o ANTISLOP).

## What Changes

- **A escala maior.**
  - O texto passa a ter 12, 13, 14, 16, 20 e 26 px: rótulo, dado, corpo, subtítulo, título e título grande.
  - As densidades sobem: a compacta para 36 px de linha e 32 de controle, a normal para 44 e 36, e a confortável para 52 e 40.
  - A densidade de fábrica passa a ser a Normal.
- **As tabelas na largura toda.** A coluna sem largura guardada divide o espaço que sobra, e a principal fica com o dobro. Assim a tabela com poucas colunas ocupa a janela. A linha que abre algo muda ao passar o ponteiro.
- **O cabeçalho das telas numa grade só.**
  - O título vem à esquerda, com a ação principal logo ao lado, maior e em destaque, e as outras ações depois.
  - Uma linha separa o cabeçalho do conteúdo.
  - As telas de todos os módulos passam a seguir o mesmo espaçamento.
- **O Início do Operação.**
  - O módulo abre num painel com as ações principais em blocos grandes: pedido de toner, conserto, equipamento, nova ordem de serviço e o estoque.
  - Abaixo vêm os atalhos para as listas, conforme as permissões.
- **A ficha do ativo numa grade.**
  - Os blocos da Visão geral viram cartões lado a lado.
  - Os campos dos cartões usam a largura da janela, o que deixa legível o cartão do Software.
  - "Salvar alterações" fica numa barra presa ao fim do cartão.

## Capabilities

### New Capabilities
Nenhuma.

### Modified Capabilities
- `design-tokens`: as densidades, com a Normal de fábrica, e a escala do texto.
- `preferencias-da-interface`: a densidade normal nos padrões de fábrica.
- `iconografia`: a miniatura de 24 px na densidade compacta.
- `componentes-base`: a tabela na largura toda e a ação principal da tela em destaque.
- `modulo-operacao`: o Início do Operação, com as ações principais, para onde o dock leva.

## Impact

- **`packages/ui`:** os tokens gerados de novo, a tabela e as histórias.
- **`packages/domain`:** a densidade de fábrica.
- **`apps/web`:** o CSS do cabeçalho e da tela nos módulos, a ficha do ativo e o Início do Operação.
- **A regressão visual muda em quase todas as capturas.** As referências são regravadas depois do prazo, com o CI de volta.
