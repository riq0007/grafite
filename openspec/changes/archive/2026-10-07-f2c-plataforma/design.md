## Context

A motivação está em `proposal.md` (Why), e os requisitos, nas specs desta change. Pontos de partida que importam aqui:
- **Preferências na web (`apps/web/src/preferencias/`):**
  - o modelo `PreferenciasDaInterface`, o `PADRAO_DE_FABRICA` e o `lerPreferencias`, que valida campo a campo;
  - as listas de opções vêm do `@grafite/ui`: temas, destaques, densidades, limites do dock e do raio, colunas da tela inicial e `fusoReconhecido`;
  - a cópia fica no `localStorage` (`grafite.preferencias`, versão 1, e `grafite.aparencia` do F0), e o script anti-flash do `index.html` copia `grafite.preferencias.atributos` para o `<html>`;
  - `usePreferencias()` devolve `{ preferencias, mudar, restaurar }`, e as seções dos Ajustes o usam direto.
- **Sessão:**
  - `GET /api/sessao` devolve `{ organizacao: { nome }, sessao }`, e a loja da web (`sessao/loja.ts`) guarda o estado fora do React;
  - a chegada tem as etapas "Carregando o Grafite", "Carregando suas preferências" (a cópia local), "Validando sessão" e "Pronto", e a casca só aparece depois de "Pronto";
  - `lerSessao` toca `ultimo_uso_em` a cada requisição, no máximo uma vez por `TEMPOS_DA_SESSAO.toque`.
- **API:**
  - só JSON, com limite de 1 MiB e 415 para outro tipo;
  - a guarda por rota (`config.permissao` ou `config.semPermissao`);
  - `registrarNaAuditoria(tx, registro)` com o catálogo `ACOES_DA_AUDITORIA`;
  - nenhuma rota de streaming nem hook `onClose`.
- **Banco:**
  - os papéis `grafite_owner` e `grafite_app`, este com DML por privilégio padrão só no esquema `public`;
  - o teste-guarda do RLS confere só o `public`;
  - `app.organizacao_do_endereco` é a única função que atravessa organizações;
  - as migrations vão até a 0010.
- **Web:**
  - o TanStack Query, que relê ao voltar o foco;
  - o `Avatar` do `packages/ui`, que já aceita `imagem` e cai nas iniciais quando ela não carrega;
  - nenhum código de SSE, `EventSource` nem envio de arquivo;
  - o item de rede confere `/api/health` a cada 50 s.
- **Imagem de contêiner:**
  - a etapa `api-isolada` instala as dependências de produção da API, mas copia só `apps/api`, sem os pacotes do workspace que a API importa desde o F2a. A imagem não sobe hoje, e nenhum job do CI a constrói;
  - a imagem final é `node:24-alpine`, e as dependências são instaladas numa etapa `node:24-slim`.

Restrições:
- **Isolamento:** toda tabela nova usa `orgScoped()` e RLS forçado, com chaves estrangeiras compostas (regra 6 do `CLAUDE.md`).
- **Fase 1:** os componentes compartilhados ainda mudam aqui, pela sessão principal.
- **Commits:** um por tarefa (regra 8 do `CLAUDE.md`).

## Goals / Non-Goals

**Goals:**
- **Um modelo de preferências só:** o domínio valida e resolve as camadas, igual na API e na web.
- **Nenhuma mudança auditada sem evento:** a mesma chamada que grava a auditoria grava o evento.
- **Fila pronta para a fase 2:** uma tarefa nova é uma entrada no catálogo de tarefas, com as tentativas e a lista de falhas de graça.
- **Imagens reaproveitáveis:** o tratamento e o armazenamento servem às imagens dos modelos do P1, sem mudança.

**Non-Goals:**
- **Concorrência otimista nos formulários:** quem salva por último continua valendo. O formulário só não perde o que foi digitado.
- **Arquivos que não são imagem:** os backups do Control iD (P5) e o GLB (T1) usam o mesmo armazenamento, mas as rotas deles ficam para lá.
- **Armazenamento em S3:** só a interface e a implementação em disco.
- **Notificações gravadas e toast vindo de eventos:** P3.

## Decisions

### 1. Modelo das preferências no domínio
- **Escolha:** `packages/domain/src/preferencias/` passa a ter:
  - o tipo `PreferenciasDaInterface` e o `PADRAO_DE_FABRICA`, que saem da web;
  - `AjustesDasPreferencias`: cada seção parcial, só com os campos mudados;
  - `lerAjustes(bruto)`: valida uma camada campo a campo, prende os números no intervalo e descarta o desconhecido;
  - `resolverPreferencias(...camadas)`: fábrica, depois cada camada por cima, campo a campo;
  - `aplicarMudanca(camada, mudanca)`: um valor grava o campo, `null` o tira (merge patch, RFC 7396);
  - as listas de opções, escritas no domínio: temas, destaques, densidades, posições do dock, tempos do aviso, colunas da tela inicial e os limites numéricos;
  - `fusoReconhecido`, por `Intl.DateTimeFormat` dentro de um `try`, que funciona no Node e no navegador.

  Um teste da web confere que as listas do domínio são as chaves dos tokens do `@grafite/ui`. Um tema novo nos tokens reprova o teste até entrar no domínio. A API monta o esquema Zod estrito das gravações a partir das mesmas listas.
- **Por quê:** a mesma regra valida o que a API grava e o que a web lê. O domínio continua sem dependências, e a API não puxa o React.
- **Alternativas:**
  - **o domínio importar do `@grafite/ui`:** traz o React para a API;
  - **a API guardar o JSON sem validar:** fere a validação por schema em toda entrada (seção 9.7 da spec mestre).

### 2. Camadas guardadas em colunas
- **Escolha:** `organizacoes.preferencias` e `contas.preferencias`, em `jsonb not null default '{}'`, cada uma só com os campos mudados, com um check de até 8 KB. O papel da aplicação já altera as duas tabelas pelos privilégios padrão do `public`, e o RLS segura a organização.
- **Por quê:** guardar só o que mudou é o que faz "vale para quem não mudou aquele ajuste". Guardar o objeto inteiro congelaria os padrões da organização no dia da primeira gravação. O nível do perfil (A1) ganha a coluna no perfil e a regra de prioridade entre perfis, que ainda não tem caso de uso.
- **Alternativa:** uma tabela `preferencias` com nível e dono anulável, que traz mais junções e uma chave polimórfica sem uso agora.

### 3. Rotas das preferências
- **Escolha:**
  - **`GET /api/sessao`:**
    - traz sempre `organizacao.preferencias`;
    - com a sessão que vale, traz também `sessao.conta.foto` e `sessao.conta.preferencias`, e nada disso com a sessão pendente.
  - **`PATCH /api/conta/preferencias`** (exceção `propria-conta`, só sessão que vale):
    - recebe `{ mudancas }` no formato merge patch e devolve a camada da conta;
    - não vai para a auditoria e grava o evento `preferencias.mudaram`.
  - **`PATCH /api/organizacao/padroes`** (`organizacao.editar`):
    - mesmo formato;
    - auditoria `padroes.alterados`, com o antes e o depois dos campos mudados;
    - evento `padroes.mudaram`.

  Um campo inválido recusa o pedido inteiro com 400, com a mensagem no campo. Cada gravação lê a linha com `for update`, aplica a mudança e grava: duas abas que mudam campos diferentes não se atropelam, e no mesmo campo vale a última.
- **Por quê:** o estado da sessão já é o que a web lê na chegada. As preferências vindo junto não custam uma requisição a mais nem uma etapa nova.

### 4. Sincronização na web, por trás do mesmo `usePreferencias()`
- **Escolha:**
  - **Estado:** `{ organizacao, conta, pendentes }`. A que vale é `resolverPreferencias(organizacao, conta + pendentes)`; sem sessão que vale, só `organizacao`.
  - **`mudar` e `restaurar`:**
    - valem na hora e acumulam a mudança em `pendentes`, e `restaurar` vira `null` em cada campo da seção;
    - os pendentes vão à API 400 ms depois da última mudança, então arrastar um controle grava uma vez, e também quando a página fica oculta, com `keepalive`.
  - **Sem servidor:** os pendentes ficam na cópia, com o `contaId`. Vão quando a sessão volta a valer para a mesma conta, e são descartados se ela volta para outra ou sem sessão.
  - **Cópia (`grafite.preferencias`, versão 2):** `{ versao: 2, contaId, organizacao, conta, pendentes }`. O anti-flash não muda: continua lendo `grafite.preferencias.atributos`. Depois de "Sair", a cópia é regravada sem a conta.
  - **Chegada:** as etapas não mudam. "Carregando suas preferências" aplica a cópia, e "Validando sessão" traz as camadas do servidor, aplicadas antes de "Pronto", então antes de a casca aparecer.
  - **Eventos:** `preferencias.mudaram` e `padroes.mudaram` releem o estado da sessão (espera de 300 ms) e aplicam as camadas.
  - **Passagem da versão 1:** na primeira sessão que vale com a camada da conta vazia, os campos da cópia antiga que diferem da fábrica entram em `pendentes`. Com a camada já preenchida, a cópia antiga é descartada. Nos dois casos, a cópia é regravada na versão 2.
- **Por quê:** os módulos e a casca continuam lendo `usePreferencias()`. A troca para o servidor fica dentro do provedor, como a seção 3.3 da spec mestre previu ("o F2 entra por baixo").

### 5. Padrões da organização com rascunho
- **Escolha:**
  - as seções de preferências dos Ajustes passam a ler um **alvo** por contexto (`AlvoDasPreferencias`), que por padrão é a conta. A tela de padrões fornece o alvo da organização: um rascunho sobre a camada gravada;
  - as prévias das seções (a tabela e o aviso de exemplo e a hora do fuso) leem o alvo, e não a casca;
  - a barra do rascunho mostra quantos ajustes mudaram, "Descartar" e "Salvar padrões";
  - sair com o rascunho pendente passa pelo bloqueio de navegação do TanStack Router, com o diálogo de confirmação.
- **Por quê:**
  - o padrão vale para a organização inteira, e salvar de uma vez grava um registro de auditoria por decisão, e não um por passo do controle deslizante;
  - a casca de quem edita não muda no meio da edição;
  - as seções são as mesmas dos Ajustes, sem duplicar formulário.
- **Alternativa:** gravar na hora, como nos Ajustes, o que encheria a auditoria e mudaria a tela de todos durante o arraste.

### 6. Armazenamento e registro dos arquivos
- **Escolha:**
  - **Interface:** `Armazenamento { gravar(chave, conteudo), abrir(chave), apagar(chave) }` em `apps/api/src/arquivos/`, com `ArmazenamentoEmDisco(pasta)`:
    - chave `<org_id>/<arquivo_id>/<variante>`;
    - gravação atômica, num arquivo temporário renomeado no fim;
    - apagar o que não existe não é erro.
  - **Tabela `arquivos`** (`orgScoped`):
    - `tipo`, `bytes`, `largura`, `altura` e `variantes`;
    - `enviado_por`, com chave composta para a conta, e `enviado_em`;
    - `removido_em` e `apagado_em`, com um check de que apagado implica removido.
  - **`pessoas.foto_id`:** com chave composta para `arquivos`.
  - **Ordem do envio:**
    1. trata a imagem na memória;
    2. grava as variantes no armazenamento;
    3. numa transação, inclui o arquivo, troca a foto da pessoa, marca a anterior como removida e grava a auditoria e o evento;
    4. se a transação falha, apaga as chaves gravadas.
- **Por quê:**
  - a spec mestre pede a interface trocável por S3 (seção 4.2);
  - imagem no banco incharia o backup e ocuparia uma conexão por entrega.

  O registro sobrevive ao conteúdo, como a sessão sobrevive ao fim: a auditoria aponta para ele.

### 7. Tratamento das imagens
- **Escolha:**
  - **Corpo:**
    - os bytes crus, com `Content-Type` de imagem ou `application/octet-stream`;
    - um parser registrado só no plugin dos envios, com limite de 10 MiB;
    - o resto da API continua só JSON, com 1 MiB.
  - **Tipo pelo conteúdo:**
    - o SVG é reconhecido pelo texto: a raiz `<svg>`, depois do BOM, da declaração XML e dos comentários;
    - o resto, pelo `metadata()` do sharp, que lê o conteúdo: PNG, JPEG, WebP e HEIF com AV1 (o AVIF);
    - o resto é 415.
  - **SVG:**
    - DOMPurify com o perfil SVG sobre o jsdom, carregados só quando chega um SVG;
    - proíbe `script`, `foreignObject`, atributos de evento e toda referência que não seja interna (`#…`);
    - confere que sobrou um `<svg>` com desenho.
  - **Regravação (sharp):**
    - `limitInputPixels` de 50 milhões e `failOn: 'error'`;
    - `rotate()` pelo EXIF;
    - redução a 2048 px no maior lado, sem ampliar;
    - WebP, sem `keepMetadata`, então os metadados saem.
  - **Variantes:**
    - as miniaturas de 512, 256, 128 e 64 px saem da regravada, em WebP;
    - do SVG, a variante completa é o SVG sanitizado, e as miniaturas são desenhadas a partir dele.
  - **Memória:** no máximo dois tratamentos ao mesmo tempo, com o `sharp.concurrency(1)`, para um servidor pequeno.
- **Por quê:** o sharp já reconhece o formato pelo conteúdo, então o `file-type` seria uma dependência a mais. O WebP é exibido por todos os navegadores suportados e é menor.
- **Alternativa:** o multipart, que serve vários arquivos e campos num pedido, o que nenhuma tela pede, e complica o cliente e o parser.

### 8. Rotas das fotos
- **Escolha:**
  - **`PUT` e `DELETE /api/pessoas/:id/foto`:** exigem `pessoas.editar`, no escopo da pessoa.
  - **`PUT` e `DELETE /api/conta/foto`:** exceção `propria-conta`, só com sessão que vale.
  - **`GET /api/pessoas/:id/foto/:arquivo/:tamanho`:** exige `pessoas.ver`, no escopo da pessoa.
  - **`GET /api/conta/foto/:arquivo/:tamanho`:** exceção `propria-conta`.
  - **`tamanho`:** 64, 128, 256, 512 ou `completa`.
  - **Pessoa e estado da sessão:** levam `foto: { id } | null`, e o cliente da API monta os endereços.
  - **Cabeçalhos:**
    - o `Content-Type` do registro, com `X-Content-Type-Options: nosniff` e `Content-Disposition: inline`;
    - `Cache-Control: private, max-age=31536000, immutable`, porque foto nova é endereço novo;
    - o SVG vai com `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox`.
- **Por quê:** cada rota declara a permissão que exige, e o teste-guarda das rotas continua valendo. O identificador do arquivo no endereço deixa o navegador guardar a imagem sem servir a antiga depois da troca.
- **Alternativa:** um `/api/arquivos/:id` genérico, que descobriria o dono para decidir a permissão e esconderia a permissão da declaração da rota.

### 9. Eventos gravados pela auditoria
- **Escolha:**
  - **Tabela `eventos`** (`orgScoped`):
    - `id` (uuidv7), `momento`, `tipo`, `alvo_tipo` e `alvo_id`;
    - quem recebe: `todas`, `permissao`, `locais`, `contas` e `sessoes`, com um check de que há ao menos um.
  - **Domínio:**
    - o catálogo `TIPOS_DE_EVENTO`;
    - `EVENTO_DA_ACAO: Record<AcaoDaAuditoria, TipoDeEvento | null>`, com um teste que exige uma entrada para cada ação do catálogo da auditoria.
  - **`registrarNaAuditoria`:**
    - grava o evento na mesma transação quando a ação tem tipo;
    - para `pessoas.mudaram`, quem chama passa `publico: { locais, contas }`: os locais de trabalho de antes e de depois e a conta da pessoa. O tipo do TypeScript exige o campo nessas ações;
    - os outros tipos tiram o público do tipo e do alvo: `sessao.encerrada` vai para a sessão do alvo, e `locais.mudaram`, `acessos.mudaram` e `padroes.mudaram`, para todas as sessões.
  - **`registrarEvento(tx, evento)`:** para as mudanças sem auditoria, que são as preferências pessoais e as tarefas com falha.
- **Por quê:** a spec mestre diz que não existe mudança sem auditoria nem evento perdido (seção 6.3). Ligar os dois numa chamada torna impossível esquecer o evento de uma mudança auditada.
- **Alternativas:**
  - **`registrarEvento` explícito em cada escrita:** fácil de esquecer, sem garantia estrutural;
  - **gatilhos em cada tabela de negócio:** o SQL não sabe o público (os locais de antes e de depois, a conta da pessoa) sem duplicar as regras de negócio em PL/pgSQL.

### 10. Aviso do banco e distribuição na API
- **Escolha:**
  - **Gatilho:** um `after insert on eventos` faz `pg_notify('grafite_eventos', …)` com o evento inteiro. São só tipo e identificadores, então a carga fica muito abaixo do limite de 8000 bytes.
  - **Ligação:** um `pg.Client` próprio, com o papel da aplicação e fora do pool, faz o `LISTEN`.
    - Se cai, ele refaz a ligação com intervalos crescentes, de 1 s até 30 s.
    - Depois de refeita, a API manda `reiniciar` a todas as conexões.
  - **Na memória:** um `Map<orgId, Set<Conexao>>`, em que cada conexão tem a sessão, a conta e o acesso.
    - O filtro `podeReceber(evento, conexao, arvore)` é uma função pura do domínio, testada por tabela.
    - O escopo usa a árvore de locais da organização, guardada até o próximo `locais.mudaram`.
  - **`acessos.mudaram`:** a API relê o acesso das contas conectadas daquela organização, uma vez por conta, antes de filtrar os eventos seguintes.
  - **Várias instâncias:** cada uma ouve e atende as próprias conexões, sem coordenação.
- **Por quê:** o `LISTEN/NOTIFY` já está na escolha da spec mestre (seção 4.2). O aviso só chega depois do commit, então nunca entrega um evento desfeito.

### 11. Conexão SSE
- **Escolha:**
  - **Rota:** `GET /api/eventos` no escopo de acesso, com `semPermissao: 'propria-conta'` e só para sessão que vale.
    - `reply.hijack()`, com `Content-Type: text/event-stream`, `Cache-Control: no-store` e `X-Accel-Buffering: no`.
    - A primeira linha é `retry: 3000`.
  - **Sinal de vida:** um comentário a cada 25 s. A cada 60 s, a conexão relê a sessão sem tocar `ultimo_uso_em`, com a opção `tocar: false` do `lerSessao`, e, se ela terminou, manda `sessao` e fecha. A abertura da conexão também não toca a sessão.
  - **Retomada:** pelo cabeçalho `Last-Event-ID`, que o `EventSource` manda sozinho, ou por `?desde=`.
    - A API reenvia os eventos com `id` a partir do uuidv7 de 30 s antes do último recebido, filtrados pelo público e em ordem de `id`.
    - A web descarta os repetidos, guardando os últimos 500 identificadores.
    - Um último evento desconhecido ou com mais de 24 h faz a API mandar `reiniciar`.
  - **Encerramento:** um hook `onClose` fecha todas as conexões. Sem ele, o `app.close()` esperaria por elas.
  - **Limites:** no máximo 20 conexões por sessão, e acima disso 429. O limite geral de requisições conta a abertura.
- **Por quê da margem de 30 s:** o uuidv7 segue a ordem de inclusão, e não a do commit. Uma transação que termina depois de outra mais nova seria pulada na retomada. 30 s cobrem qualquer transação da API, que são curtas, e a repetição não faz mal: invalidar uma consulta de novo não muda nada.
- **Alternativas:**
  - **WebSocket:** a tela não fala com o servidor por aqui. O SSE passa pelo proxy, retoma com `Last-Event-ID` sozinho, e o service worker não o intercepta, porque não entra no cache;
  - **consultar a intervalos:** atraso e carga.

### 12. Atualização das telas
- **Escolha:**
  - **Contrato de módulo:** `definirModulo` ganha `eventos?: Partial<Record<TipoDeEvento, (evento) => QueryKey[]>>`.
  - **Provedor da casca:** abre o `EventSource` quando a sessão vale e fecha quando ela deixa de valer. A cada evento, invalida as chaves declaradas, só nas consultas ativas.
  - **Eventos da casca:**
    - `acessos.mudaram` valida a sessão de novo, depois de uma espera aleatória de até 1 s;
    - `padroes.mudaram` e `preferencias.mudaram` seguem a decisão 4;
    - `sessao.encerrada` valida a sessão, que vira "sem sessão", e a tela de entrada aparece;
    - `reiniciar` invalida todas as consultas e valida a sessão.
  - **Formulários e diálogos:** começam dos dados do registro ao abrir e guardam o próprio estado. A releitura atualiza o que é só leitura e não apaga o que foi digitado. Um diálogo aberto fica fora do trecho da tela que a releitura troca: o evento da própria ação, como o da conta criada, relê a ficha enquanto o diálogo ainda mostra a senha temporária.
  - **Aba escondida:** fecha o `EventSource` depois de 5 min oculta e o reabre com `?desde=` ao voltar.
  - **Item de rede:** continua na conferência de `/api/health`. Sem sessão não há conexão de eventos, e duas fontes para o mesmo item poderiam discordar. Sai o comentário do F1 que previa a troca.
  - **Ponta a ponta com a API simulada:** a fixture responde `/api/eventos` com um fluxo vazio, e os testes que precisam empurram eventos por ela.

### 13. Uso da sessão e requisições em segundo plano
- **Escolha:**
  - a web marca a requisição com `x-grafite-segundo-plano: 1` quando o usuário não interage com a página há 5 min ou mais, contando ponteiro, teclado, toque e rolagem;
  - a API não toca `ultimo_uso_em` nessas requisições nem na conexão de eventos;
  - o resto do `lerSessao` não muda.
- **Por quê:** com as telas se atualizando sozinhas, uma casca abandonada sobre uma lista movimentada nunca expiraria. Uma marca, e não o horário da última interação, dispensa comparar o relógio do navegador com o do servidor.
- **Efeito:** as 2 h sem uso contam a partir da última interação, com até 5 min de folga.

### 14. Fila com o pg-boss, sem DDL na aplicação
- **Escolha:**
  - **Versão:** o `pg-boss` 12 fica fixado.
  - **Scripts do `packages/db`:**
    - `pnpm fila:gerar` grava a migration com o SQL de `getConstructionPlans('fila')`, no esquema `fila`;
    - `pnpm fila:verificar` falha quando a versão instalada pede uma migration que ainda não foi gerada (`getMigrationPlans`), e roda no CI, como o `contrato:verificar`.
  - **Permissões na migration:** `usage` no esquema `fila`, DML nas tabelas, `usage` nas sequências e `execute` nas funções para o `grafite_app`, e nada mais.
  - **Partida:** o construtor usa `migrate: false` e `createSchema: false`. As filas usam `partition: false`, o padrão da versão 12, em que criar uma fila é só um `insert` em `fila.queue`.
  - **Catálogo de tarefas (`apps/api/src/fila/tarefas.ts`):** cada tarefa tem o nome técnico, o nome em pt-BR, o esquema Zod dos dados (só identificadores), o trabalho e as opções.
  - **Filas:**
    - **`manutencao-diaria`:** cron `30 3 * * *`, fuso `America/Sao_Paulo` e `missed: 'once'`, que roda uma vez a execução perdida. Lista as organizações por `app.organizacoes_para_tarefas()` e põe uma `manutencao` para cada uma, com a chave única `<org>:<data>`;
    - **`manutencao`:** 5 novas tentativas com `retryBackoff`, a partir de 60 s e com teto de 1 h (`retryDelayMax`), com a fila `tarefas-com-falha` como destino das falhas. O pg-boss dobra o intervalo a cada tentativa, com uma variação aleatória;
    - **`tarefas-com-falha`:** grava a falha em `tarefas_com_falha`, no contexto da organização da tarefa, com o evento `tarefas.mudaram`.
  - **Encerramento:** `boss.stop({ graceful: true, timeout: 30_000 })` no `onClose`.
- **Por quê:**
  - a aplicação continua sem criar nada no banco (regra 6 do `CLAUDE.md`);
  - a estrutura da fila muda só por migration, revisada como as outras;
  - uma tarefa nova é uma entrada no catálogo.
- **Alternativas:**
  - **graphile-worker:** também no Postgres, mas migra na partida e precisaria de DDL;
  - **BullMQ:** exige Redis, e a spec mestre recusa outro serviço (seção 4.2);
  - **cron dentro do processo:** sem novas tentativas, e roda uma vez por instância.

### 15. Tarefas com falha
- **Escolha:**
  - **Tabela `tarefas_com_falha`** (`orgScoped`): `tarefa`, `dados` (só identificadores), `tentativas`, `erro` (a mensagem cortada em 500 caracteres, sem a pilha) e `falhou_em`.
  - **`GET /api/tarefas-com-falha`:** exige `tarefas.administrar`, paginado por cursor em `(falhou_em desc, id)`.
  - **`POST /api/tarefas-com-falha/:id/repeticao`:** exige `tarefas.administrar`. Numa transação:
    1. tira a linha;
    2. grava a auditoria `tarefa.repetida`, com a tarefa e o erro, e o evento `tarefas.mudaram`;
    3. põe a tarefa na fila pela mesma transação, com a opção `db` do `send` do pg-boss, um `executeSql` sobre o cliente da transação.
  - **Tarefas da instalação:** como a `manutencao-diaria`, que não tem organização, vão para o log com o código da tarefa.
- **Por quê:** a lista é o lugar visível que a spec mestre pede (seção 10.4). Repetir na mesma transação não deixa a tarefa sumir da lista sem voltar à fila.
- **Alternativa:** pôr na fila antes, com uma chave única, e só então tirar a linha. Funciona, mas deixa uma janela em que a tarefa está nos dois lugares.

### 16. Manutenção diária
- **Escolha:**
  - **Contexto:** roda dentro de `naOrganizacao`.
  - **Eventos:** apaga os de mais de 24 h.
  - **Arquivos:** lê os removidos e não apagados, em lotes de 500, apaga as variantes no armazenamento e marca `apagado_em`.
  - **Repetição:** apagar o que já não existe não é erro, então rodar duas vezes dá o mesmo resultado.
  - **Função `app.organizacoes_para_tarefas()`:**
    - `security definer`, `stable`, `returns setof uuid`;
    - sem `execute` para o `PUBLIC`, com `execute` para o `grafite_app`;
    - é a segunda consulta que atravessa organizações.
  - **Registro:** não grava auditoria, porque não muda registro de negócio, e grava no log quanto apagou.
- **Por quê:** a manutenção por organização é o molde das tarefas da fase 2, como a coleta (P2), o resumo por e-mail (P3) e os backups (P5).

### 17. Configuração e partida
- **Escolha:**
  - **`GRAFITE_ARQUIVOS_PASTA`:** obrigatória. Na partida, a API cria a pasta se falta e grava e apaga um arquivo de prova. A falha nomeia a variável.
  - **Valores por ambiente:**
    - `pnpm dev`: `.grafite/arquivos`, ignorada pelo Git;
    - testes de integração e pilha: uma pasta temporária;
    - contêiner: `/dados/arquivos`.
  - **Ordem da partida:** configuração, banco, ligação do `LISTEN`, fila, HTTP. Sem o esquema da fila, a API recusa iniciar e manda aplicar as migrations.
  - **Saúde:** `{ status: 'ok' | 'degradado' | 'indisponivel', versao, banco, fila, eventos }`.
    - O banco fora dá 503.
    - A fila ou os eventos fora dão 200 com `degradado`.
    - O item de rede da web, que olha o código da resposta, não acusa "sem conexão" por isso.

### 18. Imagem de contêiner
- **Escolha:**
  - **Imagem final:** `node:24-slim` no lugar do Alpine, porque o sharp instalado na etapa de build é o binário para glibc.
  - **Dependências da API:** a instalação de produção filtrada da API com as dependências dela (`--filter @grafite/api...`), com os pacotes do workspace que ela importa (`packages/db` e `packages/domain`) no layout do repositório, ligados por links fora do `node_modules`. Os pacotes do workspace são TypeScript, e o Node recusa remover os tipos de um arquivo dentro do `node_modules` (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`). Isso corrige a imagem que hoje não sobe.
  - **Volume:** `/dados/arquivos`, do usuário `node`, com `GRAFITE_ARQUIVOS_PASTA` apontando para ele.
- **Alternativas:**
  - **manter o Alpine** e instalar o binário musl do sharp pelo `supportedArchitectures` do pnpm, que é frágil e diverge do que os testes usam;
  - **o `pnpm deploy`:** copia os pacotes do workspace para dentro do `node_modules`, onde o Node recusa o TypeScript, e a API não sobe.

### 19. Componentes do `packages/ui`
- **Escolha:**
  - **`Avatar`:**
    - ganha `tamanho`: `barra`, `linha` (que segue a densidade) ou `ficha`;
    - ganha `imagens`, as miniaturas por tamanho, que viram `srcSet` com descritores de largura e `sizes` do tamanho do avatar, então o navegador escolhe pela densidade de pixels;
    - a foto é `object-fit: cover`.
  - **`EscolhaDeImagem`:**
    - usa o `FileTrigger` e o `DropZone` do React Aria;
    - recebe `imagem`, `aoEscolher(arquivo)`, `aoRemover()`, `progresso` e `erro`;
    - `accept` é a lista dos formatos.
  - **Progresso do envio:** um `enviarArquivo` do cliente da web usa o `XMLHttpRequest`, que informa o progresso do envio, com o cabeçalho CSRF.
- **Por quê:** o `fetch` não informa o progresso do envio, e a escolha de imagem mostra a barra de progresso.

### 20. Testes
- **Unitários do domínio:**
  - preferências: a leitura de cada camada, a resolução, a mudança com `null` e as listas;
  - o mapa ação → evento, que cobre todo o catálogo da auditoria;
  - `podeReceber`, por tabela: todas as sessões, permissão com e sem local, a conta, a sessão e outra organização.
- **Integração do banco:**
  - o isolamento das tabelas novas;
  - o gatilho do aviso, que só chega depois do commit;
  - as permissões do papel da aplicação no esquema da fila: usa sem criar;
  - a função das organizações, que devolve só identificadores.
- **Integração da API, contra PostgreSQL real:**
  - as preferências: merge patch, recusa inteira, a sessão pendente e a auditoria só dos padrões;
  - as fotos:
    - os formatos, os limites, o SVG sanitizado, a regravação sem EXIF e as miniaturas;
    - a entrega com os cabeçalhos, a permissão e o escopo, e o 404 da removida;
  - os eventos:
    - a conexão real, com `listen` numa porta, e a entrega depois do commit;
    - a recusa sem sessão, o filtro, a retomada, o `reiniciar` e o fim da sessão;
    - a conexão que não toca a sessão;
  - a fila:
    - a tentativa que falha e depois funciona;
    - a falha que vai para a lista, com o "Tentar de novo";
    - a manutenção, que apaga os eventos e os arquivos;
    - o encerramento gracioso.
- **Web:**
  - o provedor das preferências: pendentes, ausência de servidor, passagem da versão 1 e eventos;
  - a conexão de eventos com um `EventSource` simulado;
  - a marca de segundo plano;
  - a tela de padrões com o rascunho;
  - a tela de tarefas;
  - a foto na ficha, na lista, nos Ajustes e na barra.
- **Ponta a ponta:**
  - **com a API simulada:** os padrões, as tarefas, a foto e os eventos empurrados pela fixture;
  - **pela pilha real:** duas contas em dois contextos.
    - O administrador troca a foto de uma pessoa e muda um padrão.
    - A outra conta vê as duas mudanças sem recarregar.
    - Encerrar a sessão dela pelo outro contexto leva à tela de entrada.
- **Visual:** as histórias novas do avatar e da escolha de imagem, em Grafite e Névoa, nas três larguras.

### 21. Spec mestre e contrato de módulo
- **Spec mestre:**
  - **seção 3.2:** a linha do A1 ganha os padrões por perfil;
  - **seção 3.3:** o F2c sem o nível do perfil;
  - **seção 4.4:** o item 4, ligar e desligar módulos, vai para o P1;
  - **seção 5.2:**
    - item 8: a foto trocada ou removida é apagada, como as credenciais;
    - item 9: as preferências pessoais ficam fora da auditoria, e o nível do perfil fica no A1;
  - **seção 6.7:** os eventos ficam 24 h, e os arquivos removidos são apagados na manutenção seguinte;
  - **seção 9.4:** a lista das organizações para as tarefas, e a fila e o aviso só com identificadores;
  - **seção 9.8:** as fotos com a política do SVG.
- **`docs/casca/modulos.md`:**
  - os eventos no registro do módulo;
  - as preferências do servidor por trás do `usePreferencias()`;
  - o alvo das preferências nas seções;
  - a foto da pessoa no avatar.

  Os trechos são conferidos pelo `documentacao.test.ts`.

## Risks / Trade-offs

- **[A ordem do uuidv7 não é a do commit]** → A retomada volta 30 s antes do último evento, e a web descarta os repetidos.
- **[Avisos perdidos enquanto a ligação do `LISTEN` está caída]** → Depois de refeita a ligação, todas as telas atualizam tudo.
- **[Muitas abas no HTTP/1.1 esgotam as 6 conexões por endereço]** → A aba escondida fecha a conexão depois de 5 min. O HTTPS do F2d traz o HTTP/2, e o P3 traz a conexão única com a aba líder.
- **[`acessos.mudaram` faz toda tela reler a sessão ao mesmo tempo]** → A espera aleatória de até 1 s espalha as leituras, que são uma consulta por índice.
- **[Imagens maliciosas contra o libvips]** → Versão fixada, limite de bytes e de pixels, `failOn: 'error'` e dois tratamentos por vez.
- **[O peso do jsdom e do DOMPurify na API]** → Carregados só quando chega um SVG.
- **[Um arquivo órfão se a API cai entre a gravação e o commit]** → A falha da transação apaga o que gravou, e só a queda do processo deixa sobra. A varredura do armazenamento contra a tabela fica para a rotina de backup do F2d.
- **[Uma versão nova do pg-boss com estrutura nova]** → O `fila:verificar` reprova no CI até a migration ser gerada.
- **[A manutenção às 03:30 de Brasília para todas as organizações]** → Serve à organização de hoje. O horário por organização entra com a retenção ajustável (seção 6.7).
- **[As preferências da versão 1 passam para a conta errada num computador compartilhado]** → Passam só uma vez e só para uma conta sem preferências no servidor, e "Restaurar padrões" desfaz.
- **[A imagem final cresce com o Debian slim]** → Uns 60 MB a mais, em troca de rodar o mesmo binário do sharp que os testes usam.
- **[A marca de segundo plano é do próprio navegador]** → Só encurta ou alonga a sessão da própria conta, sem dar acesso a nada.
- **[Uma ação nova da auditoria cujo público o tipo não deduz]** → O tipo do TypeScript exige o `publico`, e o teste do mapa reprova a ação sem entrada.

## Migration Plan

Nada está em produção. As migrations acrescentam, nesta ordem:
- **0011:** as colunas `preferencias` da organização e da conta;
- **0012:** `arquivos` e `pessoas.foto_id`;
- **0013:** `eventos` e o gatilho do aviso;
- **0014:** o esquema da fila, gerado do pg-boss, com as permissões;
- **0015:** `tarefas_com_falha` e `app.organizacoes_para_tarefas()`.

Nenhuma mexe em dado existente. A configuração ganha `GRAFITE_ARQUIVOS_PASTA`, que o `pnpm dev`, os testes e o `.env.example` passam a definir. A cópia das preferências da versão 1 passa para a conta na primeira entrada. Desfazer é reverter os commits da change e recriar o volume do banco de desenvolvimento.
