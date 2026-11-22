## MODIFIED Requirements

### Requirement: Arquivos aceitos

O envio de um campo de arquivo (spec campos-personalizados) SHALL aceitar, até 25 MB:
- PDF;
- as imagens PNG, JPG, WebP e AVIF;
- os documentos, as planilhas e as apresentações do Office (DOCX, XLSX, PPTX, DOC, XLS e PPT) e do LibreOffice (ODT, ODS e ODP);
- texto (TXT) e CSV;
- ZIP.

O tipo SHALL ser conferido pelo conteúdo do arquivo, e não pelo nome nem pelo tipo que o navegador informa. A API SHALL recusar no formato único de erro:
- outro formato: 415, com "Formato não aceito. Envie PDF, imagem, documento, planilha, apresentação, texto, CSV ou ZIP.";
- mais de 25 MB: 413, com "O arquivo passa de 25 MB.";
- um arquivo vazio: 400, com "O arquivo está vazio.".

O ZIP SHALL ser aceito sem abrir o conteúdo. Um documento antigo do Office SHALL ser reconhecido pelo conteúdo, e outro arquivo no mesmo formato de contêiner, como um instalador, SHALL ser recusado.

O arquivo SHALL ser guardado como chegou, sem regravação, com o tipo conferido, o tamanho e o nome original, sem o caminho, com até 200 caracteres e com a extensão do tipo conferido: um nome com outra extensão SHALL ganhar a do tipo. Ele SHALL ficar sem miniaturas, fora a imagem anexada a um chamado ou a uma mensagem do chat, que ganha a dela (requisito "Miniatura do anexo de imagem").

#### Scenario: Texto com nome de script
- **WHEN** um arquivo de texto chamado "limpeza.ps1" é enviado num campo de arquivo
- **THEN** ele é aceito como texto, e o nome guardado é "limpeza.ps1.txt"

#### Scenario: Nota fiscal em PDF
- **WHEN** um PDF de 240 KB é enviado no campo de arquivo "PDF da nota fiscal"
- **THEN** ele é aceito e guardado com o nome, o tipo PDF e o tamanho

#### Scenario: Programa com nome de PDF
- **WHEN** um executável com o nome "nota.pdf" é enviado num campo de arquivo
- **THEN** a API recusa com "Formato não aceito. Envie PDF, imagem, documento, planilha, apresentação, texto, CSV ou ZIP.", e nada é gravado

#### Scenario: Arquivo grande demais
- **WHEN** um ZIP de 30 MB é enviado num campo de arquivo
- **THEN** a API recusa com "O arquivo passa de 25 MB.", e nada é gravado

#### Scenario: Planilha do LibreOffice
- **WHEN** uma planilha ODS é enviada num campo de arquivo
- **THEN** ela é aceita e guardada como planilha do LibreOffice

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

Os anexos da mensagem citada na abertura pelo chat (spec chamados, "Conversa do chamado") SHALL ser copiados para o chamado na mesma transação da abertura, com a miniatura, e entregues como os de uma mensagem dele. O anexo da conversa SHALL continuar dela.

A miniatura do anexo de imagem (requisito "Miniatura do anexo de imagem") SHALL ser entregue como o anexo, à mesma gente.

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

A entrega SHALL seguir a conversa dona do anexo (requisito "Entrega dos arquivos"): a quem participa dela agora. O anexo sem dono SHALL ir só a quem o enviou. A miniatura do anexo de imagem (requisito "Miniatura do anexo de imagem") SHALL ser entregue como o anexo, à mesma gente.

#### Scenario: Anexo na equipe
- **WHEN** Paulo Nunes manda na Equipe Financeiro a foto de uma folha manchada
- **THEN** quem participa da equipe baixa a foto, e quem não participa recebe que o arquivo não existe

#### Scenario: Quem saiu da equipe
- **WHEN** Tatiana Ramos sai do grupo Financeiro e pede uma foto da Equipe Financeiro
- **THEN** a API responde que o arquivo não existe

### Requirement: Miniatura do anexo de imagem

O anexo PNG, JPG, WebP ou AVIF de um chamado ou de uma mensagem do chat (requisitos "Anexos dos chamados" e "Anexos do chat") SHALL ganhar, no envio, a miniatura de 512 px, com as regras de "Miniaturas", regravada sem os metadados e na orientação certa, como em "Imagem regravada sem metadados". O arquivo SHALL continuar guardado como chegou e ser entregue para baixar, como os outros anexos.

A miniatura SHALL ser entregue para ser exibida na página, com a largura e a altura dela na resposta, para a tela reservar o lugar antes de ela chegar, e SHALL sair com o anexo, na remoção. A imagem que o servidor não consegue ler, a que passa de 10 MB e a de mais de 50 megapixels SHALL ficar sem a miniatura, como um documento, e o anexo SHALL entrar assim mesmo. Os anexos guardados sem a miniatura, como os de antes dela, SHALL ficar como estão.

#### Scenario: Print anexado
- **WHEN** Fernanda Rocha anexa no chat um print PNG de 1920 × 1080 px
- **THEN** a miniatura tem 512 × 288 px, e o print baixa como foi enviado

#### Scenario: Foto com a localização
- **WHEN** Paulo Nunes anexa na Equipe Financeiro uma foto de celular com a localização nos metadados
- **THEN** a miniatura entregue não tem a localização nem nenhum outro metadado, e o arquivo baixado é o que ele enviou
