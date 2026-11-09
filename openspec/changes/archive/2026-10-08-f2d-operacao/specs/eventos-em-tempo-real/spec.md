## MODIFIED Requirements

### Requirement: Evento de saída gravado com a mudança

Toda mudança que a API ou o comando no servidor grava, e que uma tela mostra, SHALL gravar um evento de saída na mesma transação do dado. Se um dos dois falha, nenhum dos dois SHALL ficar gravado.

O evento SHALL levar só:
- o tipo;
- o momento;
- o alvo, com o tipo e o identificador.

Ele SHALL NOT levar nomes, textos nem outros dados pessoais.

Os tipos de evento SHALL ser:

| Tipo | Quando | Quem recebe |
|---|---|---|
| `pessoas.mudaram` | uma pessoa, a conta dela ou a foto dela mudou | quem vê pessoas no escopo do local de trabalho dela, o de antes e o de depois da mudança, e a própria conta da pessoa |
| `locais.mudaram` | um local mudou | toda sessão da organização |
| `acessos.mudaram` | um perfil, um grupo, um membro de grupo ou uma atribuição mudou | toda sessão da organização |
| `padroes.mudaram` | os padrões da organização mudaram | toda sessão da organização |
| `preferencias.mudaram` | as preferências de uma conta mudaram | as sessões dessa conta |
| `sessao.encerrada` | uma sessão foi encerrada por uma ação | a própria sessão |
| `tarefas.mudaram` | uma tarefa com falha entrou na lista ou foi repetida | quem administra as tarefas |
| `operacao.mudou` | um backup ou um teste de restauração terminou, ou o horário deles mudou | quem administra o backup, na organização que opera o servidor |

Um tipo novo SHALL entrar nessa tabela, com quem o recebe, antes de ser gravado.

#### Scenario: Falha depois do evento
- **WHEN** a edição de uma pessoa grava o evento e a transação falha depois
- **THEN** nem a edição nem o evento ficam gravados, e nenhuma tela recebe o aviso

#### Scenario: Evento sem dados pessoais
- **WHEN** o nome de João é trocado
- **THEN** o evento gravado traz o tipo `pessoas.mudaram` e o identificador de João, sem o nome antigo nem o novo

#### Scenario: Mudança pelo comando no servidor
- **WHEN** o comando no servidor cria uma conta enquanto a lista de pessoas está aberta na web
- **THEN** a lista mostra a conta nova, sem uma ação do usuário

#### Scenario: Backup terminado com a tela aberta
- **WHEN** um backup termina enquanto a tela de backup está aberta
- **THEN** a tela mostra o backup novo, sem uma ação do usuário
