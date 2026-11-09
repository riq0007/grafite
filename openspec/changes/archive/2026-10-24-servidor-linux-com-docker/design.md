## Context

O F2d fez o comando de operação (`apps/operacao`) em TypeScript, com as peças de cada plataforma injetadas pelo `grafite.ts`:
- os serviços do Windows, pelo WinSW;
- as junções das versões;
- as ferramentas do PostgreSQL de uma pasta de binários;
- a saúde pela rede.

Os fluxos já estão no comando e nos testes dele: instalar, atualizar pelo teste, voltar, preparar o teste, backup, restaurar, proxy, cofre, e-mail, organização e conta. O layout (`layout.ts`) e a configuração de cada ambiente (`ambientes.ts`) supõem o Windows: `C:\Grafite`, os serviços pelo nome, os apps e os bancos em `127.0.0.1`.

O `Dockerfile` tem as imagens `aplicacao` e `coletor` desde o F0, mas o CI não as compila. A `aplicacao` não tem o `pg_dump`, que a tarefa diária de backup usa. O `versao.yml` monta o zip do Windows, instala-o no executor (Windows, com o Docker Desktop) e publica a release.

Motivação e escopo: veja proposal.md.

## Goals / Non-Goals

**Goals:**
- um comando de operação só, com as mesmas regras nas duas plataformas, e as diferenças só nas peças da plataforma;
- um servidor Linux com nada além do Docker Engine e do plugin compose;
- tudo do Grafite numa pasta só do servidor, que o root lê e copia;
- a instalação no Linux conferida pelo CI antes de cada release.

**Non-Goals:**
- mudar a instalação, a atualização ou o pacote do Windows;
- rodar o Grafite em mais de um servidor ou com réplicas;
- trocar o PostgreSQL de versão maior (18 para 19): fica para uma change própria, com o dump e a restauração.

## Decisions

### 1. Um comando de operação para as duas plataformas

O `apps/operacao` ganha a plataforma como peça:
- **Windows:** o WinSW, as junções, o PostgreSQL local e `C:\Grafite`, como hoje;
- **Linux:** o Docker Compose, as imagens por versão, o PostgreSQL em contêiner e `/opt/grafite`.

Os fluxos e as regras ficam no código que já existe e nos testes dele. O `operacao.json` grava a plataforma da instalação, e cada comando monta as peças dela.

**Alternativa descartada:** um script do shell só para o Linux. Ele repetiria as regras do F2d, como a atualização pelo teste, as confirmações e a retomada, sem os testes delas, e as duas plataformas se afastariam a cada change.

### 2. O comando roda num contêiner, pelo lançador `grafite`

A imagem nova `operacao` traz:
- o Node 24;
- o cliente do Docker com o plugin compose;
- as ferramentas do PostgreSQL 18;
- o comando de operação.

No servidor, o lançador `/usr/local/bin/grafite`, em bash, faz quatro coisas:
- confere o root e o Docker;
- garante a rede `grafite`;
- roda o contêiner da imagem `operacao` da versão da produção, como o `grafite.ps1` roda o comando da versão da produção;
- monta no contêiner o socket do Docker e a pasta da instalação, no mesmo caminho, e o põe na rede `grafite`.

Na instalação, o `instalar.sh` do pacote carrega as imagens, copia o lançador e chama o `grafite instalar` com a imagem do próprio pacote.

**Alternativa descartada:** o Node instalado no servidor, que deixaria de ser só do Docker. O socket do Docker equivale ao root do servidor, e por isso o lançador exige o root.

### 3. Um projeto do Compose, com um serviço por processo

O comando gera `/opt/grafite/compose.yaml`, um projeto `grafite` com os serviços `proxy`, `banco-producao`, `app-producao`, `coletor`, `banco-teste` e `app-teste`.
- **Versões:** a de cada ambiente fica no `.env` do Compose, então a produção e o teste rodam versões diferentes.
- **Reinício:** `restart: unless-stopped`, com o Docker ligado no boot.
- **Logs:** o driver `json-file`, com `max-size` e `max-file`.
- **Saúde:** o healthcheck das imagens.
- **Portas:** só o `proxy` publica a 80 e a 443.
- **Rede:** a `grafite` tem a faixa fixa, `172.30.0.0/24`, e o proxy, um IP fixo, o `172.30.0.2`, que vai no `GRAFITE_PROXIES_CONFIAVEIS` dos apps. O Docker só dá endereços da metade de cima da faixa (`172.30.0.128/25`), para o IP do proxy nunca ir para outro contêiner, como o do comando, que entra na rede antes do proxy. Os apps atendem em `0.0.0.0` dentro do contêiner, sem porta publicada.

**Alternativa descartada:** um projeto para a produção e outro para o teste. O proxy é um só para os endereços dos dois, como no Windows, e um projeto só deixa uma rede só. Os ambientes já mudam de versão em separado, porque cada serviço tem a própria imagem.

### 4. Tudo em `/opt/grafite`, montado das pastas do servidor

O layout do Linux repete o do Windows:
- `operacao.json` e `instalacao.json`;
- `producao/` (`config.env`, `arquivos/`, `banco/`, `coletor.env` e `coletor/`) e `teste/` (`config.env`, `arquivos/` e `banco/`);
- `caddy/` (`Caddyfile`, `config.env`, `dados/` e `ac/`, com a raiz pública da AC do Caddy);
- `backups/`, o destino padrão;
- `compose.yaml` e o `.env` do Compose;
- `versoes/<x.y.z>/`, com o `pacote.json` de cada versão carregada.

Os contêineres montam essas pastas do servidor. Assim, o root copia a configuração e a AC do Caddy para a guarda das chaves, e o comando restaura os arquivos direto na pasta, sem um contêiner a mais.
- **Modos:** a raiz fica com `700` do root. Cada pasta de dados tem o dono do usuário do contêiner que a usa: `node` (1000) nos apps e no coletor, `postgres` (999) nos bancos.
- **O que o comando grava:** o comando roda como o root. Os arquivos que ele restaura ou copia para o teste e os backups que ele faz passam ao `node` (1000), para o app mudá-los depois, como os backups seguintes e a retenção. Num compartilhamento, o dono vem das opções da montagem.
- **Configuração:** os `config.env` ficam com `600` do root e vão para os contêineres pelo `env_file` do Compose, que o Docker lê como root.

**Alternativa descartada:** os volumes nomeados. Eles ficam escondidos em `/var/lib/docker`, e a guarda das chaves e a restauração passariam a precisar de contêineres auxiliares.

### 5. Um PostgreSQL 18 em contêiner para cada ambiente

Cada ambiente roda a imagem `postgres:18.x` fixada no pacote, com a pasta de dados dele.
- **Superusuário:** a senha é gerada na instalação e só vale na primeira inicialização.
- **Papéis e banco:** o comando os cria pelo `psql`, com o mesmo código do Windows, apontado para o contêiner pela rede interna.
- **Isolamento:** duas instâncias com senhas próprias, então a credencial do teste não abre a produção.
- **Versões:** uma versão menor nova chega com o pacote, como imagem nova na mesma pasta de dados. A versão maior fica fixa no 18.

**Alternativa descartada:** o PostgreSQL do sistema, pelo `apt`, que tira o servidor do "só o Docker".

### 6. O pacote para Linux, com as imagens dentro

O pacote é o `grafite-x.y.z-linux-x64.tar`, com o `.sha256` ao lado. Ele leva:
- `imagens.tar.gz`: o `docker save` das cinco imagens, a aplicação, o coletor, o comando, o proxy e o PostgreSQL, todas com a etiqueta `grafite/<nome>:x.y.z`;
- `instalar.sh` e o lançador `grafite`;
- `pacote.json`, com a versão e as imagens que ele leva;
- o runbook.

O `versao.yml` monta o pacote no executor, com o `docker build` e o `docker save`. A release passa a levar os dois pacotes.
- **Integridade:** vem do hash do pacote, que cobre as imagens. O identificador de uma imagem muda de um Docker para outro: o armazenamento do containerd, do Docker Desktop do executor e das instalações novas do Docker Engine, usa o do manifesto, e o clássico, o da configuração. Por isso, a carga confere as etiquetas que o `docker load` diz ter carregado, e a marca da versão guarda o identificador que cada imagem ganhou no Docker do servidor.
- **Tamanho:** a estimativa é de 600 MB comprimidos, abaixo do limite de 2 GB de um arquivo da release. O pacote da 0.1.0 tem 410 MB.
- **Entre os jobs:** os pacotes passam por uma pasta do executor, e não por artefato do Actions, porque a cota de armazenamento do GitHub já estourou. Isso vale para o pacote para Linux e também para o zip do Windows, cujo upload a cota barrou no PR desta change. Todos os jobs rodam na mesma máquina, numa instância só do executor. Cada instalação de teste apaga só a pasta da plataforma dela, e a release, a pasta da execução.

**Alternativa descartada:** um registro de imagens. Com o repositório privado, as imagens gastariam a cota de armazenamento do GitHub, e o servidor precisaria de um token.

### 7. As imagens novas e a da aplicação

- **`aplicacao`:** ganha o `postgresql-client-18` do repositório do PGDG, em `/usr/lib/postgresql/18/bin`. O `GRAFITE_PG_BIN` que aponta para essa pasta fica no `config.env` da produção, e não na imagem: a variável é do grupo do backup, que a configuração aceita inteiro ou nada, e o teste não tem backup.
- **`operacao`:** a base Debian do Node 24, com o `docker-ce-cli` e o `docker-compose-plugin` do repositório oficial do Docker, o cliente do PostgreSQL 18 e o comando de operação com os pacotes dele.
- **`proxy`:** o Caddy montado pelo `xcaddy` com o `caddy-dns/cloudflare`, na mesma versão do Caddy do pacote do Windows. O `Caddyfile` sai do mesmo gerador, com o nome do serviço do app no lugar do `127.0.0.1`. O Caddy grava a AC dele só para o root, com as chaves ao lado da raiz. No modo interno com a AC do Caddy, o comando copia só a raiz para `caddy/ac/raiz.crt`, legível por todos, a cada configuração do proxy, e os apps montam essa pasta e confiam nela pelo `NODE_EXTRA_CA_CERTS`. As chaves da AC ficam só com o proxy.
- **`coletor`:** não muda.

### 8. A atualização e a volta pelas imagens

`grafite atualizar <tar> --ambiente teste|producao`:
1. confere o hash;
2. carrega as imagens, uma vez por versão, marcando-a em `versoes/<x.y.z>/` com o identificador de cada imagem no Docker do servidor;
3. aplica as migrations com a imagem da aplicação da versão nova, como o `versao.ts` faz hoje com a pasta da versão;
4. troca a versão do ambiente no `.env` do Compose e recria os serviços dele, com o banco do ambiente na imagem do PostgreSQL da versão nova. A produção leva junto o coletor e o proxy.

Os scripts da versão, as migrations e o comando da API (a organização, a conta e o coletor), rodam num contêiner descartável (`docker run --rm`) da imagem da aplicação da versão, na rede `grafite`. O `docker compose run` não serve: ele tira a versão do `.env` do Compose, que só muda depois das migrations, e sobe junto o banco do serviço. As variáveis vão pelo nome (`-e NOME`), com o valor no ambiente do cliente do Docker, como o `versao.ts` passa as do Windows: nenhuma senha fica na linha de comando, que a lista de processos mostra.

O `operacao.json` guarda a versão de antes de cada ambiente, como a junção `anterior` do Windows. A volta troca de novo, no mesmo banco. Depois de uma atualização com saúde, o comando apaga as imagens das versões que nenhum ambiente usa, nem como atual nem como anterior.

### 9. A saúde pela rede interna

A saúde dos apps e do HTTPS é conferida de dentro da rede `grafite`:
- o app, pelo nome do serviço, como `http://app-producao:3000/health`;
- o HTTPS, pelo `proxy:443`, com o endereço no SNI e no `Host`, como o Windows faz pelo `127.0.0.1`.

O `saudePelaRede` passa a receber o endereço do app e o do proxy.

### 10. O coletor na rede do Docker

O coletor fica na rede `grafite` e sai para a rede da empresa pelo NAT do Docker, com o endereço do servidor, como no Windows. O ping usa o socket ICMP sem privilégio do iputils, que já está na imagem. O coletor fala com a API em `http://app-producao:3000`, com o endereço da organização que opera o servidor.

### 11. O backup no Linux

- **Destinos:** são pastas do servidor. O Compose monta cada uma no `app-producao`, e o lançador no contêiner do comando, no mesmo caminho.
- **Marca:** a instalação grava, em cada destino, a marca `.grafite-destino`, com o identificador da instalação. Ela o faz por um contêiner descartável da imagem do comando, com o destino montado, que também dá o destino ao usuário dos contêineres: na instalação, o lançador ainda não sabe os destinos, que vêm das respostas, e não os montou. A configuração do Linux liga a conferência da marca, e o backup recusa o destino sem ela. A conferência só vale no Linux: no Windows, os destinos de rede são caminhos UNC, sem ponto de montagem.
- **Fuso:** a instalação lê o fuso do servidor e o grava no `TZ` dos contêineres. A janela do backup segue o fuso do servidor, como no Windows.
- **Teste de restauração:** o `app-producao` restaura no `banco-teste` pela rede interna, com o superusuário do teste, como no Windows. O espaço livre que ele confere antes é o do disco da pasta de dados do banco do teste: a pasta do PostgreSQL só existe dentro do contêiner do banco, então o `app-producao` monta a pasta do servidor só para ler, e a configuração a diz no `GRAFITE_RESTAURACAO_PASTA`.

### 12. As respostas da instalação

São as perguntas do Windows, com duas a menos: a pasta dos programas do PostgreSQL e a senha do `postgres`, que a instalação gera. A raiz padrão é `/opt/grafite`. O arquivo de respostas do roteiro é o mesmo, sem o `pgBin` e sem a `senhaDoPostgres`.

### 13. A instalação de teste no CI, num Docker dentro de um contêiner

O job "Instalação num Linux" do `versao.yml` roda no executor, num contêiner `docker:dind` privilegiado: um Linux com o próprio Docker Engine. Nele, o job:
1. roda o `instalar.sh` com as respostas por arquivo, no modo interno do certificado;
2. confere a saúde pelo HTTPS de dentro do contêiner;
3. atualiza o teste e a produção para o pacote de versão maior, como o job do Windows faz com o `pacote-maior`;
4. volta;
5. faz o backup e o teste de restauração.

O pacote de versão maior é o mesmo, com as etiquetas e o `pacote.json` trocados, sem compilar de novo. O job roda nas releases e nos PRs que mexem em `apps/operacao/**`, `packages/operacao/**`, no `Dockerfile` ou no próprio workflow.

**Alternativa descartada:** uma VM Linux no executor. Ela pede outra máquina ou o Hyper-V, e o `dind` é o mesmo Docker Engine de um servidor.

### 14. Sem mudança no firewall do sistema

A instalação não mexe no firewall do sistema. O Docker publica só a 80 e a 443, e o runbook avisa que o Docker abre essas portas mesmo com o `ufw` ligado. O resto do servidor, como o SSH, é da equipe de infraestrutura.

## Risks / Trade-offs

- [O socket do Docker no contêiner do comando equivale ao root do servidor] → O lançador exige o root, e o contêiner é descartado no fim (`--rm`) e só roda o comando da versão instalada.
- [Uma imagem `grafite/<nome>:<versão>` que falte no servidor seria buscada no Docker Hub, onde o nome pode ser de outra pessoa] → Nenhum contêiner busca imagem: o Compose tem o `pull_policy: never` em cada serviço, e todo `docker run` do comando e do lançador leva o `--pull never`. As imagens só vêm do pacote conferido.
- [Um pacote de uns 600 MB por versão] → É um arquivo só na release, sem cota. O servidor apaga as imagens das versões que nenhum ambiente usa.
- [O `dind` do CI não é um servidor de verdade: o boot do sistema e a montagem do NAS ficam de fora] → O runbook pede, na primeira instalação, a conferência do reinício do servidor e do backup no compartilhamento.
- [Um PR que só mexe na API pode quebrar a imagem sem rodar a instalação no Linux] → A release roda a instalação antes de publicar, e a quebra aparece nela, antes de chegar ao servidor.
- [O build das imagens depende dos repositórios do PGDG e do Docker] → Só o CI compila. O servidor carrega as imagens prontas do pacote.
- [O dono e o modo das pastas montadas] → A instalação acerta os dois em cada pasta antes de subir os contêineres, e o PostgreSQL inicializa a pasta vazia na primeira vez.
- [As duas plataformas dobram a manutenção: dois pacotes, duas instalações de teste e duas partes no runbook] → As regras e os testes ficam num código só, e só as peças da plataforma se repetem. Essa é a escolha do usuário: as duas de vez.

## Migration Plan

Não há dados a migrar. A primeira instalação no Linux é do zero, pelo pacote da primeira versão que sair com esta change. As instalações do Windows não mudam, e o zip delas continua na release. Se o pacote para Linux falhar na instalação de teste, a release não sai, e a versão anterior continua valendo.

## Open Questions

- **A versão mínima do Docker Engine:** depende dos recursos usados, como o Compose v2, o healthcheck e as redes com IP fixo, e é fixada ao implementar, sem mudar o desenho.
- **A distribuição recomendada no runbook:** Ubuntu Server 24.04 LTS ou Debian 12. O pacote serve a qualquer Linux x86-64 com o Docker.
