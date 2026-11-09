# Runbook da operação do Grafite

Como instalar, atualizar e manter o Grafite no servidor Windows da empresa: os ambientes de produção e de teste, o HTTPS, o backup e a restauração. O servidor Linux com o Docker tem as diferenças dele em [Servidor Linux com o Docker](#servidor-linux-com-o-docker). Este runbook vai em cada pacote da versão, em `docs\operacao\runbook.md` (`docs/operacao/runbook.md` no pacote para Linux).

No Windows, a instalação começa pelo atalho de instalação, o `Instalar-Grafite.cmd`, com dois cliques, e a operação do dia a dia, pelo atalho "Grafite" da área de trabalho, que abre o [painel da operação](#painel-da-operação) no navegador do servidor. O [menu da operação](#menu-da-operação) abre pelo comando, para quem prefere o terminal.

Os comandos rodam num **PowerShell aberto como administrador**. Depois da instalação, o comando de operação é `C:\Grafite\grafite.ps1` (ou o da pasta escolhida na instalação), e `C:\Grafite\grafite.ps1 --ajuda` mostra todos os comandos. O painel e o menu rodam esses mesmos comandos, com as mesmas conferências e confirmações; a restauração, a volta e a troca da chave do cofre ficam no painel e no comando, fora do menu.

Para configurar o inventário das estações e diagnosticar certificados, consulte [Inventário pelo GLPI Agent](agente-glpi.md). As correções das integrações da rede, das impressoras lidas pelo GETNEXT aos painéis em http mostrados pela ponte HTTPS, estão em [Integrações da rede](integracoes-da-rede.md).

## Visão geral

O servidor tem dois ambientes, cada um com o próprio app, o próprio banco e a própria configuração:

- **produção:** o que as pessoas usam, em `https://grafite.empresa.com.br`;
- **teste:** uma cópia da produção para validar as versões novas, em `https://grafite-teste.empresa.com.br`. Ele avisa "Ambiente de teste" na barra e na tela de entrada.

Os apps atendem só no próprio servidor (127.0.0.1). A rede chega a eles só pelo proxy (o Caddy), nas portas 80 e 443.

| Serviço no Windows | Nome do serviço | O que é |
|---|---|---|
| Grafite | `grafite` | O app da produção, em 127.0.0.1:3000 |
| Grafite Teste | `grafite-teste` | O app do teste, em 127.0.0.1:3001 |
| Grafite Coletor | `grafite-coletor` | O coletor local da produção, em 127.0.0.1:3100 |
| Grafite Proxy | `grafite-proxy` | O Caddy, nas portas 80 e 443 |
| Grafite PostgreSQL Teste | `grafite-postgresql-teste` | A instância do PostgreSQL do teste, em 127.0.0.1:5433 |
| postgresql-x64-18 | `postgresql-x64-18` | A instância do PostgreSQL da produção, em 127.0.0.1:5432 |

As pastas, dentro de `C:\Grafite`:

```text
C:\Grafite
├── grafite.ps1              o comando de operação
├── Grafite.cmd, grafite.ico o atalho do painel, para onde o "Grafite" da área de trabalho aponta
├── operacao.json            o estado: as versões, os endereços, as portas e o modo do certificado
├── versoes\<x.y.z>\         cada versão desempacotada, uma vez só
├── producao\
│   ├── config.env           a configuração da produção, com as senhas
│   ├── coletor.env          a configuração do coletor
│   ├── coletor\             a fila em disco do coletor
│   ├── atual\, anterior\    a versão em uso e a de antes da última atualização
│   ├── arquivos\            as fotos e os outros arquivos
│   └── logs\
├── teste\
│   ├── config.env, atual\, anterior\, arquivos\, logs\
│   └── banco\               os dados da instância do PostgreSQL do teste
├── caddy\
│   ├── Caddyfile            gerado pelo comando; não edite
│   ├── config.env           o token do DNS, no modo público
│   └── dados\               os certificados e a AC interna
├── servicos\                o XML e o WinSW de cada serviço
└── backups\                 o primeiro destino do backup, por padrão
```

Os bancos são `grafite`, na instância da produção, e `grafite_teste`, na do teste. Cada instância tem os próprios papéis (`grafite_owner`, `grafite_app` e `grafite_backup`), com senhas diferentes: a credencial do teste não abre a produção.

## Pré-requisitos do servidor

- **Windows Server 2019, 2022 ou 2025**, 64 bits, com as atualizações em dia, 8 GB de memória e espaço em disco para os dois bancos, os arquivos, as versões e o primeiro destino do backup. Com um segundo disco, como o D:, o Grafite, os bancos e os backups ficam nele, e as atualizações do Windows não enchem o disco do banco. A EDB só testa o PostgreSQL 18 no 2022 e no 2025; no 2019, o Grafite foi conferido pela instalação do zero. Se uma atualização do PostgreSQL ou do Windows o quebrar no 2019, a saúde dos serviços e o teste de restauração mostram a falha, e a saída é o 2022, o 2025 ou o servidor Linux.
- **Um navegador atual no servidor,** para o painel da operação. O 2022 e o 2025 já vêm com o Microsoft Edge. O 2019 vem só com o Internet Explorer, que não abre o painel: instale o Edge pelo instalador para empresas (o `.msi` da página do Microsoft Edge for Business) e deixe-o como o navegador padrão, em **Configurações › Aplicativos › Aplicativos padrão**. Num servidor sem interface gráfica, como o Server Core, a operação é pelo menu e pelos comandos.
- **Node.js 24 e PostgreSQL 18:** o atalho de instalação instala os que faltam, pelos instaladores oficiais, com a versão e o SHA-256 fixados no pacote. Para instalar à mão, use o instalador oficial (`.msi`) de nodejs.org, com a opção que põe o Node no PATH (confira com `node --version`), e o PostgreSQL como diz a seção a seguir.
- **As portas 80 e 443 livres:** sem o IIS nem outro servidor web nelas. O comando de operação abre as duas no firewall; a 5432 e a 5433 ficam fechadas para a rede. O IIS pode ter vindo junto com outro recurso do Windows, como a ativação HTTP do WCF. Se ele ocupa uma das portas, o atalho de instalação pergunta se pode parar e desligar o serviço dele, o **Serviço de Publicação na World Wide Web** (`W3SVC`); à mão: `Stop-Service W3SVC; Set-Service W3SVC -StartupType Disabled`.
- **Os endereços no DNS da empresa**, apontando para o servidor: o da produção e o do teste.
- **Os destinos do backup**, como uma pasta noutro disco e um compartilhamento de rede. Os serviços rodam como a conta do sistema, então, num compartilhamento, quem grava é a conta do computador (`EMPRESA\SERVIDOR$`): dê a ela a permissão de alterar, e só a ela e aos administradores.

## PostgreSQL 18

A instância da produção vem do instalador oficial (EDB). O atalho de instalação o roda em silêncio quando o servidor não tem o PostgreSQL:

- ele pergunta a **pasta dos dados**, com `D:\PostgreSQL\18\data` proposto quando o servidor tem um disco D:, e `C:\Program Files\PostgreSQL\18\data` quando não tem. Uma pasta que já tem arquivos é recusada;
- ele pede a **senha do `postgres`** duas vezes, sem mostrá-la. Guarde-a no cofre de senhas da TI: ela não fica gravada no servidor;
- os programas ficam em `C:\Program Files\PostgreSQL\18`, na porta 5432, com o serviço `postgresql-x64-18` iniciando com o Windows e o servidor atendendo só no próprio computador;
- um PostgreSQL 18 que o servidor já tem fica como está. Com um PostgreSQL de outra versão, o atalho para: instale o 18 à mão, numa porta livre, e rode a instalação pelo comando.

Tire a pasta dos dados escolhida da verificação em tempo real do antivírus, e não só a padrão: o antivírus que trava os arquivos do banco o deixa lento ou o derruba.

Para instalar à mão, use o instalador de postgresql.org/download/windows, na versão 18 mais recente:

1. **Componentes:** "PostgreSQL Server" e "Command Line Tools". O pgAdmin e o Stack Builder não são necessários.
2. **Pasta:** a padrão, `C:\Program Files\PostgreSQL\18`. Os dados podem ficar noutro disco.
3. **Senha do `postgres`:** uma senha forte, guardada no cofre de senhas da TI. Ela não fica gravada no servidor: o comando de operação a pede na instalação e na restauração da produção.
4. **Porta:** 5432.
5. **Locale:** o padrão.

Depois de instalar:

- confira que o serviço `postgresql-x64-18` está em execução e com o início automático;
- em `C:\Program Files\PostgreSQL\18\data\postgresql.conf`, deixe `listen_addresses = 'localhost'` e reinicie o serviço: o Grafite só conecta pelo próprio servidor.

A instância do teste não precisa de outro instalador: o `instalar` a cria com os mesmos programas, com a senha do `postgres` dela gerada e guardada na configuração da produção.

## Certificado

O Grafite só funciona por HTTPS. A instalação escolhe um de dois modos.

### Domínio público, com o Let's Encrypt

Para quando o endereço é de um domínio da empresa cujo DNS está na Cloudflare, mesmo que o endereço só resolva na rede interna. O certificado vem do Let's Encrypt, pelo desafio de DNS, e se renova sozinho. Todo computador e celular confia nele sem instalar nada.

Crie o token na Cloudflare, limitado à zona:

1. Em **My Profile › API Tokens**, escolha **Create Token** e o modelo **Edit zone DNS**.
2. Em **Permissions**, deixe só **Zone · DNS · Edit**.
3. Em **Zone Resources**, escolha **Include · Specific zone** e a zona da empresa, como `empresa.com.br`.
4. Copie o token. A instalação o pede sem mostrar na tela e o grava só em `C:\Grafite\caddy\config.env`.

Para trocar o token, edite `CLOUDFLARE_API_TOKEN` em `C:\Grafite\caddy\config.env` e rode:

```powershell
C:\Grafite\grafite.ps1 proxy configurar
```

### AC interna

Para quando não há domínio público. O certificado vem de uma AC interna, que os computadores e os celulares precisam conhecer:

- **a AC do próprio proxy:** o Caddy cria a AC na primeira partida e renova sozinho os certificados dos endereços. A raiz vale por 10 anos;
- **a AC da empresa:** a instalação recebe os arquivos PEM do certificado, com a cadeia, e da chave. A renovação é manual: troque os arquivos antes de vencer e rode `proxy configurar`.

Com a AC do próprio proxy, copie a raiz para distribuir:

```powershell
C:\Grafite\grafite.ps1 proxy raiz C:\Temp\grafite-raiz.crt
```

E instale a raiz em cada lugar:

- **Computadores do domínio:** numa GPO, em **Configuração do Computador › Políticas › Configurações do Windows › Configurações de Segurança › Políticas de Chave Pública › Autoridades de Certificação Raiz Confiáveis**, importe o `grafite-raiz.crt`.
- **Android:** em **Configurações › Segurança › Criptografia e credenciais › Instalar um certificado › Certificado de AC**, escolha o arquivo.
- **iPhone e iPad:** envie o arquivo, instale o perfil em **Ajustes › Geral › VPN e Gerenciamento de Dispositivos** e ative a confiança em **Ajustes › Geral › Sobre › Ajustes de Confiança de Certificados**.

Sem a raiz instalada, o navegador avisa que a conexão não é segura, e a PWA não instala.

### Vigilância e troca de modo

Uma tarefa diária da produção confere a validade do certificado. Com menos de 14 dias, a renovação parou, e a falha aparece em **Administração › Tarefas** da organização que opera o servidor, com o endereço e os dias.

Para trocar de modo, ou de AC, use o comando, ou **Configurações › Certificado**, no painel:

```powershell
C:\Grafite\grafite.ps1 certificado configurar --modo interno --ac caddy
C:\Grafite\grafite.ps1 certificado configurar --modo interno --ac empresa --certificado D:\certificados\grafite.crt --chave D:\certificados\grafite.key
C:\Grafite\grafite.ps1 certificado configurar --modo publico --email ti@empresa.com.br
```

No modo público, o comando pede o token da Cloudflare sem eco e o grava só em `caddy\config.env`. Ele gera de novo a configuração do proxy, grava o modo no `operacao.json`, reinicia os dois apps, que passam a confiar na raiz da AC interna ou deixam de confiar nela, e confere o HTTPS dos dois ambientes. O proxy nunca troca de modo sozinho.

## Instalação do zero

### Pelo atalho de instalação

1. Baixe da release do Grafite, na [página das versões](https://github.com/riq0007/grafite/releases), para a mesma pasta do servidor, como `C:\Instalacao`, os três arquivos do Windows: o `grafite-x.y.z-windows-x64.zip`, o `grafite-x.y.z-windows-x64.zip.sha256` e o `Instalar-Grafite.cmd`. Deixe na pasta só o zip da versão que vai instalar.
2. **Servidor sem internet:** copie também para a pasta os instaladores oficiais que faltam, com os nomes do `apps\operacao\prerequisitos.json` do pacote, como o `node-v24.22.1-x64.msi`, de nodejs.org, e o `postgresql-18.6-1-windows-x64.exe`, da EDB. Sem um instalador na pasta, o atalho o baixa da fonte oficial. Nos dois casos, ele só roda o instalador cujo SHA-256 confere com o fixado no pacote.
3. **Arquivo baixado da internet:** o Windows marca o `Instalar-Grafite.cmd` e pergunta antes de rodá-lo. Nas propriedades dele, marque **Desbloquear** e confirme.
4. Dê dois cliques no `Instalar-Grafite.cmd` e aceite o pedido de elevação do Windows.

O atalho confere o zip pelo `.sha256` antes de extrair qualquer coisa, extrai o pacote ao lado, em `grafite-x.y.z`, e:

- instala o Node 24, se o servidor não o tiver. Com outra versão do Node, ele para, sem trocar o Node de outros programas;
- se o IIS ocupa a porta 80 ou a 443, pergunta se pode parar o serviço dele e desligar o início automático. Com o não, ele para sem ter instalado nada;
- instala o PostgreSQL 18, se faltar, com as perguntas da seção [PostgreSQL 18](#postgresql-18);
- então chama a instalação do Grafite, que segue com as perguntas dela, abaixo. Num servidor com o disco D:, responda `D:\Grafite` para a pasta da instalação.

A janela fica aberta no fim, com o resultado e a senha temporária da primeira conta. A instalação cria o atalho "Grafite" na área de trabalho de todos os usuários, que abre o [menu da operação](#menu-da-operação).

### Pelo comando

Com o Node 24 e o PostgreSQL 18 instalados à mão, ou num roteiro, a instalação roda pelo `instalar.ps1` do pacote:

1. Baixe da release do Grafite, na [página das versões](https://github.com/riq0007/grafite/releases), o `grafite-x.y.z-windows-x64.zip` e o `grafite-x.y.z-windows-x64.zip.sha256`, na mesma pasta, como `C:\Temp`.
2. Extraia o zip numa pasta temporária, como `C:\Temp\grafite-x.y.z` (**Extrair tudo**).
3. Num PowerShell como administrador, rode o `instalar.ps1` da pasta extraída, com o zip:

```powershell
C:\Temp\grafite-x.y.z\instalar.ps1 C:\Temp\grafite-x.y.z-windows-x64.zip
```

Se o Windows bloquear o script, rode `powershell -ExecutionPolicy Bypass -File C:\Temp\grafite-x.y.z\instalar.ps1 C:\Temp\grafite-x.y.z-windows-x64.zip`.

### O que a instalação pergunta e faz

A instalação confere o Node 24, o hash do pacote, o PostgreSQL 18, a senha do `postgres` e as portas 80 e 443 antes de criar qualquer coisa. Depois pergunta:

- a pasta da instalação, `C:\Grafite` por padrão, e a dos programas do PostgreSQL 18. Pelo atalho, com o PostgreSQL que ele acabou de instalar, a senha do `postgres` e a pasta dos programas não são perguntadas de novo;
- os endereços da produção e, para cada um, o do teste (`grafite-teste.empresa.com.br` no lugar de `grafite.empresa.com.br`, por padrão);
- o modo do certificado;
- os destinos do backup, separados por ponto e vírgula, e a janela em que o horário do backup pode ficar, `00:00-06:00` por padrão;
- a organização que opera o servidor e a pessoa e o usuário da primeira conta.

Então ela cria a configuração de cada ambiente, com senhas geradas, a instância do teste, os bancos, a primeira organização e os serviços, abre as portas 80 e 443 e confere a saúde dos dois ambientes pelo HTTPS. O coletor da produção fica ligado à primeira organização com o nome "Servidor", sem faixas: ele só começa a coletar depois que as faixas forem cadastradas (veja "Coletor").

A **senha temporária da primeira conta** aparece uma vez só: entregue-a à pessoa. Na primeira entrada, a conta troca a senha e cadastra a verificação em dois passos.

O teste fica vazio até a primeira cópia da produção (`preparar-teste`). Depois da instalação, a pasta extraída pode ser apagada, e a operação passa a ser pelo atalho "Grafite" ou pelos comandos de `C:\Grafite\grafite.ps1`.

**Instalação interrompida:** dê os dois cliques no atalho de novo, ou rode o mesmo comando. Ela continua de onde parou, com as respostas guardadas em `C:\Grafite\instalacao.json` e as mesmas senhas; só a senha do `postgres` é pedida outra vez.

**Sem perguntas:** para um roteiro, as respostas podem vir de um arquivo, com `--respostas`, no atalho, com o Node e o PostgreSQL já instalados, ou no `instalar.ps1`:

```powershell
C:\Instalacao\Instalar-Grafite.cmd --respostas C:\Temp\respostas.json
C:\Temp\grafite-x.y.z\instalar.ps1 C:\Temp\grafite-x.y.z-windows-x64.zip --respostas C:\Temp\respostas.json
```

```json
{
  "raiz": "C:\\Grafite",
  "pgBin": "C:\\Program Files\\PostgreSQL\\18\\bin",
  "senhaDoPostgres": "a senha do postgres da produção",
  "enderecos": ["grafite.empresa.com.br"],
  "mapaDoTeste": { "grafite.empresa.com.br": "grafite-teste.empresa.com.br" },
  "certificado": { "modo": "interno", "ac": "caddy" },
  "backup": { "destinos": ["C:\\Grafite\\backups", "\\\\nas\\Backups Grafite"], "janela": "00:00-06:00" },
  "organizacao": { "nome": "Empresa", "pessoa": "Ana Souza", "usuario": "ana.souza", "email": "ana@empresa.com.br" }
}
```

No modo público, o certificado é `{ "modo": "publico", "email": "ti@empresa.com.br" }`, e o arquivo traz também `"tokenDaCloudflare"`. Apague o arquivo de respostas depois: ele tem a senha do `postgres`.

## Painel da operação

O painel é uma página do próprio servidor, separada do app, que mostra o estado do Grafite e roda as tarefas da operação pelos mesmos comandos do `grafite.ps1`, com as mesmas conferências e confirmações. Ele funciona com os apps parados.

No Windows, o atalho "Grafite" da área de trabalho de todos os usuários abre o painel: ele pede a elevação do Windows, sobe o painel numa janela do comando e abre o navegador padrão da sessão em `http://127.0.0.1:<porta>/#<código>`. Sem o atalho:

```powershell
C:\Grafite\grafite.ps1 painel
```

- **Só no próprio servidor.** O painel atende só em 127.0.0.1, numa porta livre: outro computador da rede não chega a ele. A página entra com o código de uso único do endereço, que vira o cookie da sessão; recarregar a página continua valendo, mas o mesmo endereço noutro navegador diz que o código já foi usado. Para abrir de novo, use o atalho ou o comando.
- **A janela do comando fica aberta.** Fechá-la encerra o painel, e ele também encerra sozinho depois de 30 minutos sem uso, nunca no meio de uma tarefa. Com uma tarefa rodando, a página avisa antes de fechar, e a janela diz para não fechá-la.
- **Uma tarefa por vez.** O andamento aparece ao vivo, com o que o comando escreve; as perguntas e as confirmações viram um diálogo, e uma senha é digitada sem aparecer. Enquanto uma tarefa roda, as outras ações esperam, com o motivo escrito. O fim diz o resultado, ou o motivo da falha, como o comando diria.
- **Os segredos ficam fora da página.** A senha do e-mail e o token do DNS não voltam do servidor: a página só diz se estão configurados, e o comando os pede de novo quando é para trocar.

| Aba | O que tem |
|---|---|
| Visão geral | Cada serviço da instalação com o estado escrito e os botões de ligar, desligar e reiniciar o ambiente dele; a versão em uso e a anterior de cada ambiente; o último backup e o último teste de restauração; os dias até o certificado vencer; o espaço livre no disco. A faixa de avisos, no topo, diz o serviço parado, o backup com falha ou de mais de 26 horas, o destino sem o backup mais novo, o certificado com menos de 14 dias e o disco com menos de 10% livre |
| Atualização | O pacote, escolhido entre os das pastas de Downloads e de `C:\Temp` ou digitado, e o ambiente: o teste primeiro, a produção só com a versão que roda no teste |
| Backups | O backup agora, o teste de restauração, a preparação do teste e os backups de cada destino |
| Logs | As últimas linhas do log de cada serviço, com a busca por um texto |
| Configurações | O e-mail, com o envio de teste; o backup; o certificado; os endereços; criar uma conta e redefinir um acesso |
| Operações sensíveis | A restauração da produção por um backup da lista, a volta à versão anterior e a troca da chave do cofre, cada uma explicada antes, com o nome do banco da produção digitado |

A lista dos serviços vem da instalação: um serviço que uma versão nova acrescenta aparece no painel sem mudar nada. No Linux, o painel abre pelo `sudo grafite painel`, numa sessão com interface (veja [Painel no Linux](#painel-no-linux)).

## Menu da operação

O menu é a operação do dia a dia no terminal, para quem prefere o teclado ou está num servidor sem interface gráfica. Ele abre pelo comando, num PowerShell como administrador, e mostra as tarefas do dia a dia numeradas:

```powershell
C:\Grafite\grafite.ps1 menu
```

Cada tarefa pergunta o que o comando dela precisa, com os padrões tirados da instalação, e roda o mesmo comando do `grafite.ps1`, com as mesmas conferências e as mesmas confirmações. No fim de cada uma, com sucesso ou com falha, o menu mostra o resultado e volta à lista; o 0 sai.

| Tarefa | O que pergunta | O comando |
|---|---|---|
| Estado dos serviços | Nada | `servicos estado` |
| Criar uma conta | O ambiente (a produção, por padrão), o endereço da organização (o da operadora no ambiente), o nome da pessoa, o usuário, o e-mail, que é opcional, e se a pessoa é administradora | `conta criar` |
| Redefinir um acesso | O ambiente, o endereço da organização, o usuário e se tira também a verificação em dois passos | `conta redefinir` |
| Fazer o backup agora | Nada | `backup agora` |
| Listar os backups | Nada | `backup listar` |
| Configurar o e-mail | O endereço do servidor de e-mail e o remetente; a senha, sem eco, quando o endereço só tem o usuário | `email configurar` |
| Testar o e-mail | O e-mail que recebe o teste | `email testar` |
| Atualizar um ambiente | O zip da versão (o mais novo das pastas de Downloads e de `C:\Temp`, por padrão) e o ambiente (o teste, por padrão); na produção, o nome do banco digitado | `atualizar` |
| Preparar o teste | O nome do banco do teste digitado | `preparar-teste` |
| Reiniciar um ambiente | O ambiente (a produção, por padrão) | `servicos reiniciar` |
| Abrir a pasta dos logs | Nada: abre a pasta dos logs da produção no Explorer | — |

Ficam no painel e no comando, como cada seção deste runbook diz: a restauração da produção, a volta à versão anterior e a troca da chave do cofre.

## Atualização

Cada versão nova passa primeiro pelo teste e só depois vai para a produção, com o mesmo pacote. Baixe o zip e o `.sha256` da release, na [página das versões](https://github.com/riq0007/grafite/releases), para a mesma pasta; o comando confere o hash antes de tudo.

### No teste

```powershell
C:\Grafite\grafite.ps1 atualizar C:\Temp\grafite-x.y.z-windows-x64.zip --ambiente teste
```

O comando desempacota a versão em `C:\Grafite\versoes\x.y.z` (uma vez só), para o app do teste, aplica as migrations no banco do teste, passa o teste a usar a versão nova, inicia e confere a saúde. Confira o teste: as telas que mudaram e o que a versão nova traz. Para validar as migrations nos dados reais, prepare o teste com a cópia da produção antes ou depois de atualizá-lo.

### Promoção para a produção

```powershell
C:\Grafite\grafite.ps1 atualizar C:\Temp\grafite-x.y.z-windows-x64.zip --ambiente producao
```

O comando só aceita a versão que roda no teste, com saúde e com todas as migrations dela aplicadas no banco do teste. Então:

1. faz o backup da produção e o confere;
2. pede o nome do banco da produção digitado (`grafite`);
3. para o coletor e o app;
4. aplica as migrations e passa a produção à versão nova;
5. inicia o app, confere a saúde, liga o coletor à organização que opera o servidor, se ele ainda não estiver ligado, e inicia o coletor.

O caminho do backup de antes da atualização aparece no fim. Uma produção instalada antes do coletor ganha nessa hora o "Servidor", sem faixas, com o token que o coletor já tinha. Uma instalada antes do menu, como a da v0.1.0, ganha o `Grafite.cmd` na raiz e o atalho "Grafite" na área de trabalho de todos os usuários; nas atualizações seguintes, o `Grafite.cmd` é trocado pelo da versão nova, e o atalho, que já existe, fica como está.

### A versão com os fornecedores

A versão que traz os fornecedores (P4a) troca, na atualização, o fornecedor em texto de cada ativo por um fornecedor cadastrado:
- os textos que diferem só no acento, nas maiúsculas e nos espaços viram um fornecedor só, com o nome mais usado;
- a origem, o momento, o autor e a trava de cada valor continuam, e o texto em branco vira a falta do valor;
- o filtro "contém" do fornecedor, nas visões e nas mudanças guardadas das contas, vira "é qualquer de" com os fornecedores cujo nome contém o texto.

Depois de atualizar, em Administração › Fornecedores:
1. confira os nomes criados, um por grafia diferente;
2. informe os CNPJs;
3. junte os que eram o mesmo fornecedor com nomes diferentes, como "HP" e "HP Brasil": importe uma planilha com o patrimônio e o fornecedor certo dos ativos de um deles e inative o outro.

Na volta à versão anterior, o campo do fornecedor mostraria o identificador no lugar do nome. Depois dessa atualização, o caminho é restaurar a produção com o backup de antes dela, como diz "Restauração da produção".

### A versão com os consumíveis

A versão que traz os consumíveis (P4b) cria o módulo Operação, ligado em toda organização, sem mudar os dados que já existem. Depois de atualizar:
1. em Administração › Perfis, dê `consumiveis.ver` ou `consumiveis.editar` aos perfis que cuidam dos toners e dos outros consumíveis; o Administrador já tem as duas;
2. em Ativos › Catálogo › Tipos, ligue os consumíveis compatíveis no tipo das impressoras e nos outros tipos que usam consumíveis;
3. em Operação › Consumíveis, cadastre os consumíveis, com os fornecedores e os modelos em que cada um serve.

A organização que não usa os consumíveis desliga o Operação em Administração › Módulos.

Na volta à versão anterior, o tipo que ligou os consumíveis compatíveis não pode ser salvo, porque a versão anterior não conhece a capacidade. Depois dessa atualização, o caminho é restaurar a produção com o backup de antes dela, como diz "Restauração da produção".

### A versão com o estoque

A versão que traz o estoque (P4c) acrescenta ao Operação o estoque dos consumíveis por local, vazio, sem mudar os dados que já existem. Depois de atualizar:
1. em Administração › Perfis, dê `estoque.ver` aos perfis que consultam o estoque e `estoque.movimentar` aos que lançam as entradas, as saídas, as transferências e os ajustes; atribua cada perfil no ramo dos locais de que a pessoa cuida, como o almoxarifado de uma unidade. O Administrador já tem as duas, na organização inteira;
2. em Operação › Estoque, lance o inventário inicial de cada local pelo ajuste de acrescentar, com o motivo Inventário: um ajuste por consumível e local, com a quantidade contada;
3. na linha de cada consumível em cada local, defina o mínimo com "Definir mínimo": abaixo dele, o consumível aparece em "O que resolver agora".

Um lançamento errado não se apaga nem se edita: corrija o saldo com outro ajuste, com o motivo e a observação, e os dois ficam nas movimentações e na auditoria.

Na volta à versão anterior, o estoque deixa de aparecer, e os lançamentos feitos depois da atualização se perdem com a restauração. Depois dessa atualização, o caminho é restaurar a produção com o backup de antes dela, como diz "Restauração da produção".

### A versão com as solicitações

A versão que traz as solicitações (P4d) acrescenta ao Operação as solicitações de toner, de conserto e de equipamento, vazias, sem mudar os dados que já existem. Por enquanto, quem registra é a TI, em nome da pessoa que pediu; o colaborador vai abrir o próprio pedido pelo portal, numa versão futura. Depois de atualizar:
1. em Administração › Perfis, dê `solicitacoes.ver` aos perfis que só consultam as solicitações, como os gestores, e `solicitacoes.atender` aos da TI que registram, entregam e encerram; atribua cada perfil no ramo dos locais de que a pessoa cuida. O Administrador já tem as duas, na organização inteira;
2. para entregar o toner do estoque, quem atende precisa também de `estoque.movimentar` no local de origem; sem ela, a entrega só pode ser pelo fornecedor;
3. confira que as pessoas que pedem estão em Administração › Pessoas, com o local de trabalho: "Pedida por" escolhe a pessoa no cadastro, nunca um nome digitado, e as do local da impressora vêm primeiro.

A solicitação não se apaga: a pedida por engano se cancela, com o motivo, e fica na lista de todas e na auditoria. O número é da organização e não se repete nem pula.

Na volta à versão anterior, as solicitações deixam de aparecer, e as registradas depois da atualização se perdem com a restauração, como as saídas do estoque das entregas. Depois dessa atualização, o caminho é restaurar a produção com o backup de antes dela, como diz "Restauração da produção".

### A versão com as ordens de serviço

A versão que traz as ordens de serviço (P4e) acrescenta ao Operação as OS, vazias, e o tipo Peça aos consumíveis, sem mudar os dados que já existem. A OS é o trabalho da TI num ativo; o conserto registrado antes da atualização continua como está, e quem atende pode abrir a OS dele pela ficha. Depois de atualizar:
1. em Administração › Perfis, dê `ordens.ver` aos perfis que só consultam as OS, como os gestores, e `ordens.atender` aos da TI que abrem, atendem e encerram; atribua cada perfil no ramo dos locais de que a pessoa cuida. O Administrador já tem as duas, na organização inteira;
2. para lançar as peças, quem atende precisa também de `estoque.movimentar` no local de onde a peça sai; sem ela, a gaveta da peça diz que não há saldo nos locais em que a pessoa movimenta o estoque;
3. para abrir a OS pela solicitação de conserto, a pessoa precisa de `solicitacoes.atender` nos locais da solicitação e de `ordens.atender` no local do ativo;
4. cadastre em Operação › Consumíveis, com o tipo Peça, as peças que a TI troca, como as fontes e os teclados, e lance a entrada delas no estoque.

A OS não se apaga: a aberta por engano se encerra sem resolver, com o motivo, e fica na lista de todas e na auditoria. A peça lançada não sai da OS: a peça errada se corrige no estoque, por um ajuste. O número é da organização e não se repete nem pula.

Na volta à versão anterior, as OS deixam de aparecer, e as abertas depois da atualização se perdem com a restauração, como as Peças cadastradas e as saídas do estoque delas. Depois dessa atualização, o caminho é restaurar a produção com o backup de antes dela, como diz "Restauração da produção".

### A versão com os indicadores da operação

A versão que traz os indicadores da operação (P4f) acrescenta ao Operação a tela Indicadores, com o tempo de resolução das OS, as OS repetidas e as páginas por toner, calculados com as OS e as saídas do estoque que já existem, sem mudar os dados. Quem vê as OS vê os dois primeiros, e quem vê o estoque, as páginas por toner, cada um com o que vê, sem nada a fazer. A permissão nova, `operacao.administrar`, muda as metas desses indicadores e recebe o aviso do indicador fora da meta; ela inclui `ordens.ver` e `estoque.ver`, e vale na organização inteira. Depois de atualizar:
1. em Administração › Perfis, dê `operacao.administrar` só aos perfis de quem decide a operação da TI, como a coordenação: quem a tem vê as OS e o estoque de todos os locais. O Administrador já a tem;
2. para as páginas por toner contarem, confira em Operação › Consumíveis o rendimento dos toners: o toner sem o rendimento fica fora do indicador;
3. confira as metas de fábrica (3 dias, 2 OS e 80%) em Operação › Indicadores e mude as que não servem à organização.

A avaliação das 7h, a mesma dos indicadores dos alertas, avalia os da operação com o Operação ligado e avisa quem tem `operacao.administrar` quando um sai da meta, uma vez a cada saída.

Na volta à versão anterior, a tela e a permissão deixam de existir, e as metas da operação mudadas depois da atualização se perdem com a restauração. Depois dessa atualização, o caminho é restaurar a produção com o backup de antes dela, como diz "Restauração da produção".

### Atualização que falhou

Uma falha antes da parada não muda nada. Depois da parada, o app e o coletor ficam parados, e a mensagem diz o que falhou e onde está o backup de antes. Então:

1. Leia o erro e os logs do ambiente (`C:\Grafite\producao\logs` ou `C:\Grafite\teste\logs`).
2. Veja em `C:\Grafite\operacao.json` a versão `atual` do ambiente.
3. Se ela ainda é a de antes (a falha foi nas migrations): as migrations de uma versão rodam numa transação, então o banco ficou como estava. Volte o ambiente ao ar com a versão de antes e corrija a causa, no teste primeiro:

```powershell
C:\Grafite\grafite.ps1 servicos reiniciar --ambiente producao
```

4. Se ela já é a nova (a falha foi na partida ou na saúde): volte à versão anterior, como diz a próxima seção.
5. Se o banco ficou num estado ruim: restaure a produção com o backup de antes da atualização, como diz "Restauração da produção".

### Volta à versão anterior

```powershell
C:\Grafite\grafite.ps1 voltar --ambiente producao
```

A volta troca a versão atual pela anterior, sem desfazer migrations: toda mudança de estrutura acrescenta antes de remover, então a versão anterior roda no banco novo. Rodar a volta de novo vai outra vez à versão nova. Só existe uma versão anterior depois de uma atualização. O mesmo vale para o teste, com `--ambiente teste`. Na produção, antes de mudar qualquer coisa, o comando pede o nome do banco da produção digitado (num roteiro, `--confirmar grafite`). No painel, a volta fica em **Operações sensíveis**.

A exceção é a versão que traz os campos de arquivo e de imagem: ela só volta à anterior enquanto nenhum campo desses foi criado no catálogo, porque a anterior não conhece os dois tipos e não lê os campos da organização com um deles. Depois do primeiro, o caminho é corrigir numa versão nova ou restaurar a produção com o backup de antes da atualização, como diz "Restauração da produção".

O atalho "Grafite" segue a produção: a volta devolve o `Grafite.cmd` da versão de antes. Voltar a uma versão sem o painel, como a v0.1.1, faz o atalho abrir o menu dela, e ir de novo à versão nova devolve o painel. A v0.1.0 não tem nem o menu: a volta da produção para ela diz que o atalho não foi trocado, e ele mostra "Comando desconhecido" e a ajuda, sem mudar nada. Nesse caso, apague o atalho da área de trabalho de todos os usuários (`C:\Users\Public\Desktop\Grafite.lnk`) e opere pelos comandos.

## O teste com a cópia da produção

```powershell
C:\Grafite\grafite.ps1 preparar-teste
```

O comando troca os dados do teste pelos da produção:

1. usa o backup da produção das últimas 24 horas, conferido, ou faz um;
2. pede o nome do banco do teste digitado (`grafite_teste`);
3. para o app do teste, restaura o banco e os arquivos do backup no teste;
4. troca o endereço de cada organização pelo do teste, pelo mapa do teste; os endereços fora do mapa saem, então o teste nunca atende um endereço da produção;
5. aplica as migrations da versão do teste, inicia e confere a saúde.

Nada volta do teste para a produção. As pessoas entram no teste com as senhas e os apps autenticadores de sempre, porque os dados são uma cópia.

**Organização sem endereço:** a preparação avisa, pelo nome, cada organização que ficou sem endereço no teste. Para ela ter um, acrescente o par ao `mapaDoTeste` de `C:\Grafite\operacao.json` (o endereço da produção e o do teste) e o endereço do teste a `ambientes.teste.enderecos`, ponha o endereço do teste no DNS, rode `proxy configurar` e prepare o teste de novo.

### Preparação do teste que falhou

O app do teste fica parado. O banco do teste só é trocado depois de a cópia restaurar, então uma falha na restauração deixa o banco de antes. Leia o erro e os logs em `C:\Grafite\teste\logs`, corrija a causa e rode `preparar-teste` de novo, ou volte o teste ao ar como estava:

```powershell
C:\Grafite\grafite.ps1 servicos reiniciar --ambiente teste
```

## Backup

Todo dia, no horário escolhido, a produção grava em cada destino uma pasta `grafite-producao\AAAA-MM-DDTHHmmZ` (o momento em UTC) com:

- `banco.dump`: o banco inteiro, de todas as organizações;
- `arquivos.zip`: as fotos e os outros arquivos;
- `manifesto.json`: a versão, as migrations, o número de linhas de cada tabela e o hash de cada parte.

O backup só conta como feito quando chega a todos os destinos. Um backup pela metade fica com o nome terminado em `.parcial` e é apagado no seguinte. Depois de cada backup feito, os antigos saem de cada destino, guardando os 7 últimos dias, o último de cada uma das 4 últimas semanas e o último de cada um dos 12 últimos meses.

Toda semana, no dia escolhido, o teste de restauração confere os hashes do backup mais novo, restaura o banco num banco descartável da instância do teste, compara as linhas com o manifesto, confere os arquivos e apaga o banco descartável.

Os resultados aparecem em **Administração › Backup**, na organização que opera o servidor, e as falhas, também em **Tarefas**. Na tela, quem tem a permissão faz um backup na hora e muda o horário do backup e o dia do teste, dentro da janela.

Pelo comando:

```powershell
C:\Grafite\grafite.ps1 backup agora
C:\Grafite\grafite.ps1 backup listar
C:\Grafite\grafite.ps1 backup testar
```

**Os limites** ficam em `C:\Grafite\producao\config.env`:

| Variável | O que é |
|---|---|
| `GRAFITE_BACKUP_DESTINOS` | As pastas, separadas por ponto e vírgula; o backup é montado na primeira |
| `GRAFITE_BACKUP_RETENCAO` | Os diários, semanais e mensais guardados, como `7,4,12` |
| `GRAFITE_BACKUP_JANELA` | A janela do horário, como `00:00-06:00`, no fuso do servidor |
| `GRAFITE_BACKUP_TESTE` | `semanal` ou `diario` |

Para mudar, use o comando, ou **Configurações › Backup**, no painel:

```powershell
C:\Grafite\grafite.ps1 backup configurar --destinos "D:\Backups\Grafite;\\nas01\backups\grafite" --janela 00:00-06:00 --retencao 7,4,12 --teste-de-restauracao semanal
```

Cada opção é opcional, e a que falta fica como está. O comando confere o formato de cada valor e que cada destino existe e aceita gravar; um destino que não grava não muda nada. Depois, ele grava a configuração da produção e a reinicia, conferindo a saúde.

Os backups têm dados pessoais e não são cifrados: deixe os destinos com o acesso só da conta do computador e dos administradores.

## Restauração da produção

A restauração é só pelo comando, nunca pela tela:

```powershell
C:\Grafite\grafite.ps1 restaurar 2026-10-07T0500Z --ambiente producao
```

O backup vem pelo nome, procurado no primeiro destino, ou pela pasta inteira, como `\\nas\Backups Grafite\grafite-producao\2026-10-07T0500Z`. Para ver os backups, use `backup listar`.

O comando:

1. confere o backup (os hashes e a leitura do dump), pede a senha do `postgres` da produção e o nome do banco digitado (`grafite`);
2. para o coletor e o app;
3. restaura o dump num banco novo, compara as linhas com o manifesto e aplica as migrations da versão em uso, sem tocar no banco da produção;
4. guarda o banco atual como `grafite_antes_AAAAMMDDHHmm` (o momento em UTC) e põe o restaurado no lugar dele; os arquivos do backup trocam de lugar com os de antes, que ficam em `C:\Grafite\producao\arquivos-antes-AAAAMMDDHHmm`;
5. inicia o app, confere a saúde e inicia o coletor.

### Depois da restauração

Confira a produção com quem pediu a restauração. Com tudo certo, apague o banco e os arquivos de antes, que ocupam o disco:

```powershell
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' -h 127.0.0.1 -U postgres -c 'DROP DATABASE grafite_antes_AAAAMMDDHHmm'
Remove-Item -Recurse C:\Grafite\producao\arquivos-antes-AAAAMMDDHHmm
```

Se for preciso voltar ao que estava, pare a produção, renomeie `grafite` para outro nome e `grafite_antes_AAAAMMDDHHmm` para `grafite`, troque as pastas dos arquivos e inicie a produção.

### Restauração que falhou

O app e o coletor ficam parados. Uma falha antes da troca dos bancos não muda nada; depois dela, a troca é desfeita, e o banco e os arquivos de antes voltam ao nome deles, com os restaurados guardados como `grafite_restaurado_AAAAMMDDHHmm`. A mensagem diz qual dos casos aconteceu. Leia o erro, corrija a causa e restaure de novo, ou volte a produção ao ar como estava:

```powershell
C:\Grafite\grafite.ps1 servicos reiniciar --ambiente producao
```

## Guarda das chaves

O backup não leva a configuração dos ambientes nem as chaves dela. Quem tem só os arquivos de um backup não tem as senhas dos bancos, a chave dos dois passos nem a chave do cofre. Guarde à parte, num cofre da TI fora do servidor e fora dos destinos do backup, e atualize a cópia a cada mudança:

- `C:\Grafite\producao\config.env` e `C:\Grafite\teste\config.env`: as senhas dos bancos, a `GRAFITE_CHAVE_DOIS_PASSOS`, que cifra as chaves dos apps autenticadores, e a `GRAFITE_CHAVE_DO_COFRE`, a chave mestra que cifra a chave de cada segredo do cofre;
- `C:\Grafite\producao\coletor.env`;
- `C:\Grafite\caddy\config.env`, com o token da Cloudflare, no modo público;
- `C:\Grafite\caddy\dados\pki`, com a AC do próprio proxy, no modo interno: sem ela, uma AC nova precisa ser distribuída de novo;
- a senha do `postgres` da produção.

Num servidor novo com um backup e sem a chave do cofre, os segredos continuam com os nomes e os dados, mas nenhum valor abre: guarde a cópia de cada chave do cofre junto dos backups feitos enquanto ela valia. Depois de cada troca, a cópia de antes, com a chave anterior, fica com os backups de até a troca: só ela abre os segredos deles.

Num servidor novo com um backup e sem a chave dos dois passos, os dados continuam legíveis, e só as verificações em dois passos se perdem. Cada conta volta a entrar com a redefinição, que gera uma senha temporária e remove os dois passos, para um novo cadastro:

```powershell
C:\Grafite\grafite.ps1 conta redefinir --ambiente producao --endereco grafite.empresa.com.br --usuario ana.souza --remover-dois-passos
```

### Troca da chave do cofre

A chave mestra do cofre se troca sem refazer os valores: só a chave de cada segredo é cifrada de novo, com a chave nova. Troque-a quando alguém que a conhecia sai da equipe, ou se ela pode ter vazado:

```powershell
C:\Grafite\grafite.ps1 cofre trocar-chave
```

Antes de mudar qualquer coisa, o comando pede o nome do banco da produção digitado (num roteiro, `--confirmar grafite`); no painel, a troca fica em **Operações sensíveis**. O comando gera a chave nova e a grava, com a atual como `GRAFITE_CHAVE_DO_COFRE_ANTERIOR`, no config.env da produção e no do teste; reinicia os dois apps, que leem os segredos com qualquer das duas; roda a troca do app na produção e no teste, que diz quantos segredos passaram para a chave nova e quais não abrem com nenhuma das duas; tira a anterior e reinicia de novo.

Se ele falhar no meio, as duas chaves ficam na configuração, e os apps as aceitam: os segredos continuam abrindo. Rode o comando de novo: ele continua a troca com as mesmas chaves, sem gerar outra. Um segredo que não abre com nenhuma das duas fica como estava; ele foi cifrado com uma chave que não está mais na configuração, e só abre com ela de volta, como `GRAFITE_CHAVE_DO_COFRE_ANTERIOR`.

Terminada a troca, atualize a cópia dos config.env guardada fora do servidor e mantenha a de antes junto dos backups feitos até a troca (veja "Guarda das chaves").

## Organizações e contas

Os comandos de organização e de conta são os do app, com a configuração do ambiente pedido:

```powershell
C:\Grafite\grafite.ps1 organizacao criar --ambiente producao --nome "Cliente" --endereco grafite.cliente.com.br --pessoa "Bruno Lima" --usuario bruno
C:\Grafite\grafite.ps1 conta criar --ambiente producao --endereco grafite.empresa.com.br --pessoa "Carla Dias" --usuario carla --administrador
C:\Grafite\grafite.ps1 conta redefinir --ambiente producao --endereco grafite.empresa.com.br --usuario carla
C:\Grafite\grafite.ps1 conta --ajuda
```

A senha temporária aparece uma vez só, na saída do comando. No painel, criar uma conta e redefinir um acesso ficam em **Configurações**, e a senha temporária aparece uma vez, no andamento.

### Endereços

Cada endereço da produção tem o do teste correspondente, e os dois apontam para este servidor no DNS da empresa. Para acrescentar ou tirar um, use o comando, ou **Configurações › Endereços**, no painel:

```powershell
C:\Grafite\grafite.ps1 enderecos acrescentar grafite.acme.example
C:\Grafite\grafite.ps1 enderecos tirar grafite.acme.example
```

O `acrescentar` pergunta o endereço do teste, propondo um, como `grafite-teste.acme.example`; acrescenta os dois à organização que opera o servidor, no banco de cada ambiente, e ao proxy, e confere os dois pelo HTTPS. Depois, cadastre os dois no DNS. O `tirar` pede o endereço digitado e recusa o último endereço da produção. Quando o endereço tirado é o da organização que opera o servidor, o seguinte passa a ser o dela, e a produção reinicia. Depois, tire os dois do DNS.

## Diretório (AD)

O Grafite liga a organização ao Active Directory pela tela, em Administração › Diretório, com a permissão "Administrar o diretório (AD)". O cliente LDAP é JavaScript puro, e roda igual no Windows e no Linux com o Docker.

A aba Configuração tem o guia da primeira configuração, com os mesmos passos deste roteiro e os comandos para copiar. Ele abre sozinho enquanto o diretório não foi gravado; depois, "Mostrar o guia" o abre. Os comandos são do PowerShell, num controlador de domínio ou num computador com as ferramentas do AD (RSAT). Troque `empresa.local`, `dc01` e `svc-grafite` pelos nomes da empresa.

1. **Crie a conta de serviço no AD**, só para o Grafite, com a senha que não expira:
   ```powershell
   New-ADUser -Name "svc-grafite" -UserPrincipalName "svc-grafite@empresa.local" -AccountPassword (Read-Host -AsSecureString "Senha") -PasswordNeverExpires $true -Enabled $true
   ```
   Para buscar e entrar pelo AD, ela não precisa de mais nada. Para a gerência pela tela, use Delegar controle em Usuários e Computadores do Active Directory (`dsa.msc`):
   - na OU das pessoas, "Redefinir senhas de usuário e forçar alteração de senha no próximo logon" e, numa tarefa personalizada dos objetos Usuário, ler e gravar o `userAccountControl`;
   - na OU dos grupos, "Modificar a associação de um grupo".
2. **Guarde a conta de serviço no Cofre** como um login do tipo Conta de serviço:
   - no usuário, o UPN (`svc-grafite@empresa.local`) ou o DN;
   - no valor, a senha.

   O UPN e o DN saem de `Get-ADUser svc-grafite | Select-Object UserPrincipalName, DistinguishedName`.
3. **Escolha o servidor.** Use o nome completo de um controlador de domínio, o mesmo do certificado dele, e não o IP. Os controladores saem de `nltest /dclist:empresa.local`, e `$env:LOGONSERVER` diz qual atendeu a sua entrada. Libere a porta 636 (LDAPS) do servidor do Grafite até ele e confira com `Test-NetConnection dc01.empresa.local -Port 636`. Se não houver LDAPS, use a 389 (LDAP). Pelo LDAP, a senha das pessoas atravessa a rede sem TLS, e a redefinição da senha pela tela fica recusada.
4. **Ache a base DN**, a do domínio ou a de uma OU, com `(Get-ADDomain).DistinguishedName`. A de uma OU fica nas propriedades dela, na aba Editor de atributos, com Exibir › Recursos avançados ligado.
5. **Exporte a raiz da AC da empresa**, se o certificado do LDAPS vier dela. No `certlm.msc` de um computador do domínio, em Autoridades de Certificação Raiz Confiáveis › Certificados, use Todas as tarefas › Exportar, no formato X.509 codificado na base 64. No servidor da AC, o mesmo sai de `certutil -ca.cert raiz-da-ac.cer` e `certutil -encode raiz-da-ac.cer raiz-da-ac-base64.cer`. O texto vai no campo "Certificado da AC" da tela, que começa com `-----BEGIN CERTIFICATE-----`. Com um certificado público, deixe o campo em branco. Mantenha "Conferir o certificado do servidor" ligado.

Na tela:

1. Grave o servidor (`ldaps://dc01.empresa.local`), a base (`DC=empresa,DC=local`), a conta de serviço e, se for o caso, o certificado da AC. O atributo do usuário e o filtro das pessoas de fábrica servem ao AD. Para limitar a entrada a um grupo, acrescente o `memberOf` ao filtro.
2. Use "Testar a conexão". Ela diz quantos usuários a base tem, ou o motivo da falha:
   - "O certificado do servidor não é confiável.": confira o certificado da AC e o nome do servidor;
   - "A conta de serviço foi recusada.": confira a senha no Cofre;
   - "O servidor não respondeu.": confira o nome, a porta e o firewall.
3. Mapeie os grupos do AD para os grupos do Grafite. Os grupos do Grafite já dão os perfis nos locais.
4. Ligue "Entrada pelo AD".

Na entrada pelo AD:
- Quem não tem conta local entra com o usuário e a senha do AD, e a primeira entrada cria a conta.
- Cada entrada atualiza o nome, o e-mail e os grupos mapeados.
- Quem não é de nenhum grupo mapeado é recusado com o motivo.

Mantenha uma conta local de administrador como acesso de emergência. Com o AD fora do ar, só as contas locais entram, e a recusa das outras diz "O AD não respondeu. Tente de novo ou use uma conta local.".

## Agentes do GLPI

O agente do GLPI que já está nas máquinas manda o inventário também ao Grafite. Ele aceita vários servidores, separados por vírgula, e conversa com cada um.

1. **Gere o endereço** em Administração › Agentes, com a permissão "Administrar os coletores". O endereço aparece uma vez só. Gerar outro desliga o anterior.
2. **Acrescente o endereço ao `server` do agente**, depois do GLPI:
   - No registro do Windows, a chave é `HKLM\SOFTWARE\GLPI-Agent` e o valor `server` fica assim:
     ```text
     https://glpi.empresa.local/,https://grafite.empresa.com.br/api/agentes/glpi/<token>
     ```
   - Para muitas máquinas, use a GPO de registro com o mesmo valor, ou reinstale com `SERVER="<os dois endereços>"` no MSI.
   - No Linux, o mesmo vai no `server` do `/etc/glpi-agent/agent.cfg`.
3. **Reinicie o serviço do agente, ou espere a próxima rodada.** O agente fala de 24 em 24 horas, e o Grafite responde com o mesmo prazo.

O agente aparece na lista no primeiro contato, com o IP e o horário. O inventário é ligado a um ativo ativo pela série ou hostname únicos. Para cadastrar computadores que não existem, configure **Cadastro automático de computadores** em **Administração › Agentes**, escolhendo um tipo com Inventário de hardware e, se necessário, um local de entrada. O cadastro ocorre no primeiro inventário completo. A opção **Ligar** continua disponível para revisão manual.

Os campos de identificação, rede e hardware ficam com a origem "Agente do GLPI", e os campos travados não mudam. Os softwares aparecem na aba Softwares da ficha. Veja [o guia do agente](agente-glpi.md) para distribuição da raiz, teste pelo serviço e diagnóstico.

O caminho foi verificado com o agente do GLPI 1.21, o oficial: o primeiro contato (o PROLOG, que o Grafite responde como o servidor do GLPI), o inventário, a distribuição até "Concluída" e o "Pedir agora".

### Distribuição de software

O mesmo agente instala os pacotes da base do Grafite, pela tarefa Deploy dele, que vem na instalação padrão do agente para Windows. Nada novo vai para as máquinas.

1. **Cadastre o pacote** em Ativos › Software, com a permissão "Administrar a base de software":
   - o arquivo, até 512 MB;
   - o comando silencioso, que roda como o sistema, na pasta do arquivo, como `msiexec /i "7z2301-x64.msi" /qn /norestart`;
   - os códigos de sucesso, de fábrica 0 e 3010 (o sucesso que pede reiniciar).
2. **Distribua** pelo "Distribuir" do pacote, escolhendo as máquinas com o agente ligado. Cada máquina começa em "Aguardando o agente".
3. **O agente pega a tarefa no próximo contato,** em até 24 horas. Ele baixa o arquivo em partes pelo mesmo endereço, confere cada parte, roda o comando e manda cada passo, que vai para o log da máquina.
   - Para não esperar, use "Pedir agora" na ficha da distribuição. O Grafite chama o agente de cada máquina que aguarda, na porta 62354, e diz quantos responderam.
   - O agente atende os servidores do `server` dele. Se o Grafite chega às máquinas por outro IP, acrescente esse IP ao `httpd-trust` do agente.
   - A porta 62354 precisa estar liberada no firewall das máquinas para o servidor do Grafite. O MSI do agente a libera com `ADD_FIREWALL_EXCEPTION=1`.
   - Os agentes que não respondem pegam a tarefa no próximo contato.
4. **Acompanhe** em Ativos › Software › Distribuições: o progresso em texto e, na ficha, a situação, a etapa e o log de cada máquina. A ficha do ativo mostra as distribuições dele na aba Softwares.

Um comando que sai com um código fora dos de sucesso deixa a máquina em "Falhou", com a saída do comando no log. Para tentar de novo, distribua outra vez às máquinas que falharam.

## Coletor

O coletor da produção (serviço `grafite-coletor`) pinga os ativos da organização que opera o servidor, lê as impressoras pelo SNMP, sonda os controles de acesso Control iD e manda as leituras à API da produção pelo `127.0.0.1`, com o endereço da organização. Ele só lê os IPs das faixas de rede cadastradas para ele: pinga os ativos dos tipos com a disponibilidade na rede ligada, lê pelo SNMP os dos tipos com os suprimentos e contadores ligados e sonda os dos tipos com a saúde do Control iD ligada.

**Depois da instalação:** em **Administração › Coletores**, abra o "Servidor" e cadastre as faixas de rede que o servidor alcança, uma por linha, como `10.0.0.0/24`. Em até 5 minutos ele busca a configuração nova e começa a pingar.

| Onde | O quê |
|---|---|
| `C:\Grafite\producao\coletor.env` | A configuração: o endereço da API, o da organização, o token e a pasta da fila |
| `C:\Grafite\producao\coletor` | A fila em disco: os lotes que a API ainda não aceitou, guardados por até 7 dias |
| `http://127.0.0.1:3100/health` | A saúde, só no próprio servidor |

A saúde diz quando o coletor recebeu a configuração e quantos alvos ela trouxe, o último lote aceito, quantos lotes estão na fila e quantos foram descartados, e se a API recusou o token. Ela diz `degradado` com o token recusado ou com a API sem responder há mais de 10 minutos; enquanto isso, as leituras ficam na fila e chegam à API, na ordem, quando ela voltar.

**Token trocado na tela:** o coletor para de coletar até receber o token novo. Ponha o token que a tela mostrou em `GRAFITE_COLETOR_TOKEN`, no `coletor.env`, e reinicie o serviço, num PowerShell como administrador:

```powershell
Restart-Service grafite-coletor
```

Os lotes guardados na fila são mandados depois que a API aceita o token. Um lote recusado pela API como inválido é descartado, com o motivo no log do coletor.

**Impressoras pelo SNMP:** o coletor pede a cada impressora, na porta 161/UDP, os suprimentos, os contadores, as condições e o número de série, a cada 10 minutos, com até 2 segundos de espera e uma tentativa a mais. Entre o servidor e as impressoras, o firewall da rede precisa deixar passar a 161/UDP do servidor para elas e a resposta delas de volta; o Firewall do Windows do servidor já deixa a saída e a resposta. A versão (1 ou 2c) e a comunidade ficam no tipo, em **Ativos › Catálogo › Tipos**: a comunidade é um segredo do tipo "Comunidade SNMP" no Cofre, ou a `public`. O coletor recebe a comunidade com a configuração e a guarda só na memória: ela não vai ao `coletor.env`, à fila em disco, ao log nem à saúde. A impressora que não responde, ou que recebe a comunidade errada, aparece na ficha como "Não respondeu", com os suprimentos da última resposta.

**Controles de acesso pelo Control iD:** o coletor entra em cada controle a cada 5 minutos, pelo HTTP na porta do tipo (a 80, por padrão), lê as informações do sistema e sai da sessão, com até 10 segundos de espera e uma tentativa a mais. O servidor do coletor precisa alcançar essa porta dos controles. O login é um segredo do Cofre, do tipo Usuário e senha ou Conta administrativa, com o usuário no identificador: o escolhido no tipo, em **Ativos › Catálogo › Tipos**, ou o ligado ao próprio controle, para o controle com uma senha diferente dos outros. Como o PMG, o coletor fala HTTP com os controles, e o login viaja aberto na rede: mantenha os controles e o servidor do coletor numa rede só da TI. O usuário e a senha ficam só na memória do coletor. A ficha do controle diz "Login recusado" quando a senha do controle mudou sem o cofre, "Resposta inesperada" quando o IP é de outro equipamento, e "Sem resposta" quando ele não responde. Para trocar uma gravação de teste pela de um controle de verdade, o `pnpm --filter @grafite/collector gravar-control-id` lê o controle com a senha pela variável `GRAFITE_SENHA_DO_CONTROLE`.

## Alertas

A API de cada ambiente avalia as regras de alerta de cada organização a cada minuto, pela tarefa `alertas-a-cada-minuto` da fila, sobre o estado atual da coleta e o último contato dos coletores; uma regra salva na tela pede a avaliação na hora. A avaliação que falha fica no log do app, como "falha na avaliação dos alertas", e a do minuto seguinte tenta de novo. O módulo Alertas é opcional: desligado em **Administração › Módulos**, a organização não é avaliada, e os alertas dela ficam guardados.

**Regras de fábrica:** toda organização começa com estas regras, criadas pelo `organizacao criar` e, nas que já existiam, na primeira avaliação depois da atualização. Em **Alertas › Regras**, elas se editam, inativam e reativam como as outras, e a atualização nunca as recria nem as muda.

| Regra | Abre quando | Severidade |
|---|---|---|
| Ativo offline | o ativo não responde ao ping há 5 minutos | Atenção |
| Toner em 10% ou menos | um toner está em 10% ou menos; resolve acima de 15% | Crítico |
| Impressora parada | a impressora informa uma condição que a para, como sem papel, sem toner, tampa aberta ou atolamento | Crítico |
| Impressora pede atenção | a impressora informa uma condição de atenção, como pouco papel ou toner baixo | Atenção |
| Control iD sem resposta | o controle não responde há 10 minutos | Crítico |
| Control iD não aceita a sondagem | o controle recusa o login ou responde como outro equipamento | Atenção |
| Coleta atrasada | a última leitura de uma capacidade do ativo passou de 3 ciclos, com o coletor dele ainda falando com a API | Atenção |
| Coletor sem contato | o coletor não fala com a API há 10 minutos | Crítico |

**Silêncio na manutenção:** antes de desligar um equipamento para a manutenção, silencie os alertas dele na ficha do ativo, no bloco Alertas, por "Silenciar alertas", até uma data e hora ou até alguém retomar, com o motivo. A coleta e o motor continuam: os alertas do ativo abrem e se resolvem na ficha e na lista dos alertas, mas saem de "O que resolver agora". O silêncio com data termina sozinho; o sem data, só por "Retomar alertas". Para tirar um alerta só da tela inicial por pouco tempo, adie-o por 15, 30 ou 60 minutos.

## E-mail e push

O Grafite manda por e-mail o crítico na hora e o resumo diário das outras notificações, e por push os avisos no celular, conforme o que cada pessoa escolhe em **Ajustes › Notificações**. Os dois canais saem só da produção: o teste, com a cópia das contas, não avisa ninguém.

### E-mail

1. Peça a quem cuida do e-mail da empresa uma conta de envio (SMTP), com o servidor, a porta e o usuário. O Grafite usa `smtp://`, em geral na porta 587, com STARTTLS quando o servidor oferece, ou `smtps://`, na porta 465.
2. Configure, com o remetente que as pessoas vão ver:

   ```powershell
   C:\Grafite\grafite.ps1 email configurar --smtp smtp://grafite@smtp.empresa.com.br:587 --remetente "Grafite <grafite@empresa.com.br>"
   ```

   O comando pede a senha do SMTP sem mostrar o que se digita, grava o SMTP e o remetente na configuração da produção, só para os administradores, e reinicia o app e o coletor, conferindo a saúde. Um endereço ou um remetente fora do formato é recusado antes de gravar.
3. Confira o envio:

   ```powershell
   C:\Grafite\grafite.ps1 email testar --para ti@empresa.com.br
   ```

   O comando diz se o servidor de e-mail aceitou o e-mail de teste ou o motivo da recusa, como a autenticação recusada, sem mostrar a senha.

Se o servidor de e-mail usa um certificado da AC da empresa, o app já confia nela no modo interno com a AC do Caddy, pelo `NODE_EXTRA_CA_CERTS` da instalação; com outra AC, acrescente o certificado dela ao arquivo dessa variável e reinicie o app.

Um envio que falha é tentado de novo cinco vezes, a partir de 1 minuto, e depois aparece em **Administração › Tarefas com falha**, com o motivo. A notificação continua na central.

### Push

As chaves do push são geradas na instalação, ou na atualização de uma produção de antes do push, e ficam só na configuração da produção, com o endereço da organização que opera o servidor como contato. Não troque as chaves: os aparelhos inscritos deixariam de receber até cada pessoa os inscrever de novo.

O push sai do servidor para os serviços de push dos navegadores, pela internet, em HTTPS (porta 443). Libere no firewall de saída:
- `fcm.googleapis.com`, do Chrome e do Android;
- `updates.push.services.mozilla.com`, do Firefox;
- `web.push.apple.com` e `*.push.apple.com`, do Safari, do iPhone e do iPad;
- `*.notify.windows.com`, do Edge no Windows.

O aparelho se inscreve em **Ajustes › Notificações › No celular**, por "Receber neste aparelho". No iPhone e no iPad, os avisos chegam só com o Grafite instalado na tela de início.

## Serviços

Cada serviço inicia com o Windows e reinicia sozinho depois de uma falha. Eles também aparecem em **Serviços** do Windows (`services.msc`), pelo nome.

```powershell
C:\Grafite\grafite.ps1 servicos estado
C:\Grafite\grafite.ps1 servicos reiniciar --ambiente producao
C:\Grafite\grafite.ps1 servicos reiniciar --ambiente teste
C:\Grafite\grafite.ps1 servicos parar --ambiente teste
C:\Grafite\grafite.ps1 servicos iniciar --ambiente teste
```

`servicos reiniciar` para e inicia o app do ambiente (e o coletor, na produção) e confere a saúde. `servicos parar` desliga o app do ambiente e, na produção, o coletor; na produção, antes, ele pede o nome do banco da produção digitado (num roteiro, `--confirmar grafite`). `servicos iniciar` liga o que estiver parado no ambiente e confere a saúde do app. O proxy reinicia com `proxy configurar`. No painel, cada serviço da **Visão geral** tem os botões do ambiente dele.

Se um serviço não sobe, veja o log dele e o estado com `servicos estado`. Um app que não conecta ao banco costuma ser a instância do PostgreSQL parada: inicie o serviço dela e reinicie o app.

## Logs

| Onde | O quê |
|---|---|
| `C:\Grafite\producao\logs` | O app da produção (`grafite.out.log`, `grafite.err.log` e `grafite.wrapper.log`) e o coletor (`grafite-coletor.*.log`) |
| `C:\Grafite\teste\logs` | O app do teste (`grafite-teste.*.log`) |
| `C:\Grafite\caddy\logs` | O proxy |
| `C:\Grafite\teste\banco\log` | O PostgreSQL do teste |
| `C:\Program Files\PostgreSQL\18\data\log` | O PostgreSQL da produção |

Os logs dos serviços giram por tamanho: 10 MB cada arquivo, com os 8 últimos guardados.

## Servidor Linux com o Docker

O Grafite também roda num servidor Linux dedicado, só com o Docker. As duas plataformas valem para sempre. No Linux, os ambientes, as regras e as confirmações são os do Windows. O que muda:

- cada processo é um contêiner de um projeto do Docker Compose, o `grafite`;
- cada versão é o conjunto das imagens do pacote dela;
- os dois PostgreSQL também são contêineres, com as senhas geradas na instalação;
- tudo fica em `/opt/grafite`.

O comando de operação é o `grafite`, sempre com o `sudo`: `sudo grafite --ajuda` mostra os comandos, os mesmos da tabela de [Comandos](#comandos), com o `<tar>` no lugar do `<zip>`. Ele roda o comando da versão da produção num contêiner descartável, com o socket do Docker, a pasta da instalação e a pasta de cada arquivo dos argumentos, como o pacote de uma atualização.

| Contêiner do Compose | O que é |
|---|---|
| `app-producao` | O app da produção, na porta 3000 da rede interna |
| `app-teste` | O app do teste, na porta 3001 da rede interna |
| `coletor` | O coletor local da produção, na porta 3100 da rede interna |
| `proxy` | O Caddy, o único que publica portas: a 80 e a 443 do servidor |
| `banco-producao` | O PostgreSQL 18 da produção |
| `banco-teste` | O PostgreSQL 18 do teste |

Os contêineres se acham pelo nome na rede `grafite` (`172.30.0.0/24`), que o comando cria. O proxy tem o IP fixo `172.30.0.2`, o único em que os apps confiam para o endereço do cliente.

```text
/opt/grafite
├── operacao.json            o estado: as versões, os endereços e o modo do certificado
├── compose.yaml, .env       o projeto do Compose e a versão de cada ambiente; gerados, não edite
├── versoes/<x.y.z>/         a marca de cada versão carregada no Docker
├── producao/
│   ├── config.env           a configuração da produção, com as senhas
│   ├── banco.env            a senha do superusuário do PostgreSQL da produção
│   ├── banco/               os dados do PostgreSQL da produção
│   ├── coletor.env, coletor/
│   └── arquivos/
├── teste/
│   ├── config.env, banco.env, banco/, arquivos/
├── caddy/
│   ├── Caddyfile, config.env
│   ├── dados/               os certificados e a AC interna, só para o root
│   └── ac/                  a cópia pública da raiz da AC, que os apps leem
└── backups/                 o primeiro destino do backup, por padrão
```

### Pré-requisitos do servidor Linux

- **Ubuntu Server 24.04 LTS ou Debian 12,** 64 bits, com as atualizações em dia, 8 GB de memória e espaço em disco para os dois bancos, os arquivos, as imagens de duas ou três versões (uns 2 GB cada) e o primeiro destino do backup.
- **O Docker Engine e o plugin compose,** do repositório oficial do Docker, e não o `docker.io` da distribuição. No Ubuntu:

  ```bash
  sudo apt-get update
  sudo apt-get install -y ca-certificates curl
  sudo install -m 0755 -d /etc/apt/keyrings
  sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  sudo chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list
  sudo apt-get update
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  sudo systemctl enable --now docker
  ```

  No Debian, troque `ubuntu` por `debian` nos endereços. Confira com `sudo docker version` e `sudo docker compose version`.

  Se o `apt-get update` disser `NO_PUBKEY` para o `download.docker.com`, a chave do Docker não chegou ao `/etc/apt/keyrings/docker.asc`, ou ficou sem leitura: baixe-a de novo pelo `curl`, rode o `chmod a+r` e repita o `apt-get update`.
- **As portas 80 e 443 livres,** sem outro servidor web nelas.
- **Os endereços no DNS da empresa,** apontando para o servidor: o da produção e o do teste.
- **O fuso do servidor,** que os contêineres seguem nos logs: `sudo timedatectl set-timezone America/Sao_Paulo`. O horário do backup é sempre o de São Paulo, como no Windows.

O Docker publica a 80 e a 443 direto nas regras do kernel, **mesmo com o `ufw` ligado**: o `ufw` não as fecha. As outras portas do servidor, como a do SSH, ficam com a equipe de infraestrutura. Os bancos e os apps não publicam porta nenhuma.

### Destinos do backup no Linux

Os destinos são pastas do servidor. O primeiro, por padrão, é `/opt/grafite/backups`, e os outros podem ser compartilhamentos de rede montados pelo sistema. Os contêineres rodam como o usuário `1000`, que precisa gravar em cada destino. Para um compartilhamento do Windows ou de um NAS, monte-o com esse dono, no `/etc/fstab`:

```text
//nas.empresa.local/backups/grafite  /mnt/nas/grafite  cifs  credentials=/root/.cifs-grafite,uid=1000,gid=1000,file_mode=0660,dir_mode=0770,_netdev,nofail  0  0
```

O `/root/.cifs-grafite` tem o usuário e a senha do compartilhamento (`username=` e `password=`), com o modo `600`. Monte com `sudo mount -a` e confira com `findmnt /mnt/nas/grafite`.

A instalação grava, em cada destino, a marca `.grafite-destino`. O backup recusa o destino sem a marca: um compartilhamento desmontado deixa o ponto de montagem vazio, e o backup não grava no disco do servidor no lugar dele. Não apague a marca. Os destinos são os escolhidos na instalação, que o projeto do Compose monta no app da produção.

### Instalação no Linux

1. Baixe da release, na [página das versões](https://github.com/riq0007/grafite/releases), para a mesma pasta do servidor, os três arquivos do Linux:
   - o `grafite-x.y.z-linux-x64.tar`;
   - o `.sha256` dele;
   - o `instalar.sh`.

   No servidor com internet, o `curl` baixa os três direto, com a versão no lugar do `x.y.z`:

   ```bash
   v=x.y.z
   for arquivo in "grafite-$v-linux-x64.tar" "grafite-$v-linux-x64.tar.sha256" instalar.sh; do
     curl -fLO "https://github.com/riq0007/grafite/releases/download/v$v/$arquivo"
   done
   ```

   Deixe na pasta só o pacote da versão que vai instalar.
2. Rode o roteiro de instalação como o root, pelo `bash`, porque o arquivo baixado vem sem a permissão de execução:

   ```bash
   sudo bash instalar.sh
   ```

   - Sem o pacote nos argumentos, o roteiro usa o único `grafite-x.y.z-linux-x64.tar` da pasta dele.
   - Se a pasta tiver mais de um pacote, diga qual: `sudo bash instalar.sh grafite-x.y.z-linux-x64.tar`.
   - Até a v0.1.0, o roteiro sempre pede o pacote nos argumentos.

3. Responda às perguntas. São as mesmas do Windows, menos a pasta dos programas do PostgreSQL e a senha do `postgres`, que a instalação gera.

O `instalar.sh` ao lado do pacote é igual ao de dentro dele. Ele confere o Docker, o plugin compose e o hash do pacote antes de mudar qualquer coisa. Depois, ele carrega as imagens, põe o lançador em `/usr/local/bin/grafite` e chama a instalação, que:

1. confere as portas 80 e 443;
2. cria as pastas, com o dono de cada contêiner, e marca cada destino;
3. grava a configuração, com as senhas geradas;
4. sobe os dois PostgreSQL e aplica as migrations;
5. cria a primeira organização, com a senha temporária mostrada uma vez, e o coletor `Servidor`;
6. configura o proxy, sobe os contêineres e confere a saúde pelo HTTPS.

Rodar de novo o mesmo comando retoma a instalação interrompida, com as mesmas senhas.

O roteiro automático usa um arquivo de respostas, o do Windows sem `raiz`, `pgBin` e `senhaDoPostgres`:

```bash
sudo bash instalar.sh grafite-x.y.z-linux-x64.tar --respostas respostas.json
```

**O roteiro de dentro do pacote:** o `instalar.sh` ao lado do pacote não entra no hash dele, assim como o atalho de instalação do Windows. Para rodar o de dentro, confira o pacote antes e tire o roteiro dele:

```bash
sha256sum --check grafite-x.y.z-linux-x64.tar.sha256
tar -xf grafite-x.y.z-linux-x64.tar instalar.sh
sudo bash instalar.sh grafite-x.y.z-linux-x64.tar
```

No modo interno com a AC do Caddy, copie a raiz para distribuir às máquinas e aos celulares:

```bash
sudo grafite proxy raiz .
```

Na primeira instalação, confira o que o teste de instalação do CI não confere:

- **O reinício do servidor:** `sudo reboot`, e depois `sudo grafite servicos estado` mostra os seis contêineres rodando, e a produção abre pelo endereço.
- **O backup no compartilhamento:** `sudo grafite backup agora`, e depois a pasta do backup aparece em `/mnt/nas/grafite/grafite-producao`, no próprio NAS.

### Atualização e volta no Linux

As regras são as de [Atualização](#atualização): o teste primeiro, a produção só com a versão que roda no teste, com o backup conferido e o nome do banco digitado.

```bash
sudo grafite atualizar grafite-x.y.z-linux-x64.tar --ambiente teste
sudo grafite atualizar grafite-x.y.z-linux-x64.tar --ambiente producao
sudo grafite voltar --ambiente producao
```

O `atualizar` carrega as imagens da versão uma vez só, aplica as migrations pela imagem nova e troca a versão do ambiente no `.env` do Compose. A produção leva junto o coletor e o proxy. Depois de uma atualização com saúde, o comando apaga as imagens das versões que nenhum ambiente usa, nem como atual nem como anterior.

Se a atualização falhar, os contêineres do ambiente ficam parados, e a mensagem diz o que fazer, como em [Atualização que falhou](#atualização-que-falhou). Para subir de novo a versão de antes, use `sudo grafite voltar --ambiente producao`.

### Backup, restauração e cópia no teste, no Linux

Os comandos são os do Windows:

```bash
sudo grafite backup agora
sudo grafite backup listar
sudo grafite backup testar
sudo grafite preparar-teste
sudo grafite restaurar 2026-10-07T0500Z --ambiente producao
```

O backup diário roda no `app-producao`, com as ferramentas do PostgreSQL 18 da imagem. Um destino sem a marca, como um compartilhamento desmontado, falha com o motivo, e o backup conta como não feito. O `restaurar` usa o superusuário do contêiner da produção e não pede a senha do `postgres`.

### Guarda das chaves no Linux

Guarde, fora do servidor e só para quem administra:

- os `config.env` e os `banco.env` de `/opt/grafite/producao` e `/opt/grafite/teste`, com as senhas e as chaves dos dois passos e do cofre;
- o `/opt/grafite/producao/coletor.env` e o `/opt/grafite/caddy/config.env`;
- no modo interno com a AC do Caddy, a pasta `/opt/grafite/caddy/dados/pki`, com a AC.

```bash
sudo tar -czf grafite-chaves.tar.gz -C /opt/grafite producao/config.env producao/banco.env producao/coletor.env teste/config.env teste/banco.env caddy/config.env caddy/dados/pki
```

A troca da chave do cofre é a do Windows (`sudo grafite cofre trocar-chave`): depois dela, guarde de novo os `config.env`.

### Contêineres e logs no Linux

```bash
sudo grafite servicos estado
sudo grafite servicos reiniciar --ambiente producao
sudo docker compose --project-name grafite --file /opt/grafite/compose.yaml --env-file /opt/grafite/.env ps
sudo docker compose --project-name grafite --file /opt/grafite/compose.yaml --env-file /opt/grafite/.env logs --tail 200 app-producao
```

Os contêineres reiniciam sozinhos depois de uma falha e sobem com o servidor, pelo serviço do Docker. Os logs de cada contêiner giram por tamanho: 10 MB cada arquivo, com os 5 últimos guardados. Não suba nem pare os contêineres pelo `docker compose up` ou `down` à mão: o comando de operação confere a saúde e a ordem. Um contêiner que não sobe mostra o motivo no log dele.

### Painel no Linux

Numa sessão com interface gráfica, como a do Ubuntu Desktop, o painel abre pelo comando, com o `sudo`:

```bash
sudo grafite painel
```

O lançador escolhe uma porta livre, ou a do `--porta`, e a publica só no 127.0.0.1 do servidor. Quando o contêiner do comando escreve o endereço com o código, o lançador o abre no navegador da conta que chamou o `sudo`, na sessão gráfica dela. O resto é como no Windows (veja [Painel da operação](#painel-da-operação)): o terminal fica aberto enquanto o painel roda, e o Ctrl+C o encerra.

Por um SSH, ou num servidor sem interface gráfica, o comando diz que o painel precisa de um servidor com interface e não abre porta nenhuma: a operação é pelos comandos, como `sudo grafite servicos estado`. O `--sem-navegador` só escreve o endereço, para os testes e o CI.

## Comandos

| Comando | O que faz |
|---|---|
| `painel` | Abre o painel da operação no navegador deste servidor, só no 127.0.0.1; `--porta <n>` escolhe a porta |
| `menu` | No Windows, abre o menu da operação no terminal |
| `instalar <zip>` | Instala do zero; rodar de novo retoma a instalação interrompida |
| `atualizar <zip> --ambiente teste\|producao` | Passa o ambiente à versão do pacote; a produção, só depois do teste |
| `voltar --ambiente teste\|producao` | Volta à versão de antes da última atualização |
| `preparar-teste` | Troca os dados do teste pela cópia da produção |
| `backup agora`, `backup listar`, `backup testar` | O backup da produção, a lista e o teste de restauração |
| `backup configurar` | Muda os destinos, a janela, a retenção e o teste de restauração do backup |
| `restaurar <backup> --ambiente producao` | Restaura a produção, guardando o banco e os arquivos de antes |
| `proxy configurar`, `proxy raiz <destino>` | Gera a configuração do proxy; copia a raiz da AC interna |
| `servicos estado`, `servicos reiniciar --ambiente teste\|producao` | O estado dos serviços; reinicia um ambiente |
| `servicos iniciar\|parar --ambiente teste\|producao` | Liga ou desliga um ambiente; desligar a produção pede o nome do banco |
| `certificado configurar --modo interno\|publico` | Troca o modo do certificado do proxy e confere o HTTPS |
| `enderecos acrescentar\|tirar <endereço>` | Acrescenta ou tira um endereço da produção e o do teste |
| `cofre trocar-chave` | Troca a chave mestra do cofre nos dois ambientes |
| `email configurar --smtp <endereço> --remetente <remetente>`, `email testar --para <e-mail>` | Configura o e-mail da produção; manda o e-mail de teste |
| `organizacao criar`, `conta criar`, `conta redefinir` | Os comandos do app, com `--ambiente` |

As opções `--raiz <pasta>` (outra pasta de instalação) e `--confirmar <texto>` (o texto de uma confirmação, num roteiro) valem para todos.
