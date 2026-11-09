## Purpose

Levar às telas abertas, em tempo real, o aviso de que um registro mudou: o evento gravado com a mudança, o aviso depois do commit e a conexão que retoma de onde parou. Cada conta recebe só o que pode ver, e as listas e as fichas se atualizam sozinhas.

## ADDED Requirements

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

### Requirement: Aviso depois do commit

O banco SHALL avisar a API de cada evento só depois do commit da transação que o gravou. A API SHALL entregar o evento às conexões que podem recebê-lo em até 2 s depois do commit. O evento de uma transação desfeita SHALL NOT ser entregue.

Se a API perde a ligação com o aviso do banco, ela SHALL refazer a ligação sozinha e depois mandar cada conexão atualizar todos os dados, porque pode ter perdido eventos no intervalo.

#### Scenario: Duas telas abertas
- **WHEN** Ana edita João enquanto Carla está com a lista de pessoas aberta
- **THEN** o evento chega à conexão de Carla em até 2 s depois do commit da edição

#### Scenario: Ligação com o banco refeita
- **WHEN** o banco reinicia e a API refaz a ligação com o aviso de eventos
- **THEN** as telas abertas atualizam todos os dados, sem uma ação do usuário

### Requirement: Conexão de eventos

A web SHALL receber os eventos por uma conexão de eventos enviados pelo servidor (SSE). A conexão SHALL ser aberta só por uma sessão que vale:
- sem sessão, a API SHALL recusar com 401;
- com a sessão pendente, com 403, dizendo que a entrada não terminou.

A conexão SHALL mandar um sinal de vida a cada 25 s, para não ser fechada por falta de tráfego. Ela SHALL NOT contar como uso da sessão.

A conexão SHALL terminar com a sessão:
- na hora, com o evento `sessao.encerrada`, quando a sessão é encerrada por uma ação;
- em até 1 min quando a sessão expira.

#### Scenario: Sem sessão
- **WHEN** alguém abre a conexão de eventos sem o cookie de uma sessão
- **THEN** a API responde 401, e nenhum evento é enviado

#### Scenario: Sessão encerrada pelo usuário em outro aparelho
- **WHEN** o usuário encerra, no computador, a sessão do celular, que está com a conexão aberta
- **THEN** a conexão do celular recebe `sessao.encerrada` e é fechada

#### Scenario: Conexão aberta sem uso
- **WHEN** a casca fica aberta, com a conexão de eventos, sem nenhuma outra requisição por 2 horas
- **THEN** a sessão expira, e a conexão termina em até 1 min

### Requirement: Retomada de onde parou

Quando a conexão cai, a web SHALL reconectar sozinha, informando o último evento recebido. A API SHALL então enviar os eventos das últimas 24 h que a conta pode ver e que a tela ainda não recebeu. Um evento SHALL chegar pelo menos uma vez, e a tela SHALL tolerar a repetição.

Quando o último evento recebido tem mais de 24 h ou é desconhecido, a API SHALL mandar a tela atualizar todos os dados.

#### Scenario: Rede caiu por 30 segundos
- **WHEN** a rede do computador de Carla cai por 30 s, e nesse tempo Ana edita João
- **THEN** quando a rede volta, a conexão de Carla recebe o evento da edição de João, e a lista dela mostra a mudança

#### Scenario: Computador suspenso por dois dias
- **WHEN** o computador de Carla volta de dois dias suspenso, com a casca aberta
- **THEN** a conexão manda a tela atualizar todos os dados, e as listas abertas mostram o estado atual

### Requirement: Só o que a conta pode ver

Cada conexão SHALL receber só os eventos da organização dela que a conta pode receber, conforme a tabela dos tipos, com o acesso que a conta tem no momento do evento. Uma mudança no acesso da conta SHALL valer também para a conexão já aberta. Os eventos de uma organização SHALL NOT chegar às conexões de outra.

#### Scenario: Escopo de local
- **WHEN** Bruno, que vê pessoas só em "Jundiaí", está conectado, e são editadas João, de "Jundiaí › Expedição", e Maria, de "Campinas"
- **THEN** a conexão de Bruno recebe o evento de João e não recebe o de Maria

#### Scenario: Pessoa que saiu do escopo
- **WHEN** o local de trabalho de João muda de "Jundiaí › Expedição" para "Campinas"
- **THEN** a conexão de Bruno recebe o evento, e a lista dele deixa de mostrar João

#### Scenario: A própria pessoa
- **WHEN** uma conta sem `pessoas.ver` está conectada, e a administração troca a foto da pessoa dela
- **THEN** a conexão dessa conta recebe o evento da própria pessoa, e o menu do usuário mostra a foto nova

#### Scenario: Outra organização
- **WHEN** uma pessoa da organização A é editada
- **THEN** nenhuma conexão da organização B recebe o evento

### Requirement: Telas atualizadas sozinhas

Ao receber um evento, a web SHALL atualizar as consultas que os módulos declararam para o tipo dele. As listas e as fichas abertas SHALL mostrar a mudança em até 5 s depois do commit, sem uma ação do usuário. Um formulário em edição SHALL NOT perder o que foi digitado quando o registro dele muda em outro lugar. Um diálogo aberto SHALL NOT fechar quando a releitura muda o registro dele, nem mesmo pelo evento da própria ação que o diálogo mostra, como a senha temporária, que não aparece de novo.

A casca SHALL tratar os eventos que são dela:
- **`acessos.mudaram`:** consulta de novo o acesso da conta e passa a esconder o que deixou de valer;
- **`padroes.mudaram` e `preferencias.mudaram`:** aplica as preferências novas;
- **`sessao.encerrada`:** mostra a tela de entrada por cima da casca.

#### Scenario: Ficha aberta
- **WHEN** Carla está com a ficha de João aberta, e Ana troca o telefone dele
- **THEN** a ficha de Carla mostra o telefone novo em até 5 s

#### Scenario: Formulário em edição
- **WHEN** Carla está editando o nome de João, e Ana troca o telefone dele
- **THEN** o nome que Carla digitou continua no formulário

#### Scenario: Senha temporária à vista
- **WHEN** Ana cria a conta de João, e o evento da criação relê a ficha dele na tela dela
- **THEN** a senha temporária continua no diálogo até Ana fechá-lo

#### Scenario: Perfil retirado
- **WHEN** o perfil que dá `auditoria.ver` a Bruno é retirado enquanto ele está na casca
- **THEN** em até 5 s, Auditoria some do menu de Administração de Bruno, sem uma ação dele

### Requirement: Abas escondidas

Uma aba escondida por mais de 5 min SHALL fechar a conexão de eventos. Ao voltar a ficar visível, ela SHALL reabrir a conexão e retomar de onde parou.

#### Scenario: Aba de volta
- **WHEN** uma aba fica 10 min escondida, e nesse tempo uma pessoa é cadastrada
- **THEN** a aba não tem conexão aberta enquanto está escondida, e ao voltar recebe o evento e mostra a pessoa nova

### Requirement: Eventos guardados por 24 horas

Os eventos SHALL ficar guardados por pelo menos 24 h, para a retomada. A manutenção diária SHALL apagar os eventos com mais de 24 h.

#### Scenario: Manutenção dos eventos
- **WHEN** a manutenção diária roda
- **THEN** os eventos com mais de 24 h são apagados, e os mais novos continuam
