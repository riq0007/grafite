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
