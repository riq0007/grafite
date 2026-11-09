## Purpose

Estabelecer a base técnica do Grafite: estrutura do repositório, ambiente de desenvolvimento, configuração validada, saúde dos serviços, contrato da API, proteção contra segredos e verificação automática de qualidade.

## ADDED Requirements

### Requirement: Estrutura do repositório

O repositório SHALL ter três aplicações e quatro pacotes compartilhados:
- **aplicações:** web, API e coletor;
- **pacotes:** domínio, design system, banco e cliente da API.

Cada aplicação e pacote SHALL poder ser verificado (lint, tipos e testes) de forma independente e também todos de uma vez.

#### Scenario: Verificação completa
- **WHEN** o desenvolvedor executa a verificação do repositório inteiro
- **THEN** lint, checagem de tipos e testes rodam em todas as aplicações e pacotes, e o resultado indica qual deles falhou

### Requirement: Ambiente de desenvolvimento com um comando

Um único comando SHALL subir o ambiente de desenvolvimento: banco de dados, API e web, com recarga automática ao editar o código.

#### Scenario: Primeira execução
- **WHEN** o desenvolvedor executa o comando de desenvolvimento com o Docker ativo
- **THEN** o banco sobe, as migrations são aplicadas, e a API e a web ficam acessíveis no navegador

#### Scenario: Docker inativo
- **WHEN** o comando de desenvolvimento é executado com o Docker fechado
- **THEN** o comando para e informa que o Docker precisa estar em execução

### Requirement: Configuração validada na partida

A API e o coletor SHALL validar a configuração ao iniciar. Se faltar uma variável obrigatória ou algum valor for inválido, o processo SHALL recusar iniciar e SHALL informar qual variável falhou e por quê. Nenhum valor sensível SHALL ter padrão embutido no código.

#### Scenario: Variável obrigatória ausente
- **WHEN** a API é iniciada sem a variável de conexão com o banco
- **THEN** o processo encerra com uma mensagem que nomeia a variável ausente

#### Scenario: Segredo sem padrão
- **WHEN** alguém procura no código um valor padrão para uma chave ou senha
- **THEN** não encontra nenhum; o valor só vem da configuração do ambiente

### Requirement: Saúde dos serviços

A API e o coletor SHALL expor um endpoint de saúde que informa estado e versão. O da API SHALL informar também se o banco responde.

#### Scenario: Banco fora do ar
- **WHEN** o banco está indisponível e o endpoint de saúde da API é consultado
- **THEN** a resposta indica que o banco não responde, com código de erro, sem expor credenciais nem detalhes internos

### Requirement: Contrato da API gerado e verificado

A descrição OpenAPI da API SHALL ser gerada a partir das mesmas definições que validam as requisições. O cliente tipado usado pela web e pelo coletor SHALL ser gerado a partir dessa descrição. A verificação automática SHALL falhar quando a API mudar sem o cliente ter sido regenerado.

#### Scenario: Cliente desatualizado
- **WHEN** uma rota da API muda de formato e o cliente não é regenerado
- **THEN** a verificação automática falha indicando a divergência

### Requirement: Proteção contra segredos

Um commit que contenha um segredo (chave, senha, token ou string de conexão com credencial) SHALL ser bloqueado localmente. A mesma verificação SHALL rodar no CI. Os arquivos de ambiente reais SHALL ser ignorados pelo controle de versão.

#### Scenario: Commit com chave
- **WHEN** o desenvolvedor tenta fazer commit de um arquivo que contém uma chave de API
- **THEN** o commit é recusado e a mensagem aponta o arquivo e a linha

### Requirement: Qualidade verificada antes do commit e em cada PR

Lint e formatação SHALL ser verificados antes de cada commit. O CI SHALL verificar em cada PR:
- lint e checagem de tipos;
- testes unitários;
- testes de integração com banco real;
- testes de ponta a ponta de fumaça;
- busca de segredos.

Todos os arquivos de texto do repositório SHALL usar fim de linha LF.

#### Scenario: PR com teste falhando
- **WHEN** um PR contém um teste de integração que falha
- **THEN** o CI marca o PR como reprovado e indica o teste

#### Scenario: Fim de linha no Windows
- **WHEN** um arquivo é salvo no Windows e adicionado ao repositório
- **THEN** ele é gravado com fim de linha LF

### Requirement: Imagens de contêiner para o produto

A API (com a web compilada) e o coletor SHALL poder ser empacotados como imagens de contêiner, mesmo que o servidor interno use serviços do Windows.

#### Scenario: Construção das imagens
- **WHEN** o desenvolvedor executa a construção das imagens
- **THEN** são geradas as imagens da aplicação e do coletor, e cada uma responde ao seu endpoint de saúde ao ser iniciada
