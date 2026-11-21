## MODIFIED Requirements

### Requirement: Anexos dos chamados

Os anexos das mensagens, das notas e do campo Anexo do formulário dos chamados (spec chamados) SHALL ser enviados antes da gravação que os usa, um arquivo por envio, com as regras de "Arquivos aceitos". O envio SHALL pedir `chamados.atender` em algum local ou `chat.usar`: o anexo de quem usa o chat só serve à mensagem dela num chamado de que participa (spec chamados, "Leitura do chamado pela pessoa") ou numa conversa (requisito "Anexos do chat").

Até a gravação, o anexo SHALL ficar sem dono, com a conta que o enviou. A gravação da mensagem, da nota, da abertura ou do campo:
- SHALL aceitar só os anexos enviados pela mesma conta, ainda sem dono e não removidos;
- SHALL torná-los do chamado, na mesma transação, e nenhum outro registro SHALL usá-los depois;
- SHALL recusar o anexo de outra conta, o já usado e o removido com "O anexo não foi encontrado. Envie o arquivo de novo.", sem gravar nada.

O anexo que ficar sem dono por 24 h SHALL ser removido na manutenção diária (requisito "Remoção dos arquivos"). O anexo que sai de um campo só da TI, trocado ou tirado, SHALL ser removido na hora, como o arquivo trocado de um campo do ativo.

A entrega SHALL seguir o chamado dono do anexo (requisito "Entrega dos arquivos"):
- o anexo de uma mensagem e o de um campo que a pessoa vê, a quem vê o chamado e a quem participa dele;
- o anexo de uma nota interna e o de um campo só da TI, só a quem vê o chamado com `chamados.ver`, e nunca a quem só participa dele;
- o anexo sem dono, só a quem o enviou.

Os anexos da mensagem citada na abertura pelo chat (spec chamados, "Conversa do chamado") SHALL ser copiados para o chamado na mesma transação da abertura, e entregues como os de uma mensagem dele. O anexo da conversa SHALL continuar dela.

#### Scenario: Anexo de outra conta
- **WHEN** Bruno grava uma mensagem com o anexo que Ana enviou e ainda não usou
- **THEN** a gravação é recusada com "O anexo não foi encontrado. Envie o arquivo de novo.", e nada é gravado

#### Scenario: Anexo usado duas vezes
- **WHEN** Ana grava uma mensagem no #1042 com um anexo, e depois tenta usar o mesmo anexo numa nota do #1041
- **THEN** a nota é recusada com "O anexo não foi encontrado. Envie o arquivo de novo.", e o anexo continua só do #1042

#### Scenario: Anexo esquecido
- **WHEN** Ana envia um anexo e fecha a gaveta sem abrir o chamado
- **THEN** a manutenção diária, passadas 24 h, remove o anexo

#### Scenario: Anexo de uma nota
- **WHEN** Carla, com `chamados.ver` em Jundiaí, pede o anexo de uma nota interna do #1042, de Jundiaí
- **THEN** a API entrega o anexo, como entrega a nota

#### Scenario: Anexo trocado num campo da TI
- **WHEN** Ana troca o arquivo de um campo só da TI do #1042
- **THEN** o arquivo anterior é removido na mesma gravação, e o campo fica só com o novo

#### Scenario: Print da pessoa
- **WHEN** Fernanda Rocha, com `chat.usar`, envia um print e responde o #1045 com ele
- **THEN** o anexo passa a ser do #1045, e Bruno e Fernanda o baixam pelo chamado

#### Scenario: Anexo da mensagem citada
- **WHEN** Fernanda Rocha transforma no #1045 uma mensagem de Paulo Nunes com uma foto, e Bruno não é da Equipe Financeiro
- **THEN** Bruno baixa a foto pelo #1045, e ela continua na conversa da equipe

## ADDED Requirements

### Requirement: Anexos do chat

Os anexos das mensagens do chat (spec chat, "Mensagem") SHALL ser enviados antes da mensagem, um arquivo por envio, com as regras de "Arquivos aceitos". O envio SHALL pedir `chat.usar`.

Até a mensagem, o anexo SHALL ficar sem dono, com a conta que o enviou. A mensagem:
- SHALL aceitar só os anexos enviados pela mesma conta, ainda sem dono e não removidos;
- SHALL torná-los da conversa, na mesma transação, e nenhum outro registro SHALL usá-los depois, fora a cópia para o chamado aberto da mensagem (requisito "Anexos dos chamados");
- SHALL recusar o anexo de outra conta, o já usado e o removido com "O anexo não foi encontrado. Envie o arquivo de novo.", sem gravar nada.

O anexo que ficar sem dono por 24 h SHALL ser removido na manutenção diária (requisito "Remoção dos arquivos").

A entrega SHALL seguir a conversa dona do anexo (requisito "Entrega dos arquivos"): a quem participa dela agora. O anexo sem dono SHALL ir só a quem o enviou.

#### Scenario: Anexo na equipe
- **WHEN** Paulo Nunes manda na Equipe Financeiro a foto de uma folha manchada
- **THEN** quem participa da equipe baixa a foto, e quem não participa recebe que o arquivo não existe

#### Scenario: Quem saiu da equipe
- **WHEN** Tatiana Ramos sai do grupo Financeiro e pede uma foto da Equipe Financeiro
- **THEN** a API responde que o arquivo não existe
