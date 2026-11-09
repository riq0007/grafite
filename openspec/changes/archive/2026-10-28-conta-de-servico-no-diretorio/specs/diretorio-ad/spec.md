## MODIFIED Requirements

### Requirement: Configuração do diretório

A organização SHALL ter no máximo um diretório. Ele SHALL guardar:
- o servidor, um endereço `ldap://` ou `ldaps://`;
- a base DN;
- a conta de serviço, um login ativo do Cofre do tipo Usuário e senha, Conta administrativa ou Conta de serviço, com o usuário preenchido (o DN ou o UPN da conta);
- o atributo do usuário, `sAMAccountName` de fábrica;
- o filtro das pessoas, `(&(objectCategory=person)(objectClass=user))` de fábrica;
- se o certificado do servidor é conferido, sim de fábrica;
- se ele está ligado.

A gravação SHALL recusar:
- o servidor fora do formato, com "Informe o servidor como ldap://servidor ou ldaps://servidor.";
- a base DN vazia, com "Informe a base DN, como DC=empresa,DC=local.";
- a conta de serviço fora do Cofre, com "Escolha a conta de serviço no Cofre: um login ativo, com o usuário.".

Com o módulo Cofre desligado, a conta escolhida SHALL continuar valendo, e a escolha de outra SHALL esperar o módulo. A senha da conta de serviço SHALL ficar só no Cofre. Ela SHALL NOT aparecer na resposta, na auditoria nem no log.

#### Scenario: Diretório configurado
- **WHEN** quem administra grava o servidor `ldaps://dc01.empresa.local`, a base `DC=empresa,DC=local` e o login "Conta do Grafite no AD" do Cofre
- **THEN** o diretório fica gravado, e a auditoria registra a configuração sem a senha

#### Scenario: Conta de serviço do Cofre
- **WHEN** a TI cadastra a conta do AD no Cofre com o tipo "Conta de serviço" e o usuário preenchido
- **THEN** ela aparece na escolha da conta de serviço do diretório, e um segredo de outro tipo, como uma chave de API, não aparece
