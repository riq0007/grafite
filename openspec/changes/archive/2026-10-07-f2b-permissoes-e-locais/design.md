## Context

Depois do F2a, toda requisição das rotas de acesso roda na organização do endereço, com a sessão do cookie lida no `onRequest` do escopo (`apps/api/src/acesso/escopo.ts`). A motivação está em `proposal.md` (Why), e os requisitos, nas specs desta change. Pontos de partida que importam aqui:
- **Sessão:** carrega `{ id, contaId, usuario, nome, pendencia, tokenCsrf, expiraEm }`. A pendência é derivada a cada leitura (`acesso/pendencia.ts`), e não existe guarda de autorização.
- **Auditoria:**
  - a tabela guarda o ator `conta` só pelo `ator_conta_id`, sem descrição;
  - `alvo_id` não tem chave estrangeira;
  - `registrarNaAuditoria` recusa chaves proibidas como `chave`, `codigo` e `senha`;
  - ninguém lê a auditoria ainda.
- **Banco:**
  - `pessoas` (nome, e-mail, situação) e `contas` (usuário e hash obrigatórios);
  - o `orgScoped()`, que cria `unique (org_id, id)` para as chaves compostas;
  - nenhuma extensão instalada;
  - as migrations geradas pelo drizzle-kit, com o SQL do RLS escrito à mão.
- **Domínio:** já tem `normalizarTexto` (sem acento e em minúsculas), `normalizarUsuario` e `validarUsuario`.
- **Web:**
  - o registro de módulos (`modulos/tipos.ts`) com `inicio` e `ajustes`;
  - a loja da sessão fora do React;
  - `useApi()` e `pedir()`;
  - as seções com o `useLeitura` local da seção Conta;
  - sem TanStack Query.
- **packages/ui:**
  - `Tabela` sobre a Table do React Aria, sem paginação;
  - `BuscaComSugestoes` (ComboBox), `Dialogo`, `Gaveta`, `QuickLook`, `RotuloDeSituacao`, `EstadoVazio` e `Abas`;
  - o `Copiar`, preso aos passos da entrada.
  - O `react-aria-components` 1.21 já traz `Tree`, `DateField` e `TableLoadMoreItem`.

Restrições:
- **Isolamento:** toda tabela nova usa `orgScoped()` e RLS forçado, com chaves estrangeiras compostas (regra 6 do `CLAUDE.md`).
- **Fase 1:** os componentes compartilhados ainda mudam aqui, pela sessão principal.
- **Commits:** um por tarefa (regra 8 do `CLAUDE.md`).

## Goals / Non-Goals

**Goals:**
- **Uma regra de acesso só:** a mesma função pura do domínio decide na API e explica na tela, testada sem banco.
- **Nenhuma rota sem permissão declarada,** provado por um teste-guarda, como o que reprova tabela sem RLS.
- **Contrato para a fase 2:** um módulo novo declara as permissões no catálogo e no registro, filtra as consultas pelo alcance da permissão e ganha a tela "sem permissão" de graça.

**Non-Goals:**
- **Permissão no RLS:** o banco continua separando só as organizações (decisão 1).
- **Atualização das permissões na tela sem requisição:** fica para os eventos do F2c. Até lá, a tela relê o acesso ao voltar o foco e a cada recusa.
- **Delegação:** quem administra os acessos atua sempre na organização inteira.
- **Tabela virtualizada:** fica para o P1. As listas do F2b carregam 50 por vez.

## Decisions

### 1. Permissão na API, isolamento no banco
- **Escolha:**
  - o RLS continua só com a organização;
  - cada rota declara a permissão;
  - a API carrega o acesso efetivo da conta e o resolve por funções puras do domínio;
  - o escopo vira filtro das consultas e conferência do registro antes de alterar.
- **Por quê:** a spec mestre pede a checagem na API (seção 9.3). Uma regra pura é testável por tabela de casos, e a mesma resposta serve à tela ("por que a conta pode").
- **Alternativas:**
  - **políticas do RLS por permissão:** uma por tabela e por permissão, com custo por linha, e a recusa auditada precisaria da API de qualquer jeito;
  - **acesso pré-calculado numa tabela:** estado duplicado, com invalidação em toda mudança administrativa.

### 2. Catálogo de permissões no domínio
- **Escolha:**
  - **Arquivo:** `packages/domain/src/acesso/permissoes.ts` exporta `PERMISSOES`, uma lista `as const` de `{ chave, area, descricao, escopo: 'local' | 'organizacao', inclui }`, e o tipo `Permissao`, a união das chaves.
  - **Chave:** `area.acao`, em pt-BR.
  - **Descrição:** escrita para caber depois de "Você não tem permissão para…", começando em minúscula no uso e em maiúscula na tela de perfis.
  - **Funções:**
    - `descricaoDa(chave)`;
    - `fechamento(chaves)`, que acrescenta as incluídas;
    - `permissaoConhecida(texto)`.
  - **Teste do catálogo:** chaves únicas, inclusões que existem, sem ciclo e descrições preenchidas.
  - **Módulos novos:** acrescentam entradas aqui, pela sessão orquestradora.
- **Por quê:** a API e a web importam o mesmo catálogo. O tipo `Permissao` faz uma chave errada no registro de um módulo não compilar.
- **Alternativa:** uma tabela de permissões no banco, como no PMG. Ela pediria migration para cada módulo e deixaria o banco e o código discordarem.

### 3. Árvore de locais em memória
- **Tabela `locais`:**
  - `pai_id`, com chave composta para `locais (org_id, id)`;
  - `nome` e `nome_normalizado` (`normalizarTexto`), com `unique nulls not distinct (org_id, pai_id, nome_normalizado)`;
  - `tipo`, com check na lista `unidade`, `predio`, `andar`, `setor`, `sala` e `outro`;
  - `situacao`: `ativo` ou `inativo`;
  - `criado_em` e `atualizado_em`.
  - Não há caminho gravado.
- **Domínio (`packages/domain/src/locais/arvore.ts`):** `montarArvore(locais)` devolve:
  - `caminho(id)`, como "Jundiaí › Expedição";
  - `ancestrais(id)` e `ramo(id)` (o próprio local e os de dentro);
  - `profundidade(id)` e `alturaDoRamo(id)`;
  - `podeMover(id, novoPai)`, com o motivo da recusa: ciclo, níveis ou nome repetido.
- **API:**
  - lê a árvore inteira, que tem centenas de linhas, sempre que precisa de ramo ou caminho;
  - toda mudança na árvore abre a transação com `pg_advisory_xact_lock` da organização na chave `locais`, para dois movimentos simultâneos não formarem um ciclo;
  - os 8 níveis e o ciclo são conferidos pelo domínio, dentro da trava.
- **Por quê:** a árvore é pequena, e o domínio puro testa ciclo, profundidade e caminho por tabela de casos. A consulta com escopo vira `local_id = any($ramo)`.
- **Alternativas:**
  - `ltree`: a primeira extensão do banco, com rótulos sem os hífens do UUID;
  - um caminho em `uuid[]` mantido por gatilho: mais rápido em árvores enormes, ao custo de regravar o ramo a cada movimento;
  - `WITH RECURSIVE` em cada consulta.

  Se uma organização passar de alguns milhares de locais, o caminho gravado entra sem mudar a API.

### 4. Perfis, grupos e atribuições
- **Tabelas novas** (todas `orgScoped`, com RLS forçado e chaves compostas):
  - **`perfis`:**
    - `nome`, `nome_normalizado` (único na organização) e `descricao`;
    - `permissoes text[]`;
    - `todas_as_permissoes`, `protegido` e `exige_dois_passos`;
    - `situacao` (`ativo` ou `inativo`), `criado_em` e `atualizado_em`;
    - check: só o protegido tem `todas_as_permissoes`.
  - **`grupos`:** `nome`, `nome_normalizado` (único), `descricao`, `situacao` e os momentos.
  - **`membros_do_grupo`:**
    - `grupo_id` e `conta_id`;
    - `incluida_em` e `encerrada_em`;
    - único parcial `(org_id, grupo_id, conta_id) where encerrada_em is null`.
  - **`atribuicoes`:**
    - `perfil_id`, e `conta_id` ou `grupo_id`, com check de exatamente um;
    - `local_id`, nulo para a organização inteira;
    - `criada_em` e `encerrada_em`;
    - único parcial `nulls not distinct (org_id, perfil_id, conta_id, grupo_id, local_id) where encerrada_em is null`;
    - índices `(org_id, conta_id)` e `(org_id, grupo_id)`.
- **Permissões do perfil numa coluna:**
  - a mudança é um `UPDATE` com "antes → depois" na auditoria;
  - uma chave que saiu do catálogo é ignorada na resolução e somida na próxima gravação.
- **Participações e atribuições nunca se apagam:** encerrar grava `encerrada_em`, e o histórico fica no banco e na auditoria.
- **Administrador:** `todas_as_permissoes = true` e `protegido = true`. A API recusa alterar ou inativar com `perfil-protegido` (409).
- **Por quê:** "nada se exclui, tudo se inativa" (seção 5.2). Com `todas_as_permissoes`, as permissões dos módulos futuros chegam ao Administrador sem migration.
- **Alternativa:** uma tabela `permissoes_do_perfil`, com uma linha por permissão. Daria mais linhas para auditar e apagar, e o mesmo resultado.

### 5. Acesso efetivo carregado com a sessão
- **Carga:** `lerSessao` passa a carregar, na mesma transação, as atribuições em vigor da conta, diretas e pelos grupos ativos de que ela participa, com os perfis ativos, numa consulta só.
- **Resolução:** `resolverAcesso(linhas)` (`packages/domain/src/acesso/acesso.ts`) devolve um `Acesso`:
  - `permissoes`: `Map<Permissao, { organizacao: boolean; locais: Set<string> }>`, já com as incluídas;
  - `exigeDoisPassos` e `perfisQueExigem`;
  - `origens`, para a tela explicar de onde vem cada permissão.

  Uma permissão `organizacao` numa atribuição com local é ignorada.
- **Funções:**
  - `pode(acesso, chave)`: a conta tem a permissão em algum escopo;
  - `podeEm(acesso, chave, localId, arvore)`: um `localId` nulo exige o escopo da organização;
  - `alcance(acesso, chave, arvore)`: `'organizacao'`, o conjunto dos ids de todos os ramos, ou `null`.
- **Exigência dos dois passos:** a pendência usa `conta.exigeDoisPassos || acesso.exigeDoisPassos`.
  - Uma sessão que já vale e ganha a pendência `cadastrar-dois-passos` fica pendente desse passo.
  - Ao concluir o cadastro, ela recebe token novo, mas mantém `ativada_em` e `expira_em`: o `seguirEntrada` só grava a ativação quando `ativada_em` é nula.
- **Estado da sessão:**
  - o `GET /sessao` ganha `acesso: { permissoes: { chave, organizacao, locais[] }[] }` na sessão ativa;
  - o `GET /conta` ganha `doisPassos.exigidaPor: { conta: boolean; perfis: string[] }`.
- **Por quê:** uma consulta pequena por requisição deixa toda mudança valendo já na requisição seguinte (spec `permissoes`), sem cache para invalidar.

### 6. Guarda de permissão por rota
- **Declaração:** cada rota do escopo de acesso declara, na `config`, `permissao: Permissao` ou `semPermissao`, que é um destes:
  - `'entrada'`: as rotas da sessão;
  - `'propria-conta'`: `/conta/...`;
  - `'referencia'`: `GET /locais` e `GET /acesso/administradores`.
- **Aplicação:** um gancho `onRoute` do escopo acrescenta `exigirAtiva` e `exigirPermissao(chave)` antes do `preHandler` da rota que declara `permissao`.
- **Recusa:**
  - problem `sem-permissao` (403), com `detail` "Você não tem permissão para <descrição>." e os extras `permissao` e `administradores`: até 3 nomes de pessoas ativas com `acessos.administrar` para a organização inteira, em ordem alfabética;
  - a auditoria grava `permissao.recusada` numa transação própria: ator, `alvo: { tipo: 'rota' }` e `dados: { permissao, metodo, rota, parametros }`, com a rota no padrão (`/pessoas/:id`) e sem o corpo.
- **Registro fora do escopo:** `exigirEm(requisicao, chave, localId, arvore)` é chamado pela rota depois de ler o registro, com a mesma recusa e o mesmo registro.
- **Teste-guarda (`rotas.test.ts`):** monta o `criarApp`, coleta as rotas pelo `onRoute` e reprova a do escopo de acesso que não declara `permissao` nem `semPermissao`.
- **Ações de cada registro:** cada registro devolvido diz o que a conta pode fazer com ele (`permite: { editar, inativar, … }`), calculado com o `podeEm` do mesmo acesso. A tela nunca deduz.
- **Por quê:** o escopo de uma rota só se conhece depois de ler o registro, e a declaração na rota cobre a recusa geral e entrega ao teste-guarda uma lista simples.

### 7. Último administrador
- **Conta administradora:** a que está ativa, de pessoa ativa, com `acessos.administrar` numa atribuição em vigor sem local, direta ou por grupo ativo, de perfil ativo com a permissão ou com `todas_as_permissoes`.
- **Contagem:** `contarAdministradores(tx)`, numa consulta SQL só.
- **Proteção:** toda transação que pode diminuir esse número começa com `pg_advisory_xact_lock` da organização na chave `acessos` e confere a contagem antes do commit. Com zero, ela desfaz tudo e responde `ultimo-administrador` (409).
- **Mudanças cobertas:**
  - inativar a conta ou a pessoa;
  - anonimizar a pessoa;
  - encerrar a atribuição;
  - retirar a conta do grupo;
  - inativar o perfil ou o grupo;
  - editar as permissões de um perfil.
- **Por quê:** a trava serializa as mudanças de acesso da organização, que são raras. A conferência depois da mudança cobre todos os caminhos com uma regra só, inclusive as duas retiradas simultâneas da spec.

### 8. Administrador nas organizações
- **`organizacao criar`:** cria o Administrador e o atribui à primeira conta, sem local.
  - O `--sem-exigir-dois-passos` vale para a conta e para o perfil.
- **`conta criar --administrador`:** cria a conta e atribui o perfil.
- **Organizações que já existem:** uma migration cria o Administrador e o atribui à conta mais antiga de cada uma.
  - O perfil exige os dois passos se essa conta exigia.
  - Como dono das tabelas, a migration desliga o `FORCE ROW LEVEL SECURITY` de `organizacoes` e `contas` só durante a semeadura, na mesma transação, e o religa em seguida. O teste-guarda confere o estado final.
  - Um teste de integração aplica as migrations até a anterior, cria uma organização com conta e aplica o resto.
- **Por quê:** toda organização precisa de quem administre os acessos desde o primeiro minuto (spec `perfis-e-grupos`), e o banco de desenvolvimento já tem uma organização.

### 9. Pessoa ampliada e conta anonimizável
- **`pessoas` ganha:**
  - `matricula`, com único `(org_id, matricula)`;
  - `local_id`, com chave composta;
  - `telefone`;
  - `busca`: `normalizarTexto` do nome, da matrícula e do e-mail;
  - `anonimizada_em`.
- **Situações:** `ativa`, `inativa` ou `anonimizada`.
- **Regras puras (`packages/domain/src/pessoas/pessoa.ts`):** `validarPessoa`, com as mensagens da spec, e `textoDeBusca`.
- **Busca:** cada palavra normalizada precisa aparecer em `pessoas.busca` ou em `contas.usuario` (`like`). Sem índice de trigramas, porque as listas têm milhares de pessoas, não milhões.
- **`contas`:**
  - `usuario` e `hash_senha` ficam anuláveis, com o check `(situacao = 'anonimizada') = (usuario is null and hash_senha is null)`;
  - a situação aceita `anonimizada`.
  - O código do F2a que lê a conta pelo usuário nunca encontra o nulo. Os tipos passam a dizer `string | null`, e o `typecheck` aponta cada uso.
- **Motivos novos do fim da sessão:** `conta-inativada`, `encerrada-pela-administracao` e `dois-passos-removidos`, com o check refeito.

### 10. Anonimização
- **Transação** (com a trava `acessos`):
  1. confere que a pessoa está inativa, que não é a da sessão e que não é a última administradora;
  2. grava em `pessoas` o nome `Pessoa anonimizada XXXX` (4 caracteres Crockford ao acaso), anula os campos pessoais, `situacao = 'anonimizada'` e `anonimizada_em`;
  3. na conta: `usuario`, `hash_senha` e as exigências anulados, e `situacao = 'anonimizada'`;
  4. apaga a verificação em dois passos e os códigos de recuperação;
  5. em `sessoes`, `ip` e `agente` anulados;
  6. apaga as `tentativas_de_entrada` do usuário antigo;
  7. encerra as atribuições e as participações;
  8. grava na auditoria `pessoa.anonimizada`, com `dados: { camposApagados, conta }` e sem antes nem depois.
- **Por quê:** a política decidida com o usuário. A auditoria fica intacta pela retenção (seção 6.7), e o registro novo não copia o que se apagou.
- **Nome mostrado:** a consulta da auditoria mostra o nome atual da pessoa do ator, o anonimizado.

### 11. Rotas e contrato

| Rota | Exige | Faz |
|---|---|---|
| `GET /acesso/administradores` | sessão ativa | até 3 nomes de quem administra os acessos |
| `GET /locais` | sessão ativa | todos os locais `{ id, paiId, nome, tipo, situacao }` |
| `POST /locais` | `locais.editar` no pai (raiz: organização) | cadastra |
| `PATCH /locais/:id` | `locais.editar` no local | nome e tipo |
| `POST /locais/:id/movimento` | no local e no destino | `{ paiId }` |
| `POST /locais/:id/inativacao`, `/reativacao` | no local | — |
| `GET /pessoas` | `pessoas.ver` (alcance) | `busca`, `situacao`, `conta`, `local`, `cursor`, `limite` |
| `POST /pessoas` | `pessoas.editar` no local escolhido | cadastra |
| `GET /pessoas/:id` | `pessoas.ver` no local | a pessoa, o resumo da conta e o `permite` |
| `PATCH /pessoas/:id` | `pessoas.editar` no local atual e no novo | edita |
| `POST /pessoas/:id/inativacao`, `/reativacao` | `pessoas.editar` | — |
| `POST /pessoas/:id/anonimizacao` | `pessoas.anonimizar` | — |
| `POST /pessoas/:id/conta` | `contas.administrar` | `{ usuario, exigeDoisPassos }` e devolve a senha temporária |
| `PATCH /contas/:id` | `contas.administrar` | usuário e exigência |
| `POST /contas/:id/redefinicao` | `contas.administrar` | `{ removerDoisPassos }` e devolve a senha temporária |
| `POST /contas/:id/remocao-dos-dois-passos` | `contas.administrar` | — |
| `POST /contas/:id/desbloqueio` | `contas.administrar` | — |
| `POST /contas/:id/inativacao`, `/reativacao` | `contas.administrar` | — |
| `GET /contas/:id/sessoes` | `contas.administrar` | as sessões abertas |
| `DELETE /contas/:id/sessoes` | `contas.administrar` | encerra todas |
| `GET /contas/:id/acesso` | `acessos.ver` | atribuições, grupos e permissões efetivas com as origens |
| `GET /perfis`, `GET /perfis/:id` | `acessos.ver` | lista e ficha, com quem tem |
| `POST /perfis`, `PATCH /perfis/:id` | `acessos.administrar` | cadastra e edita |
| `POST /perfis/:id/inativacao`, `/reativacao` | `acessos.administrar` | — |
| `GET /grupos`, `GET /grupos/:id` | `acessos.ver` | lista e ficha, com membros e perfis |
| `POST /grupos`, `PATCH /grupos/:id` | `acessos.administrar` | cadastra e edita |
| `POST /grupos/:id/inativacao`, `/reativacao` | `acessos.administrar` | — |
| `POST /grupos/:id/membros` | `acessos.administrar` | `{ contaId }` |
| `DELETE /grupos/:id/membros/:contaId` | `acessos.administrar` | encerra a participação |
| `POST /atribuicoes` | `acessos.administrar` | `{ perfilId, contaId \| grupoId, localId }` e devolve as `ignoradas` |
| `DELETE /atribuicoes/:id` | `acessos.administrar` | encerra |
| `GET /auditoria` | `auditoria.ver` | a lista com filtros, o cursor e o total |
| `GET /auditoria/contas` | `auditoria.ver` | contas para o filtro "quem fez", inclusive as inativas e as anonimizadas |

- **Ações de mudança de estado:** `POST` em subrecursos com nome de ação, como `/inativacao`, seguindo o F2a (`/conta/dois-passos/desativacao`).
- **Problemas novos:**
  - `sem-permissao` (403);
  - `ultimo-administrador`, `perfil-protegido`, `pessoa-ativa`, `local-em-uso`, `local-pai-inativo` e `conflito` (409), este com `campos` quando um nome, uma matrícula ou um usuário se repete;
  - `propria-conta` (409), que recusa as ações sobre a própria conta ou pessoa.
- **Contrato:** os schemas Zod nomeados geram o OpenAPI, e `pnpm contrato:gerar` regenera o cliente.

### 12. Listas paginadas por cursor
- **Pedido:** `limite` de 1 a 100, com padrão 50, e `cursor` opaco: o base64url de um JSON com a chave da ordem e o id. Um cursor ilegível responde `dados-invalidos`.
- **Ordem:**
  - pessoas por `(nome, id)`, na collation do banco, com a comparação de tupla na mesma ordem;
  - auditoria por `(momento, id)`, decrescente ou crescente;
  - perfis, grupos e locais vêm inteiros, porque são poucos.
- **Resposta:** `{ itens, proximo }`.
- **Total da auditoria:** `select count(*) from (… limit 10001)`. Acima de 10.000, a resposta diz `{ total: 10000, maisDe: true }`.
- **Por quê:** um cursor não pula nem repete registros quando chegam linhas novas no topo, e o teto da contagem mantém a consulta barata em milhões de linhas.

### 13. Consulta da auditoria
- **Filtros:**
  - `de` e `ate`: instantes ISO. A web converte as datas do fuso escolhido no começo e no fim do dia;
  - `ator`: um id de conta;
  - `acao`;
  - `alvo`: repetível, como `pessoa:<id>` e `conta:<id>`;
  - `rastreio`;
  - `ordem`: `recentes` ou `antigos`.
- **Nomes:** os de quem fez e do alvo são resolvidos na consulta, por junções à esquerda:
  - o ator `conta`, pela pessoa da conta;
  - o alvo, por tipo: `pessoa`, `conta` (a pessoa dela), `perfil`, `grupo` e `local`;
  - a `sessao`, pelo agente, com `descreverDispositivo`.
- **Rótulos das ações:** `ACOES_DA_AUDITORIA`, no domínio, com o texto de cada ação. Um teste confere que toda ação gravada pela API tem rótulo, e a ação desconhecida aparece pela chave.
- **Histórico da pessoa:** filtra `alvo=pessoa:<id>` e, se houver conta, `alvo=conta:<id>`.

### 14. Web: dados da API e acesso
- **TanStack Query:**
  - um `QueryClient` no `App`, abaixo da sessão;
  - `refetchOnWindowFocus` ligado e `retry` só para falha de rede;
  - chaves por área (`['pessoas', filtros]`, `['pessoa', id]`…);
  - as mutações invalidam a área;
  - um ajudante `consultar(fazer, acao)` usa o `pedir()` do F2a, para a falha chegar à tela em texto;
  - as listas paginadas usam `useInfiniteQuery`, com o `proximo`.
- **Loja da sessão:**
  - o estado `ativa` guarda o `acesso`, e `useAcesso()` devolve `pode(chave)` e a lista crua;
  - o cliente avisa a loja numa resposta 403 `pendencia` (validar de novo, e a entrada cobre a casca com o cadastro) e numa 403 `sem-permissao` (validar de novo, e os menus se atualizam).
- **Registro filtrado:**
  - `ModuloRegistrado`, `ItemDoMenuDoModulo`, `EntradaDeBuscaDoModulo`, `ProvedorDeBusca` e `FonteDeOcorrencias` ganham `permissoes?: readonly Permissao[]`;
  - `registroDaConta(registro, pode)`, uma função pura, devolve só o que a conta pode usar;
  - a casca, a busca e a tela inicial passam a ler o registro filtrado;
  - com a sessão desconhecida, `pode` é sempre falso.
- **Por quê:** o TanStack Query está na spec mestre (seção 4.2), e o F2b é a primeira vez que a web lista, edita e invalida dados do servidor em várias telas.
- **Alternativa:** estender o `useLeitura` da seção Conta. Ele cresceria até reimplementar cache, invalidação e paginação.

### 15. Módulo Administração
- **Rotas:**
  - `/administracao`, que leva à primeira seção permitida;
  - `/administracao/pessoas`, `/administracao/pessoas/nova` e `/administracao/pessoas/$id`;
  - `/administracao/perfis`, `/administracao/perfis/novo` e `/administracao/perfis/$id`;
  - `/administracao/grupos`, `/administracao/grupos/novo` e `/administracao/grupos/$id`;
  - `/administracao/locais`;
  - `/administracao/auditoria`, com os filtros na query string, para o histórico de uma ficha chegar já filtrado.
- **No celular:** a Administração fica sempre em "Mais". A prioridade no celular do registro aceita `'mais'`, e a barra de abas mostra "Mais" quando algum módulo a pede, mesmo com menos de cinco módulos (spec `posturas-da-casca`).
- **Leiaute:**
  - a lista de seções ao lado do conteúdo, como nos Ajustes. A peça comum sai do `AjustesDoSistema` para `packages/ui` (`JanelaComSecoes`), e os Ajustes passam a usá-la;
  - cada seção começa pelo `TituloDaJanela`;
  - a tela "sem permissão" usa o `EstadoVazio` com o cadeado e os nomes do `GET /acesso/administradores`.
- **Formulários:** em página (pessoa, perfil e grupo), numa gaveta para o local, mantendo a árvore à vista, e num diálogo para as confirmações (ANTISLOP §22).
- **Seletores:**
  - `SeletorDeLocal`: os locais ativos pelo caminho, na `BuscaComSugestoes` só com as sugestões;
  - `SeletorDeConta`: as contas pela API, enquanto se digita. A `BuscaComSugestoes` ganha o modo de sugestões vindas de fora (`items` controlado), sem o filtro local.
- **Ficha da pessoa:**
  - as abas Dados, Acesso e Histórico;
  - as ações à vista, com as destrutivas separadas;
  - a senha temporária num diálogo com o `TextoParaCopiar` e o aviso de que não aparece de novo.
- **Busca:** o provedor "Pessoas" (`GET /pessoas?busca=…&limite=8`, com `permissoes: ['pessoas.ver']`) e as entradas "Nova pessoa", "Novo perfil", "Novo grupo" e "Novo local", cada uma com a permissão dela. O provedor é chamado fora dos componentes: a casca passa a ele o cliente da API da sessão, como terceiro argumento do `buscar`.

### 16. Componentes novos no `packages/ui`
- **`Arvore` (`componentes/arvore`):**
  - o `Tree` do React Aria, com itens aninhados `{ id, rotulo, icone, detalhe?, situacao?, filhos? }`;
  - a escolha única e a expansão controláveis;
  - linhas na altura da densidade.
- **`CampoDeData` (`componentes/campo`):**
  - o `DateField` do React Aria, com o `I18nProvider` em `pt-BR`;
  - valor `string | null` em `aaaa-mm-dd`;
  - o `@internationalized/date` como dependência direta.
- **`FiltrosAtivos` (`componentes/filtros`):** `{ id, rotulo, valor }[]`, com `aoLimpar(id)` e `aoLimparTodos()`.
- **`TextoParaCopiar` (`componentes/copiar`):**
  - o `Copiar` da entrada, generalizado: o valor em JetBrains Mono, "Copiar" e depois "Copiado";
  - os passos da entrada passam a usá-lo.
- **`Tabela`:** a propriedade `carregarMais?: { haMais, carregando, aoCarregar, rotulo? }` desenha, logo depois da tabela, "Carregar mais", com o estado de carregando e sem pedido duplo. Quando acabam os registros, o foco do botão passa à primeira linha nova.
- **`JanelaComSecoes`:** a lista de seções e o conteúdo, com os grupos e a troca no celular, saída dos Ajustes.
- **`Dialogo`:** abre e fecha também por fora (`aberto` e `aoMudarAberto`), para o diálogo que muda depois da ação, como a confirmação que passa a mostrar a senha temporária, e para quem precisa saber quando ele fecha, por qualquer caminho.

Cada componente tem histórias, testes de interação e captura na regressão visual.

### 17. Testes
- **Unitários do domínio:**
  - o catálogo;
  - a árvore: caminho, ramo, profundidade, ciclo e níveis;
  - `resolverAcesso`, `pode`, `podeEm` e `alcance`: direto, por grupo, inativos, escopo, inclusões e `todas_as_permissoes`;
  - `validarPessoa` e `textoDeBusca`;
  - os rótulos da auditoria.
- **Integração do banco:**
  - isolamento e chaves compostas das tabelas novas;
  - unicidades: os nomes entre irmãos, a matrícula, os nomes de perfis e grupos e as ativas parciais;
  - o check da conta anonimizada;
  - a migration do Administrador.
- **Integração da API, contra PostgreSQL real:** cada rota com:
  - a conta sem permissão (403 e auditoria);
  - a conta com escopo de local (filtro e recusa fora do ramo);
  - a conta da organização inteira.
  
  E também:
  - o último administrador, com duas transações simultâneas;
  - a pendência no meio da sessão;
  - a anonimização inteira;
  - a auditoria com filtros, cursor e o teto do total;
  - o teste-guarda das rotas.
- **Web:**
  - os testes de componente das telas, com a API simulada;
  - o `registroDaConta` e o `useAcesso`;
  - a cobertura da casca quando a pendência surge.
- **Ponta a ponta:**
  - com a API simulada:
    - a administração com uma conta administradora;
    - a casca de uma conta sem permissões;
    - a tela "sem permissão";
  - pela pilha real: o administrador cadastra uma pessoa, cria a conta e atribui um perfil, e a conta nova entra, troca a senha e vê só o que o perfil dá.
- **Visual:** as histórias novas em Grafite e Névoa, nas três larguras.

### 18. Spec mestre e contrato de módulo
- **Spec mestre:**
  - **seção 5.1:** a árvore livre com tipos, e o rack como ativo;
  - **seção 5.2:** os dados da pessoa;
  - **seção 9.2:** a exigência dos dois passos pelo perfil;
  - **seção 9.3:** o escopo na atribuição, o catálogo no código, o Administrador e o último administrador;
  - **seção 9.9:** a política de anonimização;
  - **seção 15:** sai a decisão da LGPD.
- **`docs/casca/modulos.md`:**
  - as permissões no registro;
  - `useAcesso()`;
  - o alcance nas consultas da API;
  - o TanStack Query para os dados do servidor;
  - a tela "sem permissão".

  Os trechos são conferidos pelo `documentacao.test.ts`.

## Risks / Trade-offs

- **[Uma consulta de lista nova esquece o escopo]** → O `alcance()` é a única forma de filtrar. Cada rota de lista tem um teste de integração com uma conta de escopo de local, e a revisão do P1 confere o mesmo.
- **[Uma consulta a mais por requisição para o acesso]** → As tabelas são pequenas e têm índices por conta e por grupo. Se aparecer no p95, um cache por sessão de poucos segundos entra sem mudar o contrato.
- **[A árvore lida inteira]** → São centenas de linhas. O caminho gravado fica como evolução (decisão 3).
- **[O nome atual reescreve o "quem fez" de registros antigos]** → A auditoria guarda o id da conta, e o nome é só a apresentação. A troca de nome e a anonimização aparecem assim de propósito, e o "antes → depois" guarda o nome da época quando foi ele que mudou.
- **[Dados pessoais na auditoria depois da anonimização]** → É a política decidida, com base legal e só para quem consulta a auditoria. A spec mestre a registra.
- **[O `FORCE` desligado na migration]** → Fica dentro da transação da migration, que roda como dono, e o teste-guarda confere o estado final.
- **[Telas desatualizadas sem eventos]** → A tela relê ao voltar o foco e a cada recusa. Os eventos do F2c fecham o intervalo.
- **[Usuário e hash anuláveis]** → O `typecheck` aponta cada leitura, e a entrada nunca encontra uma conta anonimizada, porque procura pelo usuário.

## Migration Plan

Nada está em produção. As migrations novas acrescentam tabelas e colunas, e a do Administrador semeia o perfil nas organizações que existem: no banco de desenvolvimento, a conta `admin` recebe o Administrador sem exigir os dois passos, como a conta. Desfazer é reverter os commits da change e recriar o volume do banco de desenvolvimento.
