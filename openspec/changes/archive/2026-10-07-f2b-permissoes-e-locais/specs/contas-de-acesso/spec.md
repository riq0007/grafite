## MODIFIED Requirements

### Requirement: Pessoa e conta separadas

Toda conta SHALL pertencer a uma pessoa da mesma organização, e uma pessoa SHALL ter no máximo uma conta. Uma pessoa sem conta SHALL poder existir, como o responsável por um ativo que não entra no sistema. A pessoa SHALL guardar só o necessário:
- o nome;
- e, se houver, o e-mail, a matrícula, o local de trabalho e o telefone ou ramal.

A situação da pessoa SHALL ser ativa, inativa ou anonimizada.

#### Scenario: Segunda conta para a mesma pessoa
- **WHEN** se tenta criar uma segunda conta para uma pessoa que já tem conta
- **THEN** a criação é recusada, e a conta existente não muda

#### Scenario: Pessoa sem e-mail
- **WHEN** uma conta é criada para uma pessoa sem e-mail
- **THEN** a conta é criada, e a entrada funciona pelo usuário

### Requirement: Senha temporária com troca obrigatória

Uma senha criada pelo comando no servidor ou pela administração SHALL ser temporária. Ela SHALL ser gerada ao acaso e SHALL aparecer uma vez só: na saída do comando, ou na tela de quem a criou. Além do hash, ela SHALL NOT ficar gravada em lugar nenhum. A entrada com uma senha temporária SHALL exigir a troca antes de qualquer outra ação, e a senha nova SHALL ser diferente da temporária.

#### Scenario: Primeira entrada
- **WHEN** o usuário entra com a senha temporária
- **THEN** a tela pede uma senha nova antes de mostrar a casca

#### Scenario: Senha nova igual à temporária
- **WHEN** o usuário tenta trocar a temporária por ela mesma
- **THEN** a troca é recusada com "A senha nova precisa ser diferente da atual."

#### Scenario: Senha temporária pela administração
- **WHEN** quem administra contas cria uma conta pela tela
- **THEN** a senha temporária aparece uma vez na tela dele, e nem a API nem a tela a mostram de novo

### Requirement: Comando no servidor

O servidor SHALL oferecer um comando, usado por quem opera o servidor, para:
- **criar uma organização:** com os endereços de acesso, o perfil Administrador, a pessoa e a primeira conta. A conta recebe o Administrador para a organização inteira, com senha temporária e com a verificação em dois passos exigida. Só a organização de desenvolvimento dispensa os dois passos, na conta e no Administrador;
- **criar uma conta:** numa organização existente, para uma pessoa nova, escolhendo se a conta exige os dois passos e se recebe o Administrador;
- **redefinir o acesso de uma conta:** com uma senha temporária nova, o fim de todas as sessões dela e, se pedido, a remoção dos dois passos.

O comando SHALL identificar a organização pelo endereço de acesso. Ele SHALL NOT substituir uma organização, um endereço ou uma conta que já existem. Cada ação dele SHALL ficar na auditoria como feita pelo comando no servidor.

#### Scenario: Primeira organização
- **WHEN** o comando cria a organização "Empresa", com o endereço "grafite.empresa.local" e a conta "admin"
- **THEN** a organização, o endereço, o perfil Administrador, a pessoa e a conta passam a existir, a conta tem o Administrador, e a saída mostra a senha temporária uma vez

#### Scenario: Endereço já usado
- **WHEN** o comando tenta criar uma organização com um endereço que já pertence a outra
- **THEN** nada é criado, e a saída diz que o endereço já está em uso

#### Scenario: Acesso perdido
- **WHEN** o comando redefine o acesso da conta "admin", removendo os dois passos
- **THEN** as sessões dela terminam, a senha antiga para de funcionar, e a próxima entrada pede a troca da senha temporária e o cadastro dos dois passos

#### Scenario: Outro administrador pelo comando
- **WHEN** o comando cria a conta "carla" com o Administrador, porque ninguém mais consegue administrar
- **THEN** a conta passa a existir com o Administrador para a organização inteira

#### Scenario: Ação do comando na auditoria
- **WHEN** o comando redefine um acesso
- **THEN** a auditoria registra a redefinição, feita pelo comando no servidor, sem a senha
