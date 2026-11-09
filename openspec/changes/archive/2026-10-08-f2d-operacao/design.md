## Context

A motivação está em `proposal.md` (Why), e os requisitos, nas specs desta change. Pontos de partida que importam aqui:
- **Hoje no PMG (`D:\DEV_PMG`):**
  - os serviços do Windows vêm do `node-windows`;
  - o teste é uma pasta irmã, com porta e banco próprios e as automações bloqueadas por `PMG_ENVIRONMENT=test`;
  - `promote-migrations.bat` exige tudo aplicado no teste, um dump conferido, o nome do banco digitado e a parada e a partida dos serviços em ordem;
  - em falha depois da parada, os serviços ficam parados.
- **API:**
  - roda o TypeScript direto no Node 24, sem compilação, e o Node recusa remover os tipos de um arquivo dentro do `node_modules`;
  - a configuração é validada na partida (`apps/api/src/config.ts`);
  - a organização vem do cabeçalho `Host`, e o cookie da sessão é sempre `Secure`;
  - o Fastify não confia em nenhum proxy;
  - a fila (pg-boss) roda na partida da API e já agenda a manutenção diária de cada organização. As falhas vão para `tarefas_com_falha`, por organização.
- **Banco:**
  - as migrations dão permissões a papéis de nome fixo (`grafite_owner` e `grafite_app`);
  - os papéis do PostgreSQL valem para todos os bancos de uma instância;
  - o RLS é ativo e forçado em toda tabela de negócio, inclusive para o dono.
- **Imagens de contêiner:** a da aplicação e a do coletor já existem (F0 e F2c) e continuam o caminho do produto multiempresa.

## Goals / Non-Goals

**Goals:**
- Toda a lógica da operação é testável com o Vitest. Só as peças do Windows ficam atrás de interfaces finas, trocadas por simulações nos testes.
- O servidor recebe pacotes prontos: não compila, não instala dependências e não precisa do git.
- Nada do teste alcança a produção, nem por engano de configuração.

**Non-Goals:**
- Os destinos de backup em nuvem, a cifragem dos backups e mais de um servidor.
- Instalar o Node e o PostgreSQL da produção: são pré-requisitos do runbook.
- Os provedores de DNS além do Cloudflare.

## Decisions

### 1. O ambiente na configuração
- **Escolha:**
  - **Variável:** `GRAFITE_AMBIENTE`, obrigatória na API, com `desenvolvimento`, `teste` ou `producao`. O `.env` do `pnpm dev` ganha `desenvolvimento`, e a imagem de contêiner, `producao`.
  - **Na tela:** o estado da sessão (`GET /api/sessao`) traz o ambiente, então a tela de entrada e a barra o mostram antes de haver sessão. A saúde também o informa.
  - **No teste:** as tarefas do servidor que agem fora do sistema (por ora, o backup e o teste de restauração) nem são agendadas. A manutenção diária continua.
- **Por quê:** sem padrão, uma produção mal configurada não se passa por desenvolvimento.

### 2. Pastas, serviços e portas
- **Escolha:**
  - **Pastas** (raiz escolhida na instalação, por padrão `C:\Grafite`):
    - `versoes\<x.y.z>\`;
    - `producao\` e `teste\`, cada uma com `config.env`, `atual` (junção para a versão em uso), `anterior` (a versão de antes da última atualização), `arquivos\`, `logs\` e, no teste, `banco\` (a instância do teste);
    - `backups\` e `caddy\`;
    - `operacao.json`: o estado da instalação (versões, endereços, portas e modo do certificado), sem segredos.
  - **Gerenciador de serviços:** o WinSW, com um XML por serviço. Cada serviço roda `node --env-file=<config.env> <atual>\apps\api\src\servidor.ts`, com reinício na falha e o log com rotação por tamanho.
  - **Serviços e portas:**
    - `Grafite`: 127.0.0.1:3000;
    - `Grafite Teste`: 127.0.0.1:3001;
    - `Grafite Coletor`: 127.0.0.1:3100, só na produção;
    - `Grafite Proxy`: o Caddy, nas portas 80 e 443;
    - o PostgreSQL da produção: 5432, o serviço do instalador oficial;
    - `Grafite PostgreSQL Teste`: 5433.
  - **Acesso à configuração:** a ACL de cada `config.env` deixa só os administradores e a conta dos serviços lerem.
- **Alternativas:**
  - **`node-windows`:** o que o PMG usa, mas ele embrulha o próprio WinSW e esconde o XML, o log e a política de reinício;
  - **NSSM:** sem versões há anos.

### 3. Duas instâncias do PostgreSQL
- **Escolha:**
  - **Produção:** a instância do instalador oficial.
  - **Teste:** o comando de operação cria a instância com `initdb` (autenticação `scram-sha-256` e senha gerada) e a registra com `pg_ctl register`, com os binários da instalação oficial.
  - **Papéis:** cada instância tem os próprios `grafite_owner`, `grafite_app` e `grafite_backup`, com senhas diferentes. No teste, o `grafite_backup` não entra (o teste não faz backup): ele existe só para receber as permissões que os dumps da produção trazem ao restaurar.
  - **Serviço do teste:** `grafite-postgresql-teste` ("Grafite PostgreSQL Teste"), na conta `NT AUTHORITY\NetworkService`, como o do instalador oficial, com o acesso à pasta de dados dado na criação.
- **Por quê:** as migrations dão permissões aos nomes fixos dos papéis, e um papel vale para toda a instância. Num banco de teste da mesma instância, a credencial do teste abriria a produção trocando só o nome do banco.
- **Alternativa:** papéis com o nome do ambiente nas migrations. Mexeria em todas as migrations, e o teste ainda dividiria a instância (memória, parada e atualização do PostgreSQL) com a produção.

### 4. O comando de operação em TypeScript
- **Escolha:**
  - **Pacote:** `apps/operacao`, com os comandos `instalar`, `atualizar`, `voltar`, `preparar-teste`, `backup agora|listar|testar`, `restaurar`, `proxy configurar|raiz` e `servicos estado|reiniciar`.
  - **Os comandos de hoje:** os de organização e conta (`organizacao`, `conta`) continuam no `apps/api`. O comando de operação os repassa, com o `config.env` do ambiente pedido (`--ambiente`).
  - **Peças do Windows:** ficam atrás de interfaces e são simuladas nos testes:
    - `Servicos`: o WinSW e o `sc.exe`;
    - `Juncoes`: `mklink /J`;
    - `FerramentasDoPostgres`: `initdb`, `pg_ctl`, `pg_dump`, `pg_restore` e `psql`;
    - `Firewall`: `netsh`;
    - `Console`: perguntas e confirmações.
  - **Lógica compartilhada:** `packages/operacao` tem o que as tarefas agendadas da API e o comando usam juntos:
    - as ferramentas do PostgreSQL, com duas formas: os binários locais (`GRAFITE_PG_BIN`) ou dentro de um contêiner, para os testes de integração e o desenvolvimento;
    - o manifesto, o zip, o backup e a restauração.
  - **No servidor:** `grafite.ps1` confere se está elevado e chama `node apps\operacao\src\grafite.ts`.
  - **Confirmação digitada:** pode vir por `--confirmar <nome>`, para o roteiro automático do CI. O valor é conferido como se tivesse sido digitado.
- **Por quê:** a lógica arriscada (a guarda da promoção, a ordem da parada, a retenção, o remapeamento dos endereços) fica no TypeScript, com teste antes do código, como o resto do projeto.

### 5. O pacote da versão
- **Escolha:**
  - **Workflow:** `.github/workflows/versao.yml`, na tag `vX.Y.Z` ou por pedido, num executor Windows. A tag precisa ser a versão da API, ou o job falha.
  - **Montagem** (`apps/operacao/scripts/empacotar.ts`):
    - a web compilada;
    - a instalação de produção filtrada da API, do coletor e do comando de operação, com `node-linker=hoisted`, então as dependências de terceiros são pastas de verdade, e o sharp, o binário do Windows;
    - os pacotes do workspace (`packages/db` e `packages/domain`) no layout do repositório;
    - o runbook;
    - em `ferramentas\`: o WinSW, com versão fixada e conferida por hash, e o Caddy da decisão 9.
  - **Links do workspace:** um zip não carrega links. O pacote leva a lista deles, e o comando de operação os recria como junções ao desempacotar. Fora do `node_modules`, o Node aceita o TypeScript (como na imagem de contêiner).
  - **Saída:** `grafite-x.y.z-windows-x64.zip` e o `.sha256`, na release do GitHub.
- **Alternativa:** compilar a API para JavaScript com um empacotador. Seria uma segunda forma de rodar a API, diferente do desenvolvimento, dos testes e da imagem.

### 6. Instalação
- **Escolha, em ordem:**
  1. **Conferir:** o Node 24, o PostgreSQL 18 da produção, a pasta raiz e as portas 80 e 443, livres para o proxy. Quem escuta nelas o Windows responde (`Get-NetTCPConnection`), sem o comando abrir a porta, o que faria o firewall pedir permissão para o `node.exe`. Na retomada, com o proxy já rodando, as portas são dele. Nada é criado antes de tudo passar.
  2. **Perguntar:** os endereços, o modo do certificado, os destinos e a janela do backup e a organização que opera o servidor. As respostas podem vir num arquivo, para o CI.
  3. **Banco:** criar a instância do teste, os papéis e os bancos dos dois ambientes, com as senhas geradas, e gravar cada `config.env`.
  4. **Primeira versão:** desempacotar a versão, criar as junções e aplicar as migrations nos dois bancos.
  5. **Primeira organização:** criá-la na produção, com os endereços dela, e mostrar a senha temporária uma vez.
  6. **Serviços:** registrar os serviços, gerar a configuração do proxy, abrir o firewall para 80 e 443, iniciar e conferir a saúde dos dois ambientes pelo HTTPS.
- **O comando:** `grafite instalar <zip>`, rodado de uma cópia desempacotada do pacote, com `--respostas <arquivo>` no roteiro do CI. O arquivo traz também os segredos que seriam digitados: a senha do `postgres` da produção e, no modo público, o token da Cloudflare.
- **Retomada:** as respostas ficam em `instalacao.json` na raiz, sem os segredos, até o fim, e as senhas geradas ficam nos `config.env`, que a retomada lê em vez de gerar outras. O `operacao.json` só é gravado depois da saúde dos dois ambientes.
- **Por quê:** cada passo é uma função testável. Uma instalação interrompida pode ser retomada, porque os passos conferem o que já existe.

### 7. Atualização, promoção e volta
- **Escolha:**
  - **O pacote:** conferido pelo hash e desempacotado uma vez em `versoes\<x.y.z>`.
  - **Teste:** parar → migrar → `anterior` recebe o alvo de `atual`, e `atual` aponta para a versão nova → iniciar → conferir a saúde com a versão nova.
  - **Produção, guarda:** o teste roda a versão pedida, com saúde, e todas as migrations dela (o diário de migrations do pacote, com os hashes) estão aplicadas no banco do teste.
  - **Produção, passos:**
    1. backup completo (decisão 11), com o hash e o `pg_restore --list` conferidos;
    2. o nome do banco digitado;
    3. parar o coletor e o app;
    4. migrar e trocar as junções;
    5. iniciar o app e conferir a saúde;
    6. iniciar o coletor.
  - **Falha depois da parada:** os serviços ficam parados, o backup fica, e a mensagem mostra o erro e os passos do runbook.
  - **Volta:** troca `atual` e `anterior` e reinicia, sem migrations. Funciona porque as mudanças de estrutura acrescentam antes de remover (spec mestre, seção 10.6).
- **Por quê:** é a guarda que o PMG já usa, adaptada ao pacote. O mesmo pacote passa pelo teste e pela produção.

### 8. O teste com a cópia da produção
- **Escolha:**
  1. Achar o último backup da produção no primeiro destino. Sem um backup das últimas 24 h, fazer um.
  2. Pedir o nome do banco do teste digitado.
  3. Parar o app do teste.
  4. Restaurar o banco com o superusuário da instância do teste, que é recriada só nesse banco, e os arquivos, na pasta do teste.
  5. Trocar os endereços: cada endereço de cada organização que está no mapa da configuração do teste (`grafite.empresa.com.br` → `grafite-teste.empresa.com.br`) é trocado, e o que não está no mapa sai. Assim, o teste nunca atende um endereço da produção.
  6. Aplicar as migrations da versão do teste, iniciar e conferir a saúde.
- **A chave dos dois passos:** o teste usa a da produção. Os dados dele são uma cópia, e as contas entram nele com o app autenticador de sempre; com outra chave, nenhuma conta com os dois passos entraria.
- **Por quê:** valida as migrations de uma versão nova nos dados reais e prova, de quebra, que o backup restaura.

### 9. HTTPS com o Caddy
- **Escolha:**
  - **Binário:** o Caddy com versão fixada, montado no CI com o `xcaddy` e o módulo `caddy-dns/cloudflare`.
  - **Configuração gerada:** `grafite proxy configurar` gera o Caddyfile a partir do `operacao.json`, com um site por endereço, o `reverse_proxy` para a porta do ambiente e o HSTS só na produção. Os dados do Caddy (certificados e AC) ficam em `caddy\dados`, pelas variáveis `XDG_DATA_HOME` e `XDG_CONFIG_HOME`.
  - **Modo `publico`:** `tls { dns cloudflare {env.CLOUDFLARE_API_TOKEN} }`. O token, com permissão de editar o DNS só daquela zona, fica no `caddy\config.env`.
  - **Modo `interno`:** `tls internal` (a AC do próprio Caddy) ou `tls <cert> <chave>` com os arquivos da AC da empresa. `grafite proxy raiz <destino>` copia o certificado raiz. No modo interno, o `config.env` dos apps ganha `NODE_EXTRA_CA_CERTS`, para a vigilância do certificado confiar na raiz.
  - **Firewall:** só 80 e 443 abertos para a rede.
- **Alternativa:** o IIS, com o ARR e o URL Rewrite para o proxy e o win-acme para o Let's Encrypt. É mais difícil de gerar e de testar, e depende do que já estiver instalado no servidor.

### 10. Vigilância do certificado e proxies confiáveis
- **Escolha:**
  - **Vigilância:** uma tarefa do servidor, diária e só na produção, abre a conexão TLS com cada endereço de `GRAFITE_CERTIFICADO_VIGIAR` e lê `valid_to`. Com menos de 14 dias, ela falha com o endereço e os dias. As retentativas e a lista de falhas são as da fila.
  - **Proxies confiáveis:** `GRAFITE_PROXIES_CONFIAVEIS` (por padrão `127.0.0.1,::1`) vira o `trustProxy` do Fastify. O `request.ip` passa a ser o do cliente no limite de requisições, nas sessões e na auditoria. A imagem de contêiner informa o endereço do proxy do produto nessa variável.
- **Por quê:** o Let's Encrypt renova 30 dias antes de vencer. Com menos de 14, a renovação já falhou por duas semanas, e ainda há tempo de agir.

### 11. O backup
- **Escolha:**
  - **Papel de leitura:** o papel `grafite_backup`, com `LOGIN` e `BYPASSRLS`, sem nenhuma permissão de escrita.
    - Quem tem o superusuário o cria: o instalador, o `pnpm dev` (o `.env` tem a senha do superusuário) e o banco dos testes de integração.
    - Uma migration dá `USAGE` nos esquemas e `SELECT` nas tabelas e sequências, só se o papel existir, mais os privilégios padrão para as tabelas futuras do `grafite_owner`.
  - **Consistência:**
    - a tarefa abre uma transação `REPEATABLE READ` com o papel do backup e exporta o instantâneo (`pg_export_snapshot()`);
    - ela conta as linhas de cada tabela nesse instantâneo e roda `pg_dump -Fc --snapshot=<id>` enquanto a transação continua aberta;
    - assim, o manifesto bate com o dump mesmo com gravações no meio.
  - **Arquivos:** um zip da pasta dos arquivos (com o `yazl`, e o `yauzl` para ler no teste), porque cada arquivo é gravado uma vez e só sai na manutenção.
  - **Formato em cada destino:** `grafite-producao\AAAA-MM-DDTHHmmZ\` com `banco.dump`, `arquivos.zip` e `manifesto.json`. O manifesto tem a versão, as migrations, as linhas por tabela e o SHA-256 e o tamanho de cada parte. A pasta é gravada com o sufixo `.parcial` e renomeada no fim, então um backup pela metade nunca aparece como pronto.
  - **Configuração do servidor** (no `config.env` da produção):
    - `GRAFITE_BACKUP_DESTINOS`;
    - `GRAFITE_BACKUP_RETENCAO` (`7,4,12`);
    - `GRAFITE_BACKUP_JANELA` (`00:00-06:00`);
    - `GRAFITE_BACKUP_TESTE` (`semanal` ou `diario`);
    - `GRAFITE_BACKUP_URL` (o papel do backup);
    - `GRAFITE_RESTAURACAO_URL` (o superusuário da instância do teste);
    - `GRAFITE_PG_BIN` (a pasta dos binários do PostgreSQL 18).

    Na produção, os destinos, as conexões e a organização que opera o servidor são obrigatórios.
  - **Tarefas do servidor:** rodam na fila sem o contexto de organização. O backup e o teste usam só as tabelas da operação e os processos externos. Uma falha esgotada vai para `tarefas_com_falha` com a organização que opera o servidor.
- **Alternativas:**
  - **o `pg_dump` com o superusuário da produção:** daria ao app a senha que pode tudo no banco;
  - **o dono das tabelas:** o RLS forçado vale também para ele.

### 12. Retenção
- **Escolha:** uma função pura no domínio recebe as datas dos backups prontos e a retenção, e devolve os que ficam:
  - os N mais recentes;
  - o último de cada uma das S semanas ISO mais recentes;
  - o último de cada um dos M meses mais recentes;
  - sempre o mais novo.

  Ela roda depois de cada backup completo e apaga só as pastas prontas de cada destino.
- **Por quê:** é a regra mais fácil de errar, e uma tabela de datas nos testes a fixa.

### 13. Teste de restauração
- **Escolha:**
  1. Conferir os hashes do backup mais novo no primeiro destino.
  2. Criar `grafite_restauracao` na instância do teste, com o superusuário dela, e rodar `pg_restore`.
  3. Contar as linhas de cada tabela e comparar com o manifesto.
  4. Conferir o zip (a lista e o CRC de cada entrada).
  5. Apagar o banco.

  O resultado vai para `operacao.testes_de_restauracao`. A frequência vem da configuração, e o dia da semana, da tela.
- **Por quê:** fica longe da produção e usa a instância que já existe.

### 14. Registros da operação
- **Escolha:**
  - **Esquema:** `operacao`, fora das organizações, como o da fila:
    - `operacao.backups`: início, fim, situação, tamanho, destinos, manifesto e erro;
    - `operacao.testes_de_restauracao`;
    - `operacao.agenda`: o horário do backup e o dia do teste.
  - **Acesso:** o `grafite_app` lê e grava só esse esquema, sem RLS, porque não há dado de organização nele. O teste-guarda do isolamento passa a aceitar o esquema `operacao`, como aceita `fila`.
  - **Agenda:** a mudança de horário pela tela regrava o agendamento da fila.
- **Por quê:** os backups são do servidor, não de uma organização.

### 15. A organização que opera o servidor e a tela de backup
- **Escolha:**
  - **Configuração:** `GRAFITE_ORGANIZACAO_OPERADORA` (um endereço de acesso), definida pela instalação com a primeira organização.
  - **Rotas:** `/api/operacao/backups`, `/api/operacao/backups/pedidos` e `/api/operacao/agenda`. Elas exigem a sessão de uma conta dessa organização com `backup.administrar`. Para as outras organizações, respondem 404, sem dizer que existem.
  - **Auditoria:** as ações `backup.solicitado` e `agenda-do-backup.alterada`, na auditoria da organização operadora.
  - **Eventos:** um evento `operacao.mudou` (só para essa organização) atualiza a tela quando um backup ou um teste termina.
- **Por quê:** no produto multiempresa, quem opera o servidor é o fornecedor, não a administradora de cada cliente, mesmo com o perfil Administrador.

### 16. Restauração da produção
- **Escolha:** `grafite restaurar <backup> --ambiente producao`, com o backup pela pasta ou pelo nome no primeiro destino:
  1. conferir os hashes e o `pg_restore --list`, pedir a senha do `postgres` da produção (ela não fica guardada em lugar nenhum) e o nome do banco digitado;
  2. parar o coletor e o app;
  3. restaurar num banco novo (`grafite_restaurando`), com o superusuário, comparar as linhas com o manifesto e aplicar as migrations da versão em uso, porque o backup pode ser de uma versão anterior;
  4. só então renomear o banco atual para `grafite_antes_AAAAMMDDHHmm` (em UTC), pôr o restaurado no lugar, com as permissões do banco, e trocar a pasta dos arquivos pela restaurada, guardando a de antes;
  5. iniciar e conferir a saúde.

  Uma falha antes da troca não muda nada, e o banco antigo continua com o nome dele. Uma falha depois dela desfaz a troca: o de antes volta ao nome dele, e o restaurado fica como `grafite_restaurado_AAAAMMDDHHmm`. Nos dois casos, os serviços ficam parados. O banco renomeado e a pasta antiga ficam até quem opera apagá-los, pelo runbook.
- **Por quê:** um engano na restauração não pode custar o que estava no ar.

### 17. Testes
- **Unitários:**
  - a guarda e a sequência da atualização, com falha em cada passo;
  - a volta;
  - a retenção, por tabela;
  - o manifesto;
  - o Caddyfile dos dois modos;
  - a configuração nova;
  - o remapeamento dos endereços;
  - a montagem do pacote (a lista de links).
- **Integração, com o PostgreSQL de verdade:**
  - o `grafite_backup` faz o dump com o RLS forçado e não grava;
  - o dump com o instantâneo e a restauração num banco descartável batem com o manifesto;
  - o remapeamento num banco restaurado;
  - as rotas da tela, com a permissão e o 404 das outras organizações, e a auditoria;
  - o `trustProxy`, que só aceita o loopback;
  - o ambiente na saúde e no estado da sessão.
- **Web:** os testes de componente da tela de backup, do item da barra e do aviso da entrada; a ponta a ponta com a API simulada.
- **Windows real:** um job do `versao.yml` no executor Windows:
  1. instala o PostgreSQL 18 e, pelo arquivo de respostas e no modo interno, instala o pacote com os endereços `grafite.localhost` e `grafite-teste.localhost` no `hosts`;
  2. confere a saúde dos dois pelo HTTPS, confiando na raiz exportada;
  3. roda o backup, o teste de restauração e o `preparar-teste`;
  4. atualiza o teste e a produção com um segundo pacote, de versão maior, e volta a produção.

### 18. Documentação
- **Runbook:** `docs/operacao/` (pt-BR), incluído no pacote.
- **Spec mestre:**
  - 4.3: o Caddy, os dois modos e as duas instâncias;
  - 9.10: os destinos, a retenção, o teste de restauração e o papel do backup;
  - 10.6: a promoção pelo pacote;
  - 12.2: o ambiente na configuração e o teste com a cópia;
  - 14: as mitigações;
  - 15: a forma do certificado sai das decisões adiadas.
- **`CLAUDE.md`:** os comandos novos e o F2d.

## Risks / Trade-offs

- **[Os links do workspace se perdem no zip]** → O pacote leva a lista, o comando os recria como junções, e o job do Windows prova que a API sobe a partir do zip.
- **[O `pg_dump` de outra versão que a do servidor]** → `GRAFITE_PG_BIN` aponta para os binários do PostgreSQL 18 instalado, e a instalação confere a versão.
- **[Os backups têm dados pessoais e não são cifrados]** → Os destinos ficam com o acesso restrito, como o runbook manda, e nenhuma chave vai junto. A cifragem fica para quando houver um destino fora da empresa.
- **[O teste tem dados reais, e as pessoas entram com as senhas de verdade]** → A tela de entrada e a barra avisam. O teste fica no mesmo servidor, com o mesmo acesso, como no PMG.
- **[Só o Cloudflare no modo público]** → O modo interno funciona até a TI confirmar o provedor. Outro módulo é uma linha no build do Caddy.
- **[O teste de restauração enche o disco do servidor]** → Antes de restaurar, ele confere o espaço livre contra o tamanho do backup e falha com o motivo.
- **[As tarefas do servidor rodam sem organização]** → Elas não tocam nas tabelas de negócio, a não ser pelo `pg_dump`. O teste-guarda e uma revisão das consultas dela conferem isso.
