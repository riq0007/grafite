## Purpose

Guardar os arquivos das organizações por uma interface de armazenamento trocável, tratar as imagens enviadas no servidor e entregá-las com segurança só a quem pode ver o registro dono de cada uma.

## ADDED Requirements

### Requirement: Armazenamento por uma interface

Os arquivos SHALL ser gravados, lidos e apagados por uma interface de armazenamento, que não muda para quem a usa quando a implementação muda. A primeira implementação SHALL gravar em disco, na pasta da configuração, com os arquivos de cada organização separados dos das outras.

O banco SHALL guardar o registro de cada arquivo:
- o tipo e o tamanho;
- as dimensões, quando é uma imagem;
- quem enviou e quando;
- quando foi removido e quando foi apagado do armazenamento.

Um envio que falha no meio SHALL NOT deixar registro apontando para um arquivo que não existe.

#### Scenario: Arquivo de cada organização
- **WHEN** uma pessoa da organização A recebe uma foto
- **THEN** a foto fica gravada separada dos arquivos da organização B

#### Scenario: Falha na gravação do registro
- **WHEN** a foto é gravada no armazenamento e a transação que a liga à pessoa falha
- **THEN** a pessoa continua com a foto anterior, e o que foi gravado é apagado do armazenamento

### Requirement: Imagens aceitas

O envio de imagens SHALL aceitar PNG, JPG, WebP, AVIF e SVG de até 10 MB. O tipo SHALL ser conferido pelo conteúdo do arquivo, e não pelo nome nem pelo tipo que o navegador informa. A API SHALL recusar no formato único de erro:
- outro formato: 415, com "Formato não aceito. Envie uma imagem PNG, JPG, WebP, AVIF ou SVG.";
- mais de 10 MB: 413, com "A imagem passa de 10 MB.";
- mais de 50 megapixels: 400, com "A imagem é grande demais. Envie uma de até 50 megapixels.";
- um arquivo que não se consegue ler: 400, com "Não foi possível ler a imagem. O arquivo pode estar corrompido.".

#### Scenario: Imagem com o nome trocado
- **WHEN** um PNG com o nome "foto.jpg" é enviado
- **THEN** ele é aceito e tratado como PNG

#### Scenario: Programa com nome de imagem
- **WHEN** um executável com o nome "foto.png" é enviado
- **THEN** a API recusa com "Formato não aceito. Envie uma imagem PNG, JPG, WebP, AVIF ou SVG.", e nada é gravado

#### Scenario: GIF
- **WHEN** um GIF é enviado
- **THEN** a API recusa com 415, e nada é gravado

#### Scenario: Imagem grande demais
- **WHEN** um JPG de 12 MB é enviado
- **THEN** a API recusa com "A imagem passa de 10 MB.", e nada é gravado

#### Scenario: Arquivo corrompido
- **WHEN** um arquivo que começa como PNG e para no meio é enviado
- **THEN** a API recusa com "Não foi possível ler a imagem. O arquivo pode estar corrompido."

### Requirement: SVG sanitizado

Um SVG SHALL ser sanitizado no servidor antes de ser gravado. Saem:
- os scripts e os atributos de evento;
- os objetos estrangeiros, como HTML dentro do SVG;
- as referências a arquivos e endereços externos.

O desenho que sobra SHALL continuar igual. Um SVG que fica sem desenho depois da sanitização SHALL ser recusado como um arquivo que não se consegue ler.

#### Scenario: SVG com script
- **WHEN** um SVG com um `<script>` e um `onload` é enviado
- **THEN** a imagem gravada mantém o desenho, sem o script e sem o `onload`

#### Scenario: SVG com imagem externa
- **WHEN** um SVG que referencia uma imagem de outro endereço é enviado
- **THEN** a imagem gravada não tem a referência, e o servidor não busca o endereço

### Requirement: Imagem regravada sem metadados

Toda imagem SHALL ser regravada pelo servidor antes de ser guardada. A versão regravada:
- não traz metadados, como a localização, o aparelho e o autor;
- já vem na orientação certa, girada conforme o aparelho que a tirou;
- tem no máximo 2048 px no maior lado, sem ampliar a menor.

#### Scenario: Foto com localização
- **WHEN** uma foto de celular com a localização nos metadados é enviada
- **THEN** a imagem entregue depois não tem a localização nem nenhum outro metadado

#### Scenario: Foto tirada de lado
- **WHEN** uma foto marcada pelo celular como girada 90° é enviada
- **THEN** a imagem entregue aparece de pé

### Requirement: Miniaturas

Para cada imagem, o servidor SHALL gerar as miniaturas de 64, 128, 256 e 512 px. Cada miniatura:
- cabe num quadrado do tamanho dela;
- mantém a proporção da imagem;
- não amplia uma imagem menor que o quadrado.

Uma imagem SVG SHALL ganhar miniaturas desenhadas a partir do SVG sanitizado.

#### Scenario: Imagem larga
- **WHEN** uma imagem de 1000 × 500 px é enviada
- **THEN** a miniatura de 512 px tem 512 × 256 px, e a de 64 px tem 64 × 32 px

#### Scenario: Imagem pequena
- **WHEN** uma imagem de 100 × 100 px é enviada
- **THEN** as miniaturas de 128, 256 e 512 px têm 100 × 100 px

### Requirement: Entrega dos arquivos

A API SHALL entregar cada arquivo só a quem pode ver o registro dono dele, como a pessoa da foto, e recusar os outros como recusa aquele registro. A entrega SHALL:
- informar o tipo certo e proibir o navegador de adivinhar outro;
- entregar a imagem para ser exibida na página;
- deixar o navegador guardar a imagem, porque uma imagem nova ganha um endereço novo;
- entregar o SVG com uma política que bloqueia scripts e conteúdo externo, mesmo aberto direto no navegador.

O endereço de um arquivo removido ou de outra organização SHALL responder 404, com "Imagem não encontrada.".

#### Scenario: Foto de uma pessoa fora do escopo
- **WHEN** Bruno, que vê pessoas só em "Jundiaí", pede a foto de uma pessoa de outra unidade
- **THEN** a API responde 403, e a foto não é entregue

#### Scenario: SVG aberto direto
- **WHEN** o endereço de um SVG é aberto direto numa aba do navegador
- **THEN** o desenho aparece, e nenhum script roda

#### Scenario: Foto de outra organização
- **WHEN** o endereço da foto de uma pessoa da organização A é pedido pelo endereço da organização B
- **THEN** a API responde 404, com "Imagem não encontrada."

### Requirement: Remoção dos arquivos

Um arquivo trocado ou removido SHALL deixar de ser entregue na hora. O conteúdo dele SHALL ser apagado do armazenamento na manutenção diária seguinte, e o registro SHALL ficar com o momento da remoção e o do apagamento, sem o conteúdo.

#### Scenario: Foto trocada
- **WHEN** a foto de João é trocada
- **THEN** o endereço da foto antiga passa a responder 404, e a ficha mostra a nova

#### Scenario: Depois da manutenção
- **WHEN** a manutenção diária roda depois da troca da foto de João
- **THEN** a foto antiga não existe mais no armazenamento, e o registro dela diz quando foi removida e quando foi apagada
