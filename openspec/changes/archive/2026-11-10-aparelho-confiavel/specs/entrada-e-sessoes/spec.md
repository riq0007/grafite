## MODIFIED Requirements

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
