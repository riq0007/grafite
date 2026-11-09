## Purpose

Levar à tela o que precisa da atenção do usuário e guardar o histórico numa central, com as regras de severidade, tempo e quantidade da seção 7.4 da spec mestre e as escolhas do próprio usuário.

## ADDED Requirements

### Requirement: Notificar

Qualquer módulo SHALL poder notificar, informando:
- a severidade: Crítico, Atenção ou Informação;
- o título e, se houver, a descrição;
- a origem, que é o módulo;
- se houver, o endereço do registro, para "Abrir";
- se houver, as ações de reconhecer e de adiar.

Cada notificação SHALL entrar na central como não lida, com o horário em que chegou.

#### Scenario: Notificação com endereço
- **WHEN** um módulo notifica "Toner abaixo de 10%", de Atenção, com o endereço da impressora
- **THEN** a notificação entra na central como não lida, e "Abrir" leva ao endereço da impressora

### Requirement: Aviso na tela conforme as preferências

Uma notificação SHALL virar aviso na tela conforme a severidade:
- **Crítico:** sempre, e o aviso fica até ser reconhecido, adiado ou fechado.
- **Atenção e Informação:** só se o usuário mantiver essa severidade ligada nos Ajustes. O aviso some depois do tempo escolhido (6 s de fábrica, 10 s ou 20 s), com a contagem pausada enquanto o ponteiro ou o foco estão sobre ele.

A notificação que não vira aviso SHALL ir direto para a central. Fechar um aviso SHALL NOT tirar a notificação da central.

#### Scenario: Informação desligada
- **WHEN** o usuário desligou os avisos de Informação e chega uma notificação de Informação
- **THEN** nenhum aviso aparece, e a notificação está na central, não lida

#### Scenario: Tempo de 20 s
- **WHEN** o tempo escolhido é 20 s e chega uma notificação de Atenção
- **THEN** o aviso fica 20 s na tela, sem contar o tempo em que o ponteiro está sobre ele

#### Scenario: Crítico
- **WHEN** chega uma notificação Crítica
- **THEN** o aviso fica na tela até o usuário reconhecer, adiar ou fechar, qualquer que seja o tempo escolhido

### Requirement: Retorno de operação

O aviso com o resultado de uma operação que o próprio usuário acabou de fazer SHALL seguir o tempo escolhido. Ele SHALL NOT entrar na central nem na contagem do sino, e as escolhas de severidade SHALL NOT escondê-lo.

#### Scenario: Operação concluída
- **WHEN** uma operação do usuário termina com sucesso, com os avisos de Informação desligados
- **THEN** o aviso de sucesso aparece, some no tempo escolhido e não entra na central

### Requirement: Sino e não lidas

A barra superior SHALL ter o item Notificações, com um sino e, havendo não lidas, o número delas: até 99, e "99+" acima disso. O nome acessível SHALL dizer o número exato, como "Notificações, 3 não lidas". Escolher o item SHALL abrir a central. A contagem SHALL mudar na hora em que uma notificação chega ou é lida.

#### Scenario: Nenhuma não lida
- **WHEN** não há notificação não lida
- **THEN** o sino aparece sem número, e o nome acessível é "Notificações, nenhuma não lida"

#### Scenario: Muitas não lidas
- **WHEN** há 120 notificações não lidas
- **THEN** o sino mostra "99+", e o nome acessível diz "Notificações, 120 não lidas"

### Requirement: Central de notificações

A central SHALL abrir como gaveta à direita, com superfície sólida e o foco preso. SHALL fechar com Esc, devolvendo o foco ao sino.

A central SHALL listar as notificações da mais recente para a mais antiga, agrupadas por dia ("Hoje", "Ontem" e a data). Cada notificação SHALL mostrar a severidade em texto, o título, a descrição, a origem e o horário. A central SHALL oferecer:
- filtros por severidade e "Só não lidas", aplicados na hora;
- "Abrir", quando a notificação tem endereço, que leva ao registro e a marca como lida;
- "Marcar como lida" em cada notificação e "Marcar todas como lidas";
- reconhecer e adiar, nas críticas que trazem essas ações.

Sem notificações, a central SHALL mostrar "Nenhuma notificação.". Quando os filtros não deixam nenhuma, SHALL mostrar "Nenhuma notificação com esses filtros." e "Limpar filtros".

#### Scenario: Filtro por severidade
- **WHEN** a central tem notificações Críticas e de Informação, e o usuário filtra por Crítico
- **THEN** só as Críticas aparecem

#### Scenario: Abrir
- **WHEN** o usuário escolhe "Abrir" numa notificação com endereço
- **THEN** a central fecha, a casca navega até o registro, e a notificação passa a lida

#### Scenario: Central vazia
- **WHEN** não há nenhuma notificação
- **THEN** a central mostra "Nenhuma notificação."

#### Scenario: Central no celular
- **WHEN** a central abre num celular com 390 px de largura
- **THEN** ela ocupa a largura da tela, sem rolagem horizontal

### Requirement: Notificações da sessão até o P3

Até o P3 gravar as notificações no servidor, a central SHALL guardar as notificações da sessão aberta, e recarregar a página SHALL esvaziá-la. Nenhuma notificação SHALL ser inventada para preencher a central: sem um produtor real, ela fica vazia.

#### Scenario: Recarregar a página
- **WHEN** o usuário recarrega a página
- **THEN** a central abre vazia, sem notificações de exemplo
