## Why

O Grafite ainda não tem nenhuma base visual nem técnica. Sem tokens, componentes e um esqueleto que já nasça com isolamento por organização, cada subprojeto seguinte (casca, núcleo, módulos) inventaria a própria versão dessas peças. Na fase de paridade, com vários agentes em paralelo, isso viraria designs e padrões divergentes.

Esta change implementa o **subprojeto F0** da spec mestre (`docs/superpowers/specs/2026-09-24-grafite-design.md`, seções 3.2, 4, 7 e 12): identidade, design system e esqueleto técnico. É o primeiro passo da fase 1, na ordem F0 → F1 → F2.

## What Changes

- **Identidade**
  - Busca de conflito para o nome "Grafite": INPI, classes de software, e domínios.
  - Logo escolhido entre conceitos apresentados ao usuário.
  - Entregáveis: símbolo, logotipo, versão monocromática, favicon e ícones da PWA.
- **Regras do projeto**
  - `CLAUDE.md` na raiz.
  - ANTISLOP v2 consolidado em `docs/ANTISLOP.md`, a partir da v1 do PMG e da seção 7.10 da spec mestre.
- **Design tokens**
  - Três camadas: primitivos, semânticos e de componente.
  - Modos: seis temas × quatro destaques, três densidades, raio base, movimento e tipografia.
  - Uma fonte única gera as variáveis CSS e os tipos TypeScript.
  - Checagem automática de contraste.
- **Iconografia**
  - Ícones de interface com traço do projeto.
  - Ícones e imagens genéricas por tipo de ativo.
- **Componentes base** em React, com todos os estados e acessibilidade, e um catálogo navegável em todos os temas e densidades.
- **Esqueleto técnico**
  - Monorepo pnpm + Turborepo com `apps/web`, `apps/api`, `apps/collector` e os pacotes `domain`, `ui`, `db` e `api-client`.
  - Configuração validada na partida e endpoints de saúde.
  - PostgreSQL de desenvolvimento em Docker, com a organização como raiz dos dados e RLS.
  - Proteção contra segredos no commit, CI e fim de linha LF.
- **Casca vazia:** a web abre uma casca vazia com os tokens aplicados e troca tema, destaque e densidade sem recarregar a página.

**Fora desta change**, conforme a spec mestre:
- **F1:** dock, menus em árvore, barra superior funcional, busca Ctrl+K, cursor suavizado, Quick Look, notificações, Ajustes do Sistema, carregamento e boas-vindas.
- **F2:** login, contas, permissões, auditoria e preferências gravadas no servidor.
- **P1:** a tabela virtualizada de ativos.
- **Nenhuma** regra de negócio de ativos.

## Capabilities

### New Capabilities
- `identidade-visual`: nome verificado, logo e seus derivados, e regras de aplicação da marca.
- `design-tokens`: definição, geração, aplicação em tempo de execução e contraste dos tokens visuais.
- `iconografia`: conjunto de ícones de interface e de tipos de ativo, e imagens genéricas de ativo.
- `componentes-base`: biblioteca de componentes base, com estados, acessibilidade e catálogo.
- `plataforma-base`: estrutura do monorepo, configuração validada, saúde dos serviços, ambiente de desenvolvimento, proteção contra segredos e CI.
- `isolamento-organizacoes`: organização como raiz dos dados e isolamento garantido pelo banco (RLS e papéis de acesso).

### Modified Capabilities

Nenhuma. É a primeira change do repositório.

## Impact

- **Repositório:** cria toda a estrutura inicial (`apps/`, `packages/`, `docs/ANTISLOP.md`, `CLAUDE.md`, `.gitattributes`, configurações de ferramentas e CI).
- **Dependências novas:**
  - pnpm (via corepack) e Turborepo;
  - TypeScript e Biome;
  - Vite e React;
  - React Aria Components e Motion;
  - Storybook;
  - Fastify e Zod;
  - Drizzle e o driver do PostgreSQL;
  - Vitest e Playwright;
  - gancho de pré-commit e verificador de segredos;
  - Lucide e as fontes Instrument Sans e JetBrains Mono, auto-hospedadas.
- **Infraestrutura de desenvolvimento:** Docker Desktop, com um container PostgreSQL.
- **Serviços externos:**
  - **Ferramentas de design:** nenhuma. O plano inicial espelhava o design system no Figma; durante a implementação, o usuário decidiu seguir sem ferramenta de design externa (design, decisão 11).
  - **GitHub:** o repositório remoto privado para o CI depende de confirmação do usuário.
- **PMG:** nenhum impacto. O PMG continua em produção até a virada (P8).
