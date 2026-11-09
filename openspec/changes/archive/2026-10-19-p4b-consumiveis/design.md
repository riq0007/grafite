## Context

O catálogo dos ativos tem os tipos, que ligam as capacidades do código (`CAPACIDADES`, em `packages/domain/src/ativos/catalogo.ts`), e os modelos, que pertencem a um tipo. Na ficha do ativo, cada capacidade vira um grupo, e o grupo da capacidade sem campos só vira cartão quando a ficha traz um painel dela, com a situação no resumo (change ficha-em-cartoes, decisão 2). A API monta esses painéis em `fichaDoAtivo` (`apps/api/src/ativos/leitura.ts`), que também traz os segredos do Cofre, só com o módulo ligado e a permissão.

Os módulos opcionais são os ids que a organização não desligou (`organizacoes.modulos_desligados`): um módulo novo já nasce ligado em toda organização. As rotas de cada um ficam num escopo com a guarda `exigirModuloLigado`, e a web os tira do registro da conta. Um módulo mostra o que tem na ficha de outro pelas relações do registro, e o evento de outro módulo pode reler as consultas dele, como o Ativos faz com `cofre.mudou`.

O fornecedor do P4a tem a lista para escolher, `GET /fornecedores/escolha`, que toda sessão lê, e o Novo fornecedor numa aba, pelo alvo `fornecedor` dos cadastros. Já existem `packages/domain/src/operacao`, `packages/operacao` e o evento `operacao.mudou`, que são do backup e do servidor (F2d), e não deste módulo.

## Goals / Non-Goals

**Goals:**
- O consumível como um registro só, com o código normalizado único, que o estoque, as solicitações e as OS vão referenciar pelo identificador.
- A compatibilidade como ligação entre o consumível e o modelo, lida pelo modelo na ficha dele e na dos ativos.
- O módulo Operação pronto para receber as seções do P4c ao P4e sem mudar a casca.

**Non-Goals:**
- A compatibilidade escolhida na ficha do modelo: ela é escolhida só na ficha do consumível, e a do modelo só mostra.
- O consumível de outra organização ou um catálogo comum entre organizações.
- A imagem do consumível e o código de barras dele.
- Um componente de lista com inclusão e retirada no `packages/ui`: o do Operação fica no módulo até um segundo uso.

## Decisions

### 1. O consumível no domínio

O domínio (`packages/domain/src/consumiveis/`) traz:
- os tipos e as cores, em listas fixas, com os rótulos;
- o código normalizado: em maiúsculas e sem os espaços e os hífens, a chave da unicidade e da busca;
- a conferência campo a campo, com as mensagens da spec, e os limites das duas listas;
- o rendimento escrito, como "3.000 páginas";
- a ordem dos compatíveis: pelo tipo, na ordem da lista, e pelo código normalizado;
- o resumo do cartão da ficha do ativo: os dois primeiros códigos, "e mais N", "Nenhum compatível" ou "Sem modelo".

A web usa as mesmas regras para avisar antes de enviar, e a API confere a unicidade no banco, com as mensagens daqui, como no fornecedor.

### 2. As tabelas

A migration 0036 cria três tabelas da organização, com `orgScoped()` e o RLS forçado:
- **`consumiveis`:** o código, o código normalizado, o nome, o nome normalizado, para a busca sem acento, o tipo, a cor, o rendimento, a situação e os momentos. O código normalizado é único na organização, e as checagens repetem as listas e os limites do domínio.
- **`fornecedores_dos_consumiveis`:** o par consumível e fornecedor, único, com o índice pelo fornecedor.
- **`consumiveis_dos_modelos`:** o par consumível e modelo, único, com o índice pelo modelo, que a ficha do modelo e a do ativo leem.

As duas ligações apontam o consumível, o fornecedor e o modelo pela chave estrangeira com a organização, como `segredos_dos_ativos`.

Alternativa descartada: os identificadores dos fornecedores e dos modelos em listas na linha do consumível. Sem a chave estrangeira, o banco não garante que eles existem, e a ficha do ativo procuraria o modelo dentro das listas de todos os consumíveis.

### 3. A capacidade e o módulo opcional

`consumiveis.compatibilidade` entra nas `CAPACIDADES` sem campos, sem configuração e sem colunas. O tipo a liga como as outras, e o grupo dela na ficha do ativo vira cartão pelo painel (decisão 6). O cadastro em etapas já pula o grupo sem campos.

O módulo `operacao` entra nos `MODULOS_OPCIONAIS`, com o nome Operação, e as rotas dos consumíveis ficam no escopo guardado por ele. Como os desligados são uma lista, ele começa ligado sem migration. O trecho dos `MODULOS_OPCIONAIS` no contrato de módulo muda junto, porque o teste dos trechos o confere.

### 4. As rotas dos consumíveis

As rotas seguem as permissões da spec:
- `GET /consumiveis`, com `consumiveis.ver`: a busca pelo código normalizado e pelo nome normalizado, contida em qualquer parte, os filtros do tipo, da cor e da situação, o cursor pelo código normalizado e o identificador, o total e a contagem dos modelos de cada um;
- `GET /consumiveis/{id}`, com `consumiveis.ver`: a ficha, com os fornecedores e os modelos pelo nome, a situação de cada um e o tipo de cada modelo, e o que a conta pode fazer;
- `POST /consumiveis`, `PATCH /consumiveis/{id}` e as de inativar e reativar, com `consumiveis.editar`;
- `GET /consumiveis/modelos`, com `consumiveis.editar`: os modelos ativos dos tipos que ligam a capacidade, para escolher.

O cadastro e a edição recebem as listas inteiras dos fornecedores e dos modelos. A API confere só o que entra de novo: o fornecedor ativo e o modelo ativo de um tipo com a capacidade. O inativo que já estava fica.

Cada mudança grava a auditoria e o evento `consumiveis.mudaram`, para toda a organização, porque os compatíveis aparecem nas fichas dos modelos e dos ativos. Na auditoria, as duas listas vão pelos nomes, antes e depois. O código repetido volta como recusa do campo, pela violação do índice único, como no fornecedor.

### 5. Os compatíveis como referência do modelo

Uma função só lê os consumíveis ativos de um modelo, na ordem do domínio, com o código, o nome, o tipo, a cor e o rendimento. Duas leituras a usam:
- **`GET /modelos/{id}/consumiveis`:** no escopo do Operação, sem permissão, como referência, igual aos modelos e à escolha dos fornecedores. Ela devolve nulo quando o tipo do modelo não liga a capacidade.
- **`fichaDoAtivo`:** traz `consumiveisCompativeis`, nulo quando o tipo não liga a capacidade ou o Operação está desligado, e vazio no ativo sem modelo. A web distingue "Sem modelo" pelo modelo da ficha.

Alternativa descartada: exigir `consumiveis.ver` para ver os compatíveis. O técnico que vê a impressora precisa saber qual toner ela usa, e o código e o nome não são sensíveis. Os fornecedores e os inativos ficam só no módulo.

### 6. A web

O módulo fica em `apps/web/src/modulos/operacao/`:
- **registro:** o ícone `Wrench`, o endereço `/operacao/consumiveis`, "Mais" no celular, as permissões `consumiveis.ver` e `consumiveis.editar`, o menu "Consumíveis" e a entrada "Novo consumível" na busca;
- **lista:** a tabela base, como a dos fornecedores, com a busca, os filtros do tipo, da cor e da situação e o "carregar mais";
- **formulário:** os campos e duas listas com inclusão pela busca e "Retirar". A dos fornecedores usa o `CampoComCadastro` do alvo `fornecedor` na busca, e o fornecedor criado na aba entra na lista. A dos modelos mostra o fabricante, o nome e o tipo;
- **ficha:** os dados, os fornecedores e os modelos para quem só vê, e o formulário, com a inativação confirmada e a reativação, para quem edita.

No Ativos, o painel `ConsumiveisNaFicha` entra nos `paineisDasCapacidades` quando a ficha traz `consumiveisCompativeis`, com o resumo do domínio. A ficha do modelo ganha a seção `ConsumiveisDoModelo`, que lê `GET /modelos/{id}/consumiveis` e some com o Operação desligado. As duas fichas usam a mesma lista dos compatíveis, em que o código leva à ficha do consumível só para quem tem `consumiveis.ver`.

Alternativa descartada: a seção do modelo como uma relação do Operação, no alvo `modelo`. O registro da conta tira o módulo que a conta não vê com tudo o que ele registra, as relações também, e quem vê o modelo sem ver os consumíveis ficaria sem os compatíveis, que a spec dá a ele.

### 7. Os eventos na web

O registro de cada módulo relê as próprias consultas:
- **Operação:** `consumiveis.mudaram` relê a lista e a ficha; `catalogo.mudou` relê a ficha e os modelos para escolher, pelo nome e pela capacidade; `fornecedores.mudaram` relê a ficha.
- **Ativos:** `consumiveis.mudaram` relê a ficha aberta (`['ativo']`), como já faz com `cofre.mudou`, e os compatíveis da ficha do modelo, que `catalogo.mudou` também relê, pela capacidade do tipo. Eles ficam no registro do Ativos porque a conta que não vê os consumíveis não tem o do Operação.

O formulário em edição guarda o que foi digitado, como o do fornecedor.

### 8. A verificação das cores e a cor de um consumível

A verificação das cores literais (`scripts/verificar-cores.ts`) acusava qualquer string de TS igual a um nome de cor do CSS. A cor "magenta" de um consumível é dado: ela está no domínio, no banco e no contrato gerado da API, e não pinta nada. A spec design-tokens pede a verificação nos componentes e nas telas, então o nome de cor numa string passa a contar só no código das telas (`apps/web` e `packages/ui`). O hex e as funções de cor continuam contando em todo lugar, e o nome de cor no CSS também.

Alternativa descartada: uma marca de exceção na linha. O contrato gerado da API não a levaria, e cada lista de cores precisaria dela.

## Risks / Trade-offs

- [Muitos modelos para escolher] → a escolha traz todos os modelos ativos dos tipos com a capacidade, que são poucas centenas numa organização grande, e a busca filtra na tela.
- [A capacidade desligada com os modelos já ligados] → as ligações ficam e só deixam de aparecer no modelo e no ativo. A ficha do consumível continua com os modelos, e ligar a capacidade de novo traz tudo.
- [Duas pessoas editando o mesmo consumível] → a última gravação vence, com a auditoria de cada uma, como nos outros cadastros.
- [Ativos desligado com o Operação ligado] → a ficha do consumível mostra os modelos pelo nome, e o link do modelo leva à tela do módulo desligado.
- [A volta à versão anterior] → a anterior ignora as tabelas novas, mas recusa salvar o tipo que ligou `consumiveis.compatibilidade`, que ela não conhece. O runbook manda restaurar o backup feito antes da atualização.

## Migration Plan

1. A migration 0036 cria as três tabelas, sem mudar dados, e o Operação começa ligado.
2. Depois da atualização, quem administra:
   - dá `consumiveis.ver` ou `consumiveis.editar` aos perfis que precisam (o Administrador já as tem);
   - liga os consumíveis compatíveis no tipo das impressoras;
   - cadastra os consumíveis.
3. A volta pede a restauração do backup feito pela própria atualização.
