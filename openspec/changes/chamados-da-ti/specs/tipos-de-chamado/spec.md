## Purpose

Deixar a TI definir os tipos de chamado e o formulário de cada um: o que o colaborador escolhe ao pedir, o que ele responde, o prazo, quem atende e o que o chamado vira, sem programar.

## ADDED Requirements

### Requirement: Tipo de chamado

Quem tem `chamados.configurar` SHALL cadastrar e mudar os tipos de chamado. Cada tipo SHALL ter:
- **o nome,** de 1 a 40 caracteres, único na organização sem diferenciar acento e maiúsculas;
- **o ícone,** entre os da lista dos tipos de chamado;
- **a frase para o colaborador,** de 1 a 80 caracteres, como "Mancha, atola ou não imprime";
- **o prazo e o atendimento** (requisito "Prazo e atendimento do tipo");
- **o que acontece depois** (requisito "O que acontece depois");
- **quem vê** (requisito "Quem vê o tipo");
- **o formulário** (requisito "Formulário do tipo");
- **a situação,** sempre em texto:
  - Rascunho;
  - Em uso;
  - Inativo;
- **a ordem,** que vale na lista dos tipos e na escolha do tipo ao abrir um chamado. Quem configura a muda arrastando o tipo.

Cada tipo SHALL mostrar, a quem configura:
- os chamados dele em aberto;
- os abertos nos últimos 365 dias, como "1 aberto · 38 no último ano".

Só o tipo Em uso SHALL receber chamados novos.

Inativar SHALL pedir confirmação. O tipo inativo:
- SHALL guardar os chamados dele, que seguem até resolvidos;
- SHALL voltar Em uso ao reativar.

As recusas SHALL ficar no campo:
- "Escreva o nome.", "Use até 40 caracteres." e "Já existe um tipo com esse nome.", no nome;
- "Escolha o ícone.", no ícone;
- "Escreva a frase." e "Use até 80 caracteres.", na frase.

#### Scenario: Nome repetido
- **WHEN** quem configura cria o tipo "impressora", e já existe "Impressora"
- **THEN** a gravação é recusada com "Já existe um tipo com esse nome.", no nome

#### Scenario: Tipo inativado com chamados abertos
- **WHEN** quem configura inativa a Impressora, com o #1042 aberto
- **THEN** o #1042 segue até resolvido, e a Impressora sai da escolha do tipo ao abrir um chamado

### Requirement: Prazo e atendimento do tipo

O prazo do tipo SHALL ser escrito como uma frase: "Responde em [30] [min] e resolve em [8] [h], [no horário da TI]".
- **A resposta e a resolução:** cada uma é um número inteiro de 1 a 999 e uma unidade: minutos, horas ou dias.
- **O modo de contar,** do tipo: "em horas corridas" ou "no horário da TI" (spec chamados, requisito "Prazo do chamado").
- **O dia:** no horário da TI, é o dia útil, com o comprimento de um dia do horário, e a frase diz "dias úteis"; em horas corridas, são 24 h. O chamado copia o prazo em minutos na abertura (spec chamados, requisito "Prazo do chamado").
- **O tamanho:** a resposta SHALL NOT passar da resolução, com o dia útil do horário da TI de quando o tipo é gravado.

O atendimento SHALL ter:
- **quem atende por padrão:** uma conta ativa com `chamados.atender`, ou ninguém, que leva o chamado à triagem;
- **"Se não houver ninguém",** fora do horário da TI e quando quem atende por padrão não pode atender o chamado: "Cai na triagem" ou "Fica com <pessoa> mesmo assim", este só fora do horário.

Abaixo da frase, a tela SHALL dizer: "O relógio para quando o chamado fica aguardando o colaborador.".

As recusas SHALL ser:
- "Use um número inteiro de 1 a 999.", no número;
- "A resposta passa da resolução. Use uma resposta menor.", na resposta;
- "Escolha uma conta que atende os chamados.", em quem atende.

#### Scenario: Prazo em dias úteis
- **WHEN** quem configura escreve "Responde em 1 h e resolve em 3 dias, no horário da TI"
- **THEN** a frase mostra "1 h e 3 dias úteis", e o chamado do tipo vence depois de 30 h contadas no horário das 8h às 18h

#### Scenario: Resposta maior que a resolução
- **WHEN** quem configura escreve "Responde em 10 h e resolve em 8 h"
- **THEN** a gravação é recusada com "A resposta passa da resolução. Use uma resposta menor."

### Requirement: O que acontece depois

O tipo SHALL ter três chaves, cada uma com "Ligado" ou "Desligado" escrito:
- **"Pode virar OS":** o chamado do tipo com o ativo ligado vira uma OS (spec ordens-de-servico, requisito "OS pelo chamado");
- **"Gera uma Solicitação":** a abertura do chamado registra uma solicitação de Toner ou de Equipamento, este com o tipo de ativo pedido (spec solicitacoes, requisito "Solicitação pelo chamado");
- **"Pede o ativo":** o primeiro campo Ativo do formulário SHALL ser obrigatório, sem condição e sem o "Só a TI vê", e a resposta dele é o ativo ligado do chamado. Assim, todo chamado do tipo nasce com o ativo.

A solicitação de Toner SHALL pedir "Pede o ativo" ligado.

A solicitação gerada pelo tipo é registrada sem pedir a permissão das solicitações a quem abre o chamado. Por isso, toda gravação que deixa o tipo com o "Gera uma Solicitação" ligado, ou gerando outra solicitação, sem que ele já estivesse assim naquele tipo, SHALL pedir também `solicitacoes.atender` na organização inteira. Desligá-lo e gravar o resto do tipo SHALL NOT pedi-la.

As recusas SHALL ser:
- "Escolha o tipo de ativo do equipamento.";
- "O Toner precisa do ativo: ligue 'Pede o ativo'.";
- "Pede o ativo: inclua no formulário um campo Ativo obrigatório.", sem campo Ativo;
- "Pede o ativo: o primeiro campo Ativo precisa ser obrigatório, sem condição e sem o 'Só a TI vê'.";
- "Só quem atende as solicitações em todos os locais liga o 'Gera uma Solicitação'.".

#### Scenario: Pede o ativo sem o campo
- **WHEN** quem configura liga "Pede o ativo" num tipo cujo formulário não tem campo Ativo
- **THEN** a gravação é recusada com "Pede o ativo: inclua no formulário um campo Ativo obrigatório."

#### Scenario: Pede o ativo com o Ativo condicional
- **WHEN** quem configura liga "Pede o ativo" num tipo cujo primeiro campo Ativo aparece só quando "O que está acontecendo?" for "Não imprime"
- **THEN** a gravação é recusada com "Pede o ativo: o primeiro campo Ativo precisa ser obrigatório, sem condição e sem o 'Só a TI vê'."

#### Scenario: Gerar a solicitação sem atendê-las
- **WHEN** Bruno, com `chamados.configurar` e `solicitacoes.atender` só em Campinas, liga o "Gera uma Solicitação" de Equipamento num tipo
- **THEN** a gravação é recusada com "Só quem atende as solicitações em todos os locais liga o 'Gera uma Solicitação'."

### Requirement: Quem vê o tipo

O tipo SHALL ter duas chaves:
- **"Aparece para o colaborador":** a pessoa vê os chamados do tipo na aba, no chat e no portal. Desligada, o chamado fica só entre a TI;
- **"Só a TI abre":** o tipo não aparece na escolha do colaborador, e só a TI abre chamados dele.

A lista dos tipos SHALL marcar só a exceção, com o selo "Só a TI abre".

#### Scenario: Troca de equipamento
- **WHEN** a Troca de equipamento tem "Só a TI abre" ligado
- **THEN** a prévia do colaborador não a mostra, a lista dos tipos a marca "Só a TI abre", e a TI a escolhe ao abrir um chamado

### Requirement: Rascunho, duplicar e descartar

"Novo tipo" SHALL criar um Rascunho com:
- o nome "Novo tipo";
- o ícone das reticências e nenhuma frase, que "Criar o tipo" pede;
- o prazo "Responde em 1 h e resolve em 1 dia, no horário da TI", sem quem atende por padrão, e "Cai na triagem";
- as chaves desligadas, fora "Aparece para o colaborador";
- nenhum campo no formulário.

"Duplicar" SHALL criar um Rascunho com tudo do tipo de origem, inclusive o formulário, e o nome "<nome> (cópia)". A tela SHALL dizer "Duplicado de <nome>." e marcar a origem na lista com "copiado daqui".

Quando o nome já existe, o Rascunho SHALL ganhar o número seguinte, como "Novo tipo 2" e "Toner (cópia 2)". O nome de origem SHALL ser cortado para o nome do Rascunho caber nos 40 caracteres.

O "Duplicar" por quem não atende as solicitações em todos os locais SHALL criar o Rascunho com o "Gera uma Solicitação" desligado (requisito "O que acontece depois"). A tela SHALL dizer também "O 'Gera uma Solicitação' veio desligado: só quem atende as solicitações em todos os locais o liga.".

O Rascunho:
- SHALL NOT receber chamados;
- SHALL NOT aparecer na escolha do tipo;
- SHALL NOT contar nos tipos da lista;
- SHALL aparecer na lista com o selo "Rascunho".

"Criar o tipo" SHALL passá-lo a Em uso, com as mesmas conferências da gravação. "Descartar rascunho" SHALL apagá-lo, com confirmação.

#### Scenario: Equipamento novo a partir do Computador
- **WHEN** quem configura duplica o Computador, troca o nome para "Equipamento novo" e cria o tipo
- **THEN** o Equipamento novo fica Em uso, com o formulário copiado do Computador, e a lista passa de 9 para 10 tipos

#### Scenario: Duplicar de novo
- **WHEN** quem configura duplica o Toner, com o "Toner (cópia)" ainda em Rascunho
- **THEN** o Rascunho novo se chama "Toner (cópia 2)"

#### Scenario: Duplicar sem atender as solicitações
- **WHEN** Bruno, com `chamados.configurar` e com `solicitacoes.atender` só em Campinas, duplica o Toner, que gera a solicitação de Toner
- **THEN** o Rascunho "Toner (cópia)" nasce com o "Gera uma Solicitação" desligado, e a tela diz "Duplicado de Toner." e "O 'Gera uma Solicitação' veio desligado: só quem atende as solicitações em todos os locais o liga."

### Requirement: Tipos de fábrica

A organização nova e a que já existia antes dos chamados SHALL ter os 9 tipos de fábrica, Em uso e nesta ordem:

| Tipo | Frase para o colaborador | Prazo | Depois |
|---|---|---|---|
| Toner | A impressora está sem toner ou a cópia saiu fraca | 30 min e 8 h corridas | Gera a solicitação de Toner, pede o ativo |
| Computador | Não liga, está lento ou travando | 30 min e 5 h corridas | Pode virar OS, pede o ativo |
| Impressora | Mancha, atola ou não imprime | 30 min e 8 h no horário da TI | Pode virar OS, pede o ativo |
| Acesso e senha | Esqueci a senha ou preciso entrar numa pasta | 30 min e 4 h no horário da TI | — |
| Software | Instalar um programa ou ele dá erro | 1 h e 24 h corridas | — |
| Rede e internet | Sem internet, lenta ou o Wi-Fi não conecta | 30 min e 8 h corridas | — |
| Telefone | Ramal sem tom, chiado ou celular da empresa | 1 h e 10 h corridas | — |
| Outro | Não achou o seu caso? Conte com as suas palavras | 1 h e 24 h corridas | — |
| Troca de equipamento | Trocar um equipamento por outro | 1 h e 3 dias úteis no horário da TI | Pode virar OS, pede o ativo; só a TI abre |

Os tipos de fábrica:
- SHALL ter o formulário de fábrica de cada um;
- SHALL ficar sem quem atende por padrão, com "Cai na triagem";
- SHALL ter "Aparece para o colaborador" ligado.

O formulário da Impressora SHALL ser:
- "Qual impressora?" (Ativo, obrigatório);
- "O que está acontecendo?" (Escolha única, obrigatório): Manchando, Não puxa o papel, Atolando e Não imprime;
- "Onde as manchas aparecem?" (Escolha única, obrigatório, só quando for Manchando): Na borda e Na página toda;
- "Uma foto ajuda" (Anexo, opcional);
- "Contador de páginas" (Número, só a TI vê);
- "Contrato de manutenção" (Sim ou não, só a TI vê).

Depois de criados, os tipos de fábrica SHALL ser como os outros: a TI os muda, inativa e reordena. Uma versão nova SHALL NOT recriá-los.

#### Scenario: Organização criada
- **WHEN** o comando no servidor cria uma organização
- **THEN** ela já tem os 9 tipos, com a Impressora no terceiro lugar, em 8 h no horário da TI, e a auditoria registra cada tipo criado

#### Scenario: Tipo de fábrica inativado pela TI
- **WHEN** a TI inativou o Telefone, e uma versão nova é instalada
- **THEN** o Telefone continua inativo, e nenhum tipo de fábrica é criado de novo

### Requirement: Formulário do tipo

O formulário SHALL ter até 20 campos, em ordem. A TI muda a ordem arrastando os campos. Cada campo SHALL ter:
- **o rótulo,** de 1 a 80 caracteres, único no formulário;
- **o nome no resumo,** de até 30 caracteres, que vale o rótulo sem o "?" quando vazio;
- **o tipo de campo,** escolhido ao acrescentar o campo, e que não muda depois:

  | Tipo de campo | Resposta |
  |---|---|
  | Texto curto | até 200 caracteres |
  | Texto longo | até 4.000 caracteres |
  | Escolha única | uma das opções |
  | Várias opções | uma ou mais das opções |
  | Ativo | um ativo ativo, dos tipos de ativo escolhidos no campo ou de qualquer tipo |
  | Local | um local ativo |
  | Pessoa | uma pessoa ativa |
  | Data | uma data |
  | Número | um número inteiro de 0 a 999.999.999 |
  | Anexo | de 1 a 5 arquivos (spec arquivos-e-imagens, requisito "Arquivos aceitos") |
  | Sim ou não | sim ou não |

- **as opções,** na Escolha única e nas Várias opções: de 2 a 12, cada uma de 1 a 60 caracteres e única no campo;
- **"Obrigatório":** a resposta é exigida na abertura. No campo só da TI, é exigida para resolver;
- **"Só a TI vê":** o colaborador não vê o campo, e a TI o preenche no chamado;
- **a condição,** opcional (requisito "Condição de um campo").

O campo Ativo SHALL sugerir, nesta ordem:
- os ativos sob a responsabilidade da pessoa;
- os do local de trabalho dela.

O campo Local SHALL sugerir o local de trabalho dela.

A lista do formulário SHALL marcar cada campo com um selo em texto:
- "Obrigatório";
- "Condicional";
- "Opcional";
- "Só a TI vê".

O título do chamado SHALL ser o primeiro item da lista, fixo, com o selo "Automático" (requisito "Título montado das respostas").

As recusas SHALL ser:
- "Escreva o rótulo.", "Use até 80 caracteres." e "Já existe um campo com esse rótulo.", no rótulo;
- "Use até 30 caracteres.", no nome no resumo;
- "Inclua ao menos 2 opções.", "Use até 12 opções.", "Escreva a opção.", "Use até 60 caracteres." e "Essa opção já existe.", nas opções;
- "Escolha os tipos da lista.", nos tipos de ativo do campo Ativo;
- "O formulário tem no máximo 20 campos.";
- "O formulário não pôde ser lido. Recarregue a página e tente de novo.", no que a tela não monta, como o campo repetido ou de um tipo que não existe.

#### Scenario: Campo só da TI
- **WHEN** o formulário da Impressora tem o "Contador de páginas" com "Só a TI vê"
- **THEN** a prévia do colaborador não mostra o campo, e o chamado aberto mostra o campo à TI, para preencher

#### Scenario: Vigésimo primeiro campo
- **WHEN** quem configura acrescenta um campo a um formulário com 20
- **THEN** a gravação é recusada com "O formulário tem no máximo 20 campos."

### Requirement: Condição de um campo

Um campo SHALL poder ter uma condição, escrita como frase: "Mostrar '<campo>' quando '<outro campo>' for '<opção>'".

A condição:
- **depende** de um campo anterior, de Escolha única, Várias opções ou Sim ou não. Nas Várias opções, "for" vale "tiver";
- **no campo que a pessoa vê,** depende só de campos que ela também vê. Ela nunca responde o que só a TI vê, e o campo nunca apareceria;
- **cresce** com "e quando…" e "ou quando…", até 5 partes. As partes com "e" se juntam antes das com "ou";
- **mostra** o que cada resposta faz: com qual opção o campo aparece, e com quais some.

A chave "Apagar a resposta se o campo sumir", ligada por padrão, SHALL decidir o que o campo guarda enquanto o formulário é preenchido:
- ligada, o campo que some perde a resposta;
- desligada, ele a mostra de novo quando volta.

A resposta de um campo escondido SHALL NOT seguir com o chamado, com a chave ligada ou desligada.

As recusas SHALL ser:
- "'<campo>' depende de '<outro>', que precisa vir antes.", ao mover os campos;
- "'<campo>' depende deste campo. Mude a condição antes.", ao remover o campo de que outro depende;
- "'<campo>' depende desta opção. Mude a condição antes.", ao remover a opção de uma condição;
- "'<campo>' aparece para a pessoa e depende de '<outro>', que só a TI vê.", na condição do campo que a pessoa vê.

#### Scenario: Só quando for Manchando
- **WHEN** "Onde as manchas aparecem?" tem a condição "quando 'O que está acontecendo?' for 'Manchando'", e a pessoa escolhe "Atolando"
- **THEN** o campo não aparece, e o chamado segue sem a resposta dele

#### Scenario: Mover para antes do campo de que depende
- **WHEN** quem configura arrasta "Onde as manchas aparecem?" para antes de "O que está acontecendo?"
- **THEN** a mudança é recusada com "'Onde as manchas aparecem?' depende de 'O que está acontecendo?', que precisa vir antes."

#### Scenario: Condição sobre um campo só da TI
- **WHEN** quem configura acrescenta à Impressora o "Número do contrato", que a pessoa vê, com a condição "quando 'Contrato de manutenção' for 'Sim'"
- **THEN** a gravação é recusada com "'Número do contrato' aparece para a pessoa e depende de 'Contrato de manutenção', que só a TI vê."

### Requirement: Título montado das respostas

O título do chamado SHALL sair das respostas, sem um campo de título.

O item fixo "Título do chamado" SHALL ter:
- **"Começar pelo nome do tipo"**, com "Ligado" ou "Desligado";
- **a resposta que dá o título:** um campo de Escolha única, de Texto curto ou de Ativo que a pessoa vê, ou nenhum. A pessoa lê o título do próprio chamado, e ele nunca mostra o que só a TI vê.

O título SHALL ser:
- o nome do tipo, quando a chave está ligada;
- seguido da resposta do campo escolhido:
  - na opção, com a primeira letra minúscula depois do nome do tipo, fora quando a primeira palavra tem outra letra maiúscula, como "VPN" e "Wi-Fi";
  - no texto, como foi escrito;
  - no ativo, o patrimônio ou, sem ele, o nome que as telas mostram (spec cadastro-de-ativos).

Sem o campo escolhido, ou sem a resposta dele, o título SHALL ser:
- a primeira resposta de texto;
- sem ela, o nome do tipo.

Todo título montado com mais de 120 caracteres SHALL ser cortado em 120, com as reticências no fim.

O item SHALL mostrar o exemplo do título, como "Das respostas: 'Impressora manchando'".

Remover o campo que dá o título SHALL ser recusado com "O título usa este campo. Escolha outro no Título do chamado.". Ligar nele o "Só a TI vê" SHALL ser recusado com "O título usa este campo. Ele não pode ser 'Só a TI vê'.".

#### Scenario: Impressora manchando
- **WHEN** a Impressora começa pelo nome do tipo e tira o título de "O que está acontecendo?", e a pessoa escolhe "Manchando"
- **THEN** o título do chamado é "Impressora manchando"

#### Scenario: Outro, pelo relato
- **WHEN** o Outro não tem campo para o título, e a pessoa escreve "O projetor da sala 3 não liga"
- **THEN** o título do chamado é "O projetor da sala 3 não liga"

#### Scenario: Título longo
- **WHEN** o tipo "Acesso e senha" começa pelo nome e tira o título de um Texto curto respondido com 190 caracteres
- **THEN** o título tem 120 caracteres e termina com as reticências

#### Scenario: Sigla no começo da opção
- **WHEN** a Rede e internet começa pelo nome e tira o título de uma opção "VPN não conecta"
- **THEN** o título é "Rede e internet VPN não conecta"

#### Scenario: Título de um campo só da TI
- **WHEN** quem configura liga "Só a TI vê" em "O que está acontecendo?", que dá o título da Impressora
- **THEN** a gravação é recusada com "O título usa este campo. Ele não pode ser 'Só a TI vê'."

### Requirement: Respostas do formulário

A abertura do chamado SHALL conferir as respostas com o formulário do tipo:
- os campos obrigatórios visíveis respondidos;
- cada resposta no tipo do campo;
- as opções do campo;
- o ativo, o local e a pessoa ativos;
- o tamanho;
- os arquivos aceitos.

Os campos escondidos pela condição SHALL ficar sem resposta. Os campos só da TI SHALL ser opcionais na abertura.

As recusas SHALL ficar no campo:
- "Responda esta pergunta.", no obrigatório;
- "Escolha uma das opções.", na opção que não é do campo;
- "Use até <n> caracteres.", no texto;
- "Use um número inteiro de 0 a 999.999.999.", no número;
- "O ativo escolhido está inativo.", "O local escolhido está inativo. Escolha um local ativo." e "A pessoa escolhida está inativa. Escolha uma pessoa ativa.", no inativo;
- "Anexe até 5 arquivos.", no anexo.

#### Scenario: Obrigatório escondido
- **WHEN** a pessoa escolhe "Atolando", e "Onde as manchas aparecem?", obrigatório, está escondido
- **THEN** a abertura não pede a resposta dele

#### Scenario: Opção inventada
- **WHEN** a API recebe "Fumaçando" em "O que está acontecendo?"
- **THEN** a abertura é recusada com "Escolha uma das opções.", nesse campo, e nada é gravado

### Requirement: Formulário que muda

Salvar o formulário SHALL valer para os chamados abertos depois. Cada chamado SHALL guardar o formulário com que foi aberto, e a TI SHALL vê-lo e preencher os campos só da TI por ele. A tela do formulário SHALL dizer quantos chamados abertos mantêm o formulário anterior, como "Vale para os próximos chamados; o 1 aberto mantém o formulário atual".

#### Scenario: Campo novo com um chamado aberto
- **WHEN** quem configura acrescenta "Modelo do toner" à Impressora, com o #1042 aberto
- **THEN** o #1042 continua sem o campo novo, e o chamado de Impressora aberto depois o tem
