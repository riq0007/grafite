## ADDED Requirements

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

## MODIFIED Requirements

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
