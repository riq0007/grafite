## 1. Imagens

- [x] 1.1 As ferramentas do PostgreSQL 18 na imagem da aplicação (decisão 7): o `postgresql-client-18` do repositório do PGDG, em `/usr/lib/postgresql/18/bin`, para o `GRAFITE_PG_BIN` da configuração da produção. Verificar: o `docker build --target aplicacao` passa; no contêiner, o `pg_dump --version` responde 18, a saúde responde `ok`, e o `pg_dump` da imagem faz o dump de um PostgreSQL 18.
- [x] 1.2 A imagem do proxy (decisão 7): o Caddy montado pelo `xcaddy` com o `caddy-dns/cloudflare`, na versão do Caddy do pacote do Windows. Verificar: o `docker build --target proxy` passa; nela, o `caddy list-modules` mostra o `dns.providers.cloudflare`, e o `caddy validate` aceita os Caddyfiles de exemplo dos dois modos que o `scripts/caddyfiles.ts` gera.
- [x] 1.3 A imagem do comando de operação (decisão 2): o Node 24, o `docker-ce-cli` e o `docker-compose-plugin` do repositório oficial do Docker, o cliente do PostgreSQL 18 e o `apps/operacao` com os pacotes dele. Verificar: o `docker build --target operacao` passa; nela, o comando mostra a ajuda, e o `docker compose version` e o `pg_dump --version` respondem.

## 2. A plataforma no comando de operação

- [x] 2.1 Escrever primeiro os testes e depois a plataforma no estado e no layout (decisões 1 e 4): o `operacao.json` com a plataforma, o layout do Linux em `/opt/grafite`, os nomes dos serviços do Compose e os endereços da rede interna, com o Windows igual ao de hoje. Verificar: os testes do `apps/operacao` passam com o layout das duas plataformas, e o estado de antes, sem a plataforma, é lido como Windows.
- [x] 2.2 Escrever primeiro os testes e depois a configuração dos ambientes no Linux (decisões 3, 5, 10 e 11). Verificar: os testes da configuração passam nas duas plataformas, com o Windows igual ao de hoje. A configuração do Linux tem:
  - os bancos e a API pelos nomes da rede interna;
  - o proxy confiável pelo IP fixo;
  - o `GRAFITE_PG_BIN` da imagem e o `TZ` do servidor;
  - a conferência da marca dos destinos ligada;
  - o `coletor.env` com o `app-producao`.
- [x] 2.3 Escrever primeiro os testes e depois o `compose.yaml` e o `.env` do Compose (decisão 3). Verificar: os testes do gerador passam, e o `docker compose config` aceita o arquivo gerado de exemplo. O arquivo tem:
  - os seis serviços;
  - a rede com a faixa e o IP fixo do proxy;
  - as montagens das pastas e dos destinos do backup;
  - os logs com rotação e o reinício;
  - a versão de cada ambiente.
- [x] 2.4 Escrever primeiro os testes e depois os contêineres como a peça dos serviços (decisão 3): iniciar, parar, reiniciar e o estado pelo `docker compose`, com o mesmo contrato dos serviços do Windows. Verificar: os testes com o Docker simulado passam, com os comandos e as saídas esperados.
- [x] 2.5 Escrever primeiro os testes e depois o PostgreSQL em contêiner (decisão 5): a espera pelo banco e os papéis e o banco pelo `psql` da rede interna, com o mesmo código do Windows. Verificar: o teste de integração cria os papéis e o banco num `postgres:18` de verdade, e a credencial do teste é recusada na instância da produção ("Credencial do teste contra a produção").
- [x] 2.6 Escrever primeiro os testes e depois a saúde pela rede interna (decisão 9): o app pelo nome do serviço e o HTTPS pelo `proxy:443`, com o endereço no SNI e no `Host`. Verificar: os testes da saúde passam com o servidor simulado nos dois caminhos.

## 3. Os comandos no Linux

- [x] 3.1 Escrever primeiro os testes e depois o pacote para Linux no comando (decisões 6 e 8): a conferência do hash, a leitura do `pacote.json` e a carga das imagens, uma vez por versão. Verificar: os testes passam com o cenário "Pacote alterado" e com a versão já carregada, que não é carregada de novo.
- [x] 3.2 Escrever primeiro os testes e depois o começo da instalação do zero no Linux (decisão 12). Verificar: os testes da instalação passam com o Docker simulado e os cenários "Docker ausente" e "Porta do proxy ocupada". O começo cobre:
  - os pré-requisitos e as portas 80 e 443, antes de criar qualquer coisa;
  - as respostas sem o `pgBin` e sem a senha do `postgres`;
  - as pastas, com o dono e o modo;
  - a marca em cada destino do backup.
- [x] 3.3 Escrever primeiro os testes e depois o resto da instalação do zero no Linux. Verificar: os testes passam com os cenários "Instalação completa" e "Instalação interrompida". O resto cobre:
  - os bancos, as senhas, a chave do cofre e as chaves do push;
  - as migrations pela imagem da aplicação;
  - a primeira organização e o coletor "Servidor";
  - o proxy, a subida dos contêineres e a saúde pela rede interna e pelo HTTPS.
- [x] 3.4 Escrever primeiro os testes e depois a atualização e a volta pelas imagens (decisão 8). Verificar: os testes passam com os cenários "Versão que não passou pelo teste", "Volta depois de uma atualização" e "Migration que falha na produção". Elas cobrem:
  - o teste antes da produção;
  - o backup conferido e o nome do banco digitado;
  - as migrations pela imagem nova e a troca da versão no `.env` do Compose;
  - a volta;
  - a limpeza das imagens que nenhum ambiente usa.
- [x] 3.5 Escrever primeiro os testes e depois o backup, a restauração e o teste com a cópia da produção no Linux (decisão 11). Verificar: os testes passam com os cenários "Teste preparado", "Backup no compartilhamento", "Compartilhamento desmontado" e "Fuso do servidor". Eles cobrem:
  - as ferramentas do PostgreSQL pela rede interna;
  - os arquivos nas pastas montadas;
  - a marca do destino conferida antes de gravar.
- [x] 3.6 Escrever primeiro os testes e depois o proxy, o cofre, o e-mail, a organização e a conta no Linux. Verificar: os testes passam com o cenário "Conta criada na produção" e com a troca da chave do cofre retomada depois de uma falha. Eles cobrem:
  - o `Caddyfile` com o nome do serviço do app;
  - a raiz da AC pela pasta do Caddy;
  - a troca da chave do cofre, com o reinício dos contêineres;
  - o e-mail na configuração da produção;
  - o comando da API pela imagem da versão do ambiente.
- [x] 3.7 Escrever primeiro os testes e depois o lançador `grafite` e o `instalar.sh` (decisão 2). Verificar: os testes rodam os dois scripts pelo bash, com um `docker` simulado no caminho, e passam com os cenários "Sem o root" e "Docker ausente". Os scripts cobrem:
  - o lançador confere o root e o Docker, garante a rede `grafite` e roda a imagem do comando da versão da produção, com o socket e a pasta da instalação;
  - o `instalar.sh` confere o hash, carrega as imagens, copia o lançador e chama a instalação.

## 4. O pacote e o CI

- [x] 4.1 Escrever primeiro os testes e depois o script do pacote para Linux (decisão 6): o `apps/operacao/scripts/empacotar-linux.ts`, que monta o `.tar` e o `.sha256`. O `.tar` leva as cinco imagens da versão, o lançador, o `instalar.sh`, o `pacote.json` e o runbook. Verificar: os testes do `pacote.json` passam; rodado no PC, o script gera o pacote, e o `docker load` dele traz as cinco imagens com a etiqueta da versão.
- [x] 4.2 O pacote para Linux no `versao.yml` e na release (decisão 6). Verificar: um ensaio do `versao.yml` (`workflow_dispatch`) publica a pré-release com os dois pacotes e os hashes. O workflow:
  - monta o pacote no executor;
  - o guarda numa pasta do executor para os jobs seguintes, sem artefato do Actions;
  - publica os dois pacotes na release.
- [x] 4.3 A instalação de teste no Linux no CI (decisão 13): o job "Instalação num Linux", num `docker:dind`. Verificar: o job passa no PR desta change, que mexe em `apps/operacao/**`. Ele cobre:
  - a instalação pelas respostas por arquivo;
  - a saúde pelo HTTPS;
  - a atualização para o pacote de versão maior e a volta;
  - o backup e o teste de restauração.

## 5. Fechamento

- [x] 5.1 Atualizar a documentação. Verificar: o `pnpm test` passa, com o teste-guarda do mapa.
  - O runbook ganha a parte do Linux:
    - os pré-requisitos e a instalação do Docker Engine e do plugin compose;
    - a montagem dos destinos do backup;
    - a instalação, a atualização, a volta e a preparação do teste;
    - o backup, a restauração e a guarda das chaves em `/opt/grafite`;
    - os contêineres e os logs;
    - o aviso de que o Docker abre a 80 e a 443 mesmo com o `ufw` ligado;
    - a conferência do reinício do servidor e do backup no compartilhamento, na primeira instalação.
  - A spec mestre: as duas plataformas nas seções 4.3 e 3.2 (o F2d) e o pacote para Linux na seção 12.2.
  - O mapa: a change e a capacidade nova.
  - O `CLAUDE.md`: os comandos do Linux e o pacote para Linux.
- [x] 5.2 Conferir as verificações. Verificar: os comandos passam, e o CI do PR fica verde.
  - `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm test:integration` verdes;
  - os jobs "Instalação num Windows" e "Instalação num Linux" do `versao.yml` verdes;
  - `openspec validate servidor-linux-com-docker --strict` sem erros.
