## MODIFIED Requirements

### Requirement: Comando de operação no Linux

O servidor Linux SHALL ter o comando `grafite`, que roda o comando de operação da versão da produção. Ele SHALL oferecer os mesmos comandos e pedir as mesmas confirmações do servidor Windows (spec operacao-servicos):
- `instalar`, `atualizar`, `voltar` e `preparar-teste`;
- `backup` e `restaurar`;
- `proxy`, `certificado`, `enderecos` e `servicos`;
- `cofre` e `email`;
- `organizacao` e `conta`;
- `painel` (spec painel-da-operacao).

O comando SHALL exigir o root e SHALL recusar rodar sem o Docker. Os comandos `organizacao` e `conta` SHALL rodar o comando da API da versão do ambiente, com a configuração dele.

O `painel` SHALL publicar a porta dele só no 127.0.0.1 do servidor e abrir o navegador da sessão gráfica de quem chamou o `sudo`. Sem uma sessão gráfica, ele SHALL dizer que o painel precisa de um servidor com interface e que os comandos continuam valendo.

#### Scenario: Sem o root
- **WHEN** uma conta sem o root roda `grafite servicos estado`
- **THEN** o comando recusa e diz para rodar com o `sudo`

#### Scenario: Conta criada na produção
- **WHEN** quem opera roda `grafite conta criar --ambiente producao` com as opções da conta
- **THEN** a conta é criada pelo comando da API da versão da produção, com a configuração da produção

#### Scenario: Painel no Linux com interface
- **WHEN** quem opera, numa sessão do Ubuntu Desktop, roda `sudo grafite painel`
- **THEN** o navegador dessa sessão abre o painel, servido só no 127.0.0.1 do servidor

#### Scenario: Painel sem interface gráfica
- **WHEN** quem opera roda `sudo grafite painel` por um SSH, sem sessão gráfica
- **THEN** o comando diz que o painel precisa de um servidor com interface e que os comandos continuam valendo, sem abrir porta nenhuma
