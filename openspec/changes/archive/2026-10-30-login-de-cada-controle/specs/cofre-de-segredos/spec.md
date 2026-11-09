## MODIFIED Requirements

### Requirement: Login do Control iD usado pelo coletor

O segredo que dá o login da sondagem de um controle de acesso (spec saude-do-control-id), o escolhido no tipo ou o ligado ao controle, SHALL ter o identificador e o valor decifrados pela API só para a configuração do coletor que sonda esse controle, e SHALL ir só a ele. Esse uso SHALL NOT pedir a liberação do cofre nem o acesso de uma conta ao segredo, e SHALL NOT entrar na auditoria a cada configuração: a escolha do segredo no tipo entra, como toda mudança do tipo, e o vínculo com o controle entra, como toda mudança do segredo.

Só segredos ativos do tipo Usuário e senha ou Conta administrativa, com o identificador preenchido, SHALL poder ser escolhidos no tipo ou na ficha do controle. A lista da escolha SHALL mostrar o nome deles, e nunca o identificador nem o valor: no tipo, a quem administra o catálogo; na ficha do controle, a quem administra o cofre (spec saude-do-control-id, "Login escolhido na ficha do controle"). Com o módulo Cofre desligado, o login já escolhido ou ligado SHALL continuar sendo usado, e a escolha de outro, no tipo ou na ficha, SHALL esperar o módulo ser ligado.

#### Scenario: Login na configuração
- **WHEN** o tipo "Controle de acesso" usa o login "Admin dos controles", e o coletor de Jundiaí pede a configuração
- **THEN** os alvos de controle dele trazem o usuário e a senha, e a auditoria não registra uma revelação

#### Scenario: Escolha sem o cofre à vista
- **WHEN** Bruno administra o catálogo, sem acesso ao "Admin dos controles", e abre a saúde do Control iD na ficha do tipo
- **THEN** a escolha do login mostra o nome "Admin dos controles", sem o usuário nem a senha

#### Scenario: Escolha na ficha do controle
- **WHEN** quem administra o cofre abre "Escolher login" na ficha da PAT-00778
- **THEN** a lista mostra o nome dos logins que servem, sem o usuário nem a senha
