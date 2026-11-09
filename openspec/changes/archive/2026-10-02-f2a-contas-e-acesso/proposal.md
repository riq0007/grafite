## Why

A casca está pronta, mas ainda não sabe quem a usa:
- qualquer pessoa que alcança o endereço entra;
- o menu do usuário mostra um avatar neutro;
- nenhuma alteração fica registrada.

Os módulos da fase 2 precisam de quem escreve (o autor de cada campo, a auditoria do "antes → depois"), e o F2b precisa de contas para dar perfis. A fase 1 só termina quando "a casca roda com login, preferências no servidor e auditoria" (seção 3.1 da spec mestre).

Esta change implementa a **primeira parte do subprojeto F2 · Núcleo** da spec mestre (`docs/superpowers/specs/2026-09-24-grafite-design.md`, seções 3.2, 4.4, 5.1, 5.2, 6.3, 6.7, 7.5, 9, 10 e 15): **F2a · Contas e acesso**. O F2 foi dividido em quatro changes, nesta ordem: **F2a · Contas e acesso** (esta), **F2b · Permissões e locais**, **F2c · Plataforma** e **F2d · Operação**.

## What Changes

- **Organização pelo endereço de acesso**
  - Cada organização registra os endereços pelos quais é acessada, como `grafite.empresa.local`.
  - A API descobre a organização de cada requisição pelo endereço, e a entrada e a sessão correm inteiras dentro do isolamento do banco.
  - A única consulta que atravessa organizações é a do endereço, numa função estreita do banco.
  - Um endereço desconhecido recebe "Este endereço não está ligado a nenhuma organização".
- **Pessoas e contas separadas**
  - Toda conta pertence a uma pessoa, e uma pessoa tem no máximo uma conta. A pessoa guarda só o nome e, se houver, o e-mail.
  - O login é por **usuário**, único na organização, como no PMG.
  - Senha com hash Argon2id, de pelo menos 12 caracteres, sem regra de composição, recusando as comuns e as que contêm o usuário. A tela avisa antes de enviar.
  - Uma senha temporária obriga a troca no primeiro uso.
- **Comando no servidor**
  - Cria uma organização com os endereços e a primeira conta, com senha temporária exibida uma vez, troca obrigatória e verificação em dois passos exigida.
  - Cria outras contas e redefine um acesso perdido: senha temporária nova, remoção dos dois passos e fim das sessões.
  - O `pnpm dev` cria a organização de desenvolvimento na primeira vez.
- **Entrada e sessões**
  - Entrada com usuário e senha, com bloqueio progressivo por usuário: 5 erros seguidos bloqueiam por 1 min, e cada erro seguinte dobra o tempo, até 15 min. A mensagem nunca diz se o usuário existe.
  - Sessão guardada no banco, com cookie HttpOnly, Secure e SameSite=Lax, e o token só em hash. Ela termina depois de 2 h sem uso ou de 12 h no total, e fechar o navegador não a encerra.
  - Depois da senha, a sessão resolve primeiro o que falta, nesta ordem: o segundo passo, a troca da senha temporária e o cadastro dos dois passos exigidos.
  - Cada usuário vê as próprias sessões, encerra uma delas ou todas as outras, e sai.
  - Trocar a senha ou ativar os dois passos encerra as outras sessões.
- **Verificação em dois passos**
  - Código de app autenticador (TOTP), cadastrado por QR code ou pela chave em texto, e nunca aceito duas vezes.
  - Dez códigos de recuperação de uso único, mostrados uma vez e gerados de novo quando o usuário pede.
  - O segredo é cifrado com uma chave que vem do ambiente.
  - Uma conta que exige os dois passos não consegue desativá-los.
- **Auditoria única**
  - Cada registro diz quem, quando, a ação, o alvo, o "antes → depois", o IP e o código de rastreio. Nunca guarda senha, hash, token ou segredo.
  - É gravada na mesma transação do dado, e o papel da aplicação só insere e lê.
  - Neste F2a, registra as entradas e as recusas, as saídas, os encerramentos de sessão, as trocas e redefinições de senha, as mudanças nos dois passos e as criações pelo comando.
  - Fica guardada por no mínimo 5 anos, sem limpeza automática.
- **API**
  - Erros num formato único (problem+json), com mensagem por campo em pt-BR e um código de rastreio que também vai ao log.
  - Proteção contra CSRF em toda escrita: a origem conferida e o token da sessão num cabeçalho.
  - Limite de requisições por endereço IP, mais estreito na entrada.
  - Rotas novas de sessão e de conta no contrato, com o cliente tipado regenerado.
- **Casca**
  - A etapa "Validando sessão" na chegada. Sem servidor, a casca abre com "Sem conexão com o servidor" e valida a sessão quando ele volta.
  - A tela de entrada, com usuário e senha, os passos pendentes e o QR code.
  - No primeiro acesso ao navegador, as boas-vindas vêm antes da entrada, e a casca se monta depois dela.
  - Quando a sessão termina no meio do uso, a entrada cobre a casca, que fica inerte. Entrar de novo com a mesma conta continua de onde parou.
  - O menu do usuário passa a mostrar o nome, com "Conta", "Ajustes do Sistema" e "Sair".
  - Uma seção Conta no topo dos Ajustes, com os dados, a senha, a verificação em dois passos e as sessões, e entradas na busca.
  - O componente de QR code, sempre escuro sobre claro, na biblioteca de componentes base.
- **Spec mestre**
  - A divisão do F2 em quatro changes na seção 3.3.
  - O login por usuário, os tempos da sessão e do bloqueio, as pendências e a organização pelo endereço (seções 4.4 e 9).
  - A retenção da auditoria (seção 6.7) e a chegada com a entrada (seção 7.5).
  - A seção 15 sem a decisão da retenção, que fica tomada.

**Fora desta change:**
- **F2b · Permissões e locais:**
  - a árvore de locais, os perfis e os grupos com escopo;
  - as telas de administração de pessoas e contas, com a inativação e a anonimização da pessoa;
  - a consulta da auditoria.

  A exigência dos dois passos passa a vir também dos perfis.
- **F2c · Plataforma:** as preferências em três níveis no servidor, a foto da pessoa (arquivos e imagens), os eventos (outbox → SSE) e a fila de tarefas.
- **F2d · Operação:** os ambientes, os serviços do Windows, o HTTPS interno com o proxy e o backup.
- **P3:** "Esqueci minha senha" por e-mail. Até lá, a tela diz para pedir a redefinição à TI.
- **P6:** a confirmação com o segundo passo ao revelar um segredo do cofre.

## Capabilities

### New Capabilities
- `contas-de-acesso`: pessoas e contas, usuário único na organização, regra e guarda da senha, senha temporária com troca obrigatória e o comando no servidor que cria organizações e contas e redefine um acesso.
- `entrada-e-sessoes`: entrada com usuário e senha, bloqueio progressivo, sessão no banco com cookie e expiração, pendências da sessão, saída e as sessões de cada usuário.
- `verificacao-em-dois-passos`: cadastro por QR code, código do app autenticador, códigos de recuperação, exigência por conta e desativação.
- `auditoria`: registro único das ações, na mesma transação do dado, só de inclusão, sem segredos e com retenção mínima.
- `tela-de-entrada`: a tela de entrada da casca, com os passos pendentes, os erros, o endereço desconhecido e o bloqueio da casca quando a sessão termina.

### Modified Capabilities
- `isolamento-organizacoes`: a organização de cada requisição vem do endereço de acesso, por uma única consulta estreita que atravessa organizações.
- `plataforma-base`: erros da API em formato único com código de rastreio, proteção contra CSRF e limite de requisições.
- `chegada`: a etapa "Validando sessão", a entrada entre as boas-vindas e a montagem da casca, e a sessão desconhecida sem servidor.
- `estrutura-da-casca`: o item de usuário da barra com o nome da conta e os itens "Conta", "Ajustes do Sistema" e "Sair".
- `ajustes-do-sistema`: a seção Conta no topo da lista, com os dados, a senha, a verificação em dois passos e as sessões.
- `componentes-base`: o código QR no conjunto de componentes de exibição.

## Impact

- **Código**
  - `packages/db`: as migrations e o schema de endereços, pessoas, contas, sessões, tentativas de entrada, dois passos, códigos de recuperação e auditoria, além da função de resolução do endereço.
  - `packages/domain`: a regra da senha, o bloqueio progressivo, a normalização do usuário e a descrição do dispositivo.
  - `apps/api`:
    - o contexto da organização por requisição e as transações com auditoria;
    - o formato dos erros, a proteção contra CSRF e o limite de requisições;
    - as credenciais (Argon2id, TOTP e cifra do segredo);
    - as rotas de sessão e de conta, o comando `pnpm grafite` e os testes de integração com PostgreSQL real.
  - `packages/api-client`: o contrato regenerado.
  - `packages/ui`: a tela de entrada e os passos, o código QR e o menu do usuário com o nome, com histórias e regressão visual.
  - `apps/web`:
    - o cliente da API com o CSRF;
    - o provedor da sessão, a etapa da chegada e a tela de entrada;
    - o bloqueio no meio do uso;
    - a seção Conta e as entradas da busca;
    - o contrato de módulo com a sessão.
  - `scripts/dev.ts`: a chave dos dois passos no `.env` e a organização de desenvolvimento.
- **Configuração:** a variável `GRAFITE_CHAVE_DOIS_PASSOS`, obrigatória e sem padrão, validada na partida.
- **Dependências:**
  - na API, `@fastify/cookie`, `@fastify/rate-limit` e `drizzle-orm`, este já usado pelo `packages/db`;
  - no `packages/ui`, o `uqr`, uma biblioteca pequena de QR code;
  - na web, o `@grafite/api-client`.
  - O Argon2id e o TOTP usam o `node:crypto`, sem dependência nativa.
- **Testes:**
  - unitários do domínio e das credenciais, com os vetores da RFC 6238;
  - integração da API com PostgreSQL real;
  - ponta a ponta das telas com a API simulada e uma ponta a ponta da pilha completa (API, banco e web compilada) com o próprio job no CI;
  - regressão visual das histórias novas.
- **PMG:** nenhum impacto. As contas do PMG chegam na migração (P8).
