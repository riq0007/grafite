## MODIFIED Requirements

### Requirement: Imagens de contêiner para o produto

A API (com a web compilada) e o coletor SHALL ser empacotados como imagens de contêiner, que o servidor Linux roda (spec operacao-em-linux), ao lado dos serviços do servidor Windows. A imagem da aplicação SHALL:
- trazer tudo de que a API precisa para rodar, inclusive o tratamento de imagens e as ferramentas do PostgreSQL 18 que o backup usa;
- guardar os arquivos num volume, fora da imagem.

O comando de operação e o proxy, com o módulo do DNS da Cloudflare, SHALL ter as próprias imagens. O CI SHALL construir as imagens de cada versão e conferi-las pela instalação de teste no Linux.

#### Scenario: Construção das imagens
- **WHEN** o desenvolvedor executa a construção das imagens
- **THEN** são geradas as imagens da aplicação, do coletor, do comando de operação e do proxy, e a aplicação e o coletor respondem ao seu endpoint de saúde ao serem iniciados

#### Scenario: Foto enviada ao contêiner
- **WHEN** a aplicação roda no contêiner e recebe uma foto
- **THEN** a foto é tratada e gravada no volume dos arquivos, e continua lá depois que o contêiner é recriado a partir de uma imagem nova

#### Scenario: Backup no contêiner
- **WHEN** a aplicação roda no contêiner da produção, e chega o horário do backup
- **THEN** o backup usa as ferramentas do PostgreSQL 18 da própria imagem, sem nada instalado no servidor
