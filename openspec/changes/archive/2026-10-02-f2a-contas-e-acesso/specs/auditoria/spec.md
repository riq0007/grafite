## Purpose

Guardar um registro único, que só cresce, de quem fez o quê, quando e com qual efeito, gravado junto com a própria mudança, para responder a qualquer pergunta sobre o acesso e as alterações.

## ADDED Requirements

### Requirement: Registro na mesma transação

Toda alteração feita pela API ou pelo comando no servidor SHALL gravar o registro de auditoria na mesma transação do dado. Se um dos dois falha, nenhum dos dois SHALL ficar gravado.

#### Scenario: Falha ao gravar o dado
- **WHEN** a gravação de uma troca de senha falha
- **THEN** nenhum registro de auditoria dessa troca fica gravado

#### Scenario: Falha ao gravar a auditoria
- **WHEN** a gravação do registro de auditoria falha
- **THEN** a alteração também é desfeita, e a API responde com erro

### Requirement: Conteúdo do registro

Cada registro SHALL ter:
- o momento e a ação;
- quem fez: a conta, o comando no servidor ou alguém sem sessão;
- o alvo, com o tipo e o identificador;
- o "antes → depois" dos campos que mudaram;
- o endereço IP e o código de rastreio da requisição.

O registro SHALL NOT conter senha, hash, token de sessão, chave nem código de verificação.

#### Scenario: Troca de senha registrada
- **WHEN** o usuário troca a própria senha
- **THEN** a auditoria registra a troca, com a conta, o IP e o código de rastreio, sem a senha antiga nem a nova

#### Scenario: Recusa de entrada registrada
- **WHEN** alguém erra a senha do usuário "joao.silva"
- **THEN** a auditoria registra a recusa feita por alguém sem sessão, com o usuário digitado, o motivo e o IP, sem a senha

### Requirement: Eventos de acesso registrados

SHALL ser registrados:
- a entrada concluída, cada recusa com o motivo, e o início de cada bloqueio;
- o código do segundo passo recusado e o uso de um código de recuperação;
- a saída e cada sessão encerrada por uma ação, com o motivo;
- a troca da senha;
- a ativação e a desativação dos dois passos e a geração de códigos de recuperação;
- pelo comando no servidor, a criação da organização, dos endereços, das pessoas e das contas, e a redefinição de um acesso.

O motivo real de uma recusa SHALL ficar registrado, mesmo quando a tela mostra a mensagem única: credenciais, bloqueio ou conta inativa.

#### Scenario: Saída registrada
- **WHEN** o usuário sai
- **THEN** a auditoria registra o fim da sessão, com o motivo "saída", a conta, o IP e o dispositivo

#### Scenario: Recusa por conta inativa
- **WHEN** uma conta inativa tenta entrar com a senha certa
- **THEN** a tela mostra "Usuário ou senha incorretos.", e a auditoria registra o motivo "conta inativa"

### Requirement: Só inclusão

O papel com que a aplicação acessa o banco SHALL poder incluir e ler registros de auditoria, e SHALL NOT poder alterá-los nem apagá-los. Um teste automatizado SHALL provar isso.

#### Scenario: Tentativa de alterar um registro
- **WHEN** o papel da aplicação tenta alterar ou apagar um registro de auditoria
- **THEN** o banco recusa a operação

### Requirement: Retenção mínima

Os registros de auditoria SHALL ser guardados por no mínimo 5 anos, contados do momento do registro. Nenhuma rotina da aplicação SHALL apagá-los antes disso.

#### Scenario: Rotinas da aplicação
- **WHEN** qualquer rotina da aplicação ou do comando no servidor roda
- **THEN** nenhum registro de auditoria com menos de 5 anos é apagado
