## ADDED Requirements

### Requirement: Anexos dos chamados

Os anexos das mensagens, das notas e do campo Anexo do formulário dos chamados (spec chamados) SHALL ser enviados antes da gravação que os usa, um arquivo por envio, com as regras de "Arquivos aceitos". O envio SHALL pedir `chamados.atender` em algum local.

Até a gravação, o anexo SHALL ficar sem dono, com a conta que o enviou. A gravação da mensagem, da nota, da abertura ou do campo:
- SHALL aceitar só os anexos enviados pela mesma conta, ainda sem dono e não removidos;
- SHALL torná-los do chamado, na mesma transação, e nenhum outro registro SHALL usá-los depois;
- SHALL recusar o anexo de outra conta, o já usado e o removido com "O anexo não foi encontrado. Envie o arquivo de novo.", sem gravar nada.

O anexo que ficar sem dono por 24 h SHALL ser removido na manutenção diária (requisito "Remoção dos arquivos"). O anexo que sai de um campo só da TI, trocado ou tirado, SHALL ser removido na hora, como o arquivo trocado de um campo do ativo.

A entrega SHALL seguir o chamado dono do anexo (requisito "Entrega dos arquivos"):
- o anexo de uma mensagem e o de um campo que a pessoa vê, a quem vê o chamado;
- o anexo de uma nota interna e o de um campo só da TI, só a quem vê o chamado com `chamados.ver`, e nunca pela leitura que a pessoa terá do próprio chamado, no chat e na aba;
- o anexo sem dono, só a quem o enviou.

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
