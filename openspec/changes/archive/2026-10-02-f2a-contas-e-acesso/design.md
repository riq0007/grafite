## Context

Depois do F1, a casca está completa no `apps/web`, com as preferências no navegador. A motivação está em `proposal.md` (Why), e os requisitos, nas specs desta change. Pontos de partida que importam aqui:
- **API (`apps/api`):** Fastify com Zod e o OpenAPI gerado. Só existe o `/health`, que consulta o banco por um `pg.Pool` simples, sem Drizzle e sem nenhum contexto de organização.
- **Banco (`packages/db`):** tem `organizacoes`, com RLS próprio, o `orgScoped()` e as funções `app.current_org()` e `app.isolar_por_organizacao()`. A aplicação conecta como `grafite_app`, e as migrations rodam como `grafite_owner`. Os testes de integração sobem um PostgreSQL 18 pelo Testcontainers.
- **Cliente (`packages/api-client`):** `openapi-fetch` sobre os tipos gerados, que a web ainda não usa.
- **Web:**
  - a chegada aceita etapas extras (`chegar({ etapas })`) e espera a casca desenhada para "Pronto";
  - o item de usuário da barra já aceita `nome` e mostra o `Avatar` com as iniciais;
  - as pontas a ponta rodam contra a web compilada, com o `/api/health` simulado.
- **Node 24.19:** já traz `crypto.argon2()`, conferido nesta máquina (19 MiB e 2 passadas em cerca de 30 ms).
- **Chromium:** aceita o cookie `__Host-` com `Secure` em `http://localhost` e em `http://127.0.0.1`. Conferido com o Chromium do Playwright.

Restrições:
- **Isolamento:** toda tabela de negócio usa `orgScoped()` e RLS forçado (regra 6 do `CLAUDE.md`). O RLS não vale nas conferências de chave estrangeira nem de unicidade, que o PostgreSQL faz por fora das políticas.
- **Fase 1:** os componentes compartilhados (`packages/ui`, `packages/db`, `packages/domain` e o contrato) ainda mudam aqui, pela sessão principal.
- **Segredos:** nenhum valor sensível com padrão no código (spec `plataforma-base`), e nenhum segredo no repositório.

## Goals / Non-Goals

**Goals:**
- **Toda requisição dentro do RLS:** da entrada em diante, cada consulta roda no contexto da organização do endereço. A única exceção é a descoberta da organização.
- **Regras testáveis sem rede:**
  - a regra da senha, o bloqueio, o TOTP, a cifra e as pendências, com relógio injetável;
  - a auditoria na mesma transação, provada contra um PostgreSQL de verdade.
- **Contratos para a fase 2:** a sessão e o cliente da API para os módulos (`useSessao()` e `useApi()`), documentados em `docs/casca/modulos.md`.

**Non-Goals:**
- **Recuperação por e-mail** (P3) e **login corporativo** (A3).
- **Telas de administração, perfis e a exigência dos dois passos por perfil** (F2b).
- **Limite de requisições compartilhado entre processos:** um processo só por enquanto, e a guarda em memória basta.
- **Limpeza das sessões antigas:** fica para a fila do F2c. A auditoria já guarda o histórico.
- **Boas-vindas por usuário e "Bem-vindo de volta":** as boas-vindas continuam por navegador (F1c).

## Decisions

### 1. Organização pelo endereço de acesso
- **Escolha:**
  - **Tabela `enderecos_de_acesso` (`orgScoped`):** cada linha é um `endereco` normalizado (minúsculas, sem porta, sem ponto final e sem os colchetes do IPv6), com índice único global.
  - **Função `app.organizacao_do_endereco(endereco text) returns uuid`:**
    - `SECURITY DEFINER`, de dono `grafite_owner`, com `search_path` fixo;
    - devolve só o id da organização de um endereço exato;
    - `EXECUTE` só para o `grafite_app`.
  - **Política do dono:** como o RLS é forçado, a função lê a tabela por uma política só para o dono: `resolucao_de_endereco ... FOR SELECT TO grafite_owner USING (true)`. O dono já pode desligar o RLS das próprias tabelas, então a política não lhe dá nada novo. O `grafite_app` continua sem ver endereço de outra organização.
  - **Na API:** um gancho das rotas de acesso resolve `request.hostname` pela função, com cache em memória de 60 s para endereços conhecidos e de 10 s para desconhecidos. O `/health` e a web compilada não passam por ele.
  - **Endereço desconhecido:** problem `endereco-desconhecido` (404).
- **Por quê:** o usuário é único só dentro da organização (pedido do usuário, como no PMG). Com a organização vinda do endereço, a entrada, a sessão e o bloqueio rodam sob o RLS, e um endereço por cliente é o modelo de produto.
- **Alternativas:**
  - um campo "organização" na tela de entrada, que pesa em todo login, inclusive na única organização de hoje;
  - um usuário único no sistema inteiro: "joao.silva" colidiria entre clientes, e a consulta de entrada atravessaria todas as organizações;
  - um papel com `BYPASSRLS`: exigiria superusuário em cada instalação, para ganhar o mesmo que a política do dono.

### 2. Transação com o contexto e o relógio da aplicação
- **Escolha:**
  - **`naOrganizacao(banco, orgId, fn)` no `packages/db`:**
    - abre uma transação Drizzle e faz `select set_config('app.org_id', $1, true)`;
    - entrega o `tx` a `fn`;
    - toda escrita e a auditoria dela usam o mesmo `tx`.
  - **Chaves estrangeiras compostas:** o `orgScoped()` passa a criar `unique (org_id, id)`, e as chaves estrangeiras entre tabelas de negócio levam o `org_id` junto, como `(org_id, pessoa_id) → pessoas (org_id, id)`. Assim o banco recusa uma referência a outra organização, que o RLS deixaria passar.
  - **Relógio:** o tempo das regras (expiração, bloqueio, pendência, passo do TOTP e momento da auditoria) vem de `agora: () => Date`, injetado no `criarApp`. Nenhuma regra usa o `now()` do banco, e os testes de integração adiantam o relógio sem esperar.
- **Por quê:** o caminho de escrita da seção 6.3 (validação → transação com contexto → dado + auditoria → commit) fica num lugar só, e "2 h sem uso" vira um teste de milissegundos.
- **Alternativa:** um `set_config` por conexão, no início da requisição. Uma conexão devolvida ao pool levaria o contexto para outra requisição.

### 3. Modelo de dados
- **Tabelas novas** (todas com `orgScoped`, RLS forçado e a migration chamando `app.isolar_por_organizacao`):
  - **`pessoas`:** `nome`, `email` (opcional), `situacao` (`ativa`/`inativa`), `criada_em`, `atualizada_em`.
  - **`contas`:**
    - `pessoa_id` (único, com chave composta) e `usuario` normalizado (`unique (org_id, usuario)`);
    - `hash_senha`, `senha_temporaria`, `exige_dois_passos` e `situacao`;
    - `senha_trocada_em`, `ultima_entrada_em`, `criada_em` e `atualizada_em`.
  - **`sessoes`:**
    - `conta_id`, `token_hash` (`bytea`, único) e `token_csrf`;
    - `criada_em`, `ultimo_uso_em`, `expira_em` e `ativada_em` (nula enquanto pendente);
    - `segundo_passo_em` e `tentativas_de_codigo`;
    - `encerrada_em` e `motivo_do_fim`;
    - `ip` (`inet`) e `agente` (até 512 caracteres).
  - **`tentativas_de_entrada`:** `usuario` normalizado, `falhas_seguidas`, `bloqueada_ate` e `atualizada_em`, com `unique (org_id, usuario)`. Vale para usuário que existe ou não.
  - **`dois_passos`:** `conta_id` (único), `segredo_cifrado` (`bytea`), `ativado_em` (nulo no cadastro em andamento), `ultimo_passo` (`bigint`) e `criado_em`.
  - **`codigos_de_recuperacao`:** `conta_id`, `hash` (`bytea`), `usado_em` e `criado_em`.
  - **`auditoria`:** na decisão 10.
- **Credenciais se substituem:**
  - o segredo dos dois passos e os códigos de recuperação são apagados ao desativar ou ao gerar de novo;
  - as sessões nunca se apagam, só se encerram;
  - a auditoria guarda o histórico de tudo.

  A regra "nada se exclui" (seção 5.2) vale para os registros de negócio. Guardar uma credencial desativada não serve a ninguém e aumenta o risco, e a spec mestre passa a dizer isso.
- **Por quê:** pessoa e conta separadas (seção 5.2), uma conta por pessoa, e cada estado que a sessão precisa decidir guardado, sem nada calculado pelo `now()` do banco.

### 4. Senha
- **Escolha:**
  - **Hash:** `crypto.argon2('argon2id')` do Node, com 19 MiB (`memory: 19456`), 2 passadas, paralelismo 1, sal de 16 bytes e 32 bytes de saída. É o mínimo da OWASP.
  - **Formato PHC:** `$argon2id$v=19$m=19456,t=2,p=1$<sal>$<hash>`, em base64 sem preenchimento. A verificação lê os parâmetros do próprio texto e compara em tempo constante. Se os parâmetros do código mudarem, a senha é regravada na entrada seguinte.
  - **Usuário inexistente:** a entrada verifica a senha contra um hash de engano, gerado na partida com os mesmos parâmetros, para responder no mesmo tempo.
  - **Regra no `packages/domain` (`avaliarSenha(senha, { usuario })`):**
    - de 12 a 128 caracteres;
    - recusa um caractere repetido, sequências de números, de letras e das fileiras do teclado, e senhas que contêm o usuário;
    - recusa as senhas de uma lista curta de senhas comuns de 12 caracteres ou mais, em português e em inglês, escrita no próprio repositório;
    - devolve o motivo em pt-BR.

    A web usa a mesma função para avisar antes de enviar.
  - **Senha temporária:** 16 caracteres aleatórios do alfabeto Crockford (cerca de 80 bits), em grupos de 4.
- **Por quê:** o Argon2id nativo dispensa dependência nativa no Windows e no Docker. A regra sem composição segue a NIST SP 800-63B.
- **Alternativas:**
  - `@node-rs/argon2`: binário nativo por plataforma. Fica como reserva, com o mesmo formato PHC, se o `crypto.argon2` mudar;
  - uma lista de milhões de senhas vazadas: dezenas de megabytes por pouca diferença com o mínimo de 12 caracteres.

### 5. Bloqueio progressivo
- **Escolha:**
  - **Regra pura no `packages/domain` (`bloqueioDepois(falhasSeguidas)`):** até 4 falhas, sem bloqueio; na 5ª, 1 min; depois 2, 4 e 8 min, e 15 min dali em diante.
  - **Na entrada:** `tentativas_de_entrada` é lida e gravada na transação da entrada.
  - **Durante um bloqueio:** a tentativa é recusada sem conferir a senha e sem contar.
  - **Também contam como falha:** um código errado do segundo passo e uma senha atual errada na troca. A entrada com sucesso zera a contagem, e o `conta redefinir` também.
  - **A mensagem** arredonda o tempo restante para cima, em minutos ("Tente de novo em 1 min.").
- **Por quê:** a conta por usuário digitado não revela quem existe (spec `entrada-e-sessoes`). Não contar durante o bloqueio impede que um atacante o estenda sem fim.

### 6. Sessão, cookie e pendências
- **Token:** 32 bytes aleatórios, em base64url, no cookie `__Host-grafite-sessao`.
  - **Atributos:** `HttpOnly`, `Secure`, `SameSite=Lax` e `Path=/`, sem `Domain`.
  - **`Max-Age`:** até o `expira_em`, para fechar o navegador não encerrar a sessão.
  - **No banco:** só o SHA-256 do token. A busca pelo hash roda no contexto da organização do endereço, então um cookie de outra organização não é encontrado.
- **Validade:** sem `encerrada_em`, `expira_em > agora` e `ultimo_uso_em > agora − 2 h`. O `ultimo_uso_em` é regravado quando passa de 60 s, e não a cada requisição.
- **Pendência:** derivada a cada leitura, na ordem da spec:
  - **`segundo-passo`:** dois passos ativos e `segundo_passo_em` nulo;
  - **`trocar-senha`:** `senha_temporaria`;
  - **`cadastrar-dois-passos`:** `exige_dois_passos` sem os dois passos ativos.
- **Sessão pendente:**
  - nasce com `expira_em` = entrada + 10 min;
  - quando a pendência acaba, ganha `ativada_em`, `expira_em` = agora + 12 h, um token novo e um `token_csrf` novo;
  - o cookie é regravado na mesma resposta.
- **Guarda das rotas** (`exigirSessao` e `exigirAtiva`):
  - **sem sessão:** só `GET /sessao` e `POST /sessao`;
  - **pendente:** só a rota do passo da vez, `GET /sessao` e `DELETE /sessao`. As outras respondem `pendencia` (403), com o passo da vez.
- **Encerrar:** gravar `encerrada_em` e `motivo_do_fim`: `saida`, `encerrada-pelo-usuario`, `outras-encerradas`, `senha-trocada`, `dois-passos-ativados`, `redefinicao` ou `tentativas-esgotadas`.
- **Por quê:** uma tabela e um cookie descrevem todos os estados da entrada, e a troca do token no fim impede a fixação de sessão.
- **Alternativa:** um "desafio" separado para o segundo passo, com outra tabela e outro cookie para cada etapa.

### 7. Verificação em dois passos
- **TOTP próprio** (`apps/api/src/acesso/totp.ts`), seguindo a RFC 6238 sobre a RFC 4226:
  - HMAC-SHA1, 6 dígitos, passo de 30 s e base32 da RFC 4648;
  - testado com os vetores das RFCs;
  - aceita o passo atual e os dois vizinhos, só se o passo for maior que `ultimo_passo`, que é gravado em seguida.
- **Chave do app:** 20 bytes aleatórios, mostrados em base32 em grupos de 4. URI `otpauth://totp/Grafite:<usuario> (<organização>)?secret=…&issuer=Grafite&algorithm=SHA1&digits=6&period=30`.
- **Cifra:** AES-256-GCM, com a chave de `GRAFITE_CHAVE_DOIS_PASSOS`.
  - **A chave:** 32 bytes em base64, validados na partida.
  - **O texto cifrado:** versão (1 byte), IV (12), etiqueta (16) e dados.
  - **Dado associado:** o `conta_id`, para um segredo copiado para outra linha não decifrar.
- **Códigos de recuperação:**
  - 10 códigos de 10 caracteres Crockford (cerca de 50 bits cada), mostrados como `xxxxx-xxxxx`;
  - guardados em SHA-256 do código normalizado: maiúsculas, sem hífen nem espaço, e I e L lidos como 1 e O como 0. Com essa entropia, um hash lento não acrescenta nada;
  - na entrada, o campo aceita o código com ou sem hífen.
- **Cadastro:**
  - `POST /conta/dois-passos/cadastro` grava a linha com `ativado_em` nulo, ou substitui uma pendente;
  - a confirmação ativa a verificação, gera os códigos e encerra as outras sessões;
  - se a pendência era `cadastrar-dois-passos`, a confirmação marca `segundo_passo_em`, porque o usuário acabou de provar o aparelho.
- **Por quê:** o TOTP são 40 linhas sobre o `node:crypto`, com vetores oficiais. Uma dependência não pagaria o custo.

### 8. Rotas e contrato
| Rota | Quem chama | Faz |
|---|---|---|
| `GET /sessao` | qualquer um | `{ organizacao: { nome }, sessao: null \| { conta: { usuario, nome }, pendencia, csrf, expiraEm } }` |
| `POST /sessao` | sem sessão | entra com `{ usuario, senha }`; grava o cookie e devolve o estado |
| `POST /sessao/segundo-passo` | pendente | `{ codigo }`, do app ou de recuperação; devolve o estado, com o aviso dos códigos restantes |
| `DELETE /sessao` | com sessão | sai e apaga o cookie |
| `GET /conta` | ativa | usuário, nome, e-mail e situação dos dois passos, com a exigência e os códigos restantes |
| `PUT /conta/senha` | ativa ou `trocar-senha` | `{ senhaAtual, senhaNova }`; encerra as outras sessões e devolve o estado |
| `POST /conta/dois-passos/cadastro` | ativa ou `cadastrar-dois-passos` | `{ chave, uri }` |
| `POST /conta/dois-passos/confirmacao` | ativa ou `cadastrar-dois-passos` | `{ codigo }`; ativa e devolve `{ codigosDeRecuperacao, sessao }` |
| `POST /conta/dois-passos/desativacao` | ativa | `{ codigo }`; recusa com `dois-passos-exigidos` (409) |
| `POST /conta/dois-passos/codigos-de-recuperacao` | ativa | `{ codigo }`; troca os códigos |
| `GET /conta/sessoes` | ativa | `{ id, dispositivo, ip, criadaEm, ultimoUsoEm, atual }[]` |
| `DELETE /conta/sessoes/:id` | ativa | encerra uma sessão; a atual equivale a sair |
| `DELETE /conta/sessoes` | ativa | encerra todas as outras |

- **Estado da sessão nas respostas:** toda rota que resolve uma pendência devolve o estado novo. A web nunca deduz a pendência.
- **Dispositivo:** `descreverDispositivo(agente)`, no `packages/domain`, devolve o navegador e o sistema ("Chrome no Windows", "Safari no iPhone") ou "Navegador desconhecido".
- **Contrato:** os schemas Zod das rotas, com as mensagens em pt-BR, geram o OpenAPI, e `pnpm contrato:gerar` regenera o cliente.

### 9. Erros, rastreio, CSRF e limite de requisições
- **Código de rastreio:** o `genReqId` do Fastify gera 8 caracteres Crockford em dois grupos ("R7K2-9QXM"). Ele é o `reqId` do log e vai no cabeçalho `x-codigo-de-rastreio` de toda resposta.
- **problem+json:** um `setErrorHandler` e um `setNotFoundHandler` das rotas da API respondem `application/problem+json` com:
  - `type` (`urn:grafite:problema:<codigo>`), `title`, `status` e `detail`;
  - `codigoDeRastreio`;
  - `campos` (`{ campo: mensagem }`), nos erros de validação.

  Os códigos usados:
  - `dados-invalidos`, `endereco-desconhecido` e `sem-sessao`;
  - `credenciais-invalidas`, `entrada-bloqueada` e `pendencia`;
  - `codigo-invalido`, `senha-atual-incorreta` e `senha-recusada`;
  - `dois-passos-exigidos`, `origem-recusada` e `muitas-requisicoes`;
  - `nao-encontrado` e `erro-interno`.

  O erro inesperado é registrado no log com o rastreio e responde só "Erro interno do servidor.".
- **CSRF**, num gancho das rotas da API para `POST`, `PUT`, `PATCH` e `DELETE`:
  - **origem:** recusa quando `Sec-Fetch-Site` existe e não é `same-origin`, ou quando `Origin` existe e o host dele difere do pedido;
  - **token:** com sessão, exige `x-grafite-csrf` igual ao `token_csrf`, comparado em tempo constante;
  - **corpo:** as rotas só aceitam JSON. Um formulário de outro site não chega a elas sem passar pela verificação prévia do navegador.
- **Limite de requisições:** `@fastify/rate-limit` em memória, por `request.ip`. São 600 por minuto em geral e 20 por minuto em `POST /sessao` e `POST /sessao/segundo-passo`, com `muitas-requisicoes` (429) e o `Retry-After`.
- **Por quê:**
  - **um formato só:** a seção 10.1 pede um formato único, e a tela mostra o código de rastreio;
  - **origem e token:** o CSRF da seção 9.7 pede SameSite e token, e a conferência da origem fecha os navegadores que não mandam `Sec-Fetch-Site`.
- **Alternativa:** `@fastify/csrf-protection`, que usa um segredo em cookie a mais para um token que a sessão já guarda.

### 10. Auditoria
- **Tabela `auditoria`:**
  - **o fato:** `momento`, `acao` (`entrada.concluida`, `sessao.encerrada`, `senha.trocada` …);
  - **quem fez:** `ator_tipo` (`conta`, `sistema` ou `anonimo`), `ator_conta_id` e `ator_descricao`;
  - **o alvo e a mudança:** `alvo_tipo`, `alvo_id`, `antes`, `depois` e `dados` (`jsonb`);
  - **a origem:** `ip` (`inet`) e `codigo_de_rastreio`.

  Os índices são `(org_id, momento desc)`, `(org_id, alvo_tipo, alvo_id, momento desc)` e `(org_id, ator_conta_id, momento desc)`.
- **Só inclusão:** a migration faz `REVOKE UPDATE, DELETE ON auditoria FROM grafite_app`, e um teste de integração prova a recusa.
- **`registrarNaAuditoria(tx, evento)`, no `apps/api`:**
  - só aceita o `tx` da transação;
  - recebe `antes` e `depois` já em visões auditáveis da pessoa e da conta, sem hash, segredo nem token;
  - um teste confere que nenhuma visão auditável tem as chaves proibidas.
- **Retenção:** sem rotina de limpeza. A spec mestre passa a dizer "no mínimo 5 anos" (seção 6.7).
- **Por quê:** a auditoria única da seção 5.2 já sai com o formato que o F2b vai consultar e filtrar.

### 11. Comando no servidor
- **`pnpm grafite <comando>`** (`node --env-file-if-exists=.env apps/api/scripts/grafite.ts`), com argumentos pelo `node:util` `parseArgs` e a ajuda em pt-BR:
  - **`organizacao criar --nome … --endereco … [--endereco …] --pessoa … --usuario … [--email …] [--sem-exigir-dois-passos] [--se-nao-existir]`**;
  - **`conta criar --endereco … --pessoa … --usuario … [--email …] [--exigir-dois-passos]`**;
  - **`conta redefinir --endereco … --usuario … [--remover-dois-passos]`**: zera também a contagem de tentativas.
- **Banco:** usa o `GRAFITE_DATABASE_URL` (papel `grafite_app`) e a `naOrganizacao`.
  - **Organização nova:** é inserida com o próprio id no contexto. O `WITH CHECK` de `organizacoes` aceita.
  - **Auditoria:** o ator é `sistema`, com a descrição "comando no servidor: conta redefinir".
- **Saída:** a senha temporária aparece uma vez, com o aviso de que não será mostrada de novo.
- **`pnpm dev`:**
  - acrescenta `GRAFITE_CHAVE_DOIS_PASSOS` ao `.env` quando falta, e nunca troca uma que existe;
  - depois das migrations, roda `organizacao criar --se-nao-existir`, com `localhost` e `127.0.0.1`, a conta `admin` e `--sem-exigir-dois-passos`.
- **Por quê:** a recuperação de último recurso precisa existir mesmo depois das telas do F2b. O comando escreve pelos mesmos caminhos da API, com auditoria.

### 12. Web: cliente da API e sessão
- **`apps/web/src/api/`:** `useApi()` entrega o cliente do `@grafite/api-client` (base `/api`), com um middleware que:
  - põe o `x-grafite-csrf` nas escritas;
  - avisa a sessão quando uma resposta é 401 `sem-sessao`.
- **`apps/web/src/sessao/`:** uma loja externa (`useSyncExternalStore`) com o estado, e as ações: validar, entrar, mandar o código, trocar a senha, cadastrar e confirmar os dois passos, e sair. Os estados:
  - `validando` e `desconhecida`;
  - `endereco-desconhecido`;
  - `sem-sessao`, com `terminou` quando havia sessão;
  - `pendente` e `ativa`.

  `useSessao()` é o contrato dos módulos.
- **Etapa "Validando sessão":** `pronta()` consulta `GET /api/sessao` com limite de 5 s e nunca falha. Sem resposta, o estado fica `desconhecida`, e a loja tenta de novo no evento `online` e a cada 30 s até o servidor responder.
- **Sair:** `DELETE /api/sessao` e depois `location.reload()`. A chegada recomeça sem nada da conta anterior na memória.
- **Por quê:** a loja fica fora do React, para a chegada e o middleware falarem com ela antes e fora dos componentes.

### 13. Web: a porta entre a entrada e a casca
- **`Porta`, no `App`:**
  - com a sessão `ativa` ou `desconhecida`, desenha o roteador com a casca;
  - sem sessão, ou com a sessão pendente, desenha a `TelaDeEntrada` numa camada à frente;
  - a casca só monta depois da primeira sessão `ativa` ou `desconhecida` da página. Na primeira abertura sem sessão, os módulos não carregam nada.
- **Expirou com a casca montada:** a casca continua montada, `inert` e escondida, debaixo da camada, com "Sua sessão terminou…". Entrar com a mesma conta (o mesmo `usuario`) tira a camada, e entrar com outra recarrega a página.
- **Chegada:**
  - o estado `entrada` entra em `data-chegada`;
  - o aviso `cascaDesenhada` vira `telaDesenhada`, porque a primeira tela pode ser a casca ou a entrada;
  - no primeiro acesso: carregamento → `boas-vindas` → `entrada` (se não há sessão) → `montando` → `pronta`;
  - num acesso seguinte sem sessão: `entrada` → `pronta`, com a casca entrando por troca de opacidade, nos tokens de opacidade, sem passar de 300 ms.
- **Por quê:** um mecanismo serve à primeira entrada e ao bloqueio no meio do uso, e a casca nunca aparece para quem não entrou. Só o caso `desconhecida` abre sem validação, porque a casca guardada abre sem rede (spec `pwa`) e não tem dado do servidor.

### 14. Componentes no `packages/ui`
- **Pasta `entrada/`:**
  - `TelaDeEntrada`: o fundo do tema, a marca, o nome da organização e uma superfície sólida para o passo;
  - `PassoDasCredenciais`, `PassoDoCodigo` (com "Usar um código de recuperação"), `PassoDaSenhaNova` e `EnderecoDesconhecido`;
  - `CadastroDosDoisPassos` (QR code, chave com "Copiar" e código) e `CodigosDeRecuperacao` (lista com "Copiar" e "Continuar"), que a seção Conta dos Ajustes reutiliza.

  São componentes de apresentação, com histórias e testes de interação.
- **Campos:** `CampoDeSenha`, com "Mostrar senha", em `componentes/campo`, e os `autocomplete` certos: `username`, `current-password`, `new-password` e `one-time-code`.
- **`CodigoQR` (`componentes/codigoQR`):**
  - matriz da biblioteca `uqr` (MIT, sem dependências), desenhada num único `<path>` SVG;
  - tokens de componente `--qr-fundo` e `--qr-modulo`, fixos em branco e preto em todos os temas;
  - margem de 4 módulos e `role="img"` com o nome acessível.
- **Barra:** o menu do usuário recebe os itens "Conta", "Ajustes do Sistema" e "Sair", com um separador antes de "Sair".
- **Por quê:** os passos aparecem tanto na entrada quanto nos Ajustes, e a regressão visual os cobre como as outras peças da casca.

### 15. Seção Conta dos Ajustes
- **Lugar:** primeira das `SECOES`, separada das preferências na lista.
- **Partes:** cada uma tem `data-foco` (`dados-da-conta`, `senha`, `dois-passos`, com `codigos-de-recuperacao` dentro, e `sessoes`) e uma entrada na busca:
  - "Conta" e "Trocar senha";
  - "Verificação em dois passos" e "Códigos de recuperação";
  - "Sessões".
- **Dados:**
  - `GET /conta` e `GET /conta/sessoes`, com os estados carregando, erro com "Tentar de novo" e sem conexão;
  - as ações pedem confirmação por botão, como diz a spec `ajustes-do-sistema`;
  - os horários das sessões saem do `useDataHora()`, no fuso escolhido.

### 16. Testes
- **Unitários:**
  - `avaliarSenha`, `bloqueioDepois`, `normalizarUsuario` e `descreverDispositivo` no domínio;
  - Argon2id (PHC, parâmetros lidos e regravação), TOTP (vetores das RFCs 4226 e 6238, janela e repetição), cifra (ida e volta e dado associado) e códigos de recuperação na API.
- **Integração (`apps/api`, `pnpm test:integration`):**
  - o Testcontainers do `packages/db` sai como função reutilizável e é exportado para a API;
  - a API é montada com o banco real e o relógio falso, e os testes usam `app.inject` com o `Host` de cada organização. Eles cobrem:
    - o isolamento entre duas organizações;
    - o bloqueio;
    - as pendências e a troca do token;
    - as expirações com o relógio adiantado;
    - o CSRF e o limite de requisições;
    - a auditoria na mesma transação, com uma falha forçada;
    - a recusa de UPDATE e DELETE na auditoria;
    - as chaves compostas.
- **Ponta a ponta das telas:**
  - a fixture simula o `GET /api/sessao` com uma sessão ativa de "Ana Souza", e as suítes atuais seguem iguais;
  - as novas simulam as rotas de entrada.
- **Ponta a ponta da pilha (`pnpm test:e2e:pilha`, job próprio no CI):** um `globalSetup` sobe o PostgreSQL, aplica as migrations, roda o `pnpm grafite organizacao criar` de verdade (lendo a senha temporária da saída) e inicia a API servindo a web compilada. O teste:
  1. troca a senha temporária;
  2. cadastra os dois passos, gerando o TOTP com a chave da tela;
  3. abre a casca e vê "Esta sessão" na seção Conta;
  4. sai e entra com o código;
  5. confere na auditoria os eventos do caminho.
- **Visual:** as histórias novas em Grafite e Névoa, nas três larguras.

### 17. Spec mestre e contrato de módulo
- **Spec mestre:**
  - **seção 3.3:** a divisão do F2 em quatro changes;
  - **seção 4.4:** a organização pelo endereço de acesso;
  - **seção 5.2:** o login por usuário único na organização e as credenciais que se substituem;
  - **seção 6.7:** a auditoria por no mínimo 5 anos;
  - **seção 7.5:** a entrada entre as boas-vindas e a montagem, e as etapas;
  - **seção 9:**
    - os tempos da sessão e do bloqueio, as pendências e os códigos de recuperação;
    - a única consulta entre organizações;
    - o CSRF por origem e token, e os limites de 600 e 20 por minuto;
  - **seção 10.1:** o formato do código de rastreio;
  - **seção 15:** sai a retenção da auditoria e entra a política de anonimização (F2b);
  - **Apêndice B:** os tempos da sessão, do bloqueio e da validação na chegada.
- **`docs/casca/modulos.md`:**
  - `useSessao()` (quem está na sessão);
  - `useApi()` (o cliente com o CSRF);
  - o 401, que cobre a casca sozinho;
  - a etapa "Validando sessão" como exemplo real.

  Os trechos são conferidos pelo `documentacao.test.ts`.

## Risks / Trade-offs

- **[O `crypto.argon2` do Node é "release candidate"]** → Ele fica num módulo só, coberto por testes com o formato PHC. Se mudar, o `@node-rs/argon2` gera e lê o mesmo formato, e nenhum hash gravado se perde.
- **[Um atacante bloqueia um usuário conhecido]** → É o custo do bloqueio por conta. O teto de 15 min, a contagem parada durante o bloqueio e o limite de 20 entradas por minuto por IP seguram o abuso. O `conta redefinir` zera a contagem.
- **[A perda da `GRAFITE_CHAVE_DOIS_PASSOS`]** → As chaves dos apps deixam de decifrar, e ninguém entra pelo segundo passo. O `conta redefinir --remover-dois-passos` resolve conta a conta. O backup da chave fica com o do F2d, como o da chave mestra (seção 9.10).
- **[Cabeçalho `Host` forjado]** → Ele só leva à organização daquele endereço, e o RLS e a sessão continuam valendo. No servidor, o proxy do F2d só deixa passar os endereços registrados.
- **[O acesso por IP e por nome são cookies diferentes]** → O `__Host-` é preso ao endereço, então quem alterna entre eles entra duas vezes. Os endereços registrados de cada organização documentam o caminho certo.
- **[O limite de requisições em memória]** → Ele zera ao reiniciar e não se divide entre processos. Hoje há um processo só, e um armazenamento comum entra quando houver mais.
- **[As sessões crescem sem limpeza]** → São poucas linhas por pessoa por dia. A limpeza das encerradas há mais de 90 dias entra na fila do F2c.
- **[A casca abre sem validação quando o servidor some]** → Ela não tem dado do servidor, e cada requisição de módulo exige a sessão. Quando o servidor volta, a validação roda, e a entrada cobre a casca se preciso.
- **[A ponta a ponta da pilha instável]** → Um trabalhador só, contêiner com espera pela porta, tempos generosos e o job separado, que não atrasa os outros.

## Migration Plan

Não há nada em produção. Nos bancos de desenvolvimento, as migrations novas só acrescentam tabelas. O próximo `pnpm dev` acrescenta a chave dos dois passos ao `.env` e cria a organização de desenvolvimento, mostrando a senha temporária uma vez. Quem perder essa senha roda `pnpm grafite conta redefinir --endereco localhost --usuario admin`. Desfazer é reverter os commits da change e recriar o volume do banco de desenvolvimento.
