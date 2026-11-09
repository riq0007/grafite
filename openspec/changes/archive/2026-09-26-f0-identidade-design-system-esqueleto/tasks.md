## 1. Regras do projeto

- [x] 1.1 Escrever `docs/ANTISLOP.md` (v2) consolidando a v1 do PMG com as cinco mudanças da seção 7.10 da spec mestre; verificar: o documento existe e o quality gate final inclui as regras de vidro, animação, ampliação do dock e cursor
- [x] 1.2 Escrever `CLAUDE.md` na raiz: regras (ANTISLOP v2, cores só por tokens, textos em pt-BR, nenhum segredo, teste antes do código), estrutura do repositório, comandos e links para a spec mestre; verificar: arquivo presente com as quatro seções
- [x] 1.3 Adicionar `.gitattributes` (`* text=auto eol=lf`) e `.editorconfig` e renormalizar os arquivos existentes; verificar: `git ls-files --eol` mostra `i/lf` em todos os arquivos de texto

## 2. Esqueleto do monorepo

- [x] 2.1 Criar `package.json` raiz com `packageManager` (pnpm via corepack), `pnpm-workspace.yaml`, `turbo.json` e `tsconfig` base estrito; verificar: `pnpm install` e `pnpm turbo run typecheck` concluem sem erro
- [x] 2.2 Criar `apps/web`, `apps/api`, `apps/collector`, `packages/domain`, `packages/ui`, `packages/db` e `packages/api-client` com os scripts `lint`, `typecheck` e `test`; verificar: `pnpm turbo run lint typecheck test` roda nos sete e passa
- [x] 2.3 Escrever primeiro o teste do verificador de cores literais (arquivo com hex fora de `packages/ui/src/tokens` deve falhar), depois configurar o Biome e implementar o verificador; verificar: o teste passa e `pnpm lint` passa no repositório
- [x] 2.4 Configurar o Lefthook com Biome e secretlint no pré-commit; verificar: um commit com uma chave falsa é recusado apontando arquivo e linha, e um commit limpo passa
- [x] 2.5 Configurar o Vitest com um teste de exemplo em `packages/domain`; verificar: `pnpm test` executa e passa

## 3. Banco e isolamento entre organizações

- [x] 3.1 Criar o `docker compose` de desenvolvimento com PostgreSQL 18 e o script dos papéis `grafite_owner` e `grafite_app`; verificar: `docker compose exec db psql -c "\du"` lista os dois papéis, e `grafite_app` aparece sem `BYPASSRLS`
- [x] 3.2 Configurar Drizzle e Testcontainers em `packages/db` e escrever os testes de isolamento da spec: consulta sem filtro, escrita cruzada, falha fechada sem contexto, papel da aplicação sem conseguir contornar e segunda organização sem migration; verificar: os testes rodam e falham (vermelho)
- [x] 3.3 Implementar `app.current_org()`, o helper `orgScoped()` e a tabela `organizations` com `uuidv7()`; verificar: os testes de 3.2 passam
- [x] 3.4 Escrever o teste-guarda que percorre o catálogo do Postgres e falha se alguma tabela de negócio não tiver RLS ativo e forçado; verificar: o teste falha com uma tabela de prova sem RLS e passa no schema real
- [x] 3.5 Escrever o teste dos identificadores: não sequenciais e ordenáveis pelo momento de criação; verificar: o teste passa

## 4. API, coletor e contrato

- [x] 4.1 Escrever primeiro os testes da API: configuração com variável ausente encerra nomeando a variável; `/health` informa estado, versão e banco (respondendo e fora do ar), sem expor detalhes internos; verificar: os testes rodam e falham
- [x] 4.2 Implementar a API mínima (Fastify + Zod, configuração validada, `/health`, logs estruturados); verificar: os testes de 4.1 passam e `curl http://localhost:<porta>/health` responde
- [x] 4.3 Gerar o OpenAPI e o cliente tipado em `packages/api-client` (openapi-typescript + openapi-fetch) e o script de divergência; verificar: alterar uma rota sem regenerar faz o script falhar, e depois de regenerar ele passa
- [x] 4.4 Criar o coletor com configuração validada e `/health`, começando pelos testes; verificar: os testes passam e o processo recusa iniciar sem variável obrigatória
- [x] 4.5 Criar o comando `pnpm dev`: checa o Docker, sobe o banco, aplica as migrations e inicia API e web; verificar: com o Docker fechado, a mensagem pede para abri-lo; com o Docker aberto, API e web respondem

## 5. Tokens

- [x] 5.1 Escrever primeiro os testes do verificador de contraste (valores conhecidos, como #777 sobre #fff = 4,48:1, e composição de material translúcido sobre o fundo) e depois implementar a função; verificar: os testes passam
- [x] 5.2 Definir em TypeScript os primitivos e os tokens semânticos dos seis temas, a partir do Apêndice A da spec mestre; verificar: `pnpm typecheck` passa e um teste confere que todos os temas definem o mesmo conjunto de tokens semânticos
- [x] 5.3 Definir destaques por tom, situações, densidades, escala de raio, movimento e tipografia; verificar: um teste confere a escala de raio para as bases 0, 12 e 24 e as medidas das três densidades
- [x] 5.4 Escrever o gerador (CSS com seletores de atributo, tipos e JSON DTCG), começando pelo teste de snapshot do CSS de um tema; verificar: os testes passam e `tokens.css` é gerado
- [x] 5.5 Rodar o contraste nas 24 combinações de tema × destaque e ajustar o que falhar, mantendo o matiz e registrando no relatório; verificar: `pnpm tokens:contraste` passa e gera o relatório
- [x] 5.6 Auto-hospedar Instrument Sans e JetBrains Mono (Fontsource, latin + latin-ext, com pré-carregamento); verificar: um teste Playwright com a rede externa bloqueada confirma que as fontes carregam

## 6. Casca vazia na web

- [x] 6.1 Criar a web com Vite + React + TanStack Router e a rota da casca vazia usando os tokens; verificar: `pnpm dev` abre a casca sem erros no console
- [x] 6.2 Escrever primeiro o teste de ponta a ponta (trocar o tema sem recarregar; reabrir com o tema salvo sem flash) e depois implementar o script anti-flash e o painel provisório de aparência (tema, destaque, densidade, raio, movimento e transparência), salvando no navegador; verificar: o teste passa
- [x] 6.3 Respeitar o movimento reduzido e a transparência reduzida do sistema operacional; verificar: um teste com `reducedMotion: 'reduce'` confirma que não há animação de deslocamento, e outro confirma o material sólido

## 7. Ícones

- [x] 7.1 Criar o componente `<Icon>` sobre o Lucide (traço 1,7; oculto de leitores de tela por padrão; nome obrigatório em botão só de ícone), começando pelos testes de acessibilidade; verificar: os testes passam
- [x] 7.2 Desenhar os 11 ícones de tipo de ativo na grade de 24 px; verificar: a página de ícones no catálogo mostra todos com o mesmo traço, ao lado dos ícones de interface
- [x] 7.3 Criar as imagens genéricas de ativo por tipo; verificar: um teste visual confirma o encaixe na miniatura nas três densidades, sem distorção

## 8. Componentes base e catálogo

- [x] 8.1 Configurar o Storybook (construtor Vite), com seletores globais de tema, destaque, densidade e raio, complemento de acessibilidade e Vitest em modo navegador; verificar: `pnpm storybook` abre e `pnpm test:stories` roda uma história de exemplo
- [x] 8.2 Criar o botão (quatro níveis, todos os estados, carregando sem mudar a largura) com histórias e testes de interação; verificar: os testes e a checagem de acessibilidade passam
- [x] 8.3 Criar campo de texto, área de texto, seleção e busca com sugestões, com rótulo visível, obrigatoriedade e erro anunciado; verificar: os testes de interação e de acessibilidade passam
- [x] 8.4 Criar checkbox, rádio, interruptor e controle segmentado; verificar: os testes de teclado e de acessibilidade passam
- [x] 8.5 Criar o rótulo de situação e a miniatura de ativo (prioridade ativo → modelo → genérica, sem distorção); verificar: os testes passam, incluindo o do rótulo sem quebra numa coluna estreita
- [x] 8.6 Criar a dica e o popover; verificar: os testes de interação e de acessibilidade passam
- [x] 8.7 Criar o menu com submenu, começando pelos testes do movimento diagonal e do teclado (seta para a direita abre o submenu, Esc volta); verificar: os testes passam, com a tolerância própria implementada se a nativa não bastar
- [x] 8.8 Criar o diálogo e a gaveta (foco preso, Esc fecha, foco volta à origem); verificar: os testes de interação passam
- [x] 8.9 Criar o aviso (temporário com pausa no hover; persistente no Crítico; mola que respeita o movimento reduzido); verificar: os testes de interação passam
- [x] 8.10 Criar abas, tabela base (cabeçalho fixo, linhas alternadas, ordenação indicada), estado vazio, esqueleto de carregamento, barra de progresso, avatar e tecla de atalho; verificar: as histórias passam na checagem de acessibilidade sem violações sérias ou críticas
- [x] 8.11 Configurar a regressão visual no contêiner do Playwright (Grafite e Névoa em 1366, 1920 e 2560 por história, mais a matriz tema × densidade em 1920) e gravar as referências; verificar: `pnpm test:visual` passa, e falha quando um token é alterado de propósito

## 9. Ferramenta de design (fora do F0)

O plano inicial espelhava o design system no Figma, e depois se tentou o Stitch. Durante a implementação, o usuário decidiu seguir sem ferramenta de design externa, e as tarefas desta seção saíram do F0 (design, decisão 11). Ficou o JSON DTCG ampliado, gerado e testado com os tokens.

## 10. Identidade

- [x] 10.1 Fazer a busca de conflito do nome (INPI classes 9 e 42, web e RDAP de domínios) e escrever `docs/identidade/nome.md`; verificar: o relatório tem fontes, data, achados, risco e o espaço da decisão do usuário (a consulta ao INPI ficou, por decisão do usuário, para antes da venda; registrado no relatório)
- [x] 10.2 Apresentar 3 ou 4 conceitos de logo no companheiro visual (claro e escuro) e registrar a escolha do usuário; verificar: a escolha consta em `docs/identidade/nome.md`
- [x] 10.3 Refinar o conceito escolhido no Figma e exportar `packages/ui/src/brand/marca.svg`; verificar: o arquivo existe e um teste confirma contraste de pelo menos 3:1 da marca nos seis temas (refinada no código, em packages/ui/src/brand/gerar-marca.ts; o F0 ficou sem ferramenta de design externa)
- [x] 10.4 Escrever o script dos derivados (símbolo, logotipo, monocromáticos, favicon SVG + ICO, PWA 192 e 512 + maskable com área segura de 80%); verificar: um teste confere que todos são gerados a partir da fonte e que o maskable respeita a área segura
- [x] 10.5 Aplicar a marca (título, favicon, manifesto da PWA e casca vazia) e escrever `docs/identidade/marca.md` (área de proteção, tamanho mínimo, versões por fundo, usos proibidos); verificar: um teste de ponta a ponta confere título e favicon, e o documento existe

## 11. CI e empacotamento

- [x] 11.1 Escrever o workflow do GitHub Actions: lint, tipos, unitários, integração com Testcontainers, ponta a ponta de fumaça, regressão visual, contraste, divergência do OpenAPI e gitleaks; verificar: o `actionlint` (via Docker) não aponta erros
- [x] 11.2 Escrever os Dockerfiles da aplicação (API + web compilada) e do coletor; verificar: `docker build` gera as duas imagens, e cada uma responde ao `/health` ao iniciar
- [x] 11.3 Pedir ao usuário a criação do repositório privado no GitHub e, com a confirmação, ativar o CI; verificar: a primeira execução fica verde, ou fica registrado que o CI aguarda o repositório (a primeira execução não ficou verde: revelou três problemas de ambiente, corrigidos e registrados no design, Open Questions; o CI ficou verde no commit a32140a)
- [x] 11.4 Atualizar as actions do CI (checkout, setup-node e upload-artifact) para as versões maiores que rodam em Node 24, conferindo no changelog de cada uma as mudanças de comportamento; verificar: o `actionlint` (via Docker) não aponta erros, os 5 jobs ficam verdes no PR e o aviso de depreciação do Node 20 some do log (da v4 para a v7; no commit d058c0c, os 5 jobs ficaram verdes e o log não tem o aviso, que antes aparecia uma vez por job)

## 12. Fechamento do F0

- [x] 12.1 Conferir os critérios de término do F0: `pnpm dev` com todas as combinações de tema, destaque e densidade; catálogo sem violações; RLS e contraste verdes; marca aplicada; verificar: checklist com as evidências (saídas dos comandos e capturas) no commit final (em fechamento.md, com as capturas em evidencias/)
- [x] 12.2 Atualizar a spec mestre com o que mudou no F0 (por exemplo, ajustes de contraste no Apêndice A); verificar: o diff da spec mestre foi revisado pelo usuário (revisado e aprovado pelo usuário em 26/09/2026)
