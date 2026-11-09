# ligacoes-de-ativos Specification

## Purpose
Ligar os ativos entre si, pelos campos do tipo ativo e pela ligação livre "Ligado a", para cada ficha levar aos ativos ligados a ela, como o monitor ao computador.

## Requirements

### Requirement: Ligação pelos campos do tipo ativo

Um campo do tipo ativo (spec campos-personalizados) SHALL ligar o ativo que tem o campo ao ativo escolhido nele. A ligação SHALL ter dois lados:
- **o lado do campo:** o ativo que tem o campo mostra o ativo escolhido no próprio campo, na aba Dados;
- **o lado de lá:** o ativo escolhido mostra, na aba Ligados, os ativos que apontam para ele por aquele campo.

Os tipos aceitos na configuração do campo SHALL valer na escolha, que só oferece ativos desses tipos, e na API, que recusa os outros no próprio campo:
- com um tipo aceito: "Escolha um ativo do tipo Computador.";
- com vários: "Escolha um ativo de um destes tipos: Computador, Notebook.".

Mudar os tipos aceitos SHALL NOT mudar os valores guardados: o ativo já escolhido de um tipo que deixou de ser aceito SHALL continuar até alguém mudá-lo.

O lado de lá SHALL mostrar só os ativos cujo tipo usa o campo, com o campo ativo: o campo tirado do tipo ou inativado some dos dois lados, como na ficha, sem apagar os valores.

O grupo do lado de lá SHALL ter o nome do lado de lá da configuração do campo, como "Monitores". Sem ele, o grupo SHALL se chamar "Pelo campo <rótulo do campo>", como "Pelo campo Computador".

#### Scenario: Monitor ligado ao computador
- **WHEN** o tipo "Monitor" usa o campo "Computador", do tipo ativo, que aceita só o tipo "Computador" e tem o lado de lá "Monitores", e o monitor PAT-00320 aponta para o computador PAT-00150
- **THEN** a ficha do PAT-00150 mostra, na aba Ligados, o grupo "Monitores" com o PAT-00320

#### Scenario: Tipo não aceito
- **WHEN** alguém escolhe uma impressora no campo "Computador" de um monitor
- **THEN** a gravação é recusada com "Escolha um ativo do tipo Computador.", no campo Computador

#### Scenario: Tipo que deixou de ser aceito
- **WHEN** o campo "Computador" passa a aceitar só "Notebook", e um monitor já aponta para um computador
- **THEN** o monitor continua apontando para o computador, e a escolha passa a oferecer só notebooks

#### Scenario: Campo sem o nome do lado de lá
- **WHEN** o campo "Nobreak", do tipo ativo, não tem o nome do lado de lá, e um switch aponta para o nobreak PAT-00700
- **THEN** a ficha do PAT-00700 mostra o switch no grupo "Pelo campo Nobreak"

### Requirement: Ligação livre

Quem edita dois ativos SHALL poder ligá-los com a ligação livre "Ligado a", para o que não tem campo, como dois equipamentos que trabalham juntos. A ligação livre:
- SHALL NOT ter tipo nem sentido: ela aparece igual nas fichas dos dois ativos;
- SHALL ligar só ativos ativos;
- SHALL NOT ligar um ativo a ele mesmo nem repetir uma ligação que já existe;
- SHALL ter até 100 por ativo.

As recusas SHALL ser:
- "Este ativo está inativo." e "O ativo escolhido está inativo.";
- "Um ativo não se liga a ele mesmo.";
- "Os dois ativos já estão ligados.";
- "Este ativo já tem 100 ligações. Desfaça uma para ligar outra." e "O ativo escolhido já tem 100 ligações.".

A ligação de um ativo que depois é inativado SHALL continuar, com a situação dele à vista.

Desfazer a ligação SHALL pedir confirmação, dizendo que ela sai das fichas dos dois ativos e fica no histórico. A ligação desfeita SHALL sair das duas fichas.

Os retornos SHALL ser "Ativos ligados." e "Ligação desfeita.".

#### Scenario: Ligar dois ativos
- **WHEN** quem edita ativos liga o nobreak PAT-00700 ao switch PAT-00610
- **THEN** as fichas dos dois mostram o outro em "Ligado a", e o histórico de cada um registra a ligação

#### Scenario: Ligação repetida
- **WHEN** alguém tenta ligar de novo o switch PAT-00610 ao nobreak PAT-00700
- **THEN** a ligação é recusada com "Os dois ativos já estão ligados."

#### Scenario: Ligação desfeita
- **WHEN** quem edita ativos desfaz a ligação entre o PAT-00700 e o PAT-00610, depois de confirmar
- **THEN** a ligação sai das duas fichas, e o histórico dos dois registra a ligação desfeita

#### Scenario: Ativo inativado depois de ligado
- **WHEN** o switch PAT-00610, ligado ao nobreak PAT-00700, é inativado
- **THEN** a ficha do nobreak continua mostrando o switch em "Ligado a", com a situação "Inativo"

### Requirement: Acesso às ligações

A aba Ligados SHALL mostrar os ativos ligados que a conta pode ver pelo nome, com o tipo, o patrimônio, o local, a situação e a imagem, e cada um SHALL abrir a ficha dele. Um ativo ligado que a conta não pode ver SHALL aparecer como "Ativo fora do seu acesso", sem o nome e sem abrir a ficha.

Fazer e desfazer uma ligação livre SHALL exigir `ativos.editar` nos locais dos dois ativos. A recusa SHALL responder 403 e ir para a auditoria.

O lado de lá de um campo restrito SHALL aparecer só a quem tem `ativos.restritos` no local do ativo que tem o campo.

#### Scenario: Ligado fora do acesso
- **WHEN** um computador de Jundiaí está ligado a um ativo de Campinas, e Bruno vê ativos só em Jundiaí
- **THEN** a ficha do computador mostra a ligação como "Ativo fora do seu acesso"

#### Scenario: Desfazer sem acesso ao outro ativo
- **WHEN** Bruno, que edita ativos só em Jundiaí, tenta desfazer a ligação entre um ativo de Jundiaí e um de Campinas
- **THEN** a API recusa com 403, e a recusa vai para a auditoria

#### Scenario: Lado de lá de um campo restrito
- **WHEN** o campo "Cofre", do tipo ativo, é restrito, e um ativo aponta para o ativo PAT-00900 por ele
- **THEN** a ficha do PAT-00900 mostra o grupo do campo "Cofre" só a quem tem `ativos.restritos` no local do ativo que aponta

### Requirement: Aba Ligados da ficha

A aba Ligados da ficha SHALL mostrar:
- um grupo para cada campo do tipo ativo que aponta para o ativo, com os ativos que apontam por ele, até 100, com "Mostrando 100 de <total>." quando há mais;
- o grupo "Ligado a", com as ligações livres e, a quem pode, "Ligar a outro ativo" e "Desfazer ligação" em cada uma.

O título da aba SHALL trazer quantos ativos estão ligados. Sem nenhum, a aba SHALL dizer "Nenhum ativo ligado." e oferecer, a quem pode, "Ligar a outro ativo".

A escolha do ativo a ligar SHALL buscar pelo nome, pelo patrimônio, pela série, pelo hostname e pelo modelo, entre os ativos ativos que a conta pode editar.

A aba SHALL se atualizar sozinha quando um ativo ligado muda ou quando uma ligação é feita ou desfeita em outra sessão.

#### Scenario: Sem ligações
- **WHEN** alguém abre a aba Ligados de um ativo sem ligações
- **THEN** a aba diz "Nenhum ativo ligado.", com "Ligar a outro ativo" para quem edita o ativo

#### Scenario: Ligação feita em outra sessão
- **WHEN** Ana liga o nobreak PAT-00700 ao switch PAT-00610 enquanto Bruno está com a aba Ligados do switch aberta
- **THEN** a aba de Bruno mostra o nobreak em "Ligado a", sem recarregar
