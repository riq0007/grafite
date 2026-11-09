## MODIFIED Requirements

### Requirement: Pacote da versão para Linux

Cada versão SHALL ser publicada pelo CI, na mesma release do pacote para Windows, também como um pacote para Linux, com:
- as imagens da versão: a aplicação, o coletor, o comando de operação, o proxy e o PostgreSQL 18;
- o lançador do comando de operação e o roteiro de instalação;
- o runbook.

O pacote SHALL ter o hash SHA-256 publicado junto. A versão do pacote SHALL ser a mesma que a saúde da API informa. O servidor SHALL NOT compilar nada nem baixar imagens ou dependências para instalar ou atualizar: as imagens SHALL vir do pacote.

A release SHALL publicar também, ao lado do pacote e do hash, uma cópia do roteiro de instalação igual à de dentro do pacote, para quem opera não precisar tirá-lo do pacote. O roteiro SHALL conferir o pacote pelo hash publicado antes de usar qualquer coisa dele. Sem o pacote nos argumentos, o roteiro SHALL usar o único pacote para Linux da pasta dele. Se a pasta não tiver nenhum pacote, ou tiver mais de um, o roteiro SHALL parar antes de mudar qualquer coisa e dizer o que fazer. As mensagens do roteiro SHALL mandar rodá-lo pelo `bash`, porque o arquivo baixado da release vem sem a permissão de execução.

#### Scenario: Pacote alterado
- **WHEN** o comando de operação recebe um pacote para Linux cujo hash não confere
- **THEN** ele recusa o pacote antes de mudar qualquer coisa, e diz que o pacote não confere

#### Scenario: Servidor sem internet
- **WHEN** a instalação roda num servidor Linux sem acesso à internet, com o pacote e o hash copiados para ele
- **THEN** ela termina sem baixar nada

#### Scenario: Roteiro baixado da release
- **WHEN** quem opera baixa da release, para uma pasta do servidor, o pacote, o hash e o roteiro de instalação, e roda `sudo bash instalar.sh` nessa pasta, sem argumentos
- **THEN** o roteiro acha o pacote da pasta, confere o hash e segue a instalação

#### Scenario: Pasta com mais de um pacote
- **WHEN** o roteiro roda sem argumentos numa pasta com dois pacotes para Linux
- **THEN** ele para antes de mudar qualquer coisa e diz para deixar na pasta só o pacote da versão que vai instalar, ou para passar o pacote nos argumentos

#### Scenario: Pasta sem pacote
- **WHEN** o roteiro roda sem argumentos numa pasta sem nenhum pacote para Linux
- **THEN** ele para antes de mudar qualquer coisa e diz para baixar o pacote e o hash para a pasta do roteiro
