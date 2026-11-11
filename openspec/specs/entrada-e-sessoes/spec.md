# entrada-e-sessoes Specification

## Purpose

Deixar entrar só quem tem conta, com usuário e senha, e manter a sessão no servidor. A sessão expira, as tentativas erradas são bloqueadas, e cada usuário controla as próprias sessões.

## Requirements

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

A sessão SHALL terminar depois de 2 horas sem uso ou de 12 horas desde que passou a valer, o que vier primeiro. Conta como uso a requisição da tela enquanto o usuário interage com ela. SHALL NOT contar como uso:
- a conexão de eventos;
- as requisições que a tela faz sozinha quando o usuário não interage com ela há 5 min ou mais.

Fechar o navegador ou o app SHALL NOT encerrar a sessão dentro desses prazos. Uma sessão terminada SHALL ser recusada, e a tela SHALL pedir a entrada de novo em até 1 min depois do fim, mesmo sem uma ação do usuário.

#### Scenario: Duas horas sem uso
- **WHEN** a sessão fica 2 horas sem nenhuma requisição
- **THEN** a requisição seguinte é recusada como sem sessão

#### Scenario: Doze horas de uso
- **WHEN** o usuário usa a aplicação sem parar e completa 12 horas desde a entrada
- **THEN** a sessão termina, e a tela pede a entrada de novo

#### Scenario: Navegador fechado e reaberto
- **WHEN** o usuário fecha o navegador e o reabre 1 hora depois
- **THEN** a sessão continua valendo, sem nova entrada

#### Scenario: Tela parada com a lista mudando
- **WHEN** a casca fica aberta na lista de pessoas, sem o usuário interagir por 2 horas, enquanto outras pessoas editam as pessoas da lista
- **THEN** a lista continua se atualizando, a sessão termina às 2 horas sem uso, e a tela de entrada cobre a casca em até 1 min

### Requirement: Passos pendentes da sessão

Depois da senha certa, a sessão SHALL ficar pendente até o usuário resolver, nesta ordem, o que a conta pede:
1. o código do segundo passo, se a conta tem a verificação em dois passos ativa e a entrada não vem de um aparelho confiável dentro do prazo (spec verificacao-em-dois-passos, "Aparelho confiável");
2. a troca da senha, se a senha é temporária;
3. o cadastro dos dois passos, se a conta os exige e ainda não os tem.

Uma sessão pendente SHALL permitir só três coisas: resolver o passo da vez, consultar a própria sessão e sair. Ela SHALL terminar 10 minutos depois da entrada se os passos não forem resolvidos. Quando o último passo se resolve, o token da sessão SHALL ser trocado por um novo, e o anterior SHALL deixar de valer.

Uma sessão que já vale e passa a ter o cadastro dos dois passos pendente, porque a conta passou a exigi-los, SHALL ficar pendente só desse passo. Ela SHALL manter o prazo que já tinha.

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

#### Scenario: Exigência nova numa sessão que vale
- **WHEN** uma sessão aberta há 3 horas passa a ter o cadastro dos dois passos pendente, e o usuário o conclui
- **THEN** a sessão volta a valer, com o mesmo fim que tinha antes da exigência

#### Scenario: Aparelho confiável com a senha temporária
- **WHEN** a senha de Bruno é temporária, e ele entra por um aparelho confiável dentro do prazo
- **THEN** a tela não pede o código e pede a senha nova, antes de a casca abrir

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
- **WHEN** o usuário encerra a sessão do celular, com a casca aberta no celular
- **THEN** em até 5 s o celular mostra a tela de entrada, sem esperar uma ação, e as requisições dele são recusadas

#### Scenario: Encerrar todas as outras
- **WHEN** o usuário escolhe "Encerrar as outras sessões"
- **THEN** só a sessão atual continua valendo

### Requirement: Sessões encerradas pelas mudanças da conta

Duas mudanças SHALL encerrar todas as outras sessões da conta, mantendo a atual:
- trocar a senha;
- ativar a verificação em dois passos.

SHALL encerrar todas as sessões da conta:
- a redefinição do acesso, pelo comando no servidor ou pela administração;
- a remoção dos dois passos pela administração;
- a inativação da conta ou da pessoa;
- o encerramento das sessões pela administração.

A tela de uma sessão encerrada SHALL mostrar a tela de entrada em até 5 s, sem esperar uma ação.

#### Scenario: Senha trocada
- **WHEN** o usuário troca a senha no computador, com outra sessão aberta no celular
- **THEN** a sessão do computador continua, e a do celular termina

#### Scenario: Dois passos ativados
- **WHEN** o usuário ativa a verificação em dois passos
- **THEN** as outras sessões da conta terminam, e a tela diz "As outras sessões foram encerradas."

#### Scenario: Conta inativada pela administração
- **WHEN** a conta de João é inativada enquanto ele usa a casca
- **THEN** em até 5 s a tela de entrada cobre a casca de João, e as requisições dele são recusadas como sem sessão

### Requirement: Acesso no estado da sessão

O estado da sessão que vale SHALL trazer o acesso efetivo da conta: cada permissão, com o escopo dela, a organização inteira ou os locais dos ramos. O acesso SHALL ser lido de novo a cada requisição, então uma mudança nos perfis vale já na requisição seguinte.

#### Scenario: Estado com o acesso
- **WHEN** Bruno, com o "Técnico" em "Jundiaí", consulta a sessão
- **THEN** o estado traz as permissões do "Técnico", cada uma com o escopo "Jundiaí"

### Requirement: Estado da sessão com a foto e as preferências

O estado da sessão SHALL trazer sempre os padrões da organização do endereço. Com a sessão que vale, ele SHALL trazer também:
- a foto da pessoa da conta, se houver;
- as preferências que a conta mudou.

Com a sessão pendente, o estado SHALL NOT trazer a foto nem as preferências da conta.

#### Scenario: Estado com a foto e as preferências
- **WHEN** Ana, com foto e com o tema Papel escolhido, consulta a sessão que vale
- **THEN** o estado traz a foto de Ana, o tema Papel nas preferências dela e os padrões da organização

#### Scenario: Estado sem sessão
- **WHEN** alguém sem sessão consulta o estado da sessão
- **THEN** o estado traz só a organização, com os padrões dela, e nenhuma sessão

#### Scenario: Estado com a sessão pendente
- **WHEN** a sessão de Ana espera o código do segundo passo
- **THEN** o estado não traz a foto nem as preferências de Ana
