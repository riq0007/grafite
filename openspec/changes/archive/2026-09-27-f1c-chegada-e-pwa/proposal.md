## Why

Com o F1a e o F1b, a casca tem estrutura e interação, mas ainda não tem chegada nem casa:
- a aplicação abre com a tela em branco enquanto o código baixa;
- o primeiro acesso é igual a qualquer outro;
- o Início é um estado vazio provisório;
- sem rede, nada abre, e a aplicação não se instala;
- a seção Idioma e região, prevista nos Ajustes, não existe.

Esta change implementa a **terceira e última parte do subprojeto F1 · Casca OS** da spec mestre (`docs/superpowers/specs/2026-09-24-grafite-design.md`, seções 3.3, 7.2, 7.4, 7.5, 7.6 e 7.10): **F1c · Chegada e PWA**. Ela fecha a casca antes do F2, e a fase 1 segue F1b → F1c → F2. Os módulos da fase 2 dependem dos contratos que ela deixa prontos: as ocorrências da tela inicial, as etapas da chegada e as datas no fuso do usuário. A casca só muda pela sessão orquestradora (regra 7 do `CLAUDE.md`).

## What Changes

- **Carregamento:**
  - marca, barra fina e etapas reais, desenhados no `index.html` antes do JavaScript;
  - as etapas do F1c são "Carregando o Grafite", "Carregando suas preferências" e "Pronto". O F2 e o P3 acrescentam as deles sem mexer na chegada;
  - a barra avança quando uma etapa termina, nunca por tempo;
  - o carregamento só aparece se a chegada passar de 500 ms, também no primeiro acesso.
- **Boas-vindas no primeiro acesso a este navegador:**
  - o "olá" escrito à mão e "Bem-vindo ao Grafite";
  - pula com clique, Esc ou o botão "Pular";
  - com o armazenamento bloqueado, não aparecem, para não se repetir a cada recarga.
- **Montagem da casca só depois das boas-vindas:**
  - a barra desce, a janela aparece e o dock sobe com mola;
  - nos acessos seguintes, a casca já está no lugar;
  - com movimento reduzido, tudo vira troca de opacidade.
- **"O que resolver agora"** no Início:
  - as ocorrências abertas dos módulos, na tabela base, com a miniatura, o ativo, a ocorrência, a idade e a severidade em texto;
  - a ordem de fábrica é por severidade e, dentro dela, a mais antiga primeiro. As colunas são ordenáveis, e a escolha fica gravada;
  - clique e Enter abrem o registro;
  - estados de carregando, falha por fonte e vazio. Sem nenhum produtor até a fase 2, a tela diz isso, sem inventar dados.
- **Contrato de ocorrências para os módulos:** uma fonte no registro, que busca as ocorrências abertas e, se quiser, avisa quando elas mudam.
- **PWA:**
  - instalável;
  - um service worker guarda a web compilada e abre a aplicação sem rede, e a API nunca vem do cache;
  - uma versão nova aparece num aviso persistente com "Atualizar", sem recarregar no meio do trabalho;
  - o `sw.js`, o manifesto, os ícones e os demais arquivos sem versão no nome deixam de ter cache longo.
- **Ajustes do Sistema: seção Idioma e região,** entre Tabelas e Acessibilidade:
  - o idioma (Português (Brasil)) aparece como informação;
  - o fuso horário é "Seguir o sistema" ou um fuso escolhido, com a prévia da data e da hora.
- **Fuso horário em toda a interface:** o relógio, a central e os grupos "Hoje" e "Ontem" seguem o fuso escolhido, e os módulos formatam datas pelo mesmo gancho.
- **Componente de aviso:** uma ação com nome livre, como "Atualizar", e a opção de ficar na tela sem ser Crítico.
- **Preferências:** o fuso ("Seguir o sistema" de fábrica) e a ordem da tela inicial, com a validação campo a campo do F1a.
- **Spec mestre:**
  - seção 7.5: o limite de 500 ms também no primeiro acesso, "Bem-vindo ao Grafite" e a montagem só na primeira vez;
  - seção 7.6: a ordem ajustável;
  - seção 7.2: o fuso de fábrica;
  - a base da PWA.

**Fora desta change:**
- **"O que há de novo":** as boas-vindas depois de uma versão nova, com as novidades dela. Entra quando houver usuários e um processo de notas por versão.
- **F2:**
  - "Validando sessão", primeiro acesso por usuário e preferências no servidor;
  - o certificado HTTPS dos servidores, sem o qual a PWA não instala fora do `localhost`.
- **P3:**
  - "Conectando alertas", o resumo de alertas novos nas boas-vindas e as ocorrências de alerta na tela inicial;
  - notificações push, que também o A1 usa.
- **P1 e P2:** as ocorrências de ativos e de monitoramento, pelo contrato desta change.
- **Idiomas além do português do Brasil.**

## Capabilities

### New Capabilities
- `chegada`: o carregamento com etapas reais, as boas-vindas do primeiro acesso e a montagem da casca.
- `tela-inicial`: "O que resolver agora", com as fontes de ocorrências dos módulos, a ordem ajustável e os estados.
- `pwa`: instalação, abertura sem rede, versão nova com "Atualizar" e a entrega dos arquivos da web com o cache certo.

### Modified Capabilities
- `ajustes-do-sistema`: a seção Idioma e região entra entre Tabelas e Acessibilidade.
- `preferencias-da-interface`: os padrões de fábrica e a validação cobrem o fuso horário e a ordem da tela inicial.
- `estrutura-da-casca`: o registro de módulos ganha a fonte de ocorrências, e as datas e horas da casca e dos módulos seguem o fuso escolhido.
- `componentes-base`: o aviso ganha uma ação com nome livre e o modo persistente para qualquer severidade.

## Impact

- **Código:**
  - `packages/ui`:
    - a camada das boas-vindas e da montagem;
    - o aviso com ação e persistente;
    - o contexto do fuso e a formatação de datas;
    - o "olá" gerado pelo `pnpm marca:gerar`;
    - tokens de tempo novos;
    - histórias, testes de interação e regressão visual.
  - `apps/web`:
    - o carregamento no `index.html` e a orquestração da chegada;
    - a tela "O que resolver agora" e as fontes de ocorrências;
    - o service worker e o aviso de versão nova;
    - a seção Idioma e região e as preferências novas.
  - `apps/api`: os cabeçalhos de cache dos arquivos sem versão no nome.
  - `docs/casca/modulos.md`: as ocorrências, a formatação de datas pelo fuso e o aviso com ação.
- **Dependências:**
  - `vite-plugin-pwa` e `workbox-window`, de desenvolvimento na web;
  - a fonte Sacramento (licença OFL), como arquivo de desenvolvimento, só para gerar o traço do "olá".
- **Testes:**
  - **unitários:** etapas e limite de 500 ms, primeiro acesso, ordem e idade das ocorrências, fuso e preferências;
  - **catálogo:** boas-vindas, montagem, tela inicial e aviso com ação;
  - **ponta a ponta:** primeiro acesso e acesso seguinte, aplicação sem rede, API fora do cache e fuso;
  - **regressão visual:** as histórias novas.
- **PMG:** nenhum impacto.
