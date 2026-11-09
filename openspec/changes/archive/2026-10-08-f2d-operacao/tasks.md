# F2d · Operação — plano de implementação

**Objetivo:** instalar, atualizar e manter o Grafite no servidor interno Windows, com o teste e a produção separados, o HTTPS e o backup provado por restauração.

**Arquitetura:** a lógica da operação fica em TypeScript e é testada com o Vitest:
- `packages/operacao`: o backup, a restauração, o manifesto, o zip e as ferramentas do PostgreSQL, usados pelas tarefas da API e pelo comando;
- `apps/operacao`: o comando no servidor;
- `apps/api`: as tarefas do servidor e a tela.

As peças do Windows (o WinSW, as junções, o `netsh` e os binários do PostgreSQL) ficam atrás de interfaces finas. O pacote da versão sai do CI.

**Tecnologias:**
- o Node 24, rodando o TypeScript sem compilação;
- o Fastify com o Zod e o pg-boss 12;
- o PostgreSQL 18 (`pg_dump`, `pg_restore`, `initdb` e `pg_ctl`);
- o WinSW, o Caddy 2 com o `caddy-dns/cloudflare` (pelo `xcaddy`), o `yazl` e o `yauzl`;
- o Vitest, o Playwright e o GitHub Actions com o executor Windows.

**Spec:** `proposal.md`, `specs/` e `design.md` desta change. Cada tarefa cita a decisão do design que segue.

## Restrições globais

- **Configuração:**
  - `GRAFITE_AMBIENTE` é obrigatório: `desenvolvimento`, `teste` ou `producao`;
  - padrões do backup: retenção `7,4,12`, janela `00:00-06:00` e teste de restauração `semanal`;
  - o certificado é aviso com menos de 14 dias.
- **Portas e serviços:**
  - portas: produção 127.0.0.1:3000, teste 127.0.0.1:3001, coletor 127.0.0.1:3100, proxy 80 e 443, PostgreSQL da produção 5432 e do teste 5433;
  - serviços: `Grafite`, `Grafite Teste`, `Grafite Coletor`, `Grafite Proxy` e `Grafite PostgreSQL Teste`.
- **Textos da interface, exatamente:**
  - "Ambiente de teste";
  - "Os dados são uma cópia da produção. O que mudar aqui não vai para a produção.";
  - "Backup na fila.";
  - "Horário do backup salvo.";
  - "Escolha um horário entre <início> e <fim>.".
- **Pacote:** `grafite-x.y.z-windows-x64.zip` e o `.sha256`.
- **Segredos:** só nos `config.env` gerados no servidor. O repositório e o pacote não levam nenhum (regra 5).
- **Commits:** um por tarefa, no padrão `tipo(escopo): assunto`, com "Tarefa X.Y do f2d-operacao." no corpo (regra 8). Esta sessão é a orquestradora: os pacotes compartilhados mudam aqui (regra 7).

## Foco da revisão

Situações que as specs implicam, mas nenhum cenário cobre, cada uma com o teste na tarefa dona:
1. **Destino com espaço, acento ou caminho de rede** (`\\nas\Backups Grafite\Produção`): o backup, a retenção e o teste de restauração funcionam (tarefa 4.4).
2. **Fuso do horário do backup:** "02:00" é a hora do fuso do servidor (`America/Sao_Paulo`), e a retenção conta dias, semanas e meses nesse fuso (tarefas 2.2 e 5.4).
3. **"Fazer backup agora" com um backup rodando:** o segundo espera o primeiro, e nunca há dois ao mesmo tempo (tarefas 5.4 e 5.5).
4. **Disco cheio no meio do backup:** a pasta fica com `.parcial`, não conta como feita nem dispara a retenção, e a próxima execução apaga a sobra (tarefa 4.4).
5. **Teste preparado com uma organização fora do mapa de endereços:** ela fica sem endereço no teste, e a preparação avisa o nome dela, sem falhar (tarefa 7.7).

## 1. Spec mestre

- [x] 1.1 Atualizar a spec mestre conforme o design (decisão 18):
  - 4.3: o Caddy, os dois modos do certificado, os serviços e as duas instâncias do PostgreSQL;
  - 9.10: os destinos, a retenção, o teste de restauração e o papel do backup;
  - 10.6: a promoção das migrations pelo pacote, primeiro no teste;
  - 12.2: o ambiente na configuração e o teste com a cópia da produção;
  - 14: as mitigações do HTTPS e do PostgreSQL no Windows;
  - 15: a forma do certificado sai das decisões adiadas.

  Verificar: o diff da spec mestre bate com as specs desta change.

## 2. Domínio

- [x] 2.1 Escrever os testes e depois acrescentar ao `packages/domain`:
  - `AMBIENTES = ['desenvolvimento', 'teste', 'producao']` e o tipo `Ambiente`;
  - a permissão `backup.administrar` (organização, sem inclusões);
  - as ações `backup.solicitado` e `agenda-do-backup.alterada`, com os rótulos;
  - o tipo de evento `operacao.mudou`: `agenda-do-backup.alterada` grava `operacao.mudou`, e `backup.solicitado` não grava evento.

  O público do `operacao.mudou` é a permissão `backup.administrar`. Verificar: os testes unitários passam, inclusive o que fixa o catálogo e o mapa ação → evento.
- [x] 2.2 Escrever os testes por tabela e depois criar a retenção no domínio (decisão 12): `backupsQueFicam(momentos: readonly Date[], retencao: Retencao, fuso: string): Date[]`, com `Retencao = { diarios: number; semanais: number; mensais: number }`. Os casos:
  - 20 dias seguidos com `7,4,12`;
  - dois backups no mesmo dia (fica o último);
  - a virada da semana ISO e do mês no fuso `America/Sao_Paulo` (23:30 de domingo no fuso é ainda a semana anterior);
  - o mais novo, que fica mesmo com a retenção zerada;
  - a lista vazia.

  Verificar: os testes unitários passam.

## 3. Banco

- [x] 3.1 Escrever os testes de integração e depois criar a migration do esquema `operacao` (decisão 14):
  - as tabelas:
    - `backups`: `id`, `iniciado_em`, `terminado_em`, `situacao` (`em-andamento`, `feito` ou `falhou`), `pedido_por` (`agenda`, `tela` ou `comando`), `tamanho`, `destinos`, `pasta`, `manifesto` e `erro`;
    - `testes_de_restauracao`: `id`, `iniciado_em`, `terminado_em`, `backup_id`, `situacao`, `erro` e `detalhes`;
    - `agenda`: uma linha, com `horario` (`HH:MM`), `dia_do_teste` (0 a 6) e `atualizada_em`;
  - as permissões do `grafite_app` nelas;
  - o schema do Drizzle;
  - a exceção do esquema `operacao` no teste-guarda do isolamento.

  Verificar: `pnpm test:integration` passa no `packages/db`, e o teste-guarda continua reprovando uma tabela de negócio sem RLS.
- [x] 3.2 Escrever os testes de integração e depois criar o papel `grafite_backup` (decisão 11):
  - `01-papeis.sh` o cria com `LOGIN BYPASSRLS`, a senha de `GRAFITE_DB_BACKUP_PASSWORD`;
  - o banco de teste (`iniciarBancoDeTeste`) passa a devolver `urlBackup`, `urlSuperusuario` e `executarNoConteiner(comando: string[])`;
  - o `.env` do `pnpm dev` ganha a senha nova;
  - uma migration dá, só se o papel existir: `USAGE` nos esquemas `public`, `fila` e `operacao`, `SELECT` nas tabelas e sequências, e os privilégios padrão para as tabelas futuras do `grafite_owner`.

  Os casos:
  - o papel lê as linhas de duas organizações com o RLS forçado;
  - incluir, alterar ou apagar com ele é recusado;
  - as migrations rodam num banco sem o papel.

  Verificar: `pnpm test:integration` passa no `packages/db`.

## 4. Lógica compartilhada da operação

- [x] 4.1 Criar o `packages/operacao` (o package, o tsconfig e o Vitest de unidade e de integração) e escrever os testes e depois `postgres.ts` (decisão 4):
  - a interface `FerramentasDoPostgres`, com `executar(ferramenta: 'pg_dump' | 'pg_restore' | 'psql' | 'initdb' | 'pg_ctl', argumentos: string[], opcoes?: { senha?: string; entrada?: string }): Promise<{ codigo: number; saida: string; erro: string }>`;
  - `ferramentasLocais(pastaBin)`, que passa a senha por `PGPASSWORD` e nunca nos argumentos;
  - `ferramentasNoConteiner(executarNoConteiner)`;
  - `versaoDoPgDump()`.

  Os casos: a linha de comando montada, a senha fora dos argumentos, e o código e a saída do erro devolvidos. Verificar: os testes unitários passam, e o de integração roda o `pg_dump --version` no contêiner.
- [x] 4.2 Escrever os testes e depois `manifesto.ts` e `zip.ts` (decisão 11):
  - `Manifesto = { versao; migracoes: string[]; criadoEm; linhas: Record<string, number>; partes: Record<'banco.dump' | 'arquivos.zip', { tamanho: number; sha256: string }> }`;
  - `sha256DoArquivo(caminho)`, `conferirPartes(pasta, manifesto): Promise<string[]>`, que devolve os problemas em pt-BR;
  - `zipar(pasta, destino): Promise<{ arquivos: number }>` com o `yazl`, que guarda os caminhos relativos;
  - `conferirZip(caminho)` e `deszipar(caminho, destino)` com o `yauzl`.

  Os casos: a parte alterada e a parte ausente, o zip com subpastas e nomes com acento, a pasta vazia e o zip truncado. Verificar: os testes unitários passam.
- [x] 4.3 Escrever os testes de integração e depois `backup.ts` com `fazerBackup(dep)` num destino (decisão 11). As dependências: `urlBackup`, `ferramentas`, `pastaDosArquivos`, `destinos`, `retencao`, `fuso`, `versao` e `agora`. O processo:
  1. a transação `REPEATABLE READ` com o instantâneo exportado;
  2. a contagem por tabela e o `pg_dump -Fc --snapshot`;
  3. o zip dos arquivos e o manifesto, numa pasta `.parcial` no primeiro destino, renomeada no fim.

  Os casos:
  - uma inclusão no meio do dump não desalinha o manifesto;
  - a pasta pronta tem só `banco.dump`, `arquivos.zip` e `manifesto.json`, sem nenhuma configuração;
  - um erro do `pg_dump` deixa a `.parcial` e devolve o erro.

  Verificar: `pnpm test:integration` passa no `packages/operacao`.
- [x] 4.4 Escrever os testes e depois, no `fazerBackup`:
  - a cópia para os outros destinos, também com `.parcial`;
  - a retenção (`backupsQueFicam`) em cada destino, só depois de todos;
  - a limpeza das `.parcial` que sobraram de execuções anteriores.

  Os casos:
  - um destino que falha deixa a `.parcial` e não roda a retenção;
  - os destinos com espaço, acento e caminho de rede (o foco 1);
  - o disco cheio simulado no segundo destino (o foco 4);
  - a `.parcial` de ontem apagada na execução de hoje.

  Verificar: os testes do `packages/operacao` passam.
- [x] 4.5 Escrever os testes de integração e depois `restauracao.ts` (decisões 13 e 16):
  - `restaurarBanco({ ferramentas, urlSuperusuario, nome, arquivoDump })` cria o banco e restaura;
  - `contarLinhas(url)`;
  - `testarRestauracao(dep)`: os hashes, a restauração em `grafite_restauracao`, as linhas contra o manifesto, o zip e a remoção do banco;
  - a conferência do espaço livre antes de restaurar.

  Os casos: o backup bom, o dump alterado (falha no hash), as linhas que não batem e o banco descartável apagado também depois de uma falha. Verificar: `pnpm test:integration` passa no `packages/operacao`.
- [x] 4.6 Escrever os testes de integração e depois `registros.ts`, com `executarBackup` e `executarTesteDeRestauracao`. Elas:
  - gravam a linha `em-andamento` e depois `feito` ou `falhou`, com o erro, em `operacao.backups` e `operacao.testes_de_restauracao`;
  - gravam o evento `operacao.mudou` na organização operadora.

  Os casos: o backup feito, o que falhou e o teste de restauração. Verificar: `pnpm test:integration` passa.

## 5. API

- [x] 5.1 Escrever os testes e depois acrescentar à configuração da API (decisões 1, 10 e 11):
  - `GRAFITE_AMBIENTE`, obrigatório;
  - `GRAFITE_PROXIES_CONFIAVEIS`, por padrão `127.0.0.1,::1`;
  - `GRAFITE_ORGANIZACAO_OPERADORA`, opcional;
  - o grupo do backup, todo ou nada: `GRAFITE_BACKUP_DESTINOS`, `_RETENCAO`, `_JANELA`, `_TESTE`, `_URL`, `GRAFITE_RESTAURACAO_URL` e `GRAFITE_PG_BIN`;
  - `GRAFITE_CERTIFICADO_VIGIAR`, opcional.

  Também: o `.env` do `pnpm dev` (`desenvolvimento`), a pilha da ponta a ponta e a imagem de contêiner (`producao`). Os casos:
  - cada variável ausente ou inválida, com o nome e o motivo;
  - o backup parcial (`GRAFITE_BACKUP_URL` sem os destinos);
  - a janela invertida;
  - a retenção com um número negativo.

  Verificar: os testes unitários passam, o `pnpm dev` sobe, e a imagem sobe com `/health` 200.
- [x] 5.2 Escrever os testes de integração e depois:
  - **Proxies:** `trustProxy` com os proxies confiáveis, para o `request.ip` real no limite de requisições, nas sessões e na auditoria.
  - **Saúde e sessão:** o ambiente na saúde e no estado da sessão, mais `organizacao.operaOServidor`.
  - **Contrato:** regerado.

  Os casos:
  - o `X-Forwarded-For` aceito do loopback e ignorado de outro endereço;
  - a sessão com o IP do cliente;
  - a saúde do teste com `teste`;
  - `operaOServidor` verdadeiro só na organização do endereço configurado.

  Verificar: `pnpm test:integration` passa no `apps/api`, e `pnpm contrato:verificar` está em dia.
- [x] 5.3 Escrever os testes e depois a vigilância do certificado (decisão 10): `diasDeValidade(endereco, opcoes?): Promise<number>`, pela conexão TLS, e a tarefa que falha com "O certificado de <endereço> vence em N dias, e a renovação não aconteceu." quando N < 14. Os casos, com um servidor HTTPS local de certificado gerado no teste: 10 dias (falha), 60 dias (passa) e o endereço que não responde (falha com o motivo). Verificar: os testes passam.
- [x] 5.4 Escrever os testes de integração e depois as tarefas do servidor na fila (decisões 1, 11 e 14):
  - `agendarTarefasDoServidor(fila, agenda, config)`: o backup no horário da agenda, no fuso do servidor; o teste de restauração na frequência e no dia; a vigilância do certificado, diária;
  - só na produção e com a organização operadora configurada;
  - sem contexto de organização, e uma de cada vez (`singletonKey`);
  - a falha esgotada vai para `tarefas_com_falha` da organização operadora, com o `tarefas.mudaram`;
  - a mudança da agenda reagenda.

  Os casos:
  - o teste e o desenvolvimento não agendam;
  - 02:00 em `America/Sao_Paulo` vira o agendamento certo (o foco 2);
  - um pedido com um backup rodando espera (o foco 3);
  - a falha aparece nas tarefas da operadora e não nas das outras.

  Verificar: `pnpm test:integration` passa no `apps/api`.
- [x] 5.5 Escrever os testes de integração e depois as rotas da operação (decisão 15):
  - `GET /operacao/backups`: os backups do mais novo ao mais antigo, o próximo horário e o último teste;
  - `POST /operacao/backups/pedidos`: põe na fila e registra `backup.solicitado`;
  - `PUT /operacao/agenda`: o horário e o dia do teste, dentro dos limites, com `agenda-do-backup.alterada` com o antes e o depois, e reagenda;
  - para as outras organizações, 404; sem a permissão, 403.

  Os casos:
  - o horário fora da janela recusado com "Escolha um horário entre 00:00 e 06:00.";
  - o pedido duplo enquanto um backup roda (o foco 3);
  - o servidor sem backup configurado, com a resposta dizendo isso.

  Verificar: `pnpm test:integration` passa, e `pnpm contrato:verificar` está em dia.

## 6. Web

- [x] 6.1 Escrever os testes e depois o aviso do ambiente de teste:
  - no `packages/ui`, o item "Ambiente de teste" nos itens da barra, com o ícone, também no celular, e o aviso da tela de entrada (o texto e a frase), cada um com as histórias e os testes de interação e acessibilidade;
  - na web, o ambiente vem do estado da sessão para a barra e para a entrada.

  Verificar: `pnpm test:stories` e os testes da web passam.
- [x] 6.2 Escrever os testes de componente e depois a tela de backup na Administração (decisão 15):
  - **A seção:** a última do menu, só com `operaOServidor` e `backup.administrar`, e o endereço numa organização que não opera o servidor leva à primeira seção.
  - **A lista:** os backups, com quando, o tamanho, os destinos e o resultado em texto; o próximo backup; o último teste de restauração.
  - **As ações:**
    - "Fazer backup agora", que mostra "Backup na fila.";
    - o formulário do horário e do dia do teste, com a recusa da API no campo, e "Horário do backup salvo." ao salvar;
    - o servidor sem backup configurado, que diz isso;
    - a atualização pelo `operacao.mudou`.

  Verificar: os testes de componente passam.
- [x] 6.3 Estender a ponta a ponta com a API simulada:
  - o backup pedido, o horário mudado e a recusa fora da janela;
  - a barra e a entrada no ambiente de teste;
  - a seção ausente numa organização que não opera o servidor.

  Verificar: `pnpm test:e2e` passa.

## 7. Comando de operação

- [x] 7.1 Criar o `apps/operacao` (o package, o tsconfig e o Vitest) e escrever os testes e depois (decisões 2 e 4):
  - `estado.ts`: `EstadoDaInstalacao` (a raiz, os ambientes com `atual`, `anterior`, endereços e porta, o certificado e as versões), com `lerEstado` e `gravarEstado`;
  - `configuracao.ts`: `gerarConfigEnv` e `lerConfigEnv`, com aspas e caracteres especiais.

  Verificar: os testes unitários passam.
- [x] 7.2 Escrever os testes e depois as peças do Windows atrás de interfaces (decisões 2 e 4):
  - `Servicos`: o XML do WinSW por serviço, com o `--env-file`, o reinício e o log por tamanho; registrar, iniciar, parar e consultar o estado;
  - `Juncoes`: apontar e ler;
  - `Firewall`: abrir 80 e 443;
  - `Console`: a pergunta e a confirmação digitada, ou `--confirmar`;
  - a ACL dos `config.env`.

  Cada implementação monta a linha de comando, testada com um executor simulado. Verificar: os testes unitários passam, inclusive o XML exato de cada serviço.
- [x] 7.3 Escrever os testes e depois o proxy (decisão 9):
  - `gerarCaddyfile(estado)`: os modos `publico` e `interno`, o interno com a AC do Caddy ou os arquivos da empresa, o HSTS só na produção, um site por endereço e os dados em `caddy\dados`;
  - `grafite proxy configurar` e `grafite proxy raiz <destino>`.

  Verificar: os testes unitários passam, com o Caddyfile exato de cada modo.
- [x] 7.4 Escrever os testes e depois `grafite instalar` (decisão 6), com as peças simuladas. Os casos:
  - o pré-requisito ausente para antes de criar qualquer coisa, e também a porta 80 ou a 443 ocupada por outro programa, como o IIS;
  - o caminho completo na ordem do design, com as senhas geradas só nos `config.env`, diferentes em cada ambiente;
  - os apps configurados para ouvir só em 127.0.0.1;
  - a retomada de uma instalação interrompida no meio;
  - o arquivo de respostas.

  Verificar: os testes unitários passam.
- [x] 7.5 Escrever os testes e depois `grafite atualizar <zip> --ambiente teste` (decisão 7):
  - o hash conferido antes de tudo;
  - o desempacotamento uma vez só em `versoes\<x.y.z>`, com os links do workspace recriados como junções;
  - parar, migrar, trocar `atual` e `anterior`, iniciar e conferir a saúde com a versão nova.

  Os casos: o hash errado não muda nada, e a mesma versão já desempacotada não desempacota de novo. Verificar: os testes unitários passam.
- [x] 7.6 Escrever os testes e depois `grafite atualizar <zip> --ambiente producao` e `grafite voltar --ambiente <ambiente>` (decisão 7):
  - **Guarda:** o teste roda a versão, com saúde e com todas as migrations dela aplicadas, pelo diário do pacote.
  - **Passos:**
    1. o backup conferido;
    2. o nome digitado;
    3. parar o coletor e o app;
    4. migrar e trocar as junções;
    5. iniciar o app, conferir a saúde e iniciar o coletor.
  - **Falha:** em cada passo depois da parada, os serviços ficam parados, e a mensagem mostra o erro e o runbook.
  - **Volta:** troca `atual` e `anterior`, e diz que não há versão anterior quando ela não existe.

  Verificar: os testes unitários passam.
- [x] 7.7 Escrever os testes e depois `grafite preparar-teste` (decisão 8):
  - o último backup das últimas 24 h, ou um novo, e a confirmação digitada;
  - a restauração na instância do teste;
  - a troca dos endereços pelo mapa da configuração, com integração no PostgreSQL de verdade para o SQL da troca;
  - as migrations da versão do teste, a partida e a saúde.

  Os casos: a organização fora do mapa avisada pelo nome (o foco 5), o endereço do mapa que não existe e o nome do banco errado. Verificar: os testes unitários e de integração passam.
- [x] 7.8 Escrever os testes e depois `grafite restaurar <backup> --ambiente producao` (decisão 16):
  1. a confirmação digitada;
  2. parar o coletor e o app;
  3. renomear o banco atual para `grafite_antes_<momento>`;
  4. restaurar e conferir as linhas;
  5. trocar a pasta dos arquivos pela restaurada;
  6. iniciar e conferir a saúde.

  Os casos: o backup com o hash errado não muda nada, e uma falha depois da parada deixa o banco antigo com o nome dele e os serviços parados. Verificar: os testes unitários e de integração passam.
- [x] 7.9 Escrever os testes e depois a entrada do comando (`src/grafite.ts`):
  - a leitura dos argumentos e `--ambiente`;
  - `backup agora|listar|testar`, que chamam o `packages/operacao` com a configuração da produção;
  - `servicos estado|reiniciar`;
  - o repasse de `organizacao` e `conta` ao comando da API com o `config.env` do ambiente;
  - a ajuda em pt-BR.

  Também os lançadores `grafite.ps1` e `instalar.ps1`, que conferem a elevação e chamam o Node. Verificar: os testes unitários passam, e `.\grafite.ps1 --ajuda` mostra os comandos.

## 8. Pacote da versão e CI

- [x] 8.1 Escrever os testes e depois `apps/operacao/scripts/empacotar.ts` (decisão 5):
  - a montagem: a web compilada, a instalação de produção filtrada com `node-linker=hoisted`, os pacotes do workspace, o runbook e as ferramentas;
  - a lista dos links do workspace;
  - o zip e o `.sha256`;
  - a recusa quando a versão pedida não é a da API.

  Os casos, com uma pasta de exemplo: a lista dos arquivos e dos links. Verificar: os testes unitários passam. Num Windows, o zip montado e desempacotado com as junções recriadas sobe a API com `/health` 200.
- [x] 8.2 Criar o `.github/workflows/versao.yml`, com o job do pacote:
  - na tag `vX.Y.Z` ou por pedido, num executor Windows;
  - a conferência da tag contra a versão da API;
  - o Caddy montado com o `xcaddy` e o `caddy-dns/cloudflare`, com as versões fixadas;
  - o WinSW baixado e conferido pelo hash;
  - `caddy validate` nos Caddyfiles gerados dos dois modos;
  - a montagem do zip e a publicação dele e do `.sha256` na release.

  Verificar: o job passa num pedido manual, com uma versão de ensaio, e a release de ensaio tem os dois arquivos.
- [x] 8.3 Acrescentar ao `versao.yml` o job da verificação no Windows (decisão 17):
  - o PostgreSQL 18;
  - as portas 80 e 443 livres, com o IIS da imagem do executor parado;
  - `instalar.ps1` com o arquivo de respostas, no modo interno, com `grafite.localhost` e `grafite-teste.localhost` no `hosts`;
  - a saúde dos dois pelo HTTPS, confiando na raiz exportada, e o estado da sessão de cada endereço com a organização certa;
  - a porta do app recusada pelo IP da máquina, fora do loopback;
  - a credencial do teste recusada pela instância da produção;
  - o backup, o teste de restauração e `preparar-teste`;
  - a atualização do teste e da produção com um segundo pacote, de versão maior, e a volta da produção.

  Verificar: o job passa num pedido manual.

## 9. Runbook e fechamento

- [x] 9.1 Escrever o runbook em `docs/operacao/` (pt-BR), conforme o requisito "Runbook da operação":
  - os pré-requisitos do Windows Server;
  - o PostgreSQL 18, com as opções do instalador;
  - os dois modos do certificado: o token do Cloudflare limitado à zona e a distribuição da AC interna por GPO e nos celulares;
  - a instalação, a atualização e a promoção, a volta e a preparação do teste;
  - o backup, o teste de restauração, a restauração da produção e a guarda das chaves;
  - os serviços e os logs.

  Verificar: cada comando do runbook existe na ajuda do `grafite.ps1`, e o empacotamento inclui o runbook.
- [x] 9.2 Atualizar o `CLAUDE.md` com o F2d, os comandos novos e a pasta `docs/operacao`. Verificar:
  - `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:stories`, `pnpm test:e2e`, `pnpm test:e2e:pilha` e `pnpm test:visual` verdes;
  - `pnpm tokens:verificar`, `pnpm marca:verificar`, `pnpm contrato:verificar` e `pnpm fila:verificar` em dia;
  - o CI verde no PR e o `versao.yml` verde num pedido manual.
