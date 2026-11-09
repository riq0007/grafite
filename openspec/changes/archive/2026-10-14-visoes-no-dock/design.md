## Context

O motivo está em `proposal.md`. O ponto de partida:

- **O registro de módulos** (`apps/web/src/modulos/tipos.ts`) tem o `menu` fixo no código, tipado contra as rotas, com a permissão de cada item. O dock (`packages/ui/src/casca/MenuDoDock.tsx`) desenha a árvore que o registro lhe dá.
- **As visões** vêm de `GET /visoes?tabela=ativos`. As preferências da conta guardam a escolhida, e os padrões da organização guardam a padrão (`/organizacao/padroes`), com a auditoria.
- **A origem da tabela** vem das relações vivas (`?origem=tipo:<id>`), e o catálogo dos tipos vem de `GET /tipos-de-ativo`.

## Goals / Non-Goals

**Goals:**
- Uma visão vira item do dock com um clique, para a conta ou para todos.
- O registro de módulos aceita itens que vêm dos dados, com a mesma permissão e o mesmo sumiço dos fixos.

**Non-Goals:**
- Atalhos para qualquer endereço, pastas, ordem dos módulos, contagens e o dock por perfil (proposta, "Ficam fora").

## Decisions

### 1. Onde ficam as fixações

As fixações guardam só os ids e as preferências, e por isso não pedem uma tabela nova. As camadas das preferências se juntam campo a campo, com a da conta por cima da da organização, e por isso cada camada tem a chave dela:
- **as da conta:** nas preferências dela, em `tabelas.fixadas.ativos`, uma lista de até 20 ids, com o limite de 8 KB de sempre; os padrões da organização recusam essa chave;
- **as da organização:** nos padrões dela, em `tabelas.fixadasPelaOrganizacao.ativos`, até 20, gravadas por quem tem `organizacao.editar` e auditadas como os outros padrões; as preferências da conta recusam essa chave.

A API recusa a lista com mais de 20 e a visão que a camada não pode usar: na conta, uma da organização ou dela; nos padrões, só uma da organização. A tela grava a lista inteira, só com as visões que ainda existem.

A conta vê as fixadas da organização e as dela, sem repetir, e não desafixa as da organização.

**Alternativa:** uma coluna "fixada" na visão. Ela não serve à visão da organização fixada por uma conta só para ela.

### 2. Itens de menu dinâmicos

O registro ganha o `menuDinamico`, com a permissão dele, as consultas de que precisa e `montar(contexto)`, que devolve o menu do módulo com os itens fixos e os dos dados, na ordem que o módulo dá. O contexto traz o menu fixo, já só com o que a conta pode usar, o dado de cada consulta, carregada pelo TanStack Query, e as preferências. A casca carrega as consultas só para a conta que tem a permissão do menu dinâmico e com o módulo ligado, e o item dos dados que exige uma permissão que a conta não tem some, como os fixos. Enquanto uma consulta carrega, ou se ela falha, o menu sai sem os itens dela.

Só o dock usa o menu dinâmico. A busca continua com os menus fixos, porque as visões já estão nela pelo provedor dela.

O módulo Ativos usa:
- as visões e as fixações, para os itens abaixo de "Todos os ativos";
- os tipos ativos, para o submenu "Por tipo".

Os destinos são endereços tipados: `/ativos?visao=<id>` e `/ativos?origem=tipo:<id>`. Os eventos `visoes.mudaram`, `catalogo.mudou` e `preferencias.mudaram` relêem as consultas, e o menu se refaz sozinho.

### 3. O menu da visão

A escolha da visão (`EscolhaDaVisao`) ganha "Fixar no menu" e "Desafixar do menu". Para quem tem `organizacao.editar` numa visão da organização, ela ganha também "Fixar no menu de todos" e "Desafixar do menu de todos". A visão fixada mostra "No menu" em texto no menu da visão.

## Risks / Trade-offs

- **[O menu cresce demais]** → O limite é de 20 fixadas por conta e 20 pela organização, e o "Por tipo" fica num submenu.
- **[Uma visão fixada que a conta não pode mais usar]** → O cálculo do menu usa as visões que a API devolve à conta: a que ela não vê não aparece.

## Migration Plan

Sem migration: as fixações vão nas preferências e nos padrões, com as chaves novas e a lista vazia como padrão.
