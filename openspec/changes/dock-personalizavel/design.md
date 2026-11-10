## Context

A ordem do dock vem do `REGISTRO` (`apps/web/src/modulos/registro.ts`). O `registroDaConta` tira o que a conta não vê e o que a organização desligou, e o `modulosDaCasca` separa os Ajustes, que vão para o fim (`modulosDoFim`).

O `Dock` do `@grafite/ui` recebe `modulos` e `modulosDoFim`. Quando não cabem todos, ele mostra os primeiros, põe o botão Mais na última posição, com os que sobraram num menu, e suspende a ampliação. Não há separador nesse caso.

No celular, a `BarraDeAbas` ordena os módulos pela `prioridadeNoCelular` que cada um declara, e o valor `'mais'` deixa o módulo sempre em "Mais".

As preferências já têm uma lista ordenada com ocultos: `inicio.blocos`, de itens `{ id, visivel }`, com as funções puras `ordenarBlocos`, `moverBloco` e `ocultarBloco` em `apps/web/src/modulos/inicio/blocos.ts` e o leitor `blocosDoInicio` no domínio. A seção Dock dos Ajustes é a mesma que a Administração usa nos padrões da organização, pelo `useAlvoDasPreferencias`.

## Goals / Non-Goals

**Goals:**
- A mesma forma e as mesmas regras da lista do Início, para a pessoa aprender uma vez.
- Nenhum módulo fica inalcançável: o tirado vai para o Mais.
- O `Dock` continua sem saber de preferências: recebe as listas prontas.

**Non-Goals:**
- O arraste.
- Mudar a ordem das seções dos Ajustes ou a dos menus de cada módulo.
- Guardar uma ordem por aparelho.

## Decisions

### 1. O campo `dock.modulos`

`dock.modulos` é a lista `{ id, visivel }[]`, trocada inteira, em que `visivel` diz se o módulo está no dock. O leitor é o dos blocos do Início, generalizado para receber o limite, com 40 itens, e recusa o id dos Ajustes. O padrão de fábrica é a lista vazia.

A forma repetida deixa as três funções da ordem servirem às duas listas. Elas saem de `modulos/inicio/blocos.ts` para `apps/web/src/preferencias/listaOrdenada.ts`, com os nomes `ordenarItens`, `moverItem` e `ocultarItem` e o tipo do item no lugar do `BlocoDoInicioSalvo`, e o Início passa a importá-las de lá.

**Alternativa descartada:** duas listas, a da ordem e a dos tirados. Um módulo poderia estar nas duas ou em nenhuma, e a validação teria de reconciliar.

### 2. A ordem que vale

O `modulosDaCasca` passa a receber a lista que vale (a da conta, ou a da organização, ou a vazia) e devolve três grupos:
- `modulos`: os do dock, na ordem;
- `modulosNoMais`: os tirados;
- `modulosDoFim`: os Ajustes.

Ele usa o `ordenarItens` sobre os módulos do `registroDaConta`, sem os Ajustes. O id salvo que não está no registro da conta fica de fora da tela e continua na lista guardada, para o módulo voltar ao lugar quando o acesso voltar (decisão 4).

A busca, as rotas, o Início e os cadastros continuam lendo o `registroDaConta` na ordem do registro: a ordem do dock não muda o resto do app.

### 3. O `Dock` com os módulos do Mais

O `Dock` ganha a propriedade `modulosNoMais`. Com ela:
- o botão Mais existe quando há excedentes ou módulos em `modulosNoMais`;
- a medida do espaço conta a posição do Mais quando ele existe só pelos tirados;
- sem excedentes, a ordem é: os módulos, o Mais, o separador e os Ajustes;
- com excedentes, vale o desenho de hoje, com o Mais na última posição, e o menu traz os excedentes e, depois, os tirados;
- a ampliação fica suspensa só com excedentes.

A parada do Tab continua indo ao Mais quando o módulo atual está no menu dele, como hoje com os excedentes.

A `Casca` entrega os módulos de `modulosNoMais` também à barra de abas e à árvore de menus do celular, entre os módulos e os Ajustes: sem isso, o módulo tirado sumiria do celular.

### 4. A seção Dock

Abaixo dos controles de hoje, a parte "Módulos do dock", com as duas listas da spec. Cada clique grava a lista inteira, como no Início. Depois de Subir ou Descer, o foco continua no mesmo botão do mesmo módulo; quando esse botão fica desabilitado, o foco vai ao outro botão da linha.

A lista usa o registro da conta de quem ajusta. Nos padrões da organização, quem administra vê os módulos dela, e a lista vale para todos; cada conta ignora o que não vê.

A lista gravada guarda o que não está na tela. O `listaComAusentes` monta a lista inteira: os ids salvos que o registro de quem ajusta não traz continuam nela, no lugar deles, enquanto couberem no limite, e os registrados que faltavam entram no fim. O `moverItem` recebe os ids da tela e passa por cima dos ausentes, como passa por cima dos tirados. Assim, o módulo sem acesso volta ao lugar dele depois de a conta mexer na ordem, e quem administra os padrões não apaga da lista um módulo que não vê. O Início continua gravando só os blocos registrados.

O ajuste entra na busca como "Módulos do dock", com as palavras "ordem", "organizar" e "tirar do dock".

### 5. O celular

A web calcula a `prioridadeNoCelular` antes de entregar os módulos à casca: com uma lista que vale, os módulos do dock recebem 1, 2, 3… na ordem dela, os Ajustes vêm depois, e os tirados recebem `'mais'`. O módulo que já declara `'mais'` continua assim. Sem lista, nada muda. A `BarraDeAbas` não muda.

No app, a Gestão de ativos, a Operação, o Mapa, as Salas, os Painéis, o Cofre e a Administração declaram `'mais'`: no celular, a ordem escolhida muda as abas entre o Início, os Ativos e os Alertas, e os outros continuam em "Mais".

**Alternativa descartada:** a posição na lista levar à aba também o módulo que declara `'mais'`. A lista gravada traz sempre todos os módulos, e não só os que a conta moveu: quem trocasse dois módulos de lugar no computador mudaria as quatro abas do celular para os quatro primeiros da lista, e Ajustes sairia das abas, sem ter pedido isso.

## Risks / Trade-offs

- **[A conta tira do dock um módulo e não o acha mais]** → o Mais aparece sempre que há módulo tirado, a busca continua achando, e "Restaurar padrões" devolve todos.
- **[A organização define uma ordem com módulos que a conta não vê]** → eles ficam de fora para essa conta, sem buraco no dock.
- **[As capturas do dock na regressão visual]** → as histórias usam os módulos de exemplo do catálogo; entra uma história nova com o Mais pelos tirados, e as de hoje não mudam.

## Migration Plan

Nada a migrar: sem `dock.modulos`, vale a ordem do registro, com todos no dock.

## Open Questions

Nenhuma.
