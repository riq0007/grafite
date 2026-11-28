## MODIFIED Requirements

### Requirement: Sessões do usuário

O usuário SHALL ver as próprias sessões abertas. Cada uma SHALL mostrar:
- o dispositivo, com o navegador e o sistema, como "Chrome no Windows", ou, nas sessões da aba, o nome do computador, como "Aba · PC-FIN-09" e "Chat na aba · PC-FIN-09";
- o endereço IP;
- quando começou e quando foi usada por último;
- se é a sessão atual, com "Esta sessão".

O usuário SHALL poder encerrar uma delas ou todas as outras de uma vez. Encerrar a sessão atual SHALL equivaler a sair. Encerrar a sessão da aba SHALL encerrar também o chat na aba dela. No computador com a entrada pelo Windows, a aba abre outra sessão na hora, e a lista SHALL dizer que quem para o computador é o bloqueio. A lista SHALL NOT mostrar o token de nenhuma sessão nem as sessões de outra conta.

#### Scenario: Duas sessões abertas
- **WHEN** o usuário tem uma sessão no computador e outra no celular e abre as sessões no computador
- **THEN** a lista mostra as duas, com "Esta sessão" na do computador

#### Scenario: Sessão da aba na lista
- **WHEN** Fernanda, com a aba no PC-FIN-09, abre as sessões no navegador
- **THEN** a lista mostra "Aba · PC-FIN-09" e "Chat na aba · PC-FIN-09" ao lado da sessão do navegador

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

As sessões da aba e as do chat na aba SHALL contar como as outras nas duas listas, também no "Encerrar as outras sessões". A tela de uma sessão encerrada SHALL mostrar a tela de entrada em até 5 s, sem esperar uma ação; a aba SHALL ficar sem conexão em até 30 s.

#### Scenario: Senha trocada
- **WHEN** o usuário troca a senha no computador, com outra sessão aberta no celular
- **THEN** a sessão do computador continua, e a do celular termina

#### Scenario: Dois passos ativados
- **WHEN** o usuário ativa a verificação em dois passos
- **THEN** as outras sessões da conta terminam, e a tela diz "As outras sessões foram encerradas."

#### Scenario: Conta inativada pela administração
- **WHEN** a conta de João é inativada enquanto ele usa a casca
- **THEN** em até 5 s a tela de entrada cobre a casca de João, e as requisições dele são recusadas como sem sessão
