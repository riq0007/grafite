## Context

O Grafite já tem o que um módulo novo precisa:
- o registro dos módulos na web (`definirModulo`), os módulos opcionais e a guarda deles na API (`exigirModuloLigado`);
- as permissões do catálogo, a auditoria com o evento, as notificações (`notificar`) e a camada de marcadores do mapa (`FORNECEDORES_DO_MAPA`).

As salas são da organização, com o local opcional. A disponibilidade é a ausência de reserva "Aguardando aprovação" ou "Aprovada" no horário.

## Goals / Non-Goals

**Goals:**
- as salas e os itens solicitáveis;
- a reserva com o conflito de horário, a aprovação, os convites com a resposta e as notificações;
- a Agenda do dia;
- a camada do mapa.

**Non-Goals:**
- Reserva que se repete (toda semana). Cada reunião é uma reserva.
- Agenda do Outlook ou do Google, e e-mail de convite com o arquivo da agenda. As notificações do Grafite já vão por e-mail e push, pelos canais da conta.
- Reserva que atravessa a meia-noite ou passa de 12 horas.
- Separar a disponibilidade por local na permissão. As permissões valem na organização: quem vê as salas vê todas.

## Decisions

1. **Quatro tabelas, todas `orgScoped` com o RLS.**
   - `salas`: o nome normalizado único, o local, a capacidade, os recursos e a situação.
   - `itens_das_salas`: o nome normalizado único, a descrição e a situação.
   - `reservas_das_salas`: a sala, o início e o fim (`timestamptz`), o assunto, o comentário, a situação, quem pediu, quem decidiu, quando e o motivo, e os itens em `jsonb`, a lista dos ids.
   - `participantes_das_reservas`: a reserva, a conta e a resposta (`sem-resposta | aceitou | recusou`), única por reserva e conta.
2. **O conflito na transação, com a sala trancada.**
   - O pedido tranca a linha da sala (`for update`) e procura uma reserva da sala, aguardando aprovação ou aprovada, com `inicio < fim_novo and fim > inicio_novo`.
   - Duas reservas ao mesmo tempo na mesma sala ficam em fila pelo trinco, e a segunda vê a primeira.
   - Uma exclusão por `gist` pediria a extensão `btree_gist` no PostgreSQL do Windows e do Linux, o que o trinco dispensa.
3. **A conferência no domínio.**
   - `conferirSala`, `conferirItemDaSala` e `conferirReserva` dão as mensagens da spec. A reserva confere o dia só, as 12 horas e o "a partir de agora" no fuso de São Paulo, como o resto do Grafite.
   - `situacaoDaSalaNoMapa(reservasDoDia, agora)` dá o texto do marcador.
4. **Notificar na mesma transação,** com o `notificar` do P3b: o pedido avisa quem administra as salas; a aprovação, quem pediu e os participantes; a recusa, quem pediu; e o cancelamento da aprovada, os participantes. As contas com `salas.administrar` saem dos acessos da organização, como nas notificações dos alertas.
5. **As rotas em `/salas`,** na guarda do módulo opcional:
   - `GET /salas` e `POST`/`PATCH /salas/:id`, com a inativação e a reativação;
   - o mesmo em `/salas/itens`;
   - `GET /salas/agenda?de&ate`, com as salas ativas e as reservas no intervalo; o comentário e os participantes só a quem pode vê-los;
   - `POST /salas/reservas`, `GET /salas/reservas/minhas` e `GET /salas/reservas/pendentes`;
   - `POST /salas/reservas/:id/aprovacao`, `/recusa`, `/cancelamento` e `/resposta`.
6. **A Agenda em grade, na web.**
   - As colunas são as salas e as linhas, as meias horas das 07:00 às 21:00.
   - O bloco da reserva ocupa as linhas do horário dela, posicionado pela grade do CSS.
   - O dia sai do fuso do navegador, e o pedido manda o início e o fim em ISO.
7. **A camada do mapa é um fornecedor.** `alvoTipo: 'sala'`, a camada "Salas de reunião", o `ve` pela `salas.ver`, e os marcadores com a situação do domínio e a ação "Ver a agenda".

## Risks / Trade-offs

- **[A Agenda com muitas salas fica larga]** → As colunas têm largura mínima, e a grade rola de lado dentro da área, sem rolar a página.
- **[O participante é uma conta, e não um e-mail de fora]** → Quem não tem conta não é convidado pelo sistema. O comentário serve para citar os de fora.
- **[O trinco da sala serializa os pedidos da mesma sala]** → O pedido é curto, e só os da mesma sala esperam.
