## 1. Spec mestre e configuração

- [x] 1.1 Atualizar a spec mestre conforme o design (decisão 17):
  - seção 3.3: a divisão do F2 em quatro changes (F2a a F2d);
  - seção 4.4: a organização pelo endereço de acesso;
  - seção 5.2: o login por usuário único na organização e as credenciais que se substituem;
  - seção 6.7: a auditoria por no mínimo 5 anos;
  - seção 7.5: a entrada entre as boas-vindas e a montagem, e as etapas;
  - seção 9: os tempos da sessão e do bloqueio, as pendências, os códigos de recuperação, a única consulta entre organizações, o CSRF por origem e token e os limites de requisições;
  - seção 10.1: o formato do código de rastreio;
  - seção 15: sai a retenção da auditoria e entra a política de anonimização (F2b);
  - Apêndice B: os tempos da sessão, do bloqueio e da validação na chegada.

  Verificar: o diff da spec mestre bate com as specs desta change.
- [x] 1.2 Escrever os testes da configuração e depois exigir a `GRAFITE_CHAVE_DOIS_PASSOS`:
  - obrigatória e sem padrão;
  - 32 bytes em base64, recusada com a mensagem que nomeia a variável quando falta ou tem outro tamanho.

  Escrever também os testes do `pnpm dev` e depois fazê-lo gerar a chave no `.env` novo e acrescentá-la a um `.env` que não a tem, sem trocar uma que existe.

  Verificar: os testes unitários passam, e a API sem a variável encerra nomeando-a.

## 2. Banco

- [x] 2.1 Escrever o teste de integração da chave estrangeira composta e depois fazer o `orgScoped()` criar `unique (org_id, id)`. O teste usa uma tabela de prova, com uma referência a um registro de outra organização recusada pelo banco. Verificar: `pnpm test:integration` passa no `packages/db`.
- [x] 2.2 Escrever os testes de integração dos endereços e depois criar a tabela `enderecos_de_acesso` e a função `app.organizacao_do_endereco()`, com a política do dono e o `EXECUTE` só para o `grafite_app`. Os casos:
  - o endereço exato devolve a organização;
  - um desconhecido devolve nulo;
  - o papel da aplicação, sem contexto, não vê nenhum endereço;
  - com o contexto de A, não vê os de B;
  - o mesmo endereço em duas organizações é recusado.

  Verificar: os testes de integração passam, e o teste-guarda continua sem tabela sem RLS.
- [x] 2.3 Escrever os testes de integração e depois criar `pessoas` e `contas`. Os casos:
  - o isolamento entre organizações;
  - o usuário único na organização e repetido em outra;
  - uma conta por pessoa;
  - a chave composta recusando a pessoa de outra organização.

  Verificar: `pnpm test:integration` passa.
- [x] 2.4 Escrever os testes de integração e depois criar `sessoes`, `tentativas_de_entrada`, `dois_passos` e `codigos_de_recuperacao`, com as chaves compostas. Os casos:
  - o isolamento;
  - o `token_hash` único;
  - uma linha de dois passos por conta;
  - um usuário digitado por organização nas tentativas.

  Verificar: `pnpm test:integration` passa.
- [x] 2.5 Escrever os testes de integração e depois criar a `auditoria`, com os índices e o `REVOKE UPDATE, DELETE` do `grafite_app`. Os casos: o papel da aplicação inclui e lê, e o banco recusa a alteração e a exclusão. Verificar: os testes de integração passam.
- [x] 2.6 Escrever os testes de integração da `naOrganizacao(banco, orgId, fn)` e depois implementá-la. Os casos:
  - o contexto vale dentro;
  - o contexto some na transação seguinte da mesma conexão;
  - um erro desfaz tudo.

  Separar o PostgreSQL de teste do `test/banco-global.ts` numa função exportada para os outros pacotes.

  Verificar: os testes passam, e `pnpm typecheck` também.

## 3. Domínio

- [x] 3.1 Escrever os testes de `normalizarUsuario` e `validarUsuario` e depois implementá-los. Os casos:
  - espaços nas pontas e maiúsculas;
  - de 3 a 64 caracteres;
  - os caracteres aceitos e o primeiro, letra ou número;
  - a mensagem com a lista dos aceitos.

  Verificar: os testes unitários passam.
- [x] 3.2 Escrever os testes de `avaliarSenha` e depois implementá-la. Os casos:
  - "Use pelo menos 12 caracteres." e o limite de 128;
  - um caractere repetido e as sequências de números, letras e teclado;
  - a senha com o usuário;
  - a lista curta de senhas comuns ("password1234");
  - a frase longa sem símbolos aceita.

  Verificar: os testes unitários passam.
- [x] 3.3 Escrever os testes de `bloqueioDepois` e `descreverDispositivo` e depois implementá-los. Os casos:
  - sem bloqueio até 4 falhas, depois 1, 2, 4, 8 e 15 min, e o teto;
  - o tempo restante arredondado para cima em minutos;
  - Chrome, Edge, Firefox e Safari no Windows, no Mac, no Linux, no iPhone e no Android;
  - "Navegador desconhecido".

  Verificar: os testes unitários passam.

## 4. Credenciais

- [x] 4.1 Escrever os testes do hash da senha e depois implementá-lo com o `crypto.argon2` (design, decisão 4). Os casos:
  - o formato PHC com os parâmetros;
  - a verificação certa e a errada;
  - os parâmetros lidos do texto;
  - a regravação quando eles mudam;
  - o hash de engano para o usuário inexistente.

  Verificar: os testes unitários passam.
- [x] 4.2 Escrever os testes do TOTP e depois implementá-lo. Os casos:
  - os vetores das RFCs 4226 e 6238;
  - o base32 da RFC 4648;
  - a janela de um passo para cada lado;
  - a recusa de um passo já usado;
  - a URI `otpauth://` com o emissor, o usuário e a organização.

  Verificar: os testes unitários passam.
- [x] 4.3 Escrever os testes e depois implementar três peças:
  - **a cifra AES-256-GCM da chave do app:** ida e volta, a versão, e a recusa com outra chave ou com outro `conta_id` como dado associado;
  - **os códigos de recuperação:** 10 códigos, o formato `xxxxx-xxxxx`, a normalização (sem hífen, I e L como 1, O como 0) e o hash;
  - **o gerador da senha temporária:** 16 caracteres em grupos de 4.

  Verificar: os testes unitários passam.

## 5. Base da API

- [x] 5.1 Escrever os testes com `app.inject` e depois implementar o código de rastreio e os erros em problem+json. Os casos:
  - o código no cabeçalho e no log;
  - a validação com a mensagem de cada campo em pt-BR;
  - a rota inexistente em 404;
  - o erro inesperado em 500, com "Erro interno do servidor." e sem detalhe.

  Verificar: os testes da API passam, e `pnpm contrato:verificar` continua em dia.
- [x] 5.2 Montar a integração da API: `test:integration` no `apps/api`, com o PostgreSQL de teste da tarefa 2.6, e o `criarApp` recebendo o banco (Drizzle sobre o `pg.Pool`), a chave dos dois passos e o relógio. Ligar o `servidor.ts` a essas dependências e começar pelo teste de integração do `/health` com o banco real. Verificar: `pnpm test:integration` roda a API e o banco, e o job de integração do CI os inclui.
- [x] 5.3 Escrever os testes de integração e depois implementar a organização pelo endereço nas rotas de acesso, com o cache e o problem `endereco-desconhecido`. Os casos:
  - duas organizações, cada uma pelo próprio `Host`;
  - o endereço com maiúsculas e porta;
  - o desconhecido recusado;
  - o `/health` em qualquer endereço.

  Verificar: os testes passam.
- [x] 5.4 Escrever os testes e depois implementar o CSRF e o limite de requisições (design, decisão 9). Os casos:
  - a escrita com `Sec-Fetch-Site: cross-site` ou com outra `Origin`, recusada com 403;
  - a escrita com sessão e sem o token, recusada com 403;
  - a 601ª requisição do mesmo IP em um minuto e a 21ª entrada, ambas em 429, com o tempo em pt-BR e o `Retry-After`.

  Verificar: os testes passam.

## 6. Auditoria na API

- [x] 6.1 Escrever os testes de integração e depois implementar o `registrarNaAuditoria(tx, evento)` e as visões auditáveis da pessoa e da conta. Os casos:
  - uma falha forçada no dado não deixa o registro;
  - uma falha forçada no registro desfaz o dado;
  - o ator, o IP e o código de rastreio gravados;
  - nenhuma visão auditável com hash, segredo, token ou senha.

  Verificar: os testes passam.

## 7. Comando no servidor

- [x] 7.1 Escrever os testes de integração e depois implementar o `pnpm grafite organizacao criar`, com a ajuda em pt-BR. Os casos:
  - a organização, os endereços, a pessoa e a conta criados, com a senha temporária e os dois passos exigidos, e a auditoria feita pelo comando no servidor;
  - a saída com a senha uma vez;
  - um endereço em uso, sem nada criado;
  - o `--se-nao-existir` com o endereço já registrado, sem erro e sem senha.

  Verificar: os testes passam, e `pnpm grafite --ajuda` lista os comandos.
- [x] 7.2 Escrever os testes de integração e depois implementar o `conta criar` e o `conta redefinir`. Os casos:
  - a conta nova numa organização existente, com e sem exigir os dois passos;
  - o usuário repetido recusado;
  - na redefinição, a senha temporária nova, todas as sessões encerradas, a contagem de tentativas zerada e, com `--remover-dois-passos`, a chave e os códigos apagados;
  - a auditoria de cada ação.

  Verificar: os testes passam.
- [x] 7.3 Fazer o `pnpm dev` criar a organização de desenvolvimento (`localhost` e `127.0.0.1`, conta `admin`, sem exigir os dois passos) com `--se-nao-existir`, depois das migrations, começando pelo teste da montagem do comando. Pôr o `pnpm grafite` na tabela de comandos do `CLAUDE.md`. Verificar:
  - o teste passa;
  - o primeiro `pnpm dev` com o banco vazio mostra a senha temporária uma vez, e o segundo não mostra.

## 8. Sessões na API

- [x] 8.1 Escrever os testes e depois implementar a sessão (design, decisão 6). Os casos:
  - a pendência derivada da conta e da sessão, em teste unitário;
  - o token só em hash e o cookie `__Host-grafite-sessao` com os atributos e o `Max-Age`;
  - a busca pelo hash dentro da organização;
  - a sessão de outra organização tratada como ausente;
  - com o relógio adiantado, 2 h sem uso e 12 h no total;
  - o `ultimo_uso_em` regravado só depois de 60 s;
  - as guardas `exigirSessao` e `exigirAtiva`, com `pendencia` (403).

  Verificar: os testes unitários e de integração passam.
- [x] 8.2 Escrever os testes de integração e depois implementar o `GET /sessao` e o `POST /sessao`. Os casos:
  - o estado com o nome da organização e sem sessão;
  - a entrada certa, com o cookie e o estado;
  - o usuário inexistente, a senha errada e a conta inativa com a mesma recusa;
  - o bloqueio na 5ª recusa e a senha certa recusada durante ele, sem contar;
  - a pendência de cada tipo e o fim dela depois de 10 min;
  - a auditoria de cada entrada e recusa, com o motivo real.

  Regenerar o contrato. Verificar: os testes passam, e `pnpm contrato:verificar` está em dia.
- [x] 8.3 Escrever os testes de integração e depois implementar o `POST /sessao/segundo-passo`. Os casos:
  - o código do app aceito, com o token e o CSRF trocados e o cookie antigo recusado;
  - o código repetido recusado;
  - o código de recuperação aceito uma vez, com os restantes na resposta e o aviso do último;
  - cinco códigos errados encerrando a sessão pendente;
  - cada código errado contando no bloqueio;
  - a auditoria.

  Regenerar o contrato. Verificar: os testes passam.
- [x] 8.4 Escrever os testes de integração e depois implementar o `DELETE /sessao`, o `GET /conta/sessoes`, o `DELETE /conta/sessoes/:id` e o `DELETE /conta/sessoes`. Os casos:
  - a saída com o cookie apagado e a cópia dele recusada;
  - a lista com o dispositivo, o IP, os horários e a atual, sem token e sem sessões de outra conta;
  - encerrar uma e encerrar as outras;
  - a sessão de outra conta recusada como não encontrada;
  - a auditoria com o motivo.

  Regenerar o contrato. Verificar: os testes passam.

## 9. Conta na API

- [x] 9.1 Escrever os testes de integração e depois implementar o `GET /conta` e o `PUT /conta/senha`. Os casos:
  - os dados sem hash;
  - a regra da senha com o motivo em `campos`;
  - a senha atual errada recusada e contando no bloqueio;
  - a nova igual à temporária recusada;
  - a troca encerrando as outras sessões;
  - a pendência `trocar-senha` resolvida, com o próximo passo ou a sessão ativada e o token trocado;
  - a auditoria.

  Regenerar o contrato. Verificar: os testes passam.
- [x] 9.2 Escrever os testes de integração e depois implementar o cadastro e a confirmação dos dois passos. Os casos:
  - a chave e a URI, e o recomeço com uma chave nova;
  - o código errado sem ativar;
  - o código certo ativando, com os 10 códigos uma vez e as outras sessões encerradas;
  - a pendência `cadastrar-dois-passos` resolvida, com a sessão ativada;
  - a chave guardada cifrada, nunca em texto no banco;
  - a auditoria.

  Regenerar o contrato. Verificar: os testes passam.
- [x] 9.3 Escrever os testes de integração e depois implementar a desativação e os códigos novos. Os casos:
  - a desativação com o código certo, apagando a chave e os códigos;
  - a desativação recusada com `dois-passos-exigidos` (409) e com o código errado;
  - os códigos novos invalidando os antigos;
  - a auditoria.

  Regenerar o contrato. Verificar: os testes passam, e `pnpm contrato:verificar` está em dia.

## 10. Componentes

- [x] 10.1 Acrescentar os tokens de componente `--qr-fundo` e `--qr-modulo`, fixos em todos os temas, e o `uqr` ao `packages/ui`. Criar o `CodigoQR`, começando pelas histórias e pelos testes de interação:
  - o `role="img"` com o nome acessível;
  - a margem de 4 módulos;
  - o fundo branco e os módulos pretos também no OLED.

  Verificar: `pnpm test:stories` passa, e `pnpm tokens:verificar` está em dia depois de `pnpm tokens:gerar`.
- [x] 10.2 Criar o `CampoDeSenha`, começando pelos testes de interação e pelas histórias:
  - "Mostrar senha" e "Ocultar senha", sem perder o foco;
  - o `autocomplete` pedido;
  - o erro anunciado.

  Verificar: `pnpm test:stories` passa, sem violações de acessibilidade sérias ou críticas.
- [x] 10.3 Criar a `TelaDeEntrada`, o `PassoDasCredenciais` e o `EnderecoDesconhecido`, começando pelos testes de interação e pelas histórias:
  - a organização e o foco no usuário, ou na senha com o usuário preenchido;
  - Enter enviando uma vez, com o botão carregando;
  - as mensagens de recusa, bloqueio, sem conexão e erro com o código de rastreio, anunciadas;
  - "Esqueci minha senha";
  - a mensagem do endereço desconhecido sem os campos.

  Verificar: `pnpm test:stories` passa.
- [x] 10.4 Criar o `PassoDoCodigo` e o `PassoDaSenhaNova`, começando pelos testes de interação e pelas histórias:
  - os 6 dígitos com `one-time-code`;
  - a troca para o código de recuperação;
  - "As senhas não são iguais." antes de enviar;
  - a regra da senha à vista;
  - "Sair" em cada passo.

  Verificar: `pnpm test:stories` passa.
- [x] 10.5 Criar o `CadastroDosDoisPassos` e os `CodigosDeRecuperacao`, começando pelos testes de interação e pelas histórias, com a chave de exemplo marcada como exemplo:
  - o QR code e a chave em grupos, com "Copiar";
  - o campo do código e o erro do código incorreto;
  - os 10 códigos com "Copiar";
  - "Continuar".

  Verificar: `pnpm test:stories` passa.
- [x] 10.6 Mudar o menu do usuário da barra, começando pelas histórias e pelos testes de interação:
  - as iniciais e o nome acessível;
  - "Conta", "Ajustes do Sistema" e "Sair", com o separador antes de "Sair";
  - o avatar neutro só com "Ajustes do Sistema".

  Verificar: `pnpm test:stories` passa.

## 11. Web: sessão e entrada

- [x] 11.1 Escrever os testes do cliente e depois implementar o `useApi()`, com o `@grafite/api-client`. Os casos:
  - o `x-grafite-csrf` só nas escritas;
  - o aviso à sessão no 401 `sem-sessao`;
  - um problem lido com o código de rastreio.

  Verificar: os testes unitários passam.
- [x] 11.2 Escrever os testes da loja da sessão com relógio falso e depois implementá-la, com o `useSessao()`. Os casos:
  - os estados vindos de cada resposta do `GET /sessao`;
  - as ações (entrar, código, senha, cadastro e sair), cada uma com o estado da resposta;
  - a sessão desconhecida tentando de novo no `online` e a cada 30 s;
  - o `terminou` quando havia sessão.

  Verificar: os testes passam.
- [x] 11.3 Escrever os testes da chegada com relógio falso e depois acrescentar a etapa "Validando sessão" e o estado `entrada`. Os casos:
  - as quatro etapas na ordem;
  - a etapa terminando em 5 s sem servidor;
  - o aviso `telaDesenhada` para a casca e para a entrada;
  - no primeiro acesso, boas-vindas → entrada → montagem;
  - num acesso seguinte sem sessão, entrada → casca por opacidade.

  Verificar: os testes da chegada passam, e as suítes existentes também.
- [x] 11.4 Escrever os testes de componente e depois implementar a `Porta` no `App`. Os casos:
  - sem sessão, só a entrada, e a casca ainda não montada;
  - usuário e senha → código → casca;
  - senha temporária → senha nova → cadastro → códigos → casca;
  - "Sair" num passo pendente voltando ao usuário e senha;
  - o endereço desconhecido.

  Verificar: os testes de componente passam.
- [x] 11.5 Escrever os testes de componente e depois implementar o bloqueio no meio do uso. Os casos:
  - o 401 cobrindo a casca, que fica `inert`, com "Sua sessão terminou…" e o usuário preenchido;
  - a mesma conta voltando ao mesmo endereço e estado;
  - outra conta recarregando a página;
  - a sessão desconhecida que, ao validar, não vale mais e cobre a casca.

  Verificar: os testes passam.
- [x] 11.6 Ligar o menu do usuário à sessão, começando pelos testes de componente:
  - o nome da conta;
  - "Conta" levando à seção Conta;
  - "Sair" encerrando a sessão e recarregando;
  - a sessão desconhecida com o avatar neutro.

  Verificar: os testes passam.

## 12. Seção Conta dos Ajustes

- [x] 12.1 Criar a seção Conta, começando pelos testes de componente. Os casos:
  - a primeira da lista, separada das outras, e sem "Restaurar padrões";
  - o nome, o usuário e o e-mail;
  - os estados carregando, erro com "Tentar de novo" e sem conexão;
  - os `data-foco` das partes;
  - as entradas da busca ("Conta", "Trocar senha", "Verificação em dois passos", "Códigos de recuperação" e "Sessões").

  Atualizar os exemplos do contrato de módulo que reproduzem as seções. Verificar: os testes de componente e o `documentacao.test.ts` passam.
- [x] 12.2 Implementar a troca da senha na seção, começando pelos testes de componente:
  - a regra à vista e o motivo antes de enviar;
  - as senhas diferentes;
  - a senha atual errada;
  - o sucesso com "As outras sessões foram encerradas.".

  Verificar: os testes passam.
- [x] 12.3 Implementar a verificação em dois passos na seção, começando pelos testes de componente:
  - a situação em texto;
  - "Ativar" com o cadastro e os códigos uma vez;
  - "Desativar" pedindo o código, e ausente quando exigida;
  - "Gerar novos códigos de recuperação";
  - "Restam N códigos de recuperação.".

  Verificar: os testes passam.
- [x] 12.4 Implementar as sessões na seção, começando pelos testes de componente:
  - o dispositivo, o IP e os horários no fuso escolhido;
  - "Esta sessão";
  - "Encerrar" tirando a sessão da lista;
  - "Encerrar as outras sessões".

  Verificar: os testes passam.

## 13. Contrato de módulo

- [x] 13.1 Atualizar `docs/casca/modulos.md`, com trechos conferidos pelo `documentacao.test.ts`:
  - `useSessao()`;
  - `useApi()` com o CSRF;
  - o 401, que cobre a casca sem código do módulo;
  - a etapa "Validando sessão" como exemplo de etapa da chegada.

  Verificar: o teste confere os exemplos com o código.

## 14. Verificação integrada e fechamento

- [x] 14.1 Fazer a fixture da ponta a ponta simular o `GET /api/sessao` com a sessão ativa de "Ana Souza", com a opção de começar sem sessão, e ajustar as suítes que olham o menu do usuário. Verificar: `pnpm test:e2e` passa.
- [x] 14.2 Escrever a ponta a ponta da entrada, com a API simulada. Os casos:
  - usuário e senha → código → casca;
  - a recusa e o bloqueio;
  - o endereço desconhecido;
  - a sessão que termina no Dock, cobrindo a casca e voltando ao Dock;
  - "Sair";
  - no celular, a entrada sem rolagem horizontal.

  Verificar: `pnpm test:e2e` passa.
- [x] 14.3 Montar a ponta a ponta da pilha (design, decisão 16): `playwright.pilha.config.ts`, o `globalSetup` com o PostgreSQL, as migrations, o `pnpm grafite organizacao criar` e a API servindo a web compilada, o `pnpm test:e2e:pilha` e o job no CI. O teste segue o caminho:
  1. troca a senha temporária;
  2. cadastra os dois passos com o TOTP gerado da chave na tela;
  3. abre a casca e vê "Esta sessão";
  4. sai e entra com o código;
  5. confere a auditoria.

  Verificar: `pnpm test:e2e:pilha` passa aqui e no CI.
- [x] 14.4 Capturar as histórias novas em Grafite e Névoa nas três larguras e revisar as referências: os passos da entrada, o código QR, os códigos de recuperação e o menu do usuário com o nome. Verificar: `pnpm test:visual` passa.
- [x] 14.5 Revisar as telas novas pelo checklist do ANTISLOP v2 e atualizar o `CLAUDE.md` (comandos e change em andamento). Verificar:
  - `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:stories`, `pnpm test:e2e`, `pnpm test:e2e:pilha` e `pnpm test:visual` verdes;
  - `pnpm tokens:verificar`, `pnpm marca:verificar` e `pnpm contrato:verificar` em dia;
  - o CI verde no PR.
