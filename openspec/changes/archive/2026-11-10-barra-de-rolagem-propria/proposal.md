## Why

A casca imita o macOS, mas toda área que rola mostra a barra de rolagem do Windows: larga, cinza e igual em qualquer tema. Nenhuma folha de estilo do projeto define a barra hoje. Em 09/11/2026 o usuário pediu "trocar a barra de rolagem por uma própria do sistema".

Esta change segue o subprojeto D1 · Linguagem visual v3 da spec mestre, na casca. Ficam fora dela:
- uma barra desenhada em JavaScript, no lugar da rolagem do navegador;
- as faixas esmaecidas da janela e da tabela, que continuam como estão;
- as áreas que hoje escondem a barra de propósito, como a barra das abas.

## What Changes

- **A barra própria:** a janela, as tabelas, os menus, as gavetas e os painéis passam a ter a mesma barra: fina, sem o trilho pintado, com o polegar arredondado numa cor do tema. Vale também no painel da operação e no catálogo, que usam a mesma base de estilos.
- **Discreta de fábrica:** o polegar aparece com o ponteiro sobre a área, enquanto ela rola e com o foco do teclado nela, e some 1 s depois. O espaço da barra fica reservado, e o conteúdo não muda de lugar.
- **"Sempre visível":** a seção Aparência dos Ajustes ganha a escolha "Barra de rolagem", com "Ao rolar" e "Sempre visível", gravada na conta, com o padrão da organização.
- **A barra do sistema onde ela já é sobreposta:** no celular, no tablet e no macOS com a barra automática, vale a barra do sistema.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `componentes-base`: a barra de rolagem própria em toda área que rola.
- `ajustes-do-sistema`: a escolha da barra de rolagem na seção Aparência.
- `preferencias-da-interface`: a preferência da barra de rolagem, com o padrão de fábrica e a validação.

## Impact

- `packages/ui/src/base.css`: as regras da barra.
- `packages/ui/src/casca`: a marca da área que rola e a medida da barra do sistema, chamadas na partida da web, do painel da operação e do catálogo.
- `packages/domain/src/preferencias`: o campo `aparencia.barraDeRolagem`.
- `apps/api/src/preferencias/esquemas.ts` e o contrato gerado.
- `apps/web/src/preferencias/preferencias.ts` e `apps/web/index.html`: o atributo da raiz, antes da primeira pintura.
- `apps/web/src/modulos/ajustes`: a seção Aparência e a lista dos ajustes da busca.
- As referências da regressão visual em que a barra aparece.
- A spec mestre (seção 7.2 e Apêndice B) e o mapa.
