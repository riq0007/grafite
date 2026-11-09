## Context

O motivo está em `proposal.md`. O ponto de partida:

- **As referências** aparecem como texto em `celulas.tsx`, nos valores só leitura da ficha, na prévia e no acesso da conta. Só a aba Ligados, os grupos, os membros e "quem tem" usam `Link`.
- **A tabela dos ativos** já aceita os filtros no endereço, e os links antigos `?local=` e `?tipo=` viram filtros (`apps/web/src/tabelas/endereco.ts`).
- **O registro de módulos** (`apps/web/src/modulos/tipos.ts`) tem o dock, a busca (entradas e provedores), os eventos e as fontes do Início. Nenhum módulo acrescenta nada à ficha de outro.
- **A busca** (`useBusca.ts`) tem as entradas da casca e os provedores, que devolvem até 8 por grupo. Com o campo vazio, ela mostra só os módulos.
- **As permissões** de ativos e de pessoas valem por ramo de local. As contagens têm de ser feitas no escopo de quem vê.

## Goals / Non-Goals

**Goals:**
- Uma só peça de referência com cartão em todas as telas, e um só caminho de "ver na tabela".
- Contagens sempre no escopo de quem vê, ditas como tal quando recortam o total.
- O que um módulo mostra na tela de outro entra pelo registro do módulo e some com ele desligado.

**Non-Goals:**
- O inspetor, a trilha anterior e próximo, os "Recentes" e os prefixos da busca (proposta, "Ficam fora").

## Decisions

### 1. O resumo de cada registro

Cada tipo de registro ganha uma rota de resumo, do módulo dele, que herda a recusa do módulo desligado:

| Rota | Traz |
|---|---|
| `GET /pessoas/{id}/resumo` | foto, nome, situação, local de trabalho, se tem conta, e os ativos sob responsabilidade quando o módulo Ativos está ligado e a conta vê ativos |
| `GET /locais/{id}/resumo` | caminho, tipo, situação, os ativos aqui e com os de dentro, e as pessoas |
| `GET /modelos/{id}/resumo` | imagem, tipo, situação e os ativos do modelo |
| `GET /tipos-de-ativo/{id}/resumo` | nome, ícone, situação e os ativos do tipo, para a ficha do tipo e a origem `tipo` |
| `GET /ativos/{id}/resumo` | miniatura, tipo, patrimônio, local, situação e os ligados |

Os ativos contados são os ativos, sem os inativos, como a tabela os mostra ao abrir, e as pessoas contadas são as ativas. Cada contagem vem com o total que a conta vê e `recortada: true` quando o escopo dela recorta o total. Para isso, a contagem sem o escopo é feita só para saber se difere, e o número dela nunca vai na resposta.

O resumo da pessoa obedece à permissão de ver pessoas no local dela. Sem a permissão, não há cartão, como o handoff pede para não vazar o local de quem a conta não pode ver.

A tela guarda o resumo no TanStack Query por 30 s e o relê pelos eventos que já existem (`pessoas.mudaram`, `locais.mudaram`, `ativos.mudaram`, `catalogo.mudou`).

### 2. A `ReferenciaComCartao`

O componente novo de `packages/ui` recebe o link para a ficha, como o roteador da tela o desenha, o nome do cartão e o conteúdo dele. Ele:
- usa o `Popover` do React Aria, sem prender o foco, aberto por um temporizador de 500 ms sobre o ponteiro e pela seta para baixo no foco, que leva o foco ao cartão;
- fecha 300 ms depois de o ponteiro sair da referência e do cartão, e com Esc, que devolve o foco à referência;
- desenha o conteúdo só com o cartão aberto. É o conteúdo que busca o resumo, pelo TanStack Query, com o sinal que cancela a busca quando o cartão fecha antes da resposta; o cache de 30 s faz a busca valer uma vez por registro, e os eventos o releem com o cartão aberto;
- no toque, que não tem ponteiro parado, é só o link;
- numa célula da `Tabela`, o clique e o Enter seguem o link, sem abrir a linha nem mexer na seleção, e o ponteiro parado sobre ela abre o cartão, no lugar do resumo da linha. A seta para baixo continua da grade, e o cartão abre com Alt+seta para baixo;
- na prévia, a seta para baixo num link é dele: abre o cartão, sem trocar de registro.

A referência é link com cartão só quando a conta abre a ficha do registro. A pessoa, com `pessoas.ver` no local de trabalho dela e fora da anonimização, que a lista e a ficha dos ativos dizem em `permite.verResponsavel`, sem mostrar o local dela. O local, para quem abre a tela de locais (`locais.editar` em algum ramo), que recebe o local no endereço (`?local=`) e o mostra escolhido. O modelo e o tipo, sempre, porque o catálogo é de todos. Fora disso, a referência é o texto.

O `CartaoDoRegistro`, também da biblioteca, desenha o cartão: a imagem, a foto ou o ícone, o nome, o que o registro é, os detalhes e as ações, com "Carregando o resumo…" enquanto ele não chega e "Não deu para carregar o resumo." quando a busca falha, sempre com o "Abrir". Os cartões de cada tipo ficam em `apps/web`, perto das telas do módulo dono.

### 3. A origem da tabela

O endereço da tabela ganha `origem=<tipo>:<id>`, com o tipo `local`, `pessoa`, `modelo` ou `tipo`. A origem:
- vira o filtro da coluna correspondente, fora da visão e das mudanças da conta, no lugar do filtro da visão naquela coluna, que não aparece enquanto ela estiver;
- tem o rótulo resolvido pelo resumo, que também diz se a conta vê o registro;
- no local, abre com o operador `igual`, operador novo da coluna de local, e o "Incluir os locais de dentro" o troca pelo `em`, com `dentro=true` no endereço.

"Limpar origem" tira os dois. "Novo ativo" leva a origem ao cadastro (`/ativos/novo?origem=…`), que preenche o campo, sem travá-lo.

### 4. As relações no registro de módulos

O registro ganha `relacoes`, para um módulo mostrar algo na ficha de outro:
- `{ alvo: 'pessoa' | 'local' | 'modelo' | 'tipo', componente, permissao }`;
- o módulo Ativos registra os ativos da pessoa, do local, do modelo e do tipo;
- a Administração e o catálogo mostram as relações registradas para o alvo da ficha;
- com o módulo desligado, a relação some, como o dock e a busca já fazem.

### 5. As ações da tela na busca

Cada rota pode declarar as ações dela para a busca, num `useAcoesDaTela(acoes)`, que a casca lê ao abrir a busca e mostra em "Nesta tela":
- a tabela dos ativos declara "Novo ativo" e "Filtrar por tipo…", que abre o painel de filtros no tipo;
- a ficha do ativo declara "Imprimir etiqueta" e "Ir para Ligados".

Os provedores passam a devolver o total, para o "Ver todos os N", e o destino da lista com a busca.

### 6. As contagens dos locais

`GET /locais/contagens` devolve, para cada local que a conta vê, os ativos e as pessoas dele e com os de dentro, numa consulta com o caminho dos locais. Ela é pedida só quando "Mostrar contagens" está ligado, e relida pelos eventos. O "Vai junto" do mover e do inativar usa o resumo do local.

## Risks / Trade-offs

- **[As contagens custam]** → Só quando o cartão, a ficha ou a árvore com contagens pedem, com cache de 30 s, e os índices por `org_id` e local que a lista já usa. Um teste de integração mede o resumo de um local com 10 mil ativos.
- **[O cartão vaza o que a lista não mostra]** → O cartão mostra só o que a conta veria na ficha do registro, e não há cartão para quem a conta não pode ver.
- **[A origem e a visão]** → A origem fica fora da visão, como a busca, e não marca a visão nem grava nas mudanças da conta.

## Migration Plan

Sem migration. As rotas novas entram junto com o cliente gerado.
