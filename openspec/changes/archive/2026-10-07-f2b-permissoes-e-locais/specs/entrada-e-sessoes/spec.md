## MODIFIED Requirements

### Requirement: Passos pendentes da sessão

Depois da senha certa, a sessão SHALL ficar pendente até o usuário resolver, nesta ordem, o que a conta pede:
1. o código do segundo passo, se a conta tem a verificação em dois passos ativa;
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

### Requirement: Sessões encerradas pelas mudanças da conta

Duas mudanças SHALL encerrar todas as outras sessões da conta, mantendo a atual:
- trocar a senha;
- ativar a verificação em dois passos.

SHALL encerrar todas as sessões da conta:
- a redefinição do acesso, pelo comando no servidor ou pela administração;
- a remoção dos dois passos pela administração;
- a inativação da conta ou da pessoa;
- o encerramento das sessões pela administração.

#### Scenario: Senha trocada
- **WHEN** o usuário troca a senha no computador, com outra sessão aberta no celular
- **THEN** a sessão do computador continua, e a do celular termina

#### Scenario: Dois passos ativados
- **WHEN** o usuário ativa a verificação em dois passos
- **THEN** as outras sessões da conta terminam, e a tela diz "As outras sessões foram encerradas."

#### Scenario: Conta inativada pela administração
- **WHEN** a conta de João é inativada enquanto ele usa a casca
- **THEN** a próxima requisição de João é recusada como sem sessão, e a tela de entrada cobre a casca

## ADDED Requirements

### Requirement: Acesso no estado da sessão

O estado da sessão que vale SHALL trazer o acesso efetivo da conta: cada permissão, com o escopo dela, a organização inteira ou os locais dos ramos. O acesso SHALL ser lido de novo a cada requisição, então uma mudança nos perfis vale já na requisição seguinte.

#### Scenario: Estado com o acesso
- **WHEN** Bruno, com o "Técnico" em "Jundiaí", consulta a sessão
- **THEN** o estado traz as permissões do "Técnico", cada uma com o escopo "Jundiaí"
