## 1. O interruptor compartilhado

- [x] 1.1 Escrever primeiro os testes e depois o campo `parteDe` na definição do módulo e no registro da conta: o módulo some quando o módulo dono está desligado. Verificar: o `registroDaConta.test.ts` passa com "Módulo que é parte de outro desligado".
- [x] 1.2 Escrever primeiro os testes e depois a casca: o endereço de uma tela de um módulo com o dono desligado mostra o nome do dono, "O módulo Ativos está desligado nesta organização.". Verificar: o teste da casca passa com "Gestão de ativos com o Ativos desligado".

## 2. A Gestão de ativos

- [x] 2.1 Escrever primeiro os testes e depois o módulo `gestao`: o registro logo depois do Ativos, o ícone, o endereço `/gestao`, o celular em "Mais", o `parteDe: 'ativos'` e o menu com as permissões de hoje. As rotas do catálogo, das importações, do software e do Control iD saem de `ativos/rotas.tsx` para `gestao/rotas.tsx`, e os links tipados passam aos endereços novos, inclusive os do Operação. Verificar: os testes do módulo passam com os menus de "Só os modelos", "Quem edita ativos" e "Técnico do Control iD", e o `pnpm typecheck` passa.
- [x] 2.2 Escrever primeiro os testes e depois o início da Gestão (`/gestao`), que leva à primeira tela que a conta pode usar e mostra o `SemPermissao` quando não há nenhuma. Verificar: os testes passam com "Quem administra o catálogo" e "Quem edita ativos".
- [x] 2.3 Escrever primeiro os testes e depois a busca, os cadastros numa aba e os eventos da Gestão, tirados do Ativos (design, decisão 6). A busca foi junto na 2.1, porque os destinos das ações são conferidos contra as rotas do módulo. Verificar: os testes da busca passam com "Modelo pela busca" levando a `/gestao/catalogo/modelos/<id>`, e os do cadastro numa aba continuam verdes.
- [x] 2.4 Escrever primeiro os testes e depois os redirecionamentos de `/ativos/catalogo`, `/ativos/importacoes`, `/ativos/software` e `/ativos/control-id`, com o resto do caminho, a busca do endereço e o `replace`. Verificar: os testes passam com "Favorito da ficha de um modelo", "Favorito das importações" e "Filtro guardado no endereço", e `/ativos/catalogo` não abre a ficha de um ativo.

## 3. O Ativos só com os ativos

- [x] 3.1 Escrever primeiro os testes e depois o menu do Ativos:
  - "Todos os ativos", os tipos ativos direto no menu e as visões fixadas depois de uma linha, sem "Por tipo";
  - a permissão do módulo só `ativos.ver`;
  - o início que leva à Gestão de ativos para quem não vê ativos.

  Verificar: os testes do `menu.test.tsx` e do `Ativos.test.tsx` passam com "Só os ativos", "Impressoras pelo menu" e "Tipo inativado".

## 4. Os ponta a ponta e a regressão visual

- [x] 4.1 Trocar os endereços antigos nos ponta a ponta (`e2e` e `e2e-pilha`) e acrescentar o caso do dock: o menu do Ativos com os tipos e o da Gestão de ativos com o resto. Verificar: os specs mudados do `pnpm test:e2e` passam, sem rodar a pilha local com o CI rodando, e o `e2e-pilha` passa no CI.
- [x] 4.2 Regravar as capturas da regressão visual que mudam com o ícone novo no dock, com o Docker aberto pelo usuário. Verificar: o `pnpm test:visual` passa, e a diferença das capturas regravadas é só o dock. Feito em 29/10: as 635 capturas passaram sem nenhuma regravada, porque as histórias do dock usam os módulos de exemplo do catálogo, e não o registro da web.

## 5. Fechamento

- [x] 5.1 Atualizar o contrato de módulo (`docs/casca/modulos.md`), com o menu novo do Ativos e o `parteDe`, a linha do P1a na spec mestre e o mapa. Verificar: o `documentacao.test.ts` e os testes do mapa passam.
- [x] 5.2 Conferir as verificações: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `openspec validate gestao-de-ativos --strict` e, no `pnpm dev`, o dock com o Ativos e a Gestão de ativos. Verificar: os comandos passam, e a tela mostra os dois menus como na spec.
