## Context

Depois do F1a e do F1b, a casca está montada no `apps/web`, com os componentes de apresentação no `packages/ui` e as preferências num provedor React gravado no navegador. Pontos de partida que importam aqui:
- **`index.html`:** tem só o script anti-flash, que aplica as preferências antes da primeira pintura. Até o JavaScript baixar, a tela fica vazia.
- **`main.tsx`:** monta o `App` direto, sem nenhuma noção de chegada.
- **Início:** um estado vazio provisório ("Nenhum módulo registra ocorrências ainda").
- **PWA:** o manifesto e os ícones já existem, gerados pelo `pnpm marca:gerar`, mas não há service worker.
- **API:** serve a web compilada com cache de um ano para tudo, menos o `index.html`.
- **Datas:** o relógio (`apps/web`) e a central (`packages/ui`) formatam com `Intl.DateTimeFormat('pt-BR')` no fuso do navegador.
- **Aviso:** só oferece "Abrir", "Reconhecer" e "Adiar", e só o Crítico fica na tela.

A motivação está em `proposal.md` (Why), e os requisitos, nas specs desta change.

Restrições:
- **Fase 1:** a casca e os componentes compartilhados ainda mudam aqui. Na fase 2, congelam (regra 7 do `CLAUDE.md`), e por isso as ocorrências, as etapas da chegada e a formatação de datas saem como contratos.
- **ANTISLOP v2:** a sequência de boas-vindas é a exceção nomeada aos 300 ms, uma vez só. Nada de dado inventado fora do catálogo.
- **HTTPS:** fora do `localhost`, a PWA só instala com HTTPS, que é definido no F2.

## Goals / Non-Goals

**Goals:**
- **Espera honesta:** a espera mais longa de verdade, baixar a aplicação, aparece como etapa, e nenhuma etapa avança por tempo.
- **Contratos para a fase 2:** a fonte de ocorrências no registro, as etapas da chegada e a formatação de datas pelo fuso, documentados em `docs/casca/modulos.md`.
- **Regras testáveis sem navegador:** etapas e limite de 500 ms, primeiro acesso, ordem e idade das ocorrências, validação e formato do fuso.

**Non-Goals:**
- **"O que há de novo"**, o push e o resumo de alertas nas boas-vindas (P3).
- **Sessão, primeiro acesso por usuário e preferências no servidor** (F2).
- **Estratégias de cache de dados da API.** A API continua só pela rede, e o cache de dados é assunto do F2 com o TanStack Query.

## Decisions

### 1. Carregamento como marcação única, injetada no `index.html`
- **Escolha:**
  - **Marcação e CSS no `packages/ui` (`chegada/carregamento.ts`):** a marca, a barra e a linha da etapa, com `role="progressbar"` e uma região viva para a etapa.
  - **Injeção na compilação:** um plugin do Vite no `apps/web` (`transformIndexHtml`) injeta a marcação no `index.html`, numa camada `#chegada` irmã da `#raiz`, e o catálogo desenha a mesma marcação. Uma fonte só serve ao app e à regressão visual.
  - **Roteiro em linha no `index.html`:** registra o início e mostra a camada depois de 500 ms, se o app ainda não terminou. A primeira etapa, "Carregando o Grafite", está ativa desde o começo.
  - **Tokens antes da primeira pintura:** o CSS dos tokens chega por um `<link>` no `index.html`, e a camada usa só variáveis dos tokens.
- **Por quê:** só o HTML estático aparece enquanto o JavaScript baixa. Uma camada irmã da `#raiz` não some quando o React monta, e o app decide quando e como ela sai.
- **Alternativa:** o carregamento como componente React. Só apareceria depois do download, que é justamente a espera real.

### 2. Etapas da chegada como lista aberta
- **Escolha:**
  - **`apps/web/src/chegada/`:** uma lista ordenada de etapas `{ rotulo, pronta: () => Promise<void> }`. A orquestração é uma função pura, testada com relógio falso, que:
    - avança a etapa atual;
    - calcula a barra como a fração de etapas concluídas;
    - decide se a camada chegou a aparecer, pelo limite de 500 ms;
    - termina com "Pronto".
  - **No F1c:**
    - "Carregando o Grafite" termina quando o `main.tsx` executa;
    - "Carregando suas preferências" termina quando as preferências estão lidas e aplicadas;
    - "Pronto" chega depois da primeira renderização da casca e do `document.fonts.ready`, para a montagem não acontecer com a fonte trocando.
  - **Etapas futuras:** o F2 e o P3 acrescentam as suas ("Validando sessão" e "Conectando alertas") na lista, antes de "Pronto".
  - **Servidor:** não é etapa. A conferência do item de rede continua como está.
  - **Estado no `<html>`:** a chegada escreve `data-chegada` com `carregando`, `boas-vindas`, `montando` e `pronta`, e o CSS da casca lê esse atributo.
- **Por quê:** "nunca é um timer falso" (seção 7.5). Cada etapa é uma espera verificável, e as futuras entram sem mexer na orquestração.
- **Alternativa:** etapas fixas no código da chegada. O P3, com a casca congelada, não conseguiria pôr "Conectando alertas".

### 3. Boas-vindas e montagem no `packages/ui`
- **Escolha:**
  - **`BoasVindas` em `packages/ui/src/casca/`:**
    - uma camada de superfície sólida, com o "olá" em SVG escrito pelo `stroke-dashoffset` (`pathLength="1"`), revelado da esquerda para a direita por uma máscara e preenchido no fim, como no protótipo;
    - "Bem-vindo ao Grafite" e o botão terciário "Pular", que recebe o foco;
    - Esc e clique em qualquer lugar pulam;
    - `aoTerminar` avisa o app, que passa à montagem.
  - **Montagem:** as regras da casca para `html[data-chegada='montando']`: a barra desce, a janela aparece com escala leve, e o dock ou a barra de abas sobem com `--curva-mola`. Ao fim da montagem, o estado passa a `pronta`.
  - **Casca atrás das boas-vindas:** fica `inert` e invisível, para não receber foco nem ser lida.
  - **Primeiro acesso:** o app marca `grafite.chegada.boasVindas` no `localStorage` quando elas aparecem, e não quando terminam, para um fechamento no meio não repeti-las. Sem armazenamento, as boas-vindas não aparecem.
  - **Movimento reduzido:** os tokens de duração de deslocamento já vão a 0. O "olá" nasce preenchido, e só a opacidade troca.
- **Por quê:** são componentes de apresentação com histórias, testes de interação e regressão visual, como os do F1b. O app só decide quando mostrá-los.
- **Alternativa:** montar a casca com uma biblioteca de animação. Seria dependência nova para três transições que o CSS faz.

### 4. O "olá" gerado pelo `pnpm marca:gerar`
- **Escolha:**
  - O gerador da marca converte "olá" em curvas com o opentype.js, a partir da Sacramento (`@fontsource/sacramento`, OFL, de desenvolvimento), e grava `brand/gerado/ola.ts` com os caminhos e as medidas.
  - O `marca:verificar` confere que ele está em dia.
  - O acento vira um caminho próprio, desenhado depois das letras.
- **Por quê:** o produto não carrega fonte de terceiros em tempo de execução. O traço vetorial fica nítido em qualquer tamanho, e o pipeline já existe para a palavra "grafite".
- **Alternativa:** servir a Sacramento e animar o texto. Seriam mais 30 KB de fonte, com o risco de o "olá" aparecer na fonte de reserva antes de ela carregar.

### 5. "O que resolver agora" sobre fontes do registro
- **Escolha:**
  - **Contrato:** `ModuloRegistrado.ocorrencias?: FonteDeOcorrencias`, que é `{ buscar(sinal: AbortSignal): Promise<Ocorrencia[]>; assinar?(aoMudar): () => void }`.
  - **Ocorrência:** `{ id, severidade, texto, ativo: { nome, tipo, imagemDoAtivo?, imagemDoModelo? }, desde: Date, destino }`.
  - **Hook `useOcorrencias(registro)`** no `apps/web`:
    - busca cada fonte ao abrir a tela e guarda o estado de cada uma (carregando, erro ou pronta);
    - oferece `tentarDeNovo(fonte)`;
    - assina as fontes que avisam mudança e busca de novo a que avisou;
    - aborta tudo ao sair.
  - **Funções puras:**
    - `ordenarOcorrencias(lista, ordenacao)`: a severidade usa a ordem Crítico, Atenção e Informação, com a mais antiga primeiro no empate, em qualquer direção. As outras colunas desempatam pela ordem de fábrica;
    - `idadeRelativa(desde, agora)`: "agora" abaixo de 1 min, "N min" abaixo de 1 h, "N h" abaixo de 1 dia e "N d" depois, sempre arredondando para baixo.
  - **Onde fica:** o componente de apresentação (`OQueResolverAgora`) fica no `packages/ui`, com histórias de dados de exemplo, como a central do F1b, e o Início do app o liga ao hook.
  - **Tela:** a tabela base com `ColunaDaMiniatura`, ordenável, com clique e Enter abrindo o `destino`.
    - A idade anda pelo `vigiarOMinuto` do relógio.
    - A ordem vem de `preferencias.inicio.ordenacao` e é gravada na hora.
    - O título "O que resolver agora" mostra a contagem ("4 abertas"; "1 aberta").
    - Os estados de carregando, falha por fonte e vazio seguem a spec `tela-inicial`.
- **Por quê:** o mesmo padrão do provedor de busca (decisão 3 do F1b). O P1, o P2 e o P3 põem as ocorrências deles sem mexer na casca, e o `assinar` deixa a tela viva com os eventos do servidor.
- **Alternativa:** uma API de ocorrências no servidor desde já. Não há produtor no F1c, e a forma do dado nasce com o P3.

### 6. PWA com o `vite-plugin-pwa`
- **Escolha:**
  - **Configuração:** `generateSW`, com `registerType: 'prompt'` e `manifest: false`, porque o manifesto continua o do `marca:gerar`.
  - **Pré-cache:** a web compilada (JavaScript, CSS, fontes, ícones e `index.html`).
  - **Navegação sem rede:** `navigateFallback: 'index.html'`, com `navigateFallbackDenylist` para `/api/` e `/health`. Sem cache em tempo de execução, então a API sempre vai à rede. `cleanupOutdatedCaches` limpa as versões antigas.
  - **`pnpm dev`:** o service worker fica desligado.
  - **Registro no `main.tsx`:** pelo `virtual:pwa-register`.
    - `onNeedRefresh` mostra o aviso "Nova versão do Grafite", persistente, de Informação, com a ação "Atualizar" (`updateSW(true)`) e "Fechar".
    - `onRegisteredSW` agenda a conferência de versão a cada hora (`tempos.pwa.conferirVersao`).
  - **API:** cache longo e imutável só em `/assets/`, onde o Vite põe os arquivos com versão no nome. Todo o resto vai com `no-cache`.
- **Por quê:** o Workbox resolve o versionamento do pré-cache, a limpeza e o ciclo de atualização, que é onde PWA costuma quebrar. O modo "perguntar" cumpre "nunca recarregar no meio do trabalho".
- **Alternativa:** um service worker escrito à mão. Seria menos dependência, com todo esse ciclo por nossa conta.

### 7. Aviso com ação e persistente
- **Escolha:**
  - `Aviso` ganha `acao?: { rotulo, aoEscolher }` e `persistente?: boolean`.
  - A fila própria (decisão 6 do F1b) passa `timeout: undefined` para o persistente de qualquer severidade.
  - A região mostra a ação como botão primário, antes de "Fechar", e fecha o aviso depois dela.
- **Por quê:** o aviso de versão nova precisa ficar até a decisão do usuário e dizer "Atualizar", e não "Abrir".
- **Alternativa:** um componente de faixa separado para a versão nova. Seria outra camada, com outro foco e outro anúncio, para o que o aviso já faz.

### 8. Fuso horário por contexto
- **Escolha:**
  - **Preferência:** `regiao.fuso`, com `'sistema'` ou um identificador IANA validado por `Intl.DateTimeFormat` (um valor inválido volta a `'sistema'`).
  - **Contexto no `packages/ui`:** `ProvedorDaRegiao`, alimentado pelo provedor das preferências, como o `ProvedorDaTabela`.
  - **Gancho `useDataHora()`**, que devolve:
    - `formatarHorario(data)` ("qui 24 set 14:32");
    - `formatarHora(data)` ("14:32");
    - `formatarDia(data)` ("qua 23 set");
    - `grupoDoDia(data, agora)` ("Hoje", "Ontem" ou o dia);
    - todos no fuso em vigor.
  - **Quem migra:** o relógio e a central passam a usar o gancho. O agrupamento por dia recebe o fuso.
  - **Lista de fusos:** `Intl.supportedValuesOf('timeZone')`, com os do Brasil primeiro e cada grupo de oeste para leste, pela cidade na mesma diferença para o UTC.
    - Uma tabela pequena dá os 16 fusos do Brasil com o nome e a cidade em português. O nome não vem do navegador porque, sem horário de verão, o `longGeneric` do ICU diz "Horário Padrão de Brasília".
    - Fora do Brasil, o rótulo junta o nome genérico em pt-BR (`timeZoneName: 'longGeneric'`) e a cidade do identificador.
    - A diferença para o UTC sai do relógio do fuso, lido no mesmo formato, e é escrita como "UTC−4": um formato só por fuso mantém a lista de mais de 400 fusos rápida.
    - A busca usa o `normalizarTexto`.
  - **Seção Idioma e região:** o idioma como texto, a busca de fusos (`BuscaComSugestoes`) com "Seguir o sistema" no topo, a prévia ao vivo pelo `vigiarOMinuto`, a entrada de busca "Fuso horário" (`data-foco="fuso-horario"`) e "Restaurar padrões".
- **Por quê:** uma fonte só, que o F2 leva ao servidor. Os módulos da fase 2 formatam datas sem conhecer o fuso.
- **Alternativa:** mudar o fuso só no relógio. Deixaria a central e os módulos em outro fuso, e a spec pede a interface inteira.

### 9. Preferências novas no mesmo modelo
- **Escolha:**
  - `PreferenciasDaInterface` ganha `regiao: { fuso }` e `inicio: { ordenacao: { coluna, direcao } }`, lidos campo a campo, como no F1a e no F1b.
  - A ordem de fábrica é `{ coluna: 'severidade', direcao: 'decrescente' }`.
  - A chave continua na versão 1: o que falta cai no padrão.
  - O anti-flash não muda.
- **Por quê:** a mesma fonte única do F1a, com "Restaurar padrões" por seção.

### 10. Testes que não esbarram nas boas-vindas nem no service worker
- **Escolha:**
  - **Componente:** o preparo dos testes do `apps/web` marca as boas-vindas como vistas, e só os testes da chegada as desmarcam.
  - **Ponta a ponta:** a fixture faz o mesmo por `addInitScript` e usa `serviceWorkers: 'block'`. Só as pontas a ponta da chegada e da PWA liberam.
  - **Service worker:** a ponta a ponta da PWA espera o service worker assumir, recarrega, desliga a rede do contexto e abre outro endereço.
  - **Carregamento:** a ponta a ponta atrasa o JavaScript principal por rota, e confere o limite de 500 ms pelo registro de quando a camada apareceu.
  - **Versão nova:** o fluxo é testado no componente, simulando o `virtual:pwa-register`, porque exigiria duas compilações na ponta a ponta.
- **Por quê:** as 48 pontas a ponta e os testes de componente existentes abririam nas boas-vindas. Um service worker de um teste não pode servir a web velha a outro.

### 11. Spec mestre
- **Seção 7.5:**
  - o limite de 500 ms também no primeiro acesso;
  - "Bem-vindo ao Grafite" no primeiro acesso, com o "Bem-vindo de volta" guardado para o "O que há de novo", que fica para depois;
  - a montagem só depois das boas-vindas;
  - as etapas como lista aberta.
- **Seção 7.6:** a ordem ajustável e gravada.
- **Seção 7.2:** o fuso "Seguir o sistema" de fábrica.
- **Seção 4 (Arquitetura):** a base da PWA, com a casca guardada e a API sempre pela rede.
- **Seção 7.10 e ANTISLOP §28:** a montagem da casca nomeada junto da exceção das boas-vindas aos 300 ms, porque os tempos dela no Apêndice B passam desse limite. Ela acontece uma vez só, logo depois delas.
- **Apêndice B:** as linhas da chegada (limite de 500 ms e os tempos do "olá" e da montagem).

## Risks / Trade-offs

- **[Um service worker defeituoso prende uma versão]** → O modo "perguntar" nunca troca sozinho, e o `cleanupOutdatedCaches` limpa as versões antigas. O `sw.js` vai sem cache, e desfazer é publicar uma versão que o desregistra.
- **[A navegação sem rede cair num endereço da API]** → `navigateFallbackDenylist` para `/api/` e `/health`, e uma ponta a ponta confere.
- **[As boas-vindas atrapalharem os testes]** → A decisão 10: os testes existentes nascem com as boas-vindas vistas.
- **[O carregamento piscar numa chegada de pouco mais de 500 ms]** → A camada entra e sai por troca de opacidade de 200 ms. É o custo de não mostrar nada nas chegadas rápidas, e a barra nunca corre sozinha para disfarçar.
- **[Fuso inválido em outro navegador]** → A validação por `Intl` na leitura volta a "Seguir o sistema". Um identificador que um navegador conhece e outro não também cai no sistema.
- **[`Intl.supportedValuesOf` indisponível]** → Os navegadores-alvo o têm. Sem ele, a lista cai nos fusos do Brasil da tabela.
- **[HTTPS]** → No `localhost`, o service worker funciona. Nos servidores, só com o certificado do F2, e até lá a PWA apenas não instala.

## Migration Plan

Não há nada em produção. As preferências gravadas pelo F1a e pelo F1b continuam válidas: o fuso cai em "Seguir o sistema", e a tela inicial, na ordem de fábrica. Quem já usa o navegador de desenvolvimento verá as boas-vindas uma vez. Desfazer é reverter os commits da change. Se algum service worker já tiver sido instalado, uma versão sem ele o desregistra na abertura seguinte.
