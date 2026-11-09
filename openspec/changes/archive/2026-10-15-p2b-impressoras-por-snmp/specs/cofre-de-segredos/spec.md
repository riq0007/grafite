## MODIFIED Requirements

### Requirement: Segredo

Cada organização SHALL guardar os segredos dela. Cada segredo SHALL ter:
- o nome, de 1 a 120 caracteres;
- o tipo;
- a classificação;
- o identificador, como o usuário da conta, de até 200 caracteres, opcional;
- o endereço onde ele é usado, como a URL de um painel, de até 500 caracteres, opcional;
- as notas, de até 2.000 caracteres, opcionais;
- a validade e a próxima rotação, datas opcionais;
- a pessoa e os ativos ligados (requisito "Vínculos com a pessoa e os ativos");
- o valor secreto, de 1 a 10.000 caracteres;
- a situação, ativo ou inativo.

Os tipos SHALL ser os do PMG: Usuário e senha, Conta administrativa, Banco de dados, Conta de serviço, Chave de API, Token, Chave SSH, Certificado, PIN, Wi-Fi e Outro, mais Chave de licença e Comunidade SNMP. As classificações SHALL ser as do PMG: Pessoal, Compartilhado, Administrativo, Privilegiado, Aplicação e Equipamento.

Só o valor secreto SHALL ser cifrado; o resto são dados do segredo, que a lista mostra a quem pode vê-lo. O segredo SHALL NOT ser excluído, só inativado. O segredo inativo SHALL NOT ser revelado nem copiado, e ele pode ser reativado.

#### Scenario: Segredo cadastrado
- **WHEN** quem administra o cofre cadastra "Switch do CPD", do tipo Conta administrativa, com o identificador `admin`, o endereço `https://10.0.5.2` e a senha
- **THEN** o segredo aparece na lista com o nome, o tipo e o identificador, e a senha só aparece ao ser revelada

#### Scenario: Valor vazio
- **WHEN** alguém grava um segredo sem o valor secreto
- **THEN** a gravação é recusada no campo do valor com "Informe o valor do segredo."

#### Scenario: Segredo inativo
- **WHEN** quem tem acesso a um segredo inativo pede para revelá-lo
- **THEN** o pedido é recusado com "O segredo está inativo.", e a recusa fica na auditoria

## ADDED Requirements

### Requirement: Comunidade SNMP usada pelo coletor

Um segredo do tipo Comunidade SNMP escolhido num tipo de ativo (spec impressoras-por-snmp) SHALL ter o valor decifrado pela API só para a configuração do coletor que lê os ativos desse tipo, e SHALL ir só a ele. Esse uso SHALL NOT pedir a liberação do cofre nem o acesso de uma conta ao segredo, e SHALL NOT entrar na auditoria a cada configuração: a escolha do segredo no tipo entra, como toda mudança do tipo.

Só segredos ativos do tipo Comunidade SHALL poder ser escolhidos; a lista da escolha SHALL mostrar o nome deles a quem administra o catálogo, e nunca o valor. Inativar o segredo SHALL fazer as impressoras do tipo voltarem à comunidade `public` na configuração seguinte, e a ficha do tipo SHALL dizer "A comunidade escolhida está inativa: o coletor usa a public.". Com o módulo Cofre desligado, o segredo já escolhido SHALL continuar sendo usado, e a escolha de outro SHALL esperar o módulo ser ligado.

#### Scenario: Comunidade na configuração
- **WHEN** o tipo "Impressora" usa a comunidade "Comunidade das impressoras", e o coletor de Jundiaí pede a configuração
- **THEN** os alvos de impressora dele trazem o valor da comunidade, e a auditoria não registra uma revelação

#### Scenario: Comunidade inativada
- **WHEN** quem administra o cofre inativa a "Comunidade das impressoras"
- **THEN** a configuração seguinte traz a comunidade `public` para as impressoras do tipo, e a ficha do tipo avisa que a comunidade escolhida está inativa
