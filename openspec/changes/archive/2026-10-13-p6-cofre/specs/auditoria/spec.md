## ADDED Requirements

### Requirement: Eventos do cofre registrados

SHALL ser registrados, na auditoria da organização:
- o cadastro, a edição dos dados, com o "antes → depois", a inativação e a reativação de um segredo;
- a troca do valor de um segredo, sem o valor antigo nem o novo;
- a mudança do acesso de um segredo, com as contas, os grupos e os perfis antes e depois;
- a liberação do cofre numa sessão, com até quando ela vale;
- cada revelação e cada cópia de um segredo, com a conta, o segredo e a origem;
- a recusa de liberar o cofre, com o código errado, e a de revelar ou copiar, com o motivo, como o cofre fechado, o segredo inativo ou o segredo não liberado;
- a troca da chave mestra, pelo comando no servidor, com quantos segredos ela cifrou de novo.

Nenhum registro SHALL levar o valor de um segredo, a chave de um segredo, a chave mestra nem o código digitado.

#### Scenario: Revelação na auditoria
- **WHEN** Bruno revela a senha do "Switch do CPD"
- **THEN** a auditoria registra a revelação, com Bruno, o segredo e o IP, e o registro não tem a senha

#### Scenario: Código errado
- **WHEN** Bruno digita um código errado para liberar o cofre
- **THEN** a auditoria registra a recusa, sem o código digitado

#### Scenario: Acesso mudado
- **WHEN** quem administra o cofre tira o grupo "Suporte" do acesso do "Switch do CPD"
- **THEN** a auditoria registra a mudança do acesso, com o "Suporte" antes e sem ele depois
