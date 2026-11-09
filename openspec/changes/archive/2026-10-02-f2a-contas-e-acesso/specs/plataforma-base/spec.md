## MODIFIED Requirements

### Requirement: Ambiente de desenvolvimento com um comando

Um único comando SHALL subir o ambiente de desenvolvimento: banco de dados, API e web, com recarga automática ao editar o código. Na primeira execução com o banco vazio, o comando SHALL criar a organização de desenvolvimento, ligada aos endereços locais. Ela vem com uma conta de administração que não exige os dois passos, e a senha temporária dessa conta aparece no terminal uma vez.

#### Scenario: Primeira execução
- **WHEN** o desenvolvedor executa o comando de desenvolvimento com o Docker ativo
- **THEN** o banco sobe, as migrations são aplicadas, e a API e a web ficam acessíveis no navegador

#### Scenario: Organização de desenvolvimento
- **WHEN** o comando roda pela primeira vez com o banco vazio
- **THEN** a organização de desenvolvimento é criada, e o terminal mostra o usuário e a senha temporária da conta de administração

#### Scenario: Execuções seguintes
- **WHEN** o comando roda de novo com o mesmo banco
- **THEN** a organização não é criada de novo, e nenhuma senha aparece

#### Scenario: Docker inativo
- **WHEN** o comando de desenvolvimento é executado com o Docker fechado
- **THEN** o comando para e informa que o Docker precisa estar em execução

## ADDED Requirements

### Requirement: Erros da API em formato único

Toda resposta de erro da API SHALL seguir um formato único (problem+json), com:
- o tipo do problema;
- o título e o detalhe em pt-BR;
- o status HTTP;
- o código de rastreio da requisição.

Um erro de validação SHALL trazer a mensagem de cada campo em pt-BR. Um erro inesperado SHALL responder só uma mensagem genérica, com o código de rastreio e sem detalhe interno. O código de rastreio SHALL ir também num cabeçalho de toda resposta e no log da requisição.

#### Scenario: Campo obrigatório ausente
- **WHEN** a entrada é enviada sem o usuário
- **THEN** a API responde 400 no formato único, com a mensagem "Informe o usuário." no campo do usuário

#### Scenario: Erro inesperado
- **WHEN** uma rota falha por um erro não previsto
- **THEN** a resposta é 500, com "Erro interno do servidor." e o código de rastreio, e o log guarda o erro com o mesmo código

#### Scenario: Rota inexistente
- **WHEN** a web chama uma rota que a API não tem
- **THEN** a resposta é 404 no formato único

### Requirement: Proteção contra requisições de outros sites

Uma requisição da API que altera dados SHALL ser recusada com 403, sem alterar nada, quando:
- vem de outro site, conforme a origem que o navegador informa;
- tem sessão e não traz o token dela no cabeçalho próprio.

A entrada, que ainda não tem sessão, SHALL exigir a mesma origem.

#### Scenario: Escrita vinda de outro site
- **WHEN** uma página de outro site envia uma escrita à API com o cookie da sessão
- **THEN** a API recusa com 403, e nada muda

#### Scenario: Escrita sem o token da sessão
- **WHEN** uma escrita com sessão chega sem o token no cabeçalho
- **THEN** a API recusa com 403, e nada muda

### Requirement: Limite de requisições

A API SHALL limitar as requisições de cada endereço IP:
- **em geral:** 600 por minuto;
- **na entrada e no código do segundo passo:** 20 por minuto.

Passado o limite, a API SHALL responder 429, com o tempo de espera em pt-BR, até a janela passar.

#### Scenario: Entradas demais do mesmo IP
- **WHEN** o mesmo IP envia a 21ª entrada dentro de um minuto
- **THEN** a API responde 429, com "Muitas requisições. Tente de novo em N s."
