## Purpose

Deixar entrar só quem tem conta, com usuário e senha, e manter a sessão no servidor. A sessão expira, as tentativas erradas são bloqueadas, e cada usuário controla as próprias sessões.

## ADDED Requirements

### Requirement: Entrada com usuário e senha

A entrada SHALL aceitar o usuário e a senha de uma conta ativa da organização do endereço, e com a senha certa SHALL criar uma sessão. Três casos SHALL ter a mesma recusa:
- o usuário não existe;
- a senha está errada;
- a conta está inativa.

A recusa SHALL vir no mesmo tempo aproximado, com a mensagem "Usuário ou senha incorretos.", sem dizer o que falhou.

#### Scenario: Usuário e senha certos
- **WHEN** o usuário de uma conta ativa entra com a senha certa
- **THEN** uma sessão é criada, e a casca abre, ou o passo pendente da conta aparece

#### Scenario: Usuário inexistente
- **WHEN** alguém entra com um usuário que não existe na organização
- **THEN** a entrada é recusada com "Usuário ou senha incorretos.", a mesma resposta da senha errada

#### Scenario: Conta inativa
- **WHEN** o usuário de uma conta inativa entra com a senha certa
- **THEN** a entrada é recusada com "Usuário ou senha incorretos.", e nenhuma sessão é criada

### Requirement: Bloqueio progressivo

Depois de 5 recusas seguidas de um mesmo usuário na organização, a entrada com ele SHALL ficar bloqueada por 1 minuto. Cada recusa depois de um bloqueio SHALL dobrar o tempo, até 15 minutos.

O bloqueio:
- **vale também para um usuário que não existe,** para a mensagem não revelar quem existe;
- **recusa até a senha certa,** com "Muitas tentativas com este usuário. Tente de novo em N min.", e uma tentativa durante ele não conta como recusa;
- **é zerado por uma entrada com sucesso.**

#### Scenario: Quinta recusa
- **WHEN** o usuário erra a senha pela quinta vez seguida
- **THEN** a entrada com ele fica bloqueada por 1 minuto

#### Scenario: Senha certa durante o bloqueio
- **WHEN** o usuário bloqueado entra com a senha certa
- **THEN** a entrada é recusada com "Muitas tentativas com este usuário. Tente de novo em 1 min."

#### Scenario: Bloqueio que dobra
- **WHEN** o bloqueio de 1 minuto passa e o usuário erra a senha de novo
- **THEN** a entrada fica bloqueada por 2 minutos, e as recusas seguintes levam a 4, 8 e 15 minutos, sem passar de 15

#### Scenario: Usuário inexistente também bloqueia
- **WHEN** alguém erra 5 vezes seguidas um usuário que não existe
- **THEN** a resposta seguinte é a mesma mensagem de bloqueio que um usuário real receberia

#### Scenario: Sucesso zera a contagem
- **WHEN** o usuário erra 4 vezes e acerta na quinta
- **THEN** a contagem volta a zero, e um erro depois disso não bloqueia

### Requirement: Sessão guardada no servidor

A sessão SHALL ser guardada no banco e identificada por um token aleatório. O navegador SHALL guardar o token num cookie que:
- scripts não leem;
- só vai por conexão segura;
- outros sites não enviam em requisições que alteram dados.

O banco SHALL guardar só o hash do token. A presença de um cookie SHALL NOT bastar: cada requisição SHALL conferir que a sessão existe, não terminou e pertence a uma conta ativa da organização do endereço.

#### Scenario: Token desconhecido
- **WHEN** uma requisição traz um cookie de sessão que não existe no banco
- **THEN** a API a trata como sem sessão e não executa nada que exija sessão

#### Scenario: Tabela de sessões lida
- **WHEN** alguém lê a tabela de sessões
- **THEN** encontra só hashes, que não servem como cookie

#### Scenario: Sessão de outra organização
- **WHEN** o cookie de uma sessão da organização A é enviado ao endereço da organização B
- **THEN** a API o trata como sem sessão

### Requirement: Expiração da sessão

A sessão SHALL terminar depois de 2 horas sem uso ou de 12 horas desde que passou a valer, o que vier primeiro. Fechar o navegador ou o app SHALL NOT encerrar a sessão dentro desses prazos. Uma sessão terminada SHALL ser recusada, e a tela SHALL pedir a entrada de novo.

#### Scenario: Duas horas sem uso
- **WHEN** a sessão fica 2 horas sem nenhuma requisição
- **THEN** a requisição seguinte é recusada como sem sessão

#### Scenario: Doze horas de uso
- **WHEN** o usuário usa a aplicação sem parar e completa 12 horas desde a entrada
- **THEN** a sessão termina, e a tela pede a entrada de novo

#### Scenario: Navegador fechado e reaberto
- **WHEN** o usuário fecha o navegador e o reabre 1 hora depois
- **THEN** a sessão continua valendo, sem nova entrada

### Requirement: Passos pendentes da sessão

Depois da senha certa, a sessão SHALL ficar pendente até o usuário resolver, nesta ordem, o que a conta pede:
1. o código do segundo passo, se a conta tem a verificação em dois passos ativa;
2. a troca da senha, se a senha é temporária;
3. o cadastro dos dois passos, se a conta os exige e ainda não os tem.

Uma sessão pendente SHALL permitir só três coisas: resolver o passo da vez, consultar a própria sessão e sair. Ela SHALL terminar 10 minutos depois da entrada se os passos não forem resolvidos. Quando o último passo se resolve, o token da sessão SHALL ser trocado por um novo, e o anterior SHALL deixar de valer.

#### Scenario: Conta com dois passos
- **WHEN** o usuário de uma conta com os dois passos ativos entra com a senha certa
- **THEN** a tela pede o código, e a casca não abre antes disso

#### Scenario: Outra ação com a sessão pendente
- **WHEN** uma sessão que espera o código tenta consultar as sessões da conta
- **THEN** a API recusa, dizendo que a entrada não terminou

#### Scenario: Pendência esquecida
- **WHEN** uma sessão pendente fica 10 minutos sem o passo resolvido
- **THEN** ela termina, e a entrada volta ao usuário e senha

#### Scenario: Token novo ao concluir
- **WHEN** o usuário digita o código certo
- **THEN** a sessão passa a valer com um token novo, e o token da etapa pendente deixa de ser aceito

#### Scenario: Primeira entrada da conta inicial
- **WHEN** a conta criada com a organização entra pela primeira vez
- **THEN** a tela pede a senha nova, depois o cadastro dos dois passos, e só então a casca abre

### Requirement: Saída

O usuário SHALL poder sair. A saída SHALL encerrar a sessão no servidor e apagar o cookie, e a tela de entrada SHALL aparecer sem nada da sessão anterior na página.

#### Scenario: Sair pelo menu
- **WHEN** o usuário escolhe "Sair" no menu do usuário
- **THEN** a sessão termina no servidor, e a tela de entrada aparece

#### Scenario: Cookie depois da saída
- **WHEN** uma cópia do cookie da sessão encerrada é reenviada
- **THEN** a API a trata como sem sessão

### Requirement: Sessões do usuário

O usuário SHALL ver as próprias sessões abertas. Cada uma SHALL mostrar:
- o dispositivo, com o navegador e o sistema, como "Chrome no Windows";
- o endereço IP;
- quando começou e quando foi usada por último;
- se é a sessão atual, com "Esta sessão".

O usuário SHALL poder encerrar uma delas ou todas as outras de uma vez. Encerrar a sessão atual SHALL equivaler a sair. A lista SHALL NOT mostrar o token de nenhuma sessão nem as sessões de outra conta.

#### Scenario: Duas sessões abertas
- **WHEN** o usuário tem uma sessão no computador e outra no celular e abre as sessões no computador
- **THEN** a lista mostra as duas, com "Esta sessão" na do computador

#### Scenario: Encerrar outra sessão
- **WHEN** o usuário encerra a sessão do celular
- **THEN** a próxima requisição do celular é recusada, e ele mostra a tela de entrada

#### Scenario: Encerrar todas as outras
- **WHEN** o usuário escolhe "Encerrar as outras sessões"
- **THEN** só a sessão atual continua valendo

### Requirement: Sessões encerradas pelas mudanças da conta

Duas mudanças SHALL encerrar todas as outras sessões da conta, mantendo a atual:
- trocar a senha;
- ativar a verificação em dois passos.

A redefinição do acesso pelo comando no servidor SHALL encerrar todas as sessões da conta.

#### Scenario: Senha trocada
- **WHEN** o usuário troca a senha no computador, com outra sessão aberta no celular
- **THEN** a sessão do computador continua, e a do celular termina

#### Scenario: Dois passos ativados
- **WHEN** o usuário ativa a verificação em dois passos
- **THEN** as outras sessões da conta terminam, e a tela diz "As outras sessões foram encerradas."
