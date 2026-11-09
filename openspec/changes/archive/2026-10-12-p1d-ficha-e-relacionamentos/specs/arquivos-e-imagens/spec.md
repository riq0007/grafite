## ADDED Requirements

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

O arquivo SHALL ser guardado como chegou, sem regravação nem miniaturas, com o tipo conferido, o tamanho e o nome original, sem o caminho, com até 200 caracteres e com a extensão do tipo conferido: um nome com outra extensão SHALL ganhar a do tipo.

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

## MODIFIED Requirements

### Requirement: Imagem regravada sem metadados

Toda imagem enviada como imagem (a foto da pessoa, a imagem do modelo, a imagem do ativo e a de um campo de imagem) SHALL ser regravada pelo servidor antes de ser guardada. A versão regravada:
- não traz metadados, como a localização, o aparelho e o autor;
- já vem na orientação certa, girada conforme o aparelho que a tirou;
- tem no máximo 2048 px no maior lado, sem ampliar a menor.

Uma imagem enviada num campo de arquivo SHALL ser guardada como chegou, como um documento (requisito Arquivos aceitos).

#### Scenario: Foto com localização
- **WHEN** uma foto de celular com a localização nos metadados é enviada
- **THEN** a imagem entregue depois não tem a localização nem nenhum outro metadado

#### Scenario: Foto tirada de lado
- **WHEN** uma foto marcada pelo celular como girada 90° é enviada
- **THEN** a imagem entregue aparece de pé

#### Scenario: Imagem num campo de arquivo
- **WHEN** um JPG escaneado é enviado num campo de arquivo
- **THEN** o arquivo é guardado como chegou, e é entregue para baixar, como os documentos

### Requirement: Entrega dos arquivos

A API SHALL entregar cada arquivo só a quem pode ver o registro dono dele, como a pessoa da foto ou o ativo da imagem, e, num campo restrito, só a quem vê os restritos. Ela SHALL recusar os outros como recusa aquele registro. A entrega SHALL:
- informar o tipo certo e proibir o navegador de adivinhar outro;
- entregar a imagem para ser exibida na página;
- entregar o arquivo de um campo de arquivo sempre para baixar, com o nome original, e nunca para ser aberto na página;
- deixar o navegador guardar a imagem, porque uma imagem nova ganha um endereço novo;
- entregar o SVG com uma política que bloqueia scripts e conteúdo externo, mesmo aberto direto no navegador.

O endereço de um arquivo removido ou de outra organização SHALL responder 404, com "Imagem não encontrada." numa imagem e "Arquivo não encontrado." num arquivo de um campo de arquivo.

#### Scenario: Foto de uma pessoa fora do escopo
- **WHEN** Bruno, que vê pessoas só em "Jundiaí", pede a foto de uma pessoa de outra unidade
- **THEN** a API responde 403, e a foto não é entregue

#### Scenario: SVG aberto direto
- **WHEN** o endereço de um SVG é aberto direto numa aba do navegador
- **THEN** o desenho aparece, e nenhum script roda

#### Scenario: Foto de outra organização
- **WHEN** o endereço da foto de uma pessoa da organização A é pedido pelo endereço da organização B
- **THEN** a API responde 404, com "Imagem não encontrada."

#### Scenario: PDF sempre baixado
- **WHEN** alguém abre o endereço da nota fiscal em PDF de um notebook
- **THEN** o navegador baixa o arquivo com o nome original, sem abri-lo na página
