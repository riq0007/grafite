# tela-de-entrada Specification

## Purpose

Receber quem chega sem sessão com uma tela de entrada clara, que conduz pelos passos pendentes da conta e protege a casca quando a sessão termina no meio do uso.

## Requirements

### Requirement: Tela de entrada

Sem uma sessão que valha, a casca SHALL mostrar a tela de entrada, com:
- a marca;
- o nome da organização do endereço;
- os campos "Usuário" e "Senha";
- o botão "Entrar".

O campo da senha SHALL oferecer "Mostrar senha". O foco SHALL começar no usuário, ou na senha quando o usuário já vem preenchido, e Enter SHALL enviar. Durante o envio, o botão SHALL mostrar o estado carregando, e um segundo envio SHALL NOT sair. A tela SHALL ter superfície sólida, sem vidro, e os campos SHALL se identificar para os gerenciadores de senha.

#### Scenario: Abrir sem sessão
- **WHEN** o usuário abre a aplicação sem sessão no endereço da organização "Empresa"
- **THEN** a tela de entrada aparece com "Empresa", e o foco está no campo "Usuário"

#### Scenario: Enviar com Enter
- **WHEN** o usuário preenche usuário e senha e pressiona Enter
- **THEN** a entrada é enviada uma vez, e o botão mostra que está entrando

### Requirement: Mensagens da entrada

A tela SHALL dizer em texto, perto dos campos e anunciado ao leitor de tela:
- **na recusa:** "Usuário ou senha incorretos.", com a senha limpa e o foco de volta nela;
- **no bloqueio:** "Muitas tentativas com este usuário. Tente de novo em N min.";
- **sem resposta do servidor:** "Sem conexão com o servidor. Tente de novo.";
- **num erro do servidor:** "Não foi possível entrar. Informe à TI o código <código de rastreio>.".

"Esqueci minha senha" SHALL mostrar "Peça à TI para redefinir a sua senha.".

#### Scenario: Senha errada
- **WHEN** o usuário erra a senha
- **THEN** a tela mostra "Usuário ou senha incorretos.", limpa a senha e põe o foco nela

#### Scenario: Erro do servidor
- **WHEN** o servidor responde com um erro inesperado, de código de rastreio "R7K2-9QXM"
- **THEN** a tela mostra "Não foi possível entrar. Informe à TI o código R7K2-9QXM."

#### Scenario: Esqueci minha senha
- **WHEN** o usuário escolhe "Esqueci minha senha"
- **THEN** a tela mostra "Peça à TI para redefinir a sua senha."

### Requirement: Passos pendentes na tela

A tela SHALL mostrar o passo pendente da vez:
- **código:** um campo para os 6 dígitos do app, com "Usar um código de recuperação", que troca o campo pelo do código de recuperação;
- **troca da senha:** "Senha nova" e "Confirmar a senha nova", com a regra da senha à vista e o motivo de uma recusa antes de enviar;
- **cadastro dos dois passos:**
  - o QR code e a chave em texto, com "Copiar";
  - o campo do código;
  - depois de ativar, os códigos de recuperação, com "Copiar" e "Continuar".

Cada passo SHALL oferecer "Sair", que encerra a sessão pendente e volta ao usuário e senha.

#### Scenario: Confirmação diferente
- **WHEN** o usuário digita senhas novas diferentes nos dois campos
- **THEN** a tela mostra "As senhas não são iguais." antes de enviar

#### Scenario: Códigos de recuperação no cadastro
- **WHEN** o usuário ativa os dois passos na entrada
- **THEN** a tela mostra os 10 códigos de recuperação, e só "Continuar" leva à casca

#### Scenario: Sair de um passo pendente
- **WHEN** o usuário escolhe "Sair" no passo do código
- **THEN** a sessão pendente termina, e a tela volta ao usuário e senha

### Requirement: Endereço desconhecido

Se o endereço não pertence a nenhuma organização, a tela SHALL dizer "Este endereço não está ligado a nenhuma organização do Grafite. Confira o endereço com a TI." e SHALL NOT mostrar os campos.

#### Scenario: Endereço que nenhuma organização registrou
- **WHEN** o usuário abre a aplicação por um endereço que não foi registrado
- **THEN** a tela mostra a mensagem do endereço desconhecido, sem os campos de entrada

### Requirement: Sessão que termina no meio do uso

Quando a sessão termina com a casca aberta, a tela de entrada SHALL cobrir a casca, que fica inerte e escondida. Ela termina assim ao expirar, ao ser encerrada em outro dispositivo e ao ser redefinida pelo comando.

A tela SHALL dizer "Sua sessão terminou. Entre de novo para continuar." e trazer o usuário preenchido. Entrar com a mesma conta SHALL voltar à casca, no mesmo endereço e no mesmo estado. Entrar com outra conta SHALL recarregar a aplicação, sem nada da conta anterior.

#### Scenario: Sessão expirada com a casca aberta
- **WHEN** a sessão expira enquanto o usuário está na seção Dock dos Ajustes
- **THEN** a tela de entrada cobre a casca, com "Sua sessão terminou. Entre de novo para continuar." e o usuário preenchido

#### Scenario: Entrar de novo com a mesma conta
- **WHEN** o usuário entra de novo pela tela que cobre a casca
- **THEN** a casca volta, na seção Dock, como estava

#### Scenario: Entrar com outra conta
- **WHEN** outra pessoa entra com a própria conta pela tela que cobre a casca
- **THEN** a aplicação recarrega e abre sem nada da conta anterior

### Requirement: Entrada nas posturas e com movimento reduzido

A tela de entrada SHALL caber no celular sem rolagem horizontal, com os campos na largura toda. No tablet, os alvos de toque SHALL ter pelo menos 44 px. A troca entre os passos SHALL ser só de opacidade, e com o movimento reduzido nenhum elemento SHALL se deslocar.

#### Scenario: Entrada no celular
- **WHEN** a tela de entrada abre num celular de 390 px de largura
- **THEN** os campos ocupam a largura útil, e a página não rola na horizontal

### Requirement: Cadastro exigido no meio do uso

Quando a conta passa a exigir a verificação em dois passos com a casca aberta, a tela de entrada SHALL cobrir a casca, que fica inerte e escondida, na próxima requisição recusada pela pendência. A tela SHALL mostrar o cadastro dos dois passos, com "A verificação em dois passos passou a ser exigida para a sua conta.". Concluído o cadastro e vistos os códigos de recuperação, a casca SHALL voltar, no mesmo endereço e no mesmo estado.

#### Scenario: Perfil que exige com a casca aberta
- **WHEN** Bruno está na lista de pessoas, recebe um perfil que exige os dois passos e escolhe outra tela
- **THEN** a tela de entrada cobre a casca com o cadastro dos dois passos e a mensagem da exigência

#### Scenario: Voltar depois do cadastro
- **WHEN** Bruno conclui o cadastro e escolhe "Continuar" nos códigos de recuperação
- **THEN** a casca volta na lista de pessoas, como estava

### Requirement: Aviso do ambiente de teste

No ambiente de teste, a tela de entrada SHALL mostrar, acima do formulário, o texto "Ambiente de teste" com um ícone, e a frase "Os dados são uma cópia da produção. O que mudar aqui não vai para a produção." Nos outros ambientes, o aviso SHALL NOT aparecer.

#### Scenario: Entrada no teste
- **WHEN** alguém abre o endereço do ambiente de teste sem sessão
- **THEN** a tela de entrada mostra "Ambiente de teste" e a frase sobre a cópia da produção, antes do usuário e da senha

#### Scenario: Entrada na produção
- **WHEN** alguém abre o endereço da produção sem sessão
- **THEN** a tela de entrada não mostra o aviso
