## 1. As abas na casca

- [x] 1.1 O estado das abas em funções puras (design, decisões 2 e 3): abrir pelo pedido, com a aba de origem e a chave do campo; trazer para a frente; fechar; concluir e cancelar, voltando à aba de origem; a mesma chave não abre duas abas; a origem que sumiu. Começar pelo teste. Verificar: os testes do estado das abas passam (`pnpm --filter @grafite/web test`).
- [x] 1.2 A barra de abas da janela na UI (`AbasDaJanela`, decisão 6), com as histórias de interação: a aba da frente pelo teclado, o anúncio da posição, o botão de fechar com o nome, a rolagem com muitas abas e o movimento reduzido. Verificar: as histórias passam pelo `vitest --project catalogo`, e a captura nova entra na regressão visual do CI do PR.
- [x] 1.3 A janela com abas na casca do app (decisões 1, 2, 7 e 8): o provedor das abas; a primeira aba pelo roteador; as de cadastro montadas e inertes atrás; o foco no título ao abrir e no campo ao voltar; a confirmação ao fechar com dados; o dock, a busca e os menus trazendo a primeira aba. Começar pelo teste da casca. Verificar: os testes da casca do app passam.

## 2. O contrato dos cadastros

- [x] 2.1 Os `cadastros` no registro do módulo e o `useCadastro(alvo)` (decisão 4), que some sem a permissão e com o módulo desligado. Começar pelo teste. Verificar: os testes do registro e da casca passam.
- [x] 2.2 O link de cadastro do campo na UI (`LinkDeCadastro`, decisão 6), com as histórias: o anúncio junto do campo e o campo só para leitura sem o link. Verificar: as histórias passam pelo `vitest --project catalogo`.

## 3. Os cadastros que abrem numa aba

- [x] 3.1 O Novo local (decisão 5): o corpo sai da gaveta e a tela dos locais continua a pô-lo nela; o cadastro registrado na Administração com `locais.editar`; o retorno e a recusa do nome repetido dentro da aba. Começar pelo teste. Verificar: os testes dos locais passam.
- [x] 3.2 A Nova pessoa: o corpo usado pela tela e pela aba, com `pessoas.editar`, a recusa da matrícula repetida dentro da aba e o link "Cadastrar novo local" no Local de trabalho. Começar pelo teste. Verificar: os testes das pessoas passam, também o da cadeia pessoa → local.
- [x] 3.3 O Novo tipo: o corpo usado pelo catálogo e pela aba, com `catalogo.administrar`, e a recusa do nome repetido dentro da aba. Começar pelo teste. Verificar: os testes dos tipos passam.
- [x] 3.4 O Novo modelo: o corpo usado pelo catálogo e pela aba, com `modelos.editar`, o tipo do ativo só para leitura quando o ativo o pede, e o link "Cadastrar novo tipo" no campo Tipo do modelo do catálogo. Começar pelo teste. Verificar: os testes dos modelos passam, também o do tipo criado pelo modelo.

## 4. Os campos que pedem cadastro

- [x] 4.1 O cadastro e a ficha do ativo: o link no Tipo, no Modelo (com o tipo do ativo), no Local, no Responsável e nos campos de pessoa e de local do tipo, e o cadastro sem tipos abrindo o Novo tipo numa aba. Começar pelo teste. Verificar: os testes do cadastro e da ficha do ativo passam.
- [x] 4.2 A ponta a ponta da web: "Novo ativo → Cadastrar novo local → salvar" volta com o local escolhido; a cadeia "Nova pessoa → Novo local", cada uma voltando à aba que a pediu; fechar uma aba com dados pede confirmação. Verificar: o `pnpm test:e2e` passa no CI do PR.

## 5. Fechamento

- [x] 5.1 O contrato de módulo (`docs/casca/modulos.md`), com os cadastros que abrem numa aba, e o mapa (`docs/mapa.md`), com a change em andamento. Verificar: o teste-guarda do mapa e o da documentação passam.
- [x] 5.2 Conferir as verificações: `pnpm lint`, `pnpm typecheck`, `pnpm contrato:verificar` e `openspec validate cadastro-em-abas --strict` sem erros, e o CI do PR verde. Verificar: os comandos passam, e o PR fica com todos os jobs verdes.
