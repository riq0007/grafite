# verificacao-em-dois-passos Specification

## Purpose

Pedir, além da senha, um código do app autenticador do usuário, com códigos de recuperação para quando o aparelho se perde, e exigir essa verificação das contas que precisam dela.

## Requirements

### Requirement: Cadastro pelo QR code

O usuário SHALL poder ativar a verificação em dois passos com um app autenticador comum, que gera um código de 6 dígitos a cada 30 segundos. O cadastro SHALL mostrar:
- um QR code com a chave, o nome "Grafite", o usuário e a organização;
- a mesma chave em texto, com "Copiar", para quem não consegue ler o QR code.

O cadastro SHALL pedir um código gerado pelo app, e só o código certo SHALL ativar a verificação. Até lá, a entrada não muda. Recomeçar um cadastro não concluído SHALL gerar uma chave nova.

#### Scenario: Código certo
- **WHEN** o usuário lê o QR code com o app e digita o código que ele mostra
- **THEN** a verificação é ativada, e a tela mostra os códigos de recuperação

#### Scenario: Código errado no cadastro
- **WHEN** o usuário digita um código que não corresponde à chave
- **THEN** a tela diz "Código incorreto. Confira se o relógio do celular está certo e tente de novo.", e a verificação continua desativada

#### Scenario: Cadastro abandonado
- **WHEN** o usuário abre o cadastro e sai sem digitar o código
- **THEN** a entrada continua só com a senha, e um novo cadastro mostra outra chave

### Requirement: Código na entrada

Com a verificação ativa, a entrada SHALL pedir, depois da senha, o código atual do app ou um código de recuperação.

O código do app:
- **vale no intervalo atual de 30 segundos e nos dois vizinhos,** para tolerar um relógio pouco adiantado ou atrasado;
- **não é aceito de novo** depois de usado.

Os códigos errados:
- **cinco na mesma entrada encerram a sessão pendente;**
- **cada um conta** como recusa no bloqueio progressivo do usuário.

#### Scenario: Código certo na entrada
- **WHEN** o usuário digita o código que o app mostra
- **THEN** a sessão passa a valer, e a casca abre

#### Scenario: Código repetido
- **WHEN** alguém reenvia um código que já foi aceito
- **THEN** o código é recusado com "Código incorreto."

#### Scenario: Relógio um pouco atrasado
- **WHEN** o celular mostra o código do intervalo anterior
- **THEN** o código é aceito

#### Scenario: Cinco códigos errados
- **WHEN** o usuário erra o código cinco vezes na mesma entrada
- **THEN** a sessão pendente termina, e a tela volta ao usuário e senha

### Requirement: Códigos de recuperação

Ao ativar a verificação, o usuário SHALL receber 10 códigos de recuperação, mostrados uma vez, com "Copiar". Cada código SHALL servir uma vez, no lugar do código do app. Os códigos SHALL ser guardados só em hash.

A conta SHALL mostrar quantos códigos ainda restam. O usuário SHALL poder gerar códigos novos, confirmando com um código do app ou de recuperação, e então os antigos SHALL deixar de valer.

#### Scenario: Entrada com um código de recuperação
- **WHEN** o usuário escolhe "Usar um código de recuperação" e digita um dos códigos
- **THEN** a sessão passa a valer, o código não serve de novo, e a tela avisa "Restam 9 códigos de recuperação."

#### Scenario: Códigos novos
- **WHEN** o usuário gera códigos novos
- **THEN** a tela mostra os 10 novos uma vez, e nenhum dos antigos é aceito

#### Scenario: Último código
- **WHEN** o usuário entra com o último código de recuperação
- **THEN** a tela avisa "Este era o seu último código de recuperação. Gere novos na sua conta.", e a notificação de Atenção com esse texto fica na central da conta, com "Abrir" na seção Conta dos Ajustes

### Requirement: Exigência por conta ou por perfil

A verificação em dois passos SHALL ser exigida de uma conta quando:
- a própria conta a exige;
- ou quando a conta tem, direto ou por um grupo, uma atribuição em vigor de um perfil ativo que exige.

A conta criada com a organização SHALL exigir, e o perfil Administrador também. A exceção é a organização de desenvolvimento, criada pelo comando de desenvolvimento.

A conta que exige a verificação:
- **sem tê-la ainda,** SHALL cadastrá-la antes de qualquer outra ação. Isso vale na próxima entrada e também numa sessão já aberta, na requisição seguinte à mudança que passou a exigir;
- SHALL NOT poder desativá-la.

#### Scenario: Conta que exige, sem a verificação
- **WHEN** o usuário de uma conta que exige os dois passos entra pela primeira vez
- **THEN** a tela pede o cadastro dos dois passos antes de abrir a casca

#### Scenario: Perfil que exige, com a sessão aberta
- **WHEN** Bruno, sem os dois passos, está com a sessão aberta e recebe o perfil Administrador
- **THEN** a requisição seguinte de Bruno é recusada até ele cadastrar os dois passos

#### Scenario: Desativar quando exigida
- **WHEN** o usuário de uma conta que exige os dois passos abre a verificação na conta
- **THEN** a tela diz quem exige, como "Exigida pelo perfil Administrador", e não oferece desativar, e a API recusa a desativação

### Requirement: Desativação

Quem não é obrigado SHALL poder desativar a verificação, confirmando com um código atual do app ou de recuperação. A desativação SHALL apagar a chave e os códigos de recuperação.

#### Scenario: Desativar com código certo
- **WHEN** o usuário confirma a desativação com o código do app
- **THEN** a próxima entrada pede só usuário e senha

#### Scenario: Desativar com código errado
- **WHEN** o usuário confirma a desativação com um código errado
- **THEN** a desativação é recusada, e a verificação continua ativa

### Requirement: Chave do app guardada cifrada

A chave do app autenticador SHALL ser guardada cifrada. A chave que cifra SHALL vir da configuração do servidor e SHALL NOT ficar no banco nem no código. A API SHALL recusar iniciar sem essa configuração. A chave do app SHALL aparecer só durante o cadastro.

#### Scenario: Banco lido sem a configuração
- **WHEN** alguém lê a tabela da verificação em dois passos sem a chave do servidor
- **THEN** não consegue obter a chave do app de nenhuma conta

#### Scenario: API sem a chave
- **WHEN** a API é iniciada sem a chave da verificação em dois passos
- **THEN** o processo encerra com uma mensagem que nomeia a variável ausente

### Requirement: Remoção pela administração

Quem administra contas SHALL poder remover a verificação em dois passos da conta de outra pessoa, como quando ela perde o celular. A remoção SHALL apagar a chave e os códigos de recuperação e encerrar todas as sessões da conta. Se a conta continua exigindo, a próxima entrada SHALL pedir o cadastro de novo.

#### Scenario: Celular perdido
- **WHEN** quem administra contas remove os dois passos de Bruno, cujo perfil exige a verificação
- **THEN** as sessões de Bruno terminam, e a próxima entrada dele pede a senha e o cadastro de um app novo

### Requirement: Verificação no cofre

O cofre SHALL abrir só para a conta com a verificação em dois passos ativa, e revelar e copiar um segredo SHALL pedir o código atual do app, mesmo com a sessão aberta (spec cofre-de-segredos). O código certo SHALL liberar o cofre naquela sessão por 5 minutos e SHALL contar como usado, como na entrada: ele não vale de novo. Os códigos de recuperação SHALL NOT liberar o cofre.

Desativar a verificação, removê-la pela administração ou cadastrá-la de novo SHALL terminar a liberação do cofre em todas as sessões da conta.

#### Scenario: Código usado na entrada
- **WHEN** Bruno entra com o código do app e, no mesmo intervalo de 30 segundos, digita o mesmo código para liberar o cofre
- **THEN** a liberação é recusada, porque o código já foi usado, e o código seguinte do app libera o cofre

#### Scenario: Verificação removida com o cofre liberado
- **WHEN** quem administra as contas remove os dois passos de Bruno enquanto o cofre dele está liberado
- **THEN** a revelação seguinte de Bruno é recusada, e o cofre pede o cadastro da verificação

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
