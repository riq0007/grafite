## Why

Hoje o Grafite só se instala num servidor Windows, como serviços do WinSW, com o PostgreSQL e o Caddy para Windows (spec operacao-servicos). A empresa vai rodar o Grafite num servidor Linux dedicado só ao Docker. O `grafite.ps1` e o pacote da versão não funcionam lá. As imagens de contêiner existem desde o F0, mas sem a instalação, a atualização e o backup em volta delas, e sem o CI compilá-las.

A primeira instalação na empresa ainda não aconteceu, então não haverá migração: o servidor Linux nasce com a instalação do zero. O Windows continua suportado, de vez, ao lado do Linux.

Esta change continua o F2d · Operação da spec mestre (seção 3.1; a operação na seção 4.3 e o pacote da versão na 12.2). Ela revê a seção 4.3: o servidor interno passa a ser o Windows, com os serviços, ou um Linux só com o Docker, com os mesmos processos em contêineres.

Ficam fora desta change:
- a migração de uma instalação do Windows para o Linux. Não há uma a migrar, e o backup e a restauração continuam sendo o caminho, se um dia houver;
- instalar o Docker no servidor: ele é um pré-requisito, e o runbook diz como instalar;
- o menu da operação e o atalho de dois cliques, que a change `instalador-e-menu-da-operacao` traz só para o Windows;
- um registro de imagens: com o repositório privado, as imagens vão como arquivo na release e não usam a cota de armazenamento do GitHub;
- outra arquitetura além da x86-64, um orquestrador como o Kubernetes e a alta disponibilidade.

## What Changes

- **O servidor Linux, só com o Docker:**
  - a produção, o teste, o coletor da produção, o proxy e um PostgreSQL 18 para cada ambiente rodam como contêineres. Cada contêiner inicia com o Docker e reinicia sozinho depois de uma falha, com os logs em rotação por tamanho;
  - só o proxy atende a rede, nas portas 80 e 443. Os apps, o coletor e os bancos ficam numa rede interna do Docker;
  - os dados e a configuração ficam numa pasta só, `/opt/grafite` por padrão, como o `C:\Grafite` do Windows.
- **O pacote da versão para Linux:** o CI publica, na release de cada versão, ao lado do zip do Windows, um arquivo com todas as imagens da versão (a aplicação, o coletor, o comando de operação, o proxy e o PostgreSQL 18), o lançador e o runbook, com o SHA-256. O servidor não compila nada nem baixa imagens ou dependências: ele carrega as imagens do arquivo.
- **O comando de operação no Linux:**
  - o `grafite`, um lançador no servidor, roda o mesmo comando de operação do Windows, numa imagem própria, com os mesmos comandos: `instalar`, `atualizar`, `voltar`, `preparar-teste`, `backup`, `restaurar`, `proxy`, `servicos`, `cofre`, `email`, `organizacao` e `conta`;
  - exige o root, como o Windows exige o administrador.
- **A instalação do zero no Linux** confere o Docker, o plugin compose, o root e as portas 80 e 443 antes de criar qualquer coisa. Depois faz o que a do Windows faz:
  - as senhas e as chaves geradas;
  - os bancos dos dois ambientes;
  - a primeira organização e o coletor "Servidor";
  - o proxy e a saúde pelo HTTPS.
- **A atualização, a volta, o teste com a cópia da produção, o backup e a restauração** seguem as mesmas regras do Windows. No Linux, cada versão é um conjunto de imagens carregadas, e a volta passa o ambiente às imagens de antes.
- **As imagens:**
  - a da aplicação ganha as ferramentas do PostgreSQL 18, que o backup diário usa;
  - nascem a imagem do comando de operação e a do proxy, com o módulo do DNS da Cloudflare;
  - o CI as compila e confere em cada versão, com uma instalação de teste no Linux.
- **O runbook** ganha a operação no Linux, ao lado da do Windows.

## Capabilities

### New Capabilities
- `operacao-em-linux`: instalar, atualizar e manter o Grafite num servidor Linux dedicado ao Docker. Cobre:
  - os contêineres e a rede;
  - o pacote da versão para Linux;
  - o lançador do comando de operação;
  - a instalação do zero;
  - a atualização e a volta pelas imagens;
  - o teste com a cópia da produção;
  - o backup e a restauração no Linux;
  - a instalação de teste no CI;
  - o runbook.

### Modified Capabilities
- `plataforma-base`: as "Imagens de contêiner para o produto" passam a ser as do servidor Linux. A da aplicação ganha as ferramentas do PostgreSQL 18, nascem as imagens do comando de operação e do proxy, e o CI as compila e confere a cada versão.

## Impact

- **`Dockerfile`:** o cliente do PostgreSQL 18 na imagem da aplicação e os alvos novos `operacao` e `proxy`. O PostgreSQL 18 vem fixado na versão de cada pacote.
- **`apps/operacao`:**
  - a plataforma Linux nas peças do comando: os contêineres pelo Docker Compose no lugar dos serviços do Windows, o layout em `/opt/grafite`, o PostgreSQL em contêiner e as imagens por versão;
  - o lançador `grafite` e o `instalar.sh` do pacote;
  - o script que monta o pacote para Linux.
- **`.github/workflows/versao.yml`:** o pacote para Linux e a instalação de teste num Linux, rodada num Docker dentro de um contêiner no executor. A release passa a levar os dois pacotes.
- **API e web:** nenhuma rota ou tela muda.
- **Documentação:**
  - o runbook, com a operação no Linux;
  - a spec mestre, nas seções 4.3 e 12.2;
  - o mapa e a tabela de comandos do `CLAUDE.md`.
- **Dependências:**
  - no servidor, só o Docker Engine com o plugin compose;
  - no CI, o Docker do executor, que já roda a integração.
