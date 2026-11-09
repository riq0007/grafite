## Why

Depois do F2a, cada conta entra, mas ainda pode tudo e é criada só pelo comando no servidor:
- não existe permissão;
- não há tela para cadastrar pessoas e contas;
- os locais, de que os módulos da fase 2 precisam (ativo, estoque e mapa), não existem;
- a auditoria grava, mas ninguém a consulta.

A paridade com o PMG exige perfis, grupos e a administração de usuários (`autorizacao-rbac` e `gestao-usuarios`), e a spec mestre pede tudo negado por padrão, com escopo por local (seção 9.3).

Esta change implementa a **segunda parte do subprojeto F2 · Núcleo** da spec mestre (`docs/superpowers/specs/2026-09-24-grafite-design.md`, seções 3.3, 3.4, 5.1, 5.2, 9 e 15): **F2b · Permissões e locais**. O F2 tem quatro changes, nesta ordem: F2a · Contas e acesso (arquivado), **F2b · Permissões e locais** (esta), F2c · Plataforma e F2d · Operação.

## What Changes

- **Árvore de locais**
  - Locais em árvore livre, com um tipo de uma lista fixa (Unidade, Prédio, Andar, Setor, Sala e Outro), até 8 níveis e nome único entre os irmãos.
  - O rack é um ativo (T2), e não um local.
  - É possível criar, renomear, mover sem formar ciclo, inativar quando nada ativo depende do local e reativar.
  - Toda sessão ativa lê a árvore, porque ela é a referência para escolher um local.
- **Permissões com escopo**
  - Um catálogo de permissões no código, que cresce com cada módulo. No F2b, ele traz as da administração: pessoas, contas, acessos, locais e auditoria.
  - **Perfis:** conjuntos de permissões, com "Exige verificação em dois passos".
  - **Grupos:** conjuntos de contas.
  - **Atribuições:** um perfil dado a uma conta ou a um grupo, valendo para a organização inteira ou para o ramo de um local.
  - O perfil **Administrador** nasce com cada organização: tem todas as permissões, exige os dois passos e não muda.
  - Tudo é negado por padrão:
    - a API confere cada rota e o escopo de cada registro;
    - a recusa responde 403, dizendo a quem pedir acesso, e entra na auditoria;
    - a casca esconde o que a conta não pode.
  - A organização nunca fica sem alguém que administre os acessos.
- **Dois passos pelo perfil:** a exigência vem da conta ou de qualquer perfil dela e vale já: uma sessão aberta passa a pedir o cadastro antes de continuar.
- **Administração de pessoas e contas**
  - A pessoa ganha matrícula (única na organização), local de trabalho e telefone ou ramal, todos opcionais.
  - Pela tela, quem tem permissão:
    - cadastra, edita, inativa e reativa pessoas;
    - cria a conta, com a senha temporária mostrada uma vez;
    - redefine a senha, remove os dois passos, desbloqueia a entrada, inativa e reativa a conta e encerra as sessões dela.
  - O comando no servidor continua como recuperação de último recurso.
- **Anonimização da pessoa (LGPD)**
  - Uma pessoa inativa pode ser anonimizada, sem volta.
  - Somem os dados pessoais do cadastro, da conta, das sessões e das tentativas de entrada. O usuário fica livre para outra pessoa.
  - O histórico é preservado: a referência à pessoa continua, com o nome "Pessoa anonimizada" e um código.
  - A auditoria fica intacta, só para quem pode consultá-la, até o fim da retenção mínima de 5 anos. O registro da anonimização não copia os dados apagados.
- **Consulta da auditoria**
  - Uma lista do mais recente para o mais antigo, com filtros de período, quem fez, ação, alvo e código de rastreio.
  - Paginação sem teto e o total contado até 10 mil.
  - O detalhe de cada registro, com o "antes → depois".
  - O histórico de cada pessoa, perfil, grupo e local leva à auditoria já filtrada.
- **Módulo Administração**
  - Um item do dock com as telas Pessoas, Perfis, Grupos, Locais e Auditoria, cada uma visível só a quem tem a permissão dela.
  - A ficha da pessoa tem as abas Dados, Acesso e Histórico.
  - A busca ganha o grupo "Pessoas".
- **Contrato de módulo:** o módulo, cada item de menu, cada entrada de busca e cada fonte da tela inicial podem exigir permissões, e o `useAcesso()` diz o que a conta pode.
- **Componentes base:** a árvore, o campo de data, os filtros ativos e o texto para copiar. A tabela ganha o "Carregar mais", para as listas paginadas.
- **API:**
  - listas paginadas por cursor;
  - os problemas `sem-permissao` e `ultimo-administrador`;
  - as rotas novas no contrato, com o cliente regenerado.
- **Spec mestre**
  - Locais (seção 5.1) e os dados da pessoa (seção 5.2).
  - Seção 9: os dois passos pelo perfil, o escopo na atribuição, o Administrador, o último administrador e a política de anonimização.
  - Seção 15 sem a decisão da LGPD, que fica tomada.

**Fora desta change:**
- **F2c · Plataforma:**
  - as preferências em três níveis;
  - ligar e desligar módulos por organização;
  - a foto da pessoa;
  - os eventos (outbox → SSE), que atualizam as permissões da tela sem uma nova requisição;
  - a fila de tarefas.
- **F2d · Operação:** ambientes, serviços do Windows, HTTPS interno e backup.
- **Módulos da fase 2 (P1 em diante):** as permissões de cada módulo e o escopo "só os próprios" do Solicitante (A1 e P4).
- **Também ficam de fora:**
  - a delegação, em que quem administra um ramo dá acesso dentro dele;
  - arrastar e soltar na árvore;
  - a exportação da auditoria;
  - a auditoria das consultas a dados sensíveis (P5 e P6);
  - a tabela virtualizada para 10 mil linhas (P1).

## Capabilities

### New Capabilities
- `locais`: a árvore de locais, os tipos, a hierarquia, mover sem ciclo, a inativação e quem lê e altera.
- `permissoes`: o catálogo, o acesso efetivo de uma conta, o escopo por ramo, a recusa por padrão na API e na tela, a recusa auditada e a quem pedir acesso.
- `perfis-e-grupos`: perfis, grupos, membros e atribuições com escopo, o Administrador protegido e a proteção do último administrador.
- `administracao-de-pessoas`: o cadastro de pessoas e contas pela administração, com a inativação, a redefinição e a anonimização.
- `consulta-da-auditoria`: a lista, os filtros, a paginação, o total, o detalhe e o histórico de cada registro.
- `modulo-administracao`: o módulo da casca com as telas de pessoas, perfis, grupos, locais e auditoria e os estados delas.

### Modified Capabilities
- `contas-de-acesso`:
  - a pessoa ganha matrícula, local de trabalho e telefone;
  - a senha temporária também nasce pela administração;
  - o comando no servidor dá o perfil Administrador.
- `verificacao-em-dois-passos`: a exigência vem da conta ou dos perfis, vale já numa sessão aberta, e a administração pode remover a verificação de uma conta.
- `entrada-e-sessoes`:
  - o estado da sessão traz o acesso;
  - a inativação, a redefinição e o encerramento pela administração terminam as sessões;
  - uma exigência nova faz uma sessão ativa voltar a ficar pendente.
- `tela-de-entrada`: o cadastro dos dois passos exigido no meio do uso cobre a casca.
- `auditoria`: os eventos da administração e das recusas, e os dados pessoais depois da anonimização.
- `estrutura-da-casca`: os módulos, os itens de menu, as entradas de busca e as fontes da tela inicial por permissão.
- `componentes-base`:
  - a árvore, o campo de data, os filtros ativos e o texto para copiar;
  - a tabela com "Carregar mais".
- `plataforma-base`: as listas paginadas por cursor, sem limite fixo.
- `ajustes-do-sistema`: a seção Conta diz quem exige os dois passos, a conta ou o perfil.

## Impact

- **Código**
  - `packages/db`:
    - as tabelas `locais`, `perfis`, `grupos`, `membros_do_grupo` e `atribuicoes`;
    - as colunas novas de `pessoas` e a conta anonimizável;
    - a migration que dá o Administrador às organizações que já existem.
  - `packages/domain`:
    - o catálogo de permissões;
    - a árvore de locais e o acesso efetivo;
    - as regras da pessoa (matrícula, telefone e busca);
    - os rótulos das ações da auditoria.
  - `apps/api`:
    - o acesso efetivo na sessão e a exigência dos dois passos pelos perfis;
    - a guarda de permissão por rota, com o teste-guarda;
    - a proteção do último administrador;
    - as rotas de locais, pessoas, contas, perfis, grupos, atribuições e auditoria;
    - o comando no servidor com o Administrador.
  - `packages/api-client`: o contrato regenerado.
  - `packages/ui`:
    - a `Arvore`, o `CampoDeData`, os `FiltrosAtivos` e o `TextoParaCopiar`;
    - o "Carregar mais" da `Tabela`;
    - as histórias e a regressão visual de tudo isso.
  - `apps/web`:
    - o TanStack Query para os dados da API;
    - o acesso na loja da sessão e o `useAcesso()`;
    - o registro filtrado por permissão;
    - o módulo Administração e as telas dele;
    - o seletor de local;
    - a pendência que surge no meio do uso.
  - `docs/casca/modulos.md`: as permissões no contrato de módulo.
- **Dependências:**
  - na web, o `@tanstack/react-query`, já previsto na spec mestre (seção 4.2);
  - no `packages/ui`, o `@internationalized/date`, que o React Aria já traz, para o campo de data.
  - O banco continua sem extensões.
- **Testes:**
  - unitários do domínio;
  - integração da API e do banco com PostgreSQL real, incluindo a migration do Administrador;
  - componentes e histórias;
  - pontas a ponta da administração com a API simulada;
  - a ponta a ponta da pilha com uma conta criada pela tela;
  - regressão visual dos componentes novos.
- **PMG:** nenhum impacto. Os perfis, os grupos e os colaboradores do PMG chegam na migração (P8).
