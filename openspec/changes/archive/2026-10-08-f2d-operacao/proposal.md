## Why

Depois do F2c, o Grafite tem o núcleo pronto, mas só roda no ambiente de desenvolvimento e na imagem de contêiner. Falta o que o servidor interno precisa para substituir o PMG:
- não há como instalar, atualizar nem voltar uma versão no servidor Windows, onde o PMG roda hoje como serviço;
- sem HTTPS, a PWA não instala, não recebe push e o cookie `Secure` não funciona (spec mestre, seção 14);
- não há backup do banco nem dos arquivos, nem prova de que um backup restaura;
- não há ambiente de teste, então uma migration chegaria à produção sem ser validada nos dados reais.

A spec mestre pede:
- três serviços do Windows e o HTTPS obrigatório, com um proxy na frente (seção 4.3);
- o backup diário do banco e dos arquivos, com o teste de restauração periódico e as chaves guardadas à parte (seção 9.10);
- as migrations validadas no teste e um backup antes de aplicar (seção 10.6);
- os três ambientes, com o banco de teste separado (seção 12.2);
- o runbook do PostgreSQL no Windows (seção 14).

Esta change implementa a **quarta parte do subprojeto F2 · Núcleo** da spec mestre (`docs/superpowers/specs/2026-09-24-grafite-design.md`, seções 3.3, 4.3, 9, 10, 12.2, 14 e 15): **F2d · Operação**. O F2 tem quatro changes, nesta ordem:
1. F2a · Contas e acesso (arquivado);
2. F2b · Permissões e locais (arquivado);
3. F2c · Plataforma (arquivado);
4. **F2d · Operação** (esta).

Ficam fora dela:
- os e-mails de alerta, no P3;
- o trabalho real do coletor, no P2: ele é instalado agora e responde só à saúde;
- os destinos de backup em nuvem, como o S3;
- a alta disponibilidade e mais de um servidor;
- provedores de DNS além do Cloudflare, acrescentados quando a TI confirmar o provedor da empresa.

## What Changes

- **Ambientes:** a configuração diz o ambiente (desenvolvimento, teste ou produção), e a API recusa iniciar sem ele.
  - **No teste,** a barra superior e a tela de entrada mostram "Ambiente de teste", e as automações que agem fora do sistema, como o backup agendado, não rodam.
  - **Banco do teste:** fica numa instância própria do PostgreSQL, com as próprias senhas, então nada no teste alcança a produção.
- **Serviços do Windows:** o app de produção, o app de teste, o coletor e o proxy rodam como serviços, com início automático, reinício na falha e logs com rotação. Os apps só atendem no próprio servidor, pelo proxy.
- **Pacote da versão:** cada versão sai do CI como um zip para Windows, com a web compilada, as dependências de produção, o gerenciador de serviços e o proxy, e o hash dele. O servidor não compila nada.
- **Comando de operação:** um comando no servidor instala do zero, atualiza, volta à versão anterior, prepara o teste, faz e restaura backups e configura o proxy.
- **Atualização pelo teste:**
  - a produção só recebe uma versão que já roda no teste, com as mesmas migrations aplicadas;
  - antes de migrar, a produção ganha um backup conferido, e o comando pede o nome do banco digitado;
  - se algo falhar depois de parar os serviços, eles ficam parados, e o backup fica guardado.
- **Teste com a cópia da produção:** sob pedido, o teste recebe o último backup da produção, com os endereços trocados pelos do teste, e aplica as próprias migrations.
- **HTTPS interno com o Caddy,** num de dois modos escolhidos na instalação:
  - **domínio público:** Let's Encrypt pelo desafio de DNS, renovado sozinho;
  - **AC interna:** a do próprio Caddy, com o certificado raiz exportado para distribuir, ou os arquivos da AC da empresa.

  Uma tarefa diária confere a validade do certificado, e a falta de renovação aparece em Tarefas. A API passa a confiar no endereço do cliente que o proxy informa, e só no proxy.
- **Backup:**
  - diário, do banco e dos arquivos, com um manifesto, copiado para cada destino da configuração do servidor;
  - retenção de 7 diários, 4 semanais e 12 mensais, por padrão;
  - um teste de restauração periódico num banco descartável da instância de teste;
  - o banco é lido por um papel novo, só de leitura, que passa por cima do isolamento só no backup.
- **Tela de backup:** Administração › Backup, só na organização que opera o servidor e para quem tem a permissão nova. Mostra os backups e o último teste de restauração, faz um backup na hora e muda o horário dentro dos limites do servidor.
- **Runbook:** a instalação do zero, os certificados, a atualização, a volta, o teste, o backup, a restauração, a guarda das chaves e os serviços, em pt-BR.

## Capabilities

### New Capabilities

- `operacao-servicos`: os ambientes, os serviços do Windows, o pacote da versão, a instalação, a atualização com a promoção pelo teste, a volta, o teste com a cópia da produção e o runbook.
- `https-interno`: o proxy na frente dos apps, os dois modos de certificado, a vigilância da renovação e o endereço do cliente atrás do proxy.
- `backup`: o backup diário, os limites da configuração do servidor, a retenção, o teste de restauração, a restauração da produção e as chaves fora do backup.

### Modified Capabilities

- `plataforma-base`:
  - "Configuração validada na partida": o ambiente passa a ser obrigatório, só com os valores conhecidos;
  - "Saúde dos serviços": a saúde da API informa o ambiente.
- `estrutura-da-casca`: "Itens de status da barra": o item "Ambiente de teste", só no teste.
- `tela-de-entrada`: o aviso do ambiente de teste na entrada.
- `modulo-administracao`:
  - "Administração no dock": a seção Backup, por último, só na organização que opera o servidor;
  - a tela de backup, nova.
- `permissoes`: "Catálogo de permissões": a permissão `backup.administrar`.
- `auditoria`: "Eventos da administração registrados": o backup pedido pela tela e a mudança do horário.
- `eventos-em-tempo-real`: "Evento de saída gravado com a mudança": o tipo `operacao.mudou`, que atualiza a tela de backup.
- `isolamento-organizacoes`:
  - "Infraestrutura fora das organizações": os registros da operação, fora das organizações;
  - "Papéis de banco separados": o papel só de leitura do backup.

## Impact

- **Novo pacote `apps/operacao`:** o comando de operação, em TypeScript, com as peças do Windows (serviços, junções e firewall) atrás de interfaces, e os scripts `.ps1` que só conferem a elevação e chamam o Node.
- **Novo pacote `packages/operacao`:** o que o comando e as tarefas agendadas da API usam juntos (as ferramentas do PostgreSQL, o manifesto, o zip, o backup e a restauração).
- **`apps/api`:**
  - a configuração nova (o ambiente, os proxies confiáveis, a organização que opera o servidor e os limites do backup);
  - as rotas e as tarefas do backup, do teste de restauração e da vigilância do certificado;
  - o ambiente no estado da sessão e na saúde.
- **`packages/db`:** o esquema da operação (fora das organizações), as permissões do papel do backup e o teste-guarda do isolamento com a exceção.
- **`packages/domain`:** a permissão `backup.administrar`, as ações novas da auditoria e a regra da retenção.
- **`apps/web`:** a tela de backup, o item "Ambiente de teste" na barra e o aviso na tela de entrada.
- **CI:** o workflow da versão, que gera o zip, publica o hash e roda a verificação num servidor Windows.
- **Documentação:** o runbook em `docs/operacao/`, a spec mestre (seções 4.3, 9.10, 10.6, 12.2, 14 e 15) e o `CLAUDE.md`.
- **Desenvolvimento:** continua no `pnpm dev`, com `GRAFITE_AMBIENTE=desenvolvimento` no `.env`.
