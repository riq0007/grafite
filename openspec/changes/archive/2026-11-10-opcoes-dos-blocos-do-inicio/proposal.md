## Why

O Início já tem blocos que a conta sobe, desce e oculta, mas nenhum bloco tem opções. O "Suprimentos que acabam primeiro" mostra o item de menor nível de cada impressora, seja toner, cilindro ou fusor, e quem cuida só do toner vê o fusor a 3% no lugar dele. Em 09/11/2026 o usuário pediu para "escolher as informações que vão para a página inicial", com o exemplo "quero que mostre % de fusor ou só % de toner".

Esta change segue o subprojeto D1 · Linguagem visual v3 da spec mestre, no Início ajustável. Ficam fora dela:
- os blocos novos do Início, que são o catálogo do dashboard, em outra change;
- a tela dos padrões da organização para o Início;
- o arraste dos blocos.

## What Changes

- **Opções por bloco:** um módulo passa a poder declarar as opções do bloco dele, pelo contrato de módulo. No modo "Personalizar o Início", o bloco com opções ganha "Opções…", numa gaveta, e a escolha fica gravada na conta.
- **As opções dos suprimentos:** quais tipos entram (Toner, Cilindro, Fusor e Outros), de quais locais, quantas impressoras e até que nível. O bloco diz em texto o recorte que vale.
- **O menor nível entre os tipos escolhidos:** a API passa a responder as impressoras de menor nível só com os suprimentos dos tipos pedidos.
- **A largura do bloco:** cada bloco de módulo pode ficar com a largura inteira ou com a metade, e dois de metade ficam lado a lado na janela larga.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `tela-inicial`: as opções e a largura dos blocos, e as opções do bloco dos suprimentos.
- `preferencias-da-interface`: a largura e as opções de cada bloco, com a validação.

## Impact

- `packages/domain/src/preferencias`: o item de `inicio.blocos`, com a largura e as opções.
- `apps/api/src/preferencias/esquemas.ts`, uma rota nova de leitura em `apps/api/src/coleta/suprimentos.ts` e o contrato gerado.
- `apps/web/src/modulos/tipos.ts`: as opções no `BlocoDoInicio`.
- `packages/ui/src/inicio/OpcoesDoBloco.tsx`: a gaveta das opções, com a forma da opção, as histórias e as referências visuais.
- `apps/web/src/preferencias/listaOrdenada.ts`: as funções da ordem, que passam a levar a largura e as opções do item.
- `apps/web/src/modulos/inicio`: a resolução das opções, a largura e a grade dos blocos.
- `apps/web/src/modulos/ativos/suprimentos.tsx`: o bloco com as opções.
- `docs/casca/modulos.md` ("Blocos no Início"), a spec mestre (seção 7.6) e o mapa.
