# Grafite

Sistema de gestão de ativos, operação e governança de TI com casca inspirada no macOS. Substitui o PMG. Nasce interno, preparado para virar produto multiempresa.

## Regras

1. **Spec antes de código.**
   - Toda mudança nasce de uma change do OpenSpec (`openspec/changes/`), ligada a um subprojeto da spec mestre (`docs/superpowers/specs/2026-09-24-grafite-design.md`).
   - Se a implementação contradisser a spec, pare e atualize os artefatos antes.
2. **Teste antes do código** em tudo que tem lógica: escreva o teste, veja falhar pelo motivo certo e só então implemente.
3. **Visual segue o `docs/ANTISLOP.md` (v3).**
   - Cores, espaçamentos, raios, sombras, materiais e movimento vêm só dos tokens em `packages/ui/src/tokens`. A verificação automática reprova cor literal fora deles.
   - Vidro fosco só em camadas sobrepostas. Animação só para mudança de estado, com no máximo 300 ms, fora as exceções nomeadas.
   - Todo estado é comunicado por texto, e nunca só por cor.
4. **Textos da interface em pt-BR,** com a linguagem da operação e sem marketing.
5. **Nenhum segredo no repositório.**
   - Configuração vem do ambiente e é validada na partida.
   - `.env` real nunca é versionado; o gancho de pré-commit e o CI barram segredos.
   - O repositório é público (`riq0007/grafite`). Nenhum termo privado entra na árvore: o `scripts/termos-privados.ts` confere no pré-commit, com a lista em `.grafite/termos-privados/`, e no CI, com o secret `GRAFITE_TERMOS_PRIVADOS`.
   - Os commits e as tags levam o e-mail noreply do GitHub, que fica na configuração local do clone.
6. **Isolamento por organização é do banco.**
   - Toda tabela de negócio é criada com `orgScoped()` e tem RLS ativo e forçado. O teste-guarda reprova tabela sem RLS.
   - A aplicação conecta com o papel `grafite_app`, nunca com o dono das tabelas.
7. **Uma sessão escreve, sem subagentes.** A mesma sessão escreve as specs e as changes, muda os componentes compartilhados (`packages/ui`, `packages/domain`, `packages/db` e o contrato da API) e implementa as tarefas, em sequência. Nenhuma pesquisa nem tarefa vai para um subagente. Uma segunda sessão, só de leitura, pode revisar o plano da change e o diff de cada tarefa antes do commit, e devolve os pontos à sessão que escreve. Como o trabalho anda: `docs/agentes.md`.
8. **Um commit por tarefa.** Ao concluir uma tarefa de uma change (testes verdes e a verificação dela feita), commitar na hora, com a mensagem no padrão `tipo(escopo): assunto` e "Tarefa X.Y do <change>." no corpo. A change inteira não fica acumulada no índice para ser dividida no fim.

## Estrutura

```
apps/web         casca OS e módulos (React + Vite, PWA)
apps/api         HTTP, SSE e tarefas agendadas (Fastify + Zod)
apps/collector   coletor local (SNMP, Control iD)
apps/operacao    comando de operação nos servidores Windows (grafite.ps1) e Linux (grafite, em contêiner) e o empacotamento das versões
apps/painel      painel da operação: a página que o comando de operação serve no próprio servidor (React + Vite)
packages/domain  regras de negócio puras
packages/operacao  backup, restauração, manifesto e zip, das tarefas da API e do comando
packages/ui      tokens, ícones, marca e componentes base
packages/db      schema, migrations e isolamento (Drizzle + PostgreSQL)
packages/api-client  cliente tipado gerado do OpenAPI
docs/            spec mestre, ANTISLOP, identidade e referências
openspec/        changes e specs das capacidades
```

## Comandos

Esta seção é atualizada conforme o F0 cria os comandos.

| Comando | O que faz |
|---|---|
| `pnpm install` | Instala as dependências (pnpm via corepack) |
| `pnpm dev` | Sobe banco (Docker), API, coletor e web; na primeira vez, cria a organização de desenvolvimento (`localhost`), com o coletor de desenvolvimento, que pinga a faixa `127.0.0.0/8` com o token do `.env`. A conta `admin` entra com a senha `admin123`, sem troca: o comando a garante a cada execução, e essa senha só existe no desenvolvimento. A chave mestra do cofre é gerada uma vez no `.env` e nunca trocada, para os segredos cifrados continuarem a abrir. Os arquivos, como as fotos, ficam em `.grafite/arquivos`. O e-mail vai para o Mailpit, que o guarda sem entregar e o mostra em `http://localhost:8026`, e as chaves do push também são geradas uma vez no `.env` |
| `pnpm grafite <comando>` | Comando no servidor: cria organizações, com o perfil Administrador dado à primeira conta, contas (`--administrador` dá o perfil) e coletores (`coletor criar`), redefine um acesso perdido, troca a chave mestra do cofre (`cofre trocar-chave`, com a nova e a anterior no ambiente) e manda o e-mail de teste pela configuração do e-mail (`email testar --para <e-mail>`) (`pnpm grafite --ajuda`) |
| `pnpm lint` | Biome + verificador de cores literais |
| `pnpm typecheck` | Checagem de tipos em todos os pacotes |
| `pnpm test` | Testes unitários |
| `pnpm test:integration` | Testes com PostgreSQL real: pelo Docker (Testcontainers) ou, com `GRAFITE_TESTE_PG_BIN` apontando para a pasta `bin` de um PostgreSQL 18, num cluster próprio por banco de teste, sem Docker |
| `pnpm tokens:gerar` / `tokens:verificar` | Gera (ou confere) o CSS, os tipos e o JSON DTCG a partir dos tokens |
| `pnpm tokens:contraste` | Contraste das 24 combinações de tema × destaque; grava `docs/identidade/contraste.md` |
| `pnpm marca:gerar` / `marca:verificar` | Gera (ou confere) a marca e os derivados (SVG, favicon, ícones da PWA e o "olá" das boas-vindas) a partir do símbolo e das fontes |
| `pnpm contrato:gerar` / `contrato:verificar` | Gera (ou confere) o OpenAPI e o cliente tipado da API |
| `pnpm fila:gerar` / `fila:verificar` | Gera (ou confere) a migration do esquema da fila de tarefas a partir da versão fixada do pg-boss |
| `pnpm storybook` | Catálogo de componentes |
| `pnpm test:stories` | Testes de interação e acessibilidade do catálogo |
| `pnpm --filter @grafite/painel dev` | O painel da operação em `http://localhost:5174`, com o servidor do painel e um servidor simulado no lugar da instalação (`simulado/dominio.ts`), sem mudar nada no computador; o endereço com o código sai no terminal |
| `pnpm test:e2e` | Ponta a ponta da web compilada e do painel compilado (Playwright). No painel, cada teste sobe o servidor do painel com o servidor simulado, numa porta livre, e entra pelo código. Na web, com o `/api/health`, o `GET /api/sessao` (a sessão de "Ana Souza", administradora), as preferências, os padrões, os módulos da organização e a conexão de eventos, que os testes empurram, simulados, as visões e os tipos que o menu do Ativos lê e as ocorrências da tela inicial, vazios, as boas-vindas vistas e o service worker bloqueado, fora das pontas a ponta da chegada e da PWA. Nenhum pedido à API sai para a rede: o que nada simula responde 501 |
| `pnpm test:e2e:pilha` | Ponta a ponta da pilha inteira (exige Docker ou o `GRAFITE_TESTE_PG_BIN`): PostgreSQL efêmero, migrations, `pnpm grafite organizacao criar` e a API servindo a web compilada, sem nada simulado na API, com duas contas em dois navegadores, um servidor SMTP em processo e um serviço de push falso, que decifra o que recebe |
| `pnpm test:visual` | Regressão visual no contêiner do Playwright (exige Docker); `--atualizar` regrava as referências |
| `GRAFITE_SENHA_DO_CONTROLE=<senha> pnpm --filter @grafite/collector gravar-control-id -- --ip <ip> --usuario <u> --saida <arquivo>` | Lê um controle Control iD (`--porta`, a 80 por padrão) e grava a resposta das informações do sistema, sem a sessão e sem a senha, no formato do simulador dos testes do coletor |
| `pnpm --filter @grafite/collector gravar -- --ip <ip> --comunidade <c> --saida <arquivo>` | Lê uma impressora pelo SNMP (`--versao 1\|2c`, `--porta`) e grava a gravação no formato do snmpsim, que alimenta o simulador dos testes do coletor |
| `docker build --target aplicacao -t grafite-aplicacao .` | Imagem da API servindo a web compilada (`/health`, `/api/...` e a web), com os arquivos no volume `/dados/arquivos` (`GRAFITE_ARQUIVOS_PASTA`) |
| `docker build --target coletor -t grafite-coletor .` | Imagem do coletor local, com o `ping` e a fila em disco no volume `/dados/coletor` (`GRAFITE_COLETOR_PASTA`) |
| `docker build --target operacao\|proxy\|banco -t grafite/<nome>:<versão> .` | As outras imagens do pacote para Linux: o comando de operação, com o cliente do Docker e o plugin compose; o Caddy com o DNS da Cloudflare; e o PostgreSQL 18 |
| `node apps/operacao/scripts/empacotar.ts --versao x.y.z --saida <pasta> --sem-ferramentas` | Monta o pacote da versão para Windows (o zip, o `.sha256` e o atalho de instalação ao lado), como o `versao.yml` faz; o zip leva os atalhos, com os `.cmd` em CRLF, e os pré-requisitos. A versão é a de `apps/api/package.json`, e a web e o painel precisam estar compilados. Com `--winsw` e `--caddy` no lugar de `--sem-ferramentas`, o pacote instala |
| `node apps/operacao/scripts/prerequisitos.ts --conferir` | Baixa os instaladores oficiais do Node 24 e do PostgreSQL 18 fixados em `apps/operacao/prerequisitos.json` e confere o SHA-256 de cada um; roda quando a versão fixada muda |
| `node apps/operacao/scripts/empacotar-linux.ts --versao x.y.z --saida <pasta> [--construir]` | Monta o pacote da versão para Linux (o tar, o `.sha256` e o `instalar.sh` ao lado), como o `versao.yml` faz: as cinco imagens da versão do Docker de quem monta (o `--construir` as constrói pelos estágios do Dockerfile), o `instalar.sh`, o lançador e o runbook; a versão é a de `apps/api/package.json` |
| `sudo bash instalar.sh [grafite-x.y.z-linux-x64.tar]` e `sudo grafite <comando>` | No servidor Linux com o Docker: o roteiro, baixado da release ao lado do tar e do `.sha256`, acha o pacote da pasta dele, confere o Docker e o hash, carrega as imagens, põe o lançador em `/usr/local/bin/grafite` e instala em `/opt/grafite`; depois, o `grafite` roda o comando de operação da versão da produção num contêiner, com os mesmos comandos do `grafite.ps1` (`sudo grafite --ajuda`), fora o `menu`; o `sudo grafite painel`, numa sessão com interface, abre o painel no navegador de quem chamou o `sudo`, com a porta publicada só no 127.0.0.1. Tudo no runbook |
| `Instalar-Grafite.cmd` e o atalho "Grafite" | No servidor Windows, com dois cliques: o atalho de instalação, ao lado do zip e do `.sha256` da release, pede a elevação, confere e extrai o pacote, instala o Node 24 e o PostgreSQL 18 que faltam, desliga o IIS das portas do proxy com o sim de quem opera e chama a instalação (`--respostas <arquivo>` para o roteiro); depois, o atalho "Grafite" da área de trabalho abre o painel da operação no navegador do servidor. Tudo no runbook |
| `.\grafite.ps1 <comando>` | No servidor Windows, como administrador: `painel` (`--sem-navegador`, `--porta`), `menu`, `instalar` (`--preparar`, que o atalho passa), `atualizar`, `voltar`, `preparar-teste`, `backup agora\|listar\|testar\|configurar`, `restaurar`, `proxy configurar\|raiz`, `servicos estado\|reiniciar\|iniciar\|parar`, `certificado configurar`, `enderecos acrescentar\|tirar`, `cofre trocar-chave`, `email configurar\|testar` e os comandos `organizacao` e `conta` da API (`.\grafite.ps1 --ajuda`; no repositório, `apps\operacao\lancadores\grafite.ps1`). Tudo no runbook |

## Referências

- Mapa dos documentos, das specs, das changes e o glossário: `docs/mapa.md`
- Spec mestre: `docs/superpowers/specs/2026-09-24-grafite-design.md`
- Regras visuais: `docs/ANTISLOP.md`
- Telas aprovadas no brainstorming: `docs/referencias/brainstorm/`
- Specs das capacidades: `openspec/specs/`
- F0 · Identidade, design system e esqueleto técnico: `openspec/changes/archive/2026-09-26-f0-identidade-design-system-esqueleto/`
- F1 arquivado: F1a · Estrutura da casca: `openspec/changes/archive/2026-09-26-f1a-estrutura-da-casca/`; F1b · Interação: `openspec/changes/archive/2026-09-27-f1b-interacao/`; F1c · Chegada e PWA: `openspec/changes/archive/2026-09-27-f1c-chegada-e-pwa/`
- F2 arquivado: F2a · Contas e acesso: `openspec/changes/archive/2026-10-02-f2a-contas-e-acesso/`; F2b · Permissões e locais: `openspec/changes/archive/2026-10-07-f2b-permissoes-e-locais/`; F2c · Plataforma: `openspec/changes/archive/2026-10-07-f2c-plataforma/`; F2d · Operação: `openspec/changes/archive/2026-10-08-f2d-operacao/`
- P1 arquivado: P1a · Catálogo: `openspec/changes/archive/2026-10-09-p1a-catalogo/`; P1b · Cadastro de ativos: `openspec/changes/archive/2026-10-10-p1b-cadastro-de-ativos/`; P1c · Tabela e visões: `openspec/changes/archive/2026-10-10-p1c-tabela-e-visoes/`; P1d · Ficha e relacionamentos: `openspec/changes/archive/2026-10-12-p1d-ficha-e-relacionamentos/`; P1e · Importação: `openspec/changes/archive/2026-10-12-p1e-importacao/`; P1f · Etiqueta: `openspec/changes/archive/2026-10-12-p1f-etiqueta/`
- P2 arquivado: P2a · Coletor e disponibilidade: `openspec/changes/archive/2026-10-12-p2a-coletor-e-disponibilidade/`; P2b · Impressoras por SNMP: `openspec/changes/archive/2026-10-15-p2b-impressoras-por-snmp/`; P2c · Saúde do Control iD: `openspec/changes/archive/2026-10-15-p2c-saude-do-control-id/`
- P3 arquivado: P3a · Regras e alertas: `openspec/changes/archive/2026-10-15-p3a-regras-e-alertas/`; P3b · Notificações no servidor: `openspec/changes/archive/2026-10-15-p3b-notificacoes-no-servidor/`; P3c · E-mail e push: `openspec/changes/archive/2026-10-15-p3c-email-e-push/`; P3d · Indicadores: `openspec/changes/archive/2026-10-15-p3d-indicadores/`
- P4 arquivado: P4a · Fornecedores: `openspec/changes/archive/2026-10-19-p4a-fornecedores/`; P4b · Consumíveis: `openspec/changes/archive/2026-10-19-p4b-consumiveis/`; P4c · Estoque: `openspec/changes/archive/2026-10-21-p4c-estoque/`; P4d · Solicitações: `openspec/changes/archive/2026-10-22-p4d-solicitacoes/`; P4e · Ordens de serviço: `openspec/changes/archive/2026-10-22-p4e-ordens-de-servico/`; P4f · Indicadores da operação: `openspec/changes/archive/2026-10-23-p4f-indicadores-da-operacao/`
- P6 arquivado: P6 · Cofre: `openspec/changes/archive/2026-10-13-p6-cofre/`
- Runbook da operação, no Windows e no Linux com o Docker (instalar, atualizar, voltar, preparar o teste, backup, restauração, certificados, chaves, e-mail e push, serviços e logs): `docs/operacao/runbook.md`; os pacotes da versão saem do `.github/workflows/versao.yml`
- CI e versões: `.github/workflows/ci.yml` e `.github/workflows/versao.yml`, só nos executores hospedados pelo GitHub, nas imagens fixadas `ubuntu-24.04` e `windows-2022`, e nunca num executor próprio (spec plataforma-base, "Executores do CI"); o teste-guarda `scripts/ci/executores.test.ts` reprova o job que pede outro executor
- Contrato de módulo (como um módulo entra na casca, na busca e na tela inicial, declara as permissões, sabe quem está na sessão e o que ela pode, fala com a API e lê os dados com o TanStack Query, atualiza as telas pelos eventos do servidor, mostra a tela sem permissão, lê as preferências e mostra a foto da pessoa, notifica na tela, por e-mail e no celular, mostra um indicador com a meta e a decisão, formata datas no fuso escolhido, liga a prévia à tabela, monta a tabela configurável com as visões, mostra o que tem nas fichas dos outros módulos, cita um registro com o cartão do resumo e abre a tabela a partir de uma origem, declara as ações da tela para a busca, pede o cursor do sistema e põe as telas num submenu, põe no dock itens que vêm dos dados, mostra um valor coletado com a situação e a idade, os vários itens de um ativo, como os suprimentos, ou a coluna de situação de outra capacidade, como o Control iD, é um módulo opcional, que a organização desliga, pede a confirmação pelo código do app antes de uma ação sensível, oferece um cadastro dele aos campos dos outros módulos, que o abrem numa aba, põe um bloco no Início e como outra parte do app acrescenta uma etapa à chegada, sem mudar a casca): `docs/casca/modulos.md`
