## Purpose

Separar a pessoa da conta de acesso, guardar a credencial de cada conta sem que ela possa ser recuperada e dar a quem opera o servidor um comando para criar organizações e contas e recuperar um acesso perdido.

## ADDED Requirements

### Requirement: Pessoa e conta separadas

Toda conta SHALL pertencer a uma pessoa da mesma organização, e uma pessoa SHALL ter no máximo uma conta. Uma pessoa sem conta SHALL poder existir, como o responsável por um ativo que não entra no sistema. A pessoa SHALL guardar só o nome e, se houver, o e-mail.

#### Scenario: Segunda conta para a mesma pessoa
- **WHEN** se tenta criar uma segunda conta para uma pessoa que já tem conta
- **THEN** a criação é recusada, e a conta existente não muda

#### Scenario: Pessoa sem e-mail
- **WHEN** uma conta é criada para uma pessoa sem e-mail
- **THEN** a conta é criada, e a entrada funciona pelo usuário

### Requirement: Usuário único na organização

Cada conta SHALL ter um usuário, único na organização, que identifica a conta na entrada. O usuário SHALL ser comparado sem diferenciar maiúsculas e sem os espaços das pontas. Ele SHALL ter de 3 a 64 caracteres, entre letras sem acento, números, ponto, hífen e sublinhado, e começar por letra ou número. Organizações diferentes SHALL poder ter o mesmo usuário.

#### Scenario: Usuário repetido na organização
- **WHEN** se tenta criar a conta "Joao.Silva" numa organização que já tem "joao.silva"
- **THEN** a criação é recusada com "Este usuário já existe nesta organização."

#### Scenario: O mesmo usuário em outra organização
- **WHEN** a organização B cria a conta "joao.silva", que já existe na organização A
- **THEN** a conta é criada, e cada uma entra só pelo endereço da própria organização

#### Scenario: Usuário com caractere inválido
- **WHEN** se tenta criar o usuário "joão silva"
- **THEN** a criação é recusada, com a lista dos caracteres aceitos

### Requirement: Regra da senha

Uma senha nova SHALL ter de 12 a 128 caracteres, sem exigência de maiúsculas, números ou símbolos. Ela SHALL ser recusada se:
- for uma senha comum;
- repetir um caractere só ou seguir uma sequência simples, como "123456789012";
- contiver o usuário.

A recusa SHALL dizer o motivo em pt-BR, e a tela SHALL mostrar o mesmo motivo antes de enviar.

#### Scenario: Senha curta
- **WHEN** o usuário escolhe "curta123"
- **THEN** a senha é recusada com "Use pelo menos 12 caracteres."

#### Scenario: Senha com o usuário
- **WHEN** o usuário "joao.silva" escolhe "joao.silva2026!"
- **THEN** a senha é recusada com "A senha não pode conter o seu usuário."

#### Scenario: Senha comum
- **WHEN** o usuário escolhe "password1234"
- **THEN** a senha é recusada com "Esta senha é comum demais. Escolha outra."

#### Scenario: Frase longa sem símbolos
- **WHEN** o usuário escolhe "cavalo bateria grampo correto"
- **THEN** a senha é aceita

### Requirement: Senha guardada sem volta

A senha SHALL ser guardada só como hash Argon2id, com sal próprio. A senha digitada SHALL NOT aparecer no banco, no log, em resposta da API nem na auditoria. Nenhuma operação SHALL devolver a senha atual nem o hash dela.

#### Scenario: Consulta da conta
- **WHEN** a própria conta é consultada pela API
- **THEN** a resposta não traz a senha nem o hash

#### Scenario: Log da entrada
- **WHEN** o usuário entra, com a senha certa ou errada
- **THEN** nem o log nem a auditoria contêm a senha digitada

### Requirement: Senha temporária com troca obrigatória

Uma senha criada pelo comando no servidor SHALL ser temporária. Ela SHALL ser gerada ao acaso e SHALL aparecer uma vez só, na saída do comando. Além do hash, ela SHALL NOT ficar gravada em lugar nenhum. A entrada com uma senha temporária SHALL exigir a troca antes de qualquer outra ação, e a senha nova SHALL ser diferente da temporária.

#### Scenario: Primeira entrada
- **WHEN** o usuário entra com a senha temporária
- **THEN** a tela pede uma senha nova antes de mostrar a casca

#### Scenario: Senha nova igual à temporária
- **WHEN** o usuário tenta trocar a temporária por ela mesma
- **THEN** a troca é recusada com "A senha nova precisa ser diferente da atual."

### Requirement: Troca da própria senha

O usuário SHALL poder trocar a própria senha informando a atual e a nova, que segue a regra da senha. Uma senha atual errada SHALL contar como recusa para o bloqueio progressivo do usuário.

#### Scenario: Troca com a senha atual certa
- **WHEN** o usuário informa a senha atual certa e uma nova aceita
- **THEN** a senha nova passa a valer na próxima entrada, e a antiga deixa de valer

#### Scenario: Senha atual errada
- **WHEN** a senha atual informada está errada
- **THEN** a troca é recusada com "A senha atual está incorreta.", e a senha não muda

### Requirement: Comando no servidor

O servidor SHALL oferecer um comando, usado por quem opera o servidor, para:
- **criar uma organização:** com os endereços de acesso, a pessoa e a primeira conta, com senha temporária e com a verificação em dois passos exigida. Só a organização de desenvolvimento dispensa os dois passos;
- **criar uma conta:** numa organização existente, para uma pessoa nova, escolhendo se a conta exige os dois passos;
- **redefinir o acesso de uma conta:** com uma senha temporária nova, o fim de todas as sessões dela e, se pedido, a remoção dos dois passos.

O comando SHALL identificar a organização pelo endereço de acesso. Ele SHALL NOT substituir uma organização, um endereço ou uma conta que já existem. Cada ação dele SHALL ficar na auditoria como feita pelo comando no servidor.

#### Scenario: Primeira organização
- **WHEN** o comando cria a organização "Empresa", com o endereço "grafite.empresa.local" e a conta "admin"
- **THEN** a organização, o endereço, a pessoa e a conta passam a existir, e a saída mostra a senha temporária uma vez

#### Scenario: Endereço já usado
- **WHEN** o comando tenta criar uma organização com um endereço que já pertence a outra
- **THEN** nada é criado, e a saída diz que o endereço já está em uso

#### Scenario: Acesso perdido
- **WHEN** o comando redefine o acesso da conta "admin", removendo os dois passos
- **THEN** as sessões dela terminam, a senha antiga para de funcionar, e a próxima entrada pede a troca da senha temporária e o cadastro dos dois passos

#### Scenario: Ação do comando na auditoria
- **WHEN** o comando redefine um acesso
- **THEN** a auditoria registra a redefinição, feita pelo comando no servidor, sem a senha
