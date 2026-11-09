## 1. Os componentes

- [x] 1.1 Escrever primeiro a história e depois o `CabecalhoDaPagina` (design, decisão 1). Verificar: a história passa com "Ações à direita" e "Detalhe embaixo do título", sem violação de acessibilidade.
- [x] 1.2 Escrever primeiro o teste e depois a `ListaDeDados` (decisão 3). Verificar: o teste passa com os termos e as definições, e a história mostra o rótulo em cima na largura estreita.

## 2. As telas

- [x] 2.1 Migrar os cabeçalhos do Ativos e da Gestão de ativos (decisão 2). Verificar: os testes dos dois módulos passam.
- [x] 2.2 Migrar os cabeçalhos do Alertas, do Operação, do Cofre, do Mapa, das Salas e dos Painéis, e passar as seções e os dados da ordem de serviço e da solicitação ao carimbo e à lista de dados (decisões 2 e 3). Verificar: os testes desses módulos passam com "Dados da ordem de serviço".
- [x] 2.3 Migrar os cabeçalhos da Administração, com as seções do perfil e os dados do fornecedor, e as telas só com o título que ficaram no Ativos e na Gestão de ativos (decisões 2 e 3). Verificar: os testes da Administração passam, e o `pnpm dev` mostra as ações à direita em todos os módulos.

## 3. Fechamento

- [x] 3.1 Conferir as verificações:
  - `pnpm lint`;
  - `pnpm typecheck`;
  - `pnpm test`;
  - `pnpm test:stories`;
  - `pnpm test:visual`;
  - `openspec validate cabecalhos-e-fichas --strict`.

  Verificar: os comandos passam.
