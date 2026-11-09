## Purpose

Dar às salas de reunião um módulo na casca, com a agenda do dia, o pedido de reserva, os convites, a aprovação e o cadastro.

## ADDED Requirements

### Requirement: Salas no dock

A casca SHALL ter o módulo Salas, depois do Mapa e antes do Cofre, visível para quem tem `salas.ver`, também pela `salas.administrar`, e só com o módulo ligado na organização. O menu SHALL ter:
- "Agenda" e "Minhas reservas", para quem vê as salas;
- "Pedidos" e "Cadastro", para quem administra as salas.

O item do dock SHALL levar à Agenda. A busca SHALL oferecer a ação "Nova reserva", no caminho "Salas", que abre a Agenda com o formulário. Sem a permissão, o endereço do módulo SHALL dizer "Você não tem acesso às salas.", com a quem pedir acesso.

#### Scenario: Quem só pede reservas
- **WHEN** uma conta com só `salas.ver` abre o Salas
- **THEN** o menu mostra "Agenda" e "Minhas reservas", sem "Pedidos" e sem "Cadastro"

### Requirement: Agenda do dia

A Agenda SHALL mostrar o dia escolhido, começando por hoje, com "Dia anterior", "Hoje" e "Dia seguinte":
- as salas ativas lado a lado, cada uma com o nome, o local e a capacidade;
- a faixa das 07:00 às 21:00, com as reservas aguardando aprovação e as aprovadas em blocos, com o horário, o assunto, quem pediu e a situação em texto;
- "Nova reserva", a ação principal, ao lado do título.

Escolher um horário livre de uma sala SHALL abrir a Nova reserva com a sala, o dia e a hora. Sem salas cadastradas, a Agenda SHALL dizer "Nenhuma sala cadastrada." e, para quem administra, oferecer o Cadastro.

#### Scenario: Horário livre
- **WHEN** Paula escolhe o horário das 10:00 da Sala Paraty na Agenda
- **THEN** a Nova reserva abre com a Sala Paraty, o dia e o início às 10:00

### Requirement: Nova reserva

A Nova reserva SHALL abrir numa gaveta, com a sala, o dia, o início e o fim, o assunto, o comentário, os participantes, buscados pelo nome, e os itens solicitáveis, marcados um a um. A recusa SHALL ficar no campo. Gravar SHALL dar o retorno "Reserva pedida.", ou "Reserva feita." na reserva de quem administra.

#### Scenario: Pedido pela Agenda
- **WHEN** Paula preenche a Nova reserva e escolhe "Pedir reserva"
- **THEN** a gaveta fecha com "Reserva pedida.", e o bloco aparece na Agenda como "Aguardando aprovação"

### Requirement: Minhas reservas e convites

"Minhas reservas" SHALL mostrar as reservas que a conta pediu e os convites dela, das que ainda não terminaram, da mais próxima para a mais distante, cada uma com a sala, o dia, o horário, o assunto e a situação.
- A reserva pedida SHALL mostrar as respostas dos participantes e "Cancelar".
- O convite SHALL ter "Aceitar" e "Recusar", com a resposta atual em texto.

Sem nenhuma, a tela SHALL dizer "Nenhuma reserva nem convite." e oferecer "Nova reserva".

#### Scenario: Convite aceito
- **WHEN** Rui abre Minhas reservas e escolhe "Aceitar" no convite de Paula
- **THEN** o convite mostra "Você aceitou", e Paula vê Rui como "Aceitou"

### Requirement: Pedidos e cadastro

"Pedidos" SHALL listar as reservas aguardando aprovação, da mais próxima para a mais distante, com quem pediu, os participantes, os itens, o comentário, "Aprovar" e "Recusar". A recusa SHALL abrir o diálogo do motivo. Os retornos SHALL ser "Reserva aprovada." e "Reserva recusada.". Sem pedidos, a tela SHALL dizer "Nenhum pedido aguardando aprovação.".

"Cadastro" SHALL ter as salas e os itens solicitáveis, cada lista com "Nova sala" ou "Novo item", a edição numa gaveta e "Inativar" e "Reativar".

#### Scenario: Aprovar pelo Pedidos
- **WHEN** quem administra as salas escolhe "Aprovar" no pedido de Paula
- **THEN** o pedido sai da lista com "Reserva aprovada."

### Requirement: Salas atualizadas pelos eventos

A Agenda, as Minhas reservas, os Pedidos e o Cadastro SHALL se atualizar sozinhos quando o evento `salas.mudaram` chega, sem uma ação do usuário.

#### Scenario: Pedido novo
- **WHEN** Paula pede uma reserva, e quem administra as salas está com os Pedidos abertos
- **THEN** o pedido aparece na lista sem recarregar
