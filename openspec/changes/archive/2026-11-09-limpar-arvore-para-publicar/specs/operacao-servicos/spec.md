## MODIFIED Requirements

### Requirement: Serviços e configurações pelo comando de operação

O comando de operação SHALL ligar e desligar cada ambiente:
- `servicos parar --ambiente teste|producao` para o app do ambiente e, na produção, também o coletor. Na produção, ele SHALL pedir o nome do banco da produção digitado antes de parar;
- `servicos iniciar --ambiente teste|producao` inicia o que estiver parado e confere a saúde do app.

O comando de operação SHALL configurar o backup da produção com o `backup configurar`, que recebe:
- os destinos;
- a janela do horário;
- a retenção dos diários, dos semanais e dos mensais;
- a frequência do teste de restauração.

Antes de gravar, ele SHALL conferir que cada destino existe e aceita gravação. Depois, SHALL gravar na configuração da produção, reiniciar a produção e conferir a saúde.

O comando de operação SHALL configurar o certificado do proxy com o `certificado configurar`:
- o modo interno, com a AC do proxy ou com os arquivos da AC da empresa;
- ou o modo público, com o e-mail e o token do DNS, pedido sem aparecer na tela.

Ele SHALL gravar o modo na configuração da instalação e o token só na configuração do proxy. Depois, SHALL gerar de novo a configuração do proxy, reiniciá-lo e conferir a saúde dos dois ambientes pelo HTTPS.

O comando de operação SHALL acrescentar e tirar endereços:
- `enderecos acrescentar <endereço>` acrescenta o endereço à produção e o endereço do teste correspondente ao teste. O endereço do teste é perguntado, com o padrão `grafite-teste` no lugar do primeiro nome. Os dois SHALL entrar também nos endereços de acesso da organização que opera o servidor, no banco de cada ambiente. Depois, ele SHALL gerar de novo a configuração do proxy, conferir a saúde e dizer para cadastrar os dois endereços no DNS da empresa;
- `enderecos tirar <endereço>` pede o endereço digitado e tira o endereço e o do teste correspondente. Ele SHALL recusar tirar o último endereço da produção.

Um valor fora do formato SHALL ser recusado antes de gravar, com o motivo.

#### Scenario: Produção desligada pelo comando
- **WHEN** quem opera roda `servicos parar --ambiente producao` e digita o nome do banco da produção
- **THEN** o app e o coletor da produção param, e o `servicos estado` mostra os dois parados

#### Scenario: Destino do backup que não grava
- **WHEN** quem opera configura um destino de backup que não existe
- **THEN** o comando recusa antes de gravar e diz qual destino não existe

#### Scenario: Certificado público pelo comando
- **WHEN** quem opera muda o certificado para o modo público, com o e-mail e o token da Cloudflare
- **THEN** o token vai só para a configuração do proxy, sem aparecer na tela, e o proxy reinicia e responde pelo HTTPS nos dois ambientes

#### Scenario: Endereço acrescentado
- **WHEN** quem opera acrescenta `grafite.acme.example`, aceitando o endereço do teste proposto
- **THEN** a produção passa a atender também por ele, o teste passa a atender por `grafite-teste.acme.example`, a organização que opera o servidor entra pelos dois, e o comando diz para cadastrá-los no DNS

#### Scenario: Último endereço
- **WHEN** quem opera tenta tirar o único endereço da produção
- **THEN** o comando recusa e diz que a produção precisa de pelo menos um endereço
