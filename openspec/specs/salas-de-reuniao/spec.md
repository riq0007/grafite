# salas-de-reuniao Specification

## Purpose

Organizar as reservas das salas de reunião: quem tem acesso vê as salas livres e pede a reserva, com os participantes e os equipamentos, o TI aprova, e os participantes respondem ao convite.

## Requirements

### Requirement: Salas e itens solicitáveis

Quem tem `salas.administrar` SHALL cadastrar, editar, inativar e reativar as salas. Cada sala SHALL ter:
- o nome, de 1 a 80 caracteres, único na organização;
- o local, opcional;
- a capacidade, de 1 a 500 pessoas, opcional;
- os recursos, em texto até 500 caracteres, como "TV de 65 polegadas e quadro branco".

Quem tem `salas.administrar` SHALL cadastrar, editar, inativar e reativar os itens solicitáveis. Cada item SHALL ter o nome, de 1 a 80 caracteres e único na organização, e a descrição, até 200 caracteres.

A sala e o item inativos SHALL NOT aparecer na Nova reserva. As reservas que já os citam SHALL continuar como estão. A gravação SHALL recusar o nome vazio com "Informe o nome.", o longo com "Use até 80 caracteres no nome.", o repetido com "Já existe uma sala com esse nome." ou "Já existe um item com esse nome." e a capacidade fora dos limites com "Informe uma capacidade de 1 a 500 pessoas.".

#### Scenario: Sala nova
- **WHEN** quem administra as salas cadastra "Sala Paraty", em Jundiaí, para 8 pessoas
- **THEN** a sala aparece na Agenda e na Nova reserva

#### Scenario: Item inativado
- **WHEN** quem administra as salas inativa o item "Projetor"
- **THEN** o projetor sai da Nova reserva, e as reservas que já o pediram continuam com ele

### Requirement: Pedido de reserva

Quem tem `salas.ver` SHALL pedir a reserva de uma sala ativa, com:
- o início e o fim, no mesmo dia, com o fim depois do início e até 12 horas de duração, e o início a partir de agora;
- o assunto, de 1 a 120 caracteres;
- o comentário, até 1.000 caracteres, opcional;
- os participantes, até 50 contas ativas da organização, sem quem pede;
- os itens solicitáveis ativos que a reunião precisa.

A reserva SHALL nascer "Aguardando aprovação". A de quem tem `salas.administrar` SHALL nascer "Aprovada". O pedido SHALL notificar cada conta com `salas.administrar`, com a severidade Informação, a origem "Salas", o título "Pedido de reserva: <sala>, <dia> das <início> às <fim>" e o endereço dos pedidos.

O horário que cruza o de outra reserva da mesma sala, aguardando aprovação ou aprovada, SHALL ser recusado com "A sala já está reservada nesse horário.", e nada SHALL ser gravado. Duas reservas da mesma sala que só se encostam, uma terminando quando a outra começa, SHALL NOT conflitar. A gravação SHALL recusar com a mensagem no campo:

| O que não confere | Mensagem |
|---|---|
| sala que falta ou está inativa | "Escolha uma sala ativa." |
| fim antes do início, ou no mesmo minuto | "O fim precisa ficar depois do início." |
| início e fim em dias diferentes, ou mais de 12 horas | "A reserva fica num dia só, com até 12 horas." |
| início antes de agora | "Escolha um horário a partir de agora." |
| assunto vazio | "Informe o assunto." |
| assunto com mais de 120 caracteres | "Use até 120 caracteres no assunto." |
| comentário com mais de 1.000 caracteres | "Use até 1.000 caracteres no comentário." |
| participante que não é uma conta ativa da organização | "Escolha participantes da organização." |
| mais de 50 participantes | "Convide até 50 participantes." |
| item que falta ou está inativo | "Escolha itens que estejam ativos." |

#### Scenario: Pedido de Paula
- **WHEN** Paula, com `salas.ver`, pede a Sala Paraty amanhã das 14:00 às 15:00, com o assunto "Revisão do orçamento", dois participantes e o projetor
- **THEN** a reserva fica "Aguardando aprovação", e quem administra as salas é notificado

#### Scenario: Horário ocupado
- **WHEN** a Sala Paraty já está reservada das 14:00 às 15:00, e alguém pede das 14:30 às 15:30
- **THEN** o pedido é recusado com "A sala já está reservada nesse horário."

#### Scenario: Reservas que se encostam
- **WHEN** a Sala Paraty está reservada das 14:00 às 15:00, e alguém pede das 15:00 às 16:00
- **THEN** o pedido é aceito

### Requirement: Aprovação e cancelamento

Quem tem `salas.administrar` SHALL aprovar ou recusar a reserva que aguarda aprovação. A recusa SHALL pedir o motivo, de 1 a 300 caracteres.
- Na aprovação, quem pediu e cada participante SHALL ser notificados, com o título "Reserva aprovada: <assunto>, <sala>, <dia> das <início> às <fim>" e o endereço das Minhas reservas.
- Na recusa, quem pediu SHALL ser notificado, com o título "Reserva recusada: <assunto>" e o motivo como descrição.

Quem pediu e quem administra as salas SHALL cancelar a reserva aguardando aprovação ou aprovada, enquanto ela não termina. O cancelamento da aprovada SHALL notificar os participantes, com o título "Reserva cancelada: <assunto>".

Aprovar, recusar ou cancelar a reserva que já mudou de situação SHALL ser recusado com "Esta reserva já foi <aprovada|recusada|cancelada>.".

#### Scenario: Aprovação com convites
- **WHEN** quem administra as salas aprova a reserva de Paula, com dois participantes
- **THEN** a reserva fica "Aprovada", e Paula e os dois participantes recebem a notificação

#### Scenario: Recusa com motivo
- **WHEN** quem administra as salas recusa a reserva com o motivo "A sala estará em manutenção"
- **THEN** a reserva fica "Recusada", o horário volta a ficar livre e Paula recebe a notificação com o motivo

### Requirement: Resposta ao convite

Cada participante SHALL responder ao convite da reserva aguardando aprovação ou aprovada, com "Aceitar" ou "Recusar", e SHALL poder mudar a resposta enquanto a reserva não termina. A resposta começa "Sem resposta". Quem pediu e quem administra as salas SHALL ver a resposta de cada participante.

#### Scenario: Participante aceita
- **WHEN** Rui, convidado para a reserva de Paula, escolhe "Aceitar"
- **THEN** a reserva mostra Rui como "Aceitou" para Paula e para quem administra as salas

### Requirement: Permissões, auditoria e evento das salas

O catálogo SHALL ter, na área "Salas":
- `salas.ver`: "Ver as salas e pedir as reservas", na organização;
- `salas.administrar`: "Cadastrar as salas e os itens e aprovar as reservas", na organização, incluindo `salas.ver`.

O perfil Administrador SHALL ter as duas. A API SHALL repetir as verificações, e a conta só SHALL ver os participantes e o comentário das reservas que ela pediu, em que foi convidada, ou com `salas.administrar`. A Agenda SHALL mostrar a todos com `salas.ver` a sala, o horário, o assunto e quem pediu.

O cadastro e a mudança das salas e dos itens, o pedido, a aprovação, a recusa e o cancelamento das reservas e a resposta ao convite SHALL ir para a auditoria e gravar o evento `salas.mudaram`, entregue a quem vê as salas.

#### Scenario: Conta sem a permissão
- **WHEN** uma conta sem `salas.ver` pede uma reserva pela API
- **THEN** a API responde 403, e nada é gravado

### Requirement: Salas no mapa da planta

O mapa da planta SHALL ter a camada "Salas de reunião", com as salas posicionadas que a conta vê, cada uma com a situação em texto:
- "Em uso até <fim>", na reserva aprovada que acontece agora;
- "Reservada às <início>", na próxima reserva aprovada do dia;
- "Livre", sem reserva aprovada no resto do dia.

O marcador SHALL ter o assunto da reunião em uso, quando há, e a ação "Ver a agenda". Quem edita o mapa SHALL posicionar as salas como os ativos.

#### Scenario: Sala em uso no mapa
- **WHEN** a reserva aprovada da Sala Paraty vai das 14:00 às 15:00, e são 14:20
- **THEN** o marcador da sala no mapa mostra "Em uso até 15:00"
