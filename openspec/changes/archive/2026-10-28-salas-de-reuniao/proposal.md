## Why

Hoje as reservas das salas de reunião chegam ao TI por e-mail, com a sala, o horário e a pessoa. Quem pede não vê se a sala está livre, e os participantes não sabem da reunião pelo sistema. O usuário pediu, em 28/10, um módulo de salas no Grafite:
- quem tem acesso vê as salas e a disponibilidade e pede a reserva, com o comentário e os participantes;
- os participantes são notificados e aceitam ou recusam na tela;
- quem pede escolhe os equipamentos que precisa, entre os itens que o TI cadastra;
- o TI cadastra as salas e aprova os pedidos.

Ele pediu também as salas em uso no mapa da planta. A change é um subprojeto novo da spec mestre, depois do P7, e usa a camada de marcadores do mapa (spec mapa-da-planta).

## What Changes

- **O módulo Salas, opcional, no dock.**
  - A Agenda do dia mostra as salas lado a lado, com as reservas em blocos na faixa das horas.
  - "Nova reserva" pede a sala, o dia, o início e o fim, o assunto, o comentário, os participantes e os equipamentos.
  - O horário que bate com outra reserva da sala é recusado.
- **A aprovação.**
  - O pedido nasce "Aguardando aprovação" e avisa quem administra as salas.
  - Quem administra aprova ou recusa, com o motivo.
  - A reserva de quem administra já nasce aprovada.
  - Quem pediu e quem administra cancelam a reserva.
- **Os convites.**
  - Na aprovação, cada participante recebe a notificação.
  - Em "Minhas reservas", o participante aceita ou recusa o convite, e quem pediu vê as respostas.
- **O cadastro.** Quem administra cadastra as salas, com o local, a capacidade e os recursos, e os itens solicitáveis, como o projetor e o ramal de viva-voz.
- **A camada no mapa.** As salas posicionadas no mapa aparecem com a situação: "Em uso" até a hora do fim, "Livre", ou "Reservada às 14:00", na próxima reserva do dia.
- **As permissões.** `salas.ver` vê as salas e pede as reservas, e `salas.administrar` cadastra e aprova. O perfil Administrador tem as duas.

## Capabilities

### New Capabilities
- `salas-de-reuniao`: as salas, os itens solicitáveis, as reservas com o conflito de horário, a aprovação, os participantes e as respostas deles, as notificações, as permissões, a auditoria, o evento e a camada do mapa.
- `modulo-salas`: o módulo Salas na casca, com a Agenda, a Nova reserva, as Minhas reservas, os Pedidos e o Cadastro.

### Modified Capabilities
- `modulos-da-organizacao`: o Salas entre os módulos opcionais.

## Impact

- **`packages/domain`:**
  - as permissões, as ações da auditoria e o evento `salas.mudaram`;
  - o módulo opcional;
  - a conferência da sala, do item e da reserva, o conflito de horário e a situação da sala no mapa.
- **`packages/db`:** as tabelas das salas, dos itens, das reservas e dos participantes, com o RLS.
- **`apps/api`:** as rotas das salas e o fornecedor da camada no mapa.
- **`apps/web`:** o módulo Salas e o registro dele.
