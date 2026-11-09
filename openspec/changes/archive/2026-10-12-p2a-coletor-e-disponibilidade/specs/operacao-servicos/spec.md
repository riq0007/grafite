## MODIFIED Requirements

### Requirement: Serviços do Windows

No servidor interno, SHALL rodar como serviços do Windows:
- o app de produção (API, web compilada e tarefas agendadas);
- o app de teste;
- o coletor, só na produção, ligado à organização que opera o servidor (spec coletor-local);
- o proxy (spec https-interno);
- as duas instâncias do PostgreSQL.

Cada serviço SHALL iniciar com o Windows e reiniciar sozinho depois de uma falha. Os logs SHALL ficar numa pasta do ambiente, com rotação por tamanho. Os apps e o coletor SHALL atender só no próprio servidor, e a rede chega aos apps só pelo proxy. A fila em disco do coletor SHALL ficar na pasta da produção, legível só para os administradores do servidor e para a conta dos serviços.

#### Scenario: Falha do app
- **WHEN** o processo do app de produção termina com erro
- **THEN** o Windows o inicia de novo, e a falha fica no log do ambiente

#### Scenario: App fora do proxy
- **WHEN** outra máquina da rede tenta abrir a porta do app de produção direto
- **THEN** a conexão é recusada, e só o endereço do proxy responde

#### Scenario: Coletor da produção
- **WHEN** o serviço do coletor da produção inicia, com a faixa da rede do servidor cadastrada na tela
- **THEN** ele busca a configuração na API da produção pelo endereço da organização que opera o servidor e pinga os ativos dela

### Requirement: Instalação do zero

O comando de operação SHALL instalar o Grafite num servidor Windows com o Node 24 e o PostgreSQL 18 da produção já instalados. A instalação SHALL:
- conferir os pré-requisitos e dizer o que falta;
- criar a instância do PostgreSQL do teste;
- criar os papéis e os bancos dos dois ambientes, com senhas geradas, gravadas só na configuração de cada ambiente;
- aplicar as migrations e criar a primeira organização, com a senha temporária da primeira conta mostrada uma vez;
- ligar o coletor da produção a essa organização, com o nome "Servidor", sem faixas, e com o token gerado na configuração do coletor, que nunca aparece na tela;
- registrar os serviços, configurar o proxy e as regras do firewall;
- iniciar tudo e conferir a saúde de cada app.

A configuração de cada ambiente SHALL ficar legível só para os administradores do servidor e para a conta dos serviços. O fim da instalação SHALL dizer que o coletor só coleta depois que as faixas de rede dele forem cadastradas na tela dos coletores.

#### Scenario: Pré-requisito ausente
- **WHEN** a instalação roda num servidor sem o PostgreSQL 18
- **THEN** ela para antes de criar qualquer coisa e diz que o PostgreSQL 18 precisa estar instalado

#### Scenario: Porta do proxy ocupada
- **WHEN** outro programa, como o IIS, escuta na porta 80 ou na 443
- **THEN** a instalação para antes de criar qualquer coisa e diz qual porta liberar

#### Scenario: Instalação completa
- **WHEN** a instalação termina num servidor com os pré-requisitos
- **THEN** a produção e o teste respondem pelos endereços configurados, com HTTPS, e a saúde de cada um informa a versão instalada

#### Scenario: Coletor da instalação
- **WHEN** a instalação termina, e quem administra a primeira organização abre a tela dos coletores
- **THEN** a tela mostra o "Servidor", ativo, sem faixas, e o fim da instalação disse para cadastrar as faixas

### Requirement: Atualização pelo teste antes da produção

Uma versão nova SHALL ser instalada primeiro no teste. Lá, o comando SHALL parar o app, aplicar as migrations, passar a usar a versão nova, iniciar e conferir a saúde.

Na produção, o comando SHALL recusar a versão que não roda no teste, com saúde, e com todas as migrations dela aplicadas no teste. Antes de mudar a produção, ele SHALL:
- fazer um backup da produção e conferir que ele pode ser lido;
- pedir o nome do banco da produção digitado.

Depois, nesta ordem, ele SHALL parar o coletor e o app, aplicar as migrations, passar a usar a versão nova, iniciar o app, conferir a saúde e iniciar o coletor.

Antes de iniciar o coletor, a atualização SHALL ligá-lo à organização que opera o servidor, como a instalação faz, se ele ainda não estiver ligado: uma produção instalada antes do coletor ganha o "Servidor", sem faixas, e uma que já o tem continua como está.

Se algo falhar depois de parar os serviços, eles SHALL ficar parados, o backup SHALL ficar guardado, e o comando SHALL dizer o que falhou e o que fazer.

#### Scenario: Versão que não passou pelo teste
- **WHEN** se tenta atualizar a produção para a versão 1.5.0, e o teste roda a 1.4.0
- **THEN** o comando recusa e diz que a 1.5.0 precisa rodar no teste primeiro

#### Scenario: Migration que falha na produção
- **WHEN** uma migration falha ao ser aplicada na produção
- **THEN** o app e o coletor ficam parados, o backup feito antes continua guardado, e o comando mostra o erro e os passos da recuperação

#### Scenario: Nome do banco errado
- **WHEN** quem atualiza a produção digita um nome que não é o do banco da produção
- **THEN** o comando para sem mudar nada

#### Scenario: Produção de antes do coletor
- **WHEN** a produção instalada antes desta versão é atualizada
- **THEN** a organização que opera o servidor ganha o coletor "Servidor", sem faixas, com o token que o coletor já tinha, e uma segunda atualização não cria outro
