## Context

O repositório `D:\grafite` tem só a spec mestre, as referências do brainstorming e o OpenSpec inicializado. A motivação está em `proposal.md` (Why), e os requisitos nas specs desta change.

Restrições que moldam o desenho:
- **Máquina de desenvolvimento:** Windows 11, Node 24 com corepack e Docker Desktop, com a virtualização já ativa.
- **Produção interna futura:** servidor Windows, sem garantia de internet.
- **Ferramentas de design:** o plano inicial espelhava o design system no Figma. Durante a implementação, o usuário decidiu seguir sem ferramenta de design externa (decisão 11).
- **Multi-agente a partir da fase 2:** o esqueleto precisa deixar contratos e fronteiras claros para agentes em worktrees.

## Goals / Non-Goals

**Goals:**
- Uma base em que F1 (casca) e F2 (núcleo) só acrescentam, sem refazer estrutura, tokens ou componentes.
- Verificações automáticas que seguram a qualidade sem depender de revisão manual:
  - cor fixa;
  - contraste;
  - acessibilidade;
  - regressão visual;
  - tabela sem RLS;
  - segredo no commit;
  - cliente da API desatualizado.
- O primeiro teste de isolamento entre organizações rodando desde o dia 1.

**Non-Goals:**
- Nenhuma rota de negócio, autenticação ou persistência de preferências no servidor (F2).
- Os comportamentos da casca: dock, cursor, busca, Quick Look, boas-vindas (F1). O F0 entrega só a casca vazia e um painel provisório de aparência.
- Espelho do design system em ferramenta de design externa (decisão 11).

## Decisions

### 1. Monorepo com pnpm + Turborepo
- **Escolha:** workspaces pnpm, com a versão fixada em `packageManager` e ativada via corepack; Turborepo para orquestrar e guardar em cache lint, tipos, testes e build.
- **Por quê:** o depósito único do pnpm deixa baratas as worktrees dos agentes da fase 2, e o cache do Turborepo mantém o CI rápido.
- **Alternativas:** workspaces do npm (como no dsachboard): mais simples, mas sem cache e com node_modules pesados por worktree. Nx: poderoso, mas mais pesado do que o necessário.
- **Escopo dos pacotes:** `@grafite/web`, `@grafite/api`, `@grafite/collector`, `@grafite/domain`, `@grafite/ui`, `@grafite/db` e `@grafite/api-client`.

### 2. Biome para lint e formatação, mais um verificador próprio de cores
- **Escolha:** Biome para lint (incluindo regras de acessibilidade e de hooks) e formatação. Um script próprio procura cores literais (hex, `rgb()`, `hsl()`, nomes de cor) fora de `packages/ui/src/tokens`.
- **Por quê:** Biome é uma ferramenta só e rápida. O verificador de cores é simples e não depende do mecanismo de plugins do linter.
- **Alternativa:** ESLint + Prettier: ecossistema maior, porém mais lento e com duas configurações.

### 3. Tokens escritos em TypeScript, com geração de CSS, tipos e JSON
- **Fonte:** `packages/ui/src/tokens/`, em TypeScript tipado. Contém os primitivos, os semânticos por tema, os destaques por tom, as densidades, a escala de raio derivada da base e o movimento. Os valores iniciais vêm do Apêndice A da spec mestre.
- **Um gerador produz três saídas:**
  1. `tokens.css`, com as variáveis CSS e seletores `[data-theme]`, `[data-accent]`, `[data-density]`, `[data-motion]` e `[data-transparency]`. O destaque é gerado por tema × destaque (`[data-theme="nevoa"][data-accent="verde"]`), e não por um atributo de tom à parte: assim cada tema tem seu destaque padrão e o Alto contraste pode ter ajustes próprios (decidido durante a implementação);
  2. os tipos TypeScript dos nomes de tokens;
  3. um JSON no formato DTCG, que deixa os tokens legíveis por outras ferramentas.
- **Raio:** a base fica numa variável (`--r`), e a escala por elemento sai de `calc()`.
- **Por quê:** o TypeScript permite derivar valores (raios, destaque por tom) e detecta nome errado na compilação. O JSON DTCG mantém a porta aberta para outras ferramentas.
- **Alternativa:** Style Dictionary com fonte em JSON: bom para vários destinos, mas perde a tipagem e exige transformações para os valores derivados.

### 4. Aparência em tempo de execução por atributos no `<html>`
- **Mecanismo:** a aparência é aplicada por atributos no elemento raiz, e a troca só muda atributos, sem recarregar a página.
- **Sem flash:** um script inline mínimo no `index.html` lê a preferência salva (no navegador, até o F2) e aplica os atributos antes da primeira pintura.
- **Preferências do sistema:** movimento reduzido e transparência reduzida são lidos do sistema operacional quando não houver escolha explícita.
- **Alternativa:** tema via contexto React. Descartada, porque obriga a renderizar antes de saber o tema e causa flash.

### 5. Contraste calculado por um verificador próprio e testado
- **Como funciona:** uma função de luminância relativa sRGB calcula o contraste WCAG 2.2 para uma lista explícita de pares.
  - Os pares são: texto sobre fundo e superfícies; texto secundário; destaque sobre superfície; texto sobre destaque; situações sobre superfície e sobre fundo tingido; anel de foco sobre fundo; borda de controle.
  - Os materiais translúcidos são calculados já compostos sobre o fundo do tema, que é o pior caso.
  - A função é testada contra valores conhecidos (por exemplo, #777 sobre #fff = 4,48:1).
- **Por quê:** a lista de pares documenta o que de fato é usado junto, e roda em milissegundos no CI.
- **Alternativa:** axe-core só nas telas. Continua sendo usado (decisão 8), mas sozinho não cobre as 24 combinações.

### 6. Componentes: React Aria Components + CSS Modules + Motion
- **Escolha:** React Aria Components como primitivos sem estilo; estilo em CSS Modules que consomem só tokens semânticos; Motion apenas onde CSS não basta (a mola do aviso).
- **Menu:** o menu com submenu usa o suporte a submenus do React Aria, com os tempos do Apêndice B. Se o comportamento nativo de tolerância não cumprir o cenário diagonal da spec, a tolerância é implementada por cima, com o teste do triângulo.
  - **Resultado (tarefa 8.7):** a tolerância nativa cumpre o cenário diagonal. Ela é um cone entre o ponteiro e a borda do submenu, com 15° de folga, amostrado a cada 50 ms. Mas decide em 1000 ms, valor fixo no código, e o Apêndice B pede 150 ms.
  - **Ajuste:** em vez de reimplementar o triângulo, um patch do pnpm (`patches/react-aria.patch`) troca só essa constante.
  - **Garantias:** o teste `ToleranciaDecideRapido` falha sem o patch. Uma atualização do React Aria que invalide o patch interrompe a instalação, em vez de voltar em silêncio aos 1000 ms.
- **Por quê:** o React Aria é a opção mais completa em acessibilidade (teclado, leitores de tela, i18n) para menus, árvores, tabelas e combobox, e não impõe aparência. É o ANTISLOP: a biblioteca é infraestrutura, não identidade.
- **Alternativas:** Radix UI (boa, mas menos completa em tabela e árvore); Tailwind + shadcn (descartado, porque traz identidade visual pronta).

### 7. Ícones: Lucide por trás de um componente próprio
- **Escolha:** um componente `<Icon>` encapsula o Lucide (licença ISC) com o traço do projeto (1,7) e deixa o ícone oculto de leitores de tela por padrão. Quando é botão só de ícone, o nome acessível é obrigatório.
- **Ícones próprios:** os de tipo de ativo e as imagens genéricas de produto (evoluídas dos protótipos) são SVGs na mesma grade de 24 px.
- **Alternativa:** Phosphor. Tem mais variantes, mas o traço do Lucide combina com a direção A.

### 8. Catálogo no Storybook, com testes no navegador
- **Escolha:** Storybook com construtor Vite.
  - Seletores globais de tema, destaque, densidade e raio na barra.
  - Complemento de acessibilidade com axe.
  - Testes de interação escritos nas histórias e executados pelo Vitest em modo navegador (Chromium): tolerância do menu, foco de diálogo, pausa do aviso.
- **Regressão visual:** Playwright gera capturas do Storybook compilado:
  - cada história nos temas Grafite e Névoa, nas larguras 1366, 1920 e 2560;
  - uma página-matriz por tema × densidade em 1920.
  - As referências são geradas dentro do contêiner oficial do Playwright, para serem idênticas no Windows e no CI.
  - **Como ficou (tarefa 8.11):**
    - `pnpm test:visual` compila o Storybook e roda as capturas no contêiner, na mesma versão do Playwright do projeto. O contêiner instala só o `@playwright/test`, porque os `node_modules` do Windows não servem no Linux. `--atualizar` regrava as referências.
    - Histórias com função de interação ficam fora das capturas. Elas terminam em estado transitório (aviso com tempo, menu aberto), e o comportamento delas já é coberto pelos testes de interação.
    - A captura é só da área da história, não da tela inteira, para as referências ficarem leves no Git.
- **Alternativas:** Ladle (mais leve, mas sem o mesmo ecossistema de testes e acessibilidade); página própria de catálogo (mais trabalho, sem ferramentas).

### 9. Fontes auto-hospedadas
- **Escolha:** pacotes Fontsource de Instrument Sans e JetBrains Mono (licença OFL), com os subconjuntos latin e latin-ext em woff2, pré-carregando os pesos principais.
- **Por quê:** o servidor interno pode não ter internet, e não há dependência de terceiros em tempo de execução.

### 10. API, coletor, contrato e banco
- **API:** Fastify, com provedor de tipos Zod.
  - Configuração validada por um schema Zod na partida, listando todas as variáveis que faltarem.
  - `GET /health` informa estado, versão e resposta do banco.
  - Logs estruturados (pino).
  - OpenAPI gerado por `@fastify/swagger`.
- **Cliente da API:** gerado com openapi-typescript + openapi-fetch.
  - O CI regenera o OpenAPI e o cliente e falha se houver diferença no Git.
  - Alternativas: orval e hey-api geram mais código do que precisamos agora.
- **Coletor:** o mesmo padrão, com configuração validada e `/health`. Sem lógica de coleta, que fica no P2.
- **Banco:** PostgreSQL 18, que tem `uuidv7()` nativo e atende à spec de identificadores; Drizzle com migrations em SQL versionadas.
  - **Isolamento:**
    - uma função `app.current_org()` lê `current_setting('app.org_id', true)`;
    - no TypeScript, o helper `orgScoped()` do Drizzle acrescenta `id` (uuidv7) e `org_id` a toda tabela de negócio, para a tipagem e a geração da tabela;
    - no banco, a migration que cria a tabela chama `app.isolar_por_organizacao('<tabela>')`. É uma função SQL única, que ativa e força o RLS e cria a política de leitura e escrita. Ela existe porque o Drizzle ativa RLS, mas não sabe forçá-lo (decisão tomada durante a implementação).
    - Sem contexto, `current_org()` retorna nulo e as políticas não deixam passar nenhuma linha (falha fechada).
    - Nomes de tabelas em português (`organizacoes`, `ativos`, `pessoas`), acompanhando o domínio; a coluna de escopo é `org_id`.
  - **Papéis:**
    - `grafite_owner` é dono das tabelas e roda as migrations;
    - `grafite_app` é o papel de execução, sem `BYPASSRLS` e sem ser dono das tabelas.
    - O contexto é definido por transação com `set_config('app.org_id', …, true)`.
  - **Teste-guarda:** uma consulta ao catálogo do Postgres falha se alguma tabela fora da lista de exceções não tiver RLS ativo e forçado.
  - **Testes de integração:** Testcontainers, com um banco efêmero por execução. Os cenários de isolamento criam uma tabela de prova e aplicam a própria `app.isolar_por_organizacao()`, validando a função que toda tabela futura vai usar.
  - **Alternativa:** filtro por organização em cada consulta. Descartada pela spec: depende de disciplina de código.
- **Desenvolvimento:** `docker compose` com o PostgreSQL e um script de inicialização dos papéis. O comando `pnpm dev` checa o Docker, sobe o banco, aplica as migrations e inicia API e web.
- **Web:** Vite + React 19 + TanStack Router e Query (uso mínimo no F0). Uma rota com a casca vazia (barra, área de conteúdo com componentes de exemplo e marcador do dock) e um painel provisório de aparência, substituído pelos Ajustes do F1.

### 11. Sem ferramenta de design externa
- **Decisão do usuário, durante a implementação:** o F0 segue sem espelho do design system em ferramenta de design. O código é a única referência visual:
  - os tokens em `packages/ui/src/tokens`;
  - o catálogo do Storybook;
  - a regressão visual.
- **Como se chegou aqui:**
  - **Figma:** o plano previa as variáveis com um modo por tema e os componentes principais. O plano Starter permite um modo só por coleção, e a escrita pelo MCP exige assento Full.
  - **Stitch:** foi avaliado no lugar do Figma. Ele reescreve com IA o design system recebido: recalcula as cores de destaque no sistema de cores dele, troca fontes e reescreve o texto. O espelho não ficaria fiel aos tokens.
- **Fica do trabalho anterior:** o JSON DTCG ampliado, com nomes dos modos, situações, apelidos, escalas, paleta e nomes CSS. Ele segue gerado e testado, pronto para qualquer ferramenta que venha depois.

### 12. Proteção contra segredos e ganchos de commit
- **Escolha:**
  - Lefthook, que funciona no Windows sem shell POSIX, roda Biome e secretlint antes de cada commit.
  - O CI roda o gitleaks, com regras mais amplas.
  - `.gitattributes` com `* text=auto eol=lf`.
- **Por quê:** o secretlint roda em Node, sem instalar binário no Windows, e o gitleaks no CI cobre o histórico inteiro.
- **Alternativa:** Husky, que depende de scripts de shell e dá mais atrito no Windows.

### 13. Identidade
- **Nome:** a busca usa a busca pública do INPI (classes 9 e 42), buscas na web e consultas RDAP aos registros de domínio (registro.br para `.com.br`). O resultado vira o relatório `docs/identidade/nome.md`.
- **Logo:**
  1. 3 ou 4 conceitos em SVG são mostrados no companheiro visual, nos temas claro e escuro;
  2. o usuário escolhe;
  3. o conceito escolhido é refinado no código (`gerar-marca.ts`) e exportado para `packages/ui/src/brand/marca.svg`.
- **Derivados:** um script gera os PNG da PWA (incluindo o maskable, com área segura de 80%), o favicon (SVG + ICO) e as versões monocromáticas.
  - **Como ficou (tarefas 10.4 e 10.5):** o script é o `gerar-marca.ts`, e os PNG saem do resvg. Ele grava também o manifesto da PWA, com as cores do tema padrão e os ícones gerados. Grava ainda a montagem da marca em TypeScript, que o componente `<Marca>` desenha em linha na cor do texto do tema, sem carregar a fonte no navegador.
- **Regras de aplicação:** ficam em `docs/identidade/marca.md`.

### 14. Documentos de regras primeiro
O `docs/ANTISLOP.md` (v2) e o `CLAUDE.md` são as primeiras entregas, porque orientam todas as outras tarefas e, depois, os agentes da fase 2.

## Risks / Trade-offs

- [Capturas de tela instáveis entre Windows e Linux] → Referências geradas no contêiner do Playwright; tolerância de pixels calibrada; fontes auto-hospedadas.
- [A tolerância nativa do submenu no React Aria não cumprir o cenário diagonal] → Teste de interação escrito antes; se falhar, implementação própria do triângulo por cima (decisão 6).
- [Corepack deixando de vir com o Node em versões futuras] → Versão do pnpm fixada em `packageManager` e instrução de instalação alternativa (`npm i -g pnpm`) no README.
- [Conflito de marca para "Grafite"] → O nome fica centralizado na configuração da marca; trocar depois custa pouco. A decisão é do usuário, com base no relatório.
- [Testcontainers exigir Docker em toda execução de teste de integração] → Testes unitários e de componente rodam sem Docker; só os de integração exigem, e o comando avisa quando o Docker está fechado.
- [Contraste reprovando cores do protótipo aprovado] → Ajuste mínimo de luminância mantendo o matiz, registrado no relatório do verificador para o usuário ver.

## Migration Plan

Não se aplica: repositório novo, sem nada em produção. Cada entrega é um commit revisável, e desfazer é reverter o commit.

## Open Questions

- **Repositório no GitHub (resolvida):** o repositório privado anterior existe, e o CI roda no PR do F0 (#1 do repositório anterior).
  - As primeiras execuções revelaram três problemas, e os três foram corrigidos.
  - A dica pelo mouse falhava também localmente: a história anterior deixava as dicas "aquecidas".
  - O hover do botão falhava só no CI: o cursor real do navegador ficava sobre a história.
  - A fumaça de ponta a ponta travava no Linux. O pnpm 12 roda cada script num grupo de processos próprio, e o `vite preview` sobrevivia ao encerramento do Playwright. O servidor dos testes passou a chamar o vite direto, e cada job do CI ganhou limite de 15 minutos.
