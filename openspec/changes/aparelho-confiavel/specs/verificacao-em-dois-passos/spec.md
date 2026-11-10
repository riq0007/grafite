## ADDED Requirements

### Requirement: Aparelho confiável

No passo do código da entrada, o usuário SHALL poder marcar o navegador como um aparelho confiável. Com o código do app certo e a marca, a entrada SHALL guardar no navegador um token aleatório próprio, num cookie que:
- scripts não leem;
- só vai por conexão segura;
- outros sites não enviam;
- só acompanha as requisições da entrada.

O banco SHALL guardar só o hash do token, com a conta, o dispositivo, como "Chrome no Windows", o endereço IP, quando o aparelho passou a ser confiável e quando foi usado por último.

Nas entradas seguintes daquela conta, com a senha certa e um aparelho confiável dentro do prazo (requisito "Prazo da confiança"), a entrada SHALL dispensar o código do app. O aparelho SHALL ser conferido só depois da senha certa, e a presença do cookie SHALL NOT bastar: o aparelho SHALL existir no banco, pertencer à conta que entra, na organização do endereço, e estar dentro do prazo. O cookie que não confere SHALL ser apagado, e a entrada SHALL pedir o código.

O aparelho confiável:
- SHALL valer só para a conta que o marcou: um navegador guarda a confiança de uma conta por vez;
- SHALL NOT nascer de uma entrada por código de recuperação;
- SHALL NOT liberar o cofre nem dispensar o código do app pedido antes de uma ação sensível (requisito "Verificação no cofre");
- SHALL NOT dispensar a troca da senha temporária nem o cadastro dos dois passos pendentes.

Cada conta SHALL ter até 10 aparelhos confiáveis; o décimo primeiro SHALL tirar o usado há mais tempo. A auditoria SHALL registrar o aparelho que passa a ser confiável, com o dispositivo, sem o token.

#### Scenario: Confiar no aparelho
- **WHEN** Bruno entra com a senha e o código do app, com "Confiar neste aparelho por 30 dias" marcado
- **THEN** a sessão passa a valer, e a auditoria registra o aparelho confiável "Chrome no Windows"

#### Scenario: Entrada seguinte no mesmo navegador
- **WHEN** Bruno sai e entra de novo com a senha certa, no mesmo navegador, 3 dias depois
- **THEN** a casca abre sem pedir o código

#### Scenario: Outro navegador
- **WHEN** Bruno entra com a senha certa num navegador que nunca foi marcado
- **THEN** a tela pede o código do app

#### Scenario: Cookie de outra conta
- **WHEN** Carla entra com a senha certa num navegador em que só Bruno marcou o aparelho
- **THEN** a tela pede o código do app de Carla

#### Scenario: Senha errada com o aparelho confiável
- **WHEN** alguém erra a senha de Bruno no navegador que Bruno marcou
- **THEN** a entrada é recusada com "Usuário ou senha incorretos.", como em qualquer navegador, e a recusa conta para o bloqueio

#### Scenario: Código de recuperação
- **WHEN** Bruno entra com um código de recuperação
- **THEN** a tela não oferece confiar no aparelho, e a entrada seguinte pede o código de novo

#### Scenario: Cofre no aparelho confiável
- **WHEN** Bruno entra sem o código, pelo aparelho confiável, e pede para revelar um segredo
- **THEN** o cofre pede o código atual do app, como antes

#### Scenario: Tabela dos aparelhos lida
- **WHEN** alguém lê a tabela dos aparelhos confiáveis
- **THEN** encontra só hashes, que não servem como cookie

### Requirement: Prazo da confiança

O prazo da confiança SHALL ser o número de dias, de 0 a 90, em que um aparelho confiável dispensa o código, contados de quando ele foi marcado. O uso do aparelho SHALL NOT renovar o prazo: passado o prazo, a entrada pede o código, e o aparelho pode ser marcado de novo. O prazo 0 SHALL significar pedir o código em toda entrada.

O prazo que vale para uma conta SHALL ser:
1. o da própria conta, quando ela tem um;
2. sem ele, o menor entre os prazos dos perfis ativos que a conta tem em vigor, direto ou por um grupo, quando algum tem um;
3. sem nenhum, o da organização, que é 30 dias de fábrica.

Quem tem `acessos.administrar` SHALL mudar o prazo da organização e o de um perfil; quem tem `contas.administrar` SHALL mudar o de outra conta. Ninguém SHALL mudar o prazo da própria conta. O valor fora de 0 a 90 SHALL ser recusado com "Informe um prazo de 0 a 90 dias.". A auditoria SHALL registrar cada mudança de prazo, com o valor de antes e o de depois.

O prazo SHALL ser conferido em cada entrada, com o valor do momento: reduzir o prazo SHALL valer na hora para os aparelhos já marcados, e o prazo 0 SHALL fazer toda entrada pedir o código. Com o prazo 0, o passo do código SHALL NOT oferecer confiar no aparelho.

#### Scenario: Prazo de fábrica
- **WHEN** Bruno marcou o aparelho há 29 dias, numa organização sem prazo definido
- **THEN** a entrada dispensa o código, e no 31º dia ela o pede de novo

#### Scenario: Uso não renova
- **WHEN** Bruno marcou o aparelho há 29 dias e entrou por ele todos os dias
- **THEN** no 31º dia a entrada pede o código

#### Scenario: Prazo reduzido
- **WHEN** quem administra os acessos muda o prazo da organização de 30 para 7 dias, e Bruno marcou o aparelho há 10
- **THEN** a entrada seguinte de Bruno pede o código

#### Scenario: Perfil que pede sempre
- **WHEN** o perfil Administrador tem o prazo 0, e Ana, que tem esse perfil e nenhum prazo próprio, entra com a senha certa
- **THEN** a tela pede o código, sem oferecer confiar no aparelho

#### Scenario: Prazo da conta
- **WHEN** a organização pede o código sempre, com o prazo 0, e quem administra contas dá a Carla o prazo de 30 dias
- **THEN** Carla pode confiar no aparelho por 30 dias, e as outras contas continuam digitando o código em toda entrada

#### Scenario: Prazo fora do intervalo
- **WHEN** alguém grava o prazo de 120 dias na organização
- **THEN** a gravação é recusada com "Informe um prazo de 0 a 90 dias."

### Requirement: Aparelhos esquecidos

O usuário SHALL poder esquecer um aparelho confiável da própria conta, ou todos, e quem administra contas SHALL poder esquecer todos os de outra conta (spec administracao-de-pessoas). O aparelho esquecido SHALL ser apagado, e a entrada seguinte por ele SHALL pedir o código.

Todos os aparelhos confiáveis da conta SHALL ser esquecidos, sem uma ação a mais:
- na troca da senha, pela própria conta;
- na redefinição do acesso, pelo comando no servidor ou pela administração;
- ao ativar, desativar ou cadastrar de novo a verificação em dois passos, e na remoção dela pela administração;
- na inativação da conta ou da pessoa.

A manutenção diária SHALL apagar os aparelhos marcados há mais de 90 dias. A auditoria SHALL registrar o aparelho esquecido por alguém, com quem esqueceu.

#### Scenario: Esquecer um aparelho
- **WHEN** Bruno esquece o aparelho "Chrome no Windows" nos Ajustes
- **THEN** a entrada seguinte naquele navegador pede o código, e a auditoria registra o aparelho esquecido

#### Scenario: Senha trocada
- **WHEN** Bruno troca a senha, com dois aparelhos confiáveis
- **THEN** os dois são esquecidos, e a entrada seguinte em qualquer um pede o código

#### Scenario: Dois passos removidos pela administração
- **WHEN** quem administra contas remove os dois passos de Bruno, que tinha um aparelho confiável
- **THEN** o aparelho é esquecido, e, depois do cadastro de um app novo, a entrada naquele navegador pede o código
