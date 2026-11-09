## Context

O F1a deixou a casca montada no `apps/web` a partir do registro de módulos, com os componentes de apresentação no `packages/ui/src/casca/` (decisão 1 do F1a). As preferências de interface ficam num provedor React, gravadas no navegador (decisão 4 do F1a).

Do F0, o F1b reaproveita:
- a região de avisos, sobre a `ToastQueue` do React Aria. Ela existe no catálogo, mas ainda não está montada no app;
- a gaveta, o diálogo, o menu com submenu e o material translúcido;
- a tabela base, sem linha em foco nem ação de abrir;
- a miniatura de ativo, com a prioridade ativo → modelo → genérica;
- o `normalizarTexto` do `@grafite/domain`, que tira acentos e maiúsculas;
- o `formatarAtalho`, que mostra "Ctrl" ou "⌘" conforme a plataforma.

A motivação está em `proposal.md` (Why), e os requisitos nas specs desta change.

Restrições:
- **Fase 1:** só a sessão principal trabalha, e os componentes compartilhados podem mudar aqui. Na fase 2, a casca congela (regra 7 do `CLAUDE.md`). Por isso os contratos da busca, das notificações e da prévia saem prontos agora.
- **ANTISLOP v2:**
  - o vidro só entra na busca e nos avisos, que são camadas sobrepostas; a central e a prévia têm superfície sólida;
  - as animações ficam em até 300 ms, exceto a mola do aviso;
  - o cursor nunca substitui o cursor de texto.
- **Sem produtor real de notificações até o P3:** o comportamento completo aparece no catálogo, com dados de exemplo, e no aviso de exemplo dos Ajustes.

## Goals / Non-Goals

**Goals:**
- **Contratos congelados para a fase 2:** entradas e provedores de busca no registro, `notificar` e o hook da prévia na tabela, documentados em `docs/casca/modulos.md`.
- **Regras testáveis sem navegador:** as regras de tempo, casamento e forma ficam em funções puras, testadas com relógio falso, como as máquinas do dock no F1a.
- **Cursor a 60 quadros por segundo ou mais,** sem renderizar o React a cada movimento e sem trabalho com o mouse parado.

**Non-Goals:**
- **Notificações no servidor, reconhecer e adiar de verdade, e um só aviso com várias abas abertas (P3).** O F1b entrega a interface e o contrato.
- **Busca de ativos (P1).** O F1b entrega o contrato de provedor e o testa com um provedor de exemplo no catálogo.
- **Tabela de ativos (P1):** seleção múltipla, menu de contexto, colunas configuráveis, visões e o resumo da linha.
- **3D na prévia (T1).** Fica só o lugar reservado.

## Decisions

### 1. Componentes no `packages/ui`, estado e fontes no `apps/web`
- **Escolha:**
  - **`packages/ui/src/casca/`:** a busca global e o botão de busca, o cursor suavizado, o sino e a central de notificações.
  - **`packages/ui/src/componentes/`:** a prévia (Quick Look), as mudanças na tabela base e na região de avisos.
  - **`apps/web`:** as notificações da sessão, as fontes da busca (registro, ações e ajustes), as preferências novas e a ligação de tudo com a casca.
  - **Funções puras:** toda regra com lógica fica numa função pura, testada sem navegador:
    - casamento e ordem da busca;
    - o executor dos provedores;
    - a suavização, a forma do abraço e a visibilidade do cursor;
    - a fila dos avisos;
    - o agrupamento da central por dia.
- **Por quê:** é o mesmo motivo da decisão 1 do F1a. O catálogo dá testes de interação, checagem de acessibilidade e regressão visual com dados de exemplo, e a ponta a ponta cobre a composição real.
- **Alternativa:** tudo no `apps/web`, testado só por ponta a ponta. Descartada pela mesma falta de testes finos de teclado e de tempo.

### 2. Busca sobre o `Autocomplete` do React Aria, com filtragem própria
- **Escolha:**
  - **Estrutura:** `Autocomplete`, `SearchField` e `ListBox` com seções, dentro de um `ModalOverlay` em material.
    - O foco fica no campo, e as setas movem o foco virtual da lista (`aria-activedescendant`), como num combobox.
    - As seções dão o grupo ao leitor de tela.
  - **Filtragem:** o `Autocomplete` recebe os grupos já filtrados, sem usar a filtragem do React Aria, porque ela não casa as palavras em qualquer ordem nem põe primeiro o que começa pelo texto.
  - **Casamento:**
    - O texto e os campos passam pelo `normalizarTexto`.
    - Um resultado casa quando cada palavra aparece no nome, no caminho ou nas palavras-chave.
    - Dentro do grupo, a ordem é: nome que começa pelo texto, nome que contém o texto, e o resto. No empate, vale a ordem de declaração.
  - **Grupos:**
    - A ordem é fixa: Ir para, Ações, Ajustes e, depois, os grupos dos provedores, na ordem do registro.
    - Cada grupo local mostra até 8 resultados.
    - Um mesmo destino aparece uma vez só, e a entrada declarada pelo módulo vence a que sai dos menus. Assim, "Aparência" aparece em Ajustes, e não repetida em Ir para.
  - **Abrir e fechar:** 180 ms (token novo `dur-busca`), com opacidade e uma escala leve. Com movimento reduzido, só a opacidade.
  - **Atalho:** a busca ouve Ctrl+K e ⌘K no documento, na fase de captura, com `preventDefault`, inclusive dentro de campos. Com a busca aberta, o mesmo atalho fecha.
  - **Foco:** ao fechar sem escolher, o `ModalOverlay` devolve o foco. Ao escolher um destino, a navegação da casca decide o foco (decisão 4).
- **Alternativas:**
  - cmdk: dependência nova para o que o React Aria já cobre;
  - a busca com sugestões do F0 (`ComboBox`): é um campo de formulário com popover ancorado, e não uma camada central com grupos.

### 3. Provedores assíncronos com cancelamento
- **Escolha:**
  - **Contrato:** o registro do módulo declara `{ grupo, buscar(termo, sinal) }`, que devolve uma promessa de resultados. O `sinal` é um `AbortSignal`.
  - **Executor:** um executor puro por provedor:
    - espera 150 ms sem digitação e pelo menos 2 caracteres;
    - aborta a chamada anterior quando o texto muda ou a busca fecha;
    - desiste em 5 s;
    - descarta a resposta de um texto antigo;
    - tem os estados ocioso, buscando, pronto e erro, e é testado com relógio falso.
  - **Chegada dos resultados:**
    - Os resultados do provedor entram abaixo dos grupos locais.
    - A escolha atual fica guardada pela chave do resultado, e não pela posição, e continua a mesma quando a lista cresce.
    - O estado do provedor aparece no cabeçalho do grupo ("Buscando…" ou o erro) e é anunciado numa região viva.
  - **Tempos em `tempos.ts`:** `busca.pausaDoProvedor` (150 ms) e `busca.limiteDoProvedor` (5000 ms).
- **Por quê:** o P1 liga a busca de ativos sem mexer na casca. O cancelamento evita que uma resposta velha cubra a nova e poupa o servidor.
- **Alternativa:** TanStack Query na busca. A web ainda não usa o Query, e o executor é pequeno e testável sozinho.

### 4. Endereço com foco: o parâmetro `foco`
- **Escolha:**
  - A rota raiz aceita o parâmetro de busca `foco`, validado como texto simples.
  - Depois de uma navegação, a casca põe o foco no elemento marcado com `data-foco` igual ao valor. Sem esse elemento, o foco vai ao título, como no F1a.
  - Cada controle dos Ajustes leva `data-foco` com o id do ajuste. A entrada de busca de um ajuste leva, por exemplo, a `/ajustes/dock?foco=tamanho-do-dock`.
- **Por quê:** um mecanismo só, da casca, que serve aos ajustes agora e a qualquer módulo depois, como ir a um campo de uma ficha no P1, sem a casca conhecer os Ajustes.
- **Alternativa:** a âncora (`#tamanho-do-dock`). O navegador rola até ela por conta própria, e o parâmetro de busca é tipado pelo roteador.

### 5. Cursor fora do React, com funções puras
- **Escolha:**
  - **Camada:** o cursor monta, num portal, o ponto e o anel, com `aria-hidden` e `pointer-events: none`. Ele fica acima de todas as camadas, com o maior z-index, porque os popovers do React Aria usam 100000.
  - **Eventos:** o cursor ouve no documento `pointermove`, `pointerdown` e `pointerleave`, além de `scroll` na fase de captura. O `pointerType` decide: o mouse mostra o cursor, e o toque e a caneta o escondem até o próximo movimento do mouse.
  - **Laço por quadro:**
    - Um laço de `requestAnimationFrame` só roda enquanto o anel não alcançou o alvo.
    - Ele escreve, por referência, a transformação e a largura, a altura e o raio do anel, sem estado do React.
  - **Suavização:** `k60 = 0,65 − 0,55 × s/100`, e a cada quadro `k = 1 − (1 − k60)^(Δt / 16,67 ms)`. Assim, 60 Hz e 120 Hz convergem no mesmo tempo. Um Δt grande, como na volta de uma aba oculta, dá k perto de 1: o anel encosta no ponto sem animação longa.
  - **Abraço:**
    - O alvo é o elemento mais próximo, subindo a partir do que está sob o ponteiro, com papel de botão, link, aba ou segmento, ou marcado com `data-cursor-abracar`. A lista de papéis fica numa constante.
    - Não entram os itens de menu e as opções de lista, que já têm destaque próprio, nem elementos desabilitados (`:disabled`, `aria-disabled` e `data-disabled`) ou maiores que 320 × 128 px.
    - Depois de uma rolagem, o alvo é recalculado pelo `elementFromPoint` na última posição do ponteiro.
    - A forma é o retângulo do elemento com 4 px de cada lado. O raio é o do elemento mais 4 px, limitado à metade da altura.
  - **Cursor do sistema:**
    - O cursor marca `data-cursor-suavizado` no `<html>` só enquanto o ponto e o anel estão à vista.
    - Um CSS global esconde o cursor do sistema em tudo, exceto nos campos de texto (`input` de texto, `textarea` e `[contenteditable]`) e dentro de `[data-cursor-nativo]`, o atributo com que um componente pede o cursor do sistema, como a alça de redimensionar coluna do P1.
    - O mesmo seletor decide, no JavaScript, quando o ponto e o anel somem.
  - **Quando o cursor não aparece:** com "Do sistema", com movimento reduzido (`data-motion="reduzido"` ou `prefers-reduced-motion`), nas posturas tablet e celular, depois de toque ou caneta, e com o ponteiro fora da janela. Uma função pura decide a visibilidade.
- **Por quê:** o cursor fica fluido sem renderizar o React. A suavização, a forma do abraço e a visibilidade ficam testáveis sem navegador.
- **Alternativas:**
  - `cursor: url(...)` com imagem: não suaviza nem abraça;
  - uma mola de biblioteca de animação para o anel: troca a curva aprovada do Apêndice B por outra.

### 6. Fila de avisos própria, desenhada pelo React Aria
- **Escolha:**
  - **Descoberta ao preparar esta change:** a `ToastQueue` do React Aria 1.21 mostra os três avisos mais novos. Um quarto esconde o mais antigo, mesmo crítico, e o traz de volta quando outro sai.
  - **Fila própria:** uma função pura guarda os avisos na tela (até 3) e os que esperam.
    - Chegada com vaga: o aviso entra na tela.
    - Chegada sem vaga: sai o temporário mais antigo da tela. Se todos forem críticos, o novo espera.
    - Saída de um aviso (tempo, fechar, reconhecer ou adiar): o primeiro da espera entra na tela.
  - **Papel do React Aria:** a fila do React Aria recebe só os avisos que estão na tela (`add` e `close`), com `maxVisibleToasts: 3`, e continua cuidando da pausa por ponteiro e foco, do anúncio e da navegação por F6. O tempo de um aviso só começa quando ele aparece.
  - **Tempo:** o do temporário vem da preferência. `avisar` lê a duração em vigor na fila, que o app atualiza quando a preferência muda. Um aviso que já está na tela mantém o tempo com que entrou.
  - **Retorno e notificação:** `avisar`, do F0, continua para o retorno de operação, e `notificar`, do F1b, usa a mesma fila.
  - **Ações do aviso:** "Abrir" aparece quando há endereço. "Reconhecer" e "Adiar" aparecem só quando quem notificou oferece essas ações, e "Fechar" sempre.
  - **Camada:** a região fica acima das camadas modais (busca, gaveta e prévia). O React Aria a mantém acessível mesmo com uma camada modal aberta.
- **Por quê:** cumpre a regra da seção 7.4, "o crítico fica até ser reconhecido ou adiado", que a fila pronta não cumpre, sem reescrever a região acessível do React Aria.
- **Alternativa:** uma região própria no lugar da do React Aria. Perderia a pausa, os anúncios e a navegação por F6, que já estão testados.

### 7. Notificações da sessão no `apps/web`
- **Escolha:**
  - **Provedor:** o `ProvedorDeNotificacoes` fica na raiz do app, ao lado do provedor de preferências. Ele guarda em memória a lista da sessão, e cada notificação tem id, severidade, título, descrição, origem, endereço, ações, horário e se foi lida.
  - **`useNotificacoes()`:** oferece `notificar`, `marcarComoLida`, `marcarTodasComoLidas`, a lista e o número de não lidas.
    - `notificar` grava na lista e, conforme as preferências, põe o aviso na fila.
    - "Abrir" navega pelo roteador e marca como lida.
  - **Sino:** um item de status da barra, marcado como essencial para ficar à vista no celular.
  - **Central:**
    - É a gaveta do F0, à direita, na largura da tela no celular.
    - Os filtros são um controle segmentado de severidade e o interruptor "Só não lidas". Valem enquanto a central está aberta e voltam a "Todas" quando ela reabre.
    - O agrupamento por dia é uma função pura, com `Intl.DateTimeFormat('pt-BR')`: "Hoje", "Ontem" e "qua 23 set".
- **Por quê:** é o mesmo padrão das preferências (decisão 4 do F1a), um provedor como fonte única. O P3 troca a fonte pelo servidor e pelos eventos atrás do mesmo hook, sem mudar a casca nem os componentes.

### 8. Quick Look controlado, ligado à tabela por um hook
- **Escolha:**
  - **Camada:** um `ModalOverlay` transparente, sem véu, com um `Dialog` de superfície sólida de até 720 px de largura, na largura da tela no celular.
  - **Conteúdo:**
    - o título e o tipo ou modelo;
    - o visual: a imagem numa miniatura grande, de até 256 px, ou um nó do chamador, para o 3D do T1;
    - os campos, com rótulo e valor, e `mono` nos identificadores;
    - as ações do chamador;
    - a posição, como "3 de 120".
  - **Controle:** o componente recebe as chaves na ordem da tabela, a chave atual, `aoMudar` e `aoFechar`. Os dados do registro atual chegam com o estado (carregando, erro ou pronto) e um `tentarDeNovo`.
  - **Teclado:**
    - as setas trocam de registro, sem dar a volta na lista;
    - Enter aciona "Abrir";
    - Esc fecha;
    - o espaço fecha fora dos botões. Num botão, o espaço aciona o botão, como manda o teclado.
  - **Hook `usePrevia(chaves)`:** liga o `aoPreverLinha` da tabela à prévia. Ao fechar, põe o foco na linha da chave atual, pelo `data-key` da linha, que o React Aria sincroniza com o foco da coleção.
  - **Movimento:** opacidade e escala de 0,97 a 1, em `dur-media` (200 ms). Com movimento reduzido, só a opacidade.
- **Por quê:** o P1 liga a prévia à tabela de ativos só com o hook e os dados, e o T1 põe o 3D no lugar da imagem.
- **Alternativa:** uma prévia não modal, com a tabela ainda utilizável por trás, como no Finder. Seria mais fiel, mas teria dois focos para administrar e anunciar. A camada modal com as setas cobre o uso com menos risco.

### 9. Tabela base: linha em foco, abrir, prever e as preferências
- **Escolha:**
  - **`aoAbrirLinha(chave)`:** usa o `onRowAction` do React Aria, e o clique e o Enter abrem. Um controle dentro da linha não dispara a linha, porque o React Aria já isola o toque no controle.
  - **`aoPreverLinha(chave)`:** o espaço na linha em foco é capturado no contêiner da tabela, antes do React Aria. Sem `selectionMode`, o espaço não tem outro uso na tabela.
  - **Linha em foco:** usa o `data-focus-visible` do React Aria, com o anel de foco dos tokens.
  - **Preferências:**
    - Chegam por um contexto do `packages/ui` (`ProvedorDaTabela`), com as linhas alternadas e as miniaturas ligadas por padrão. O app o alimenta com as preferências.
    - As linhas alternadas viram um atributo na tabela, lido pelo CSS.
    - As miniaturas usam `ColunaDaMiniatura` e `CelulaDaMiniatura`, que não se desenham quando desligadas. A coluna e as células somem juntas, e a contagem de colunas continua certa.
- **Por quê:** esconder a coluna só por CSS quebraria a navegação célula a célula do React Aria, que poria o foco numa célula invisível.
- **Alternativa:** um atributo no `<html>` com CSS global, como o tema. Serve para as linhas alternadas, mas não para tirar a coluna.

### 10. Preferências: três seções novas no mesmo modelo
- **Escolha:**
  - **Seções novas em `PreferenciasDaInterface`:**
    - `cursor`: `tipo` (`suavizado` ou `sistema`), `suavizacao` (de 0 a 100) e `abracar`;
    - `notificacoes`: `atencao`, `informacao` e `tempo` (6, 10 ou 20);
    - `tabelas`: `linhasAlternadas` e `miniaturas`.
  - **Leitura campo a campo,** como no F1a. A chave continua na versão 1, porque os campos novos ausentes caem no padrão, e as preferências gravadas pelo F1a continuam valendo.
  - **Anti-flash:** não muda, porque nada disso aparece antes do React. O cursor só aparece depois do primeiro movimento do mouse, e as tabelas já nascem com o contexto.
  - **Restaurar padrões:** por seção, como no F1a.
- **Por quê:** mantém a fonte única do F1a, e o F2 leva as seções novas ao servidor junto com as outras.

### 11. Seções dos Ajustes
- **Cursor:**
  - um controle segmentado, "Suavizado" ou "Do sistema";
  - o controle deslizante da suavização, de 0 a 100%, com passo de 5;
  - o interruptor "Abraçar botões";
  - um aviso quando o sistema pede movimento reduzido ou a postura é de toque, lido como no F1a, por `matchMedia` e `usePostura`.
- **Notificações:**
  - o grupo "Avisos na tela", com checkboxes: o Crítico marcado e desabilitado, com a descrição "Sempre aparece, até ser reconhecido ou adiado"; Atenção; e Informação;
  - o controle segmentado "Tempo do aviso": 6 s, 10 s ou 20 s;
  - o texto "O que não aparece como aviso continua na central de notificações.";
  - o botão secundário "Mostrar aviso de exemplo". Ele mostra um aviso de Informação com o título "Aviso de exemplo" e o tempo escolhido na descrição, e usa `avisar`, e não `notificar`, para não entrar na central.
- **Tabelas:**
  - dois interruptores, "Linhas alternadas" e "Miniaturas";
  - a tabela de exemplo, com 4 linhas fictícias, a legenda "Exemplo com dados fictícios", patrimônios como "EXEMPLO-01" e as miniaturas genéricas do tipo.
- **Busca:** cada controle leva `data-foco` com o id do ajuste, e cada seção declara as entradas de busca dos seus ajustes, com o nome e as palavras-chave.
- **Ordem:** Aparência, Dock, Cursor, Notificações, Tabelas e Acessibilidade. O F1c põe Idioma e região antes de Acessibilidade.

### 12. Registro de módulos e o contrato de busca
- **Escolha:**
  - `ModuloRegistrado` ganha `busca?: { entradas?, provedor? }`.
  - **Entrada de busca:** `{ id, rotulo, grupo, caminho?, palavrasChave?, destino | executar }`.
    - O grupo é `acoes`, `ajustes` ou `ir-para`.
    - `destino` é um endereço tipado do próprio módulo, conferido como os destinos dos menus.
    - `executar(contexto)` recebe o que a casca oferece às ações: navegar, mudar as preferências e abrir as notificações.
  - **Ir para:** sai sozinho do registro, com os módulos e os itens dos menus.
  - **Montagem:** a casca do `apps/web` junta o registro, as ações da casca (abrir as notificações) e as entradas dos módulos.
  - **Ajustes:** declara as seções, os ajustes e as ações de tema ("Usar o tema Névoa" e as demais).
  - **Documentação:** `docs/casca/modulos.md` ganha a busca (entradas e provedor), `notificar`, a prévia na tabela e os atributos `data-cursor-nativo` e `data-cursor-abracar`. O `documentacao.test.ts` confere os exemplos.
- **Por quê:** na fase 2, cada agente registra a busca e as ações do seu módulo sem tocar na casca.

### 13. Tokens novos
- **`tempos.ts`:**
  - `busca.pausaDoProvedor` (150 ms) e `busca.limiteDoProvedor` (5000 ms);
  - `aviso.opcoes` (6000, 10000 e 20000 ms).
- **`escalas.ts`:**
  - `cursor`: ponto de 6 px, anel de 26 px, folga do abraço de 4 px, abraço até 320 × 128 px, fatores 0,65 e 0,55 e o quadro de referência de 60 Hz;
  - `previa`: largura de até 720 px e imagem de até 256 px;
  - `movimento.duracoes.busca`: 180 ms.
- **Cores derivadas em cada tema:**
  - `cursor-ponto`: o texto;
  - `cursor-anel`: o texto a 45%;
  - `cursor-abraco`: o texto a 10%, igual ao pressionado;
  - `sombra-cursor`.
- **Contraste:** o verificador ganha os pares do anel sobre o fundo, a superfície e a superfície 2, com 3:1.
- **Geração:** tudo passa pelo gerador do F0 (CSS, tipos e DTCG).

### 14. Spec mestre
- **Seção 7.4:**
  - **Notificações:** o tempo do aviso temporário (6 s de fábrica, 10 ou 20 s), as severidades escolhidas por usuário e a regra dos três avisos com críticos.
  - **Cursor:** o abraço com 4 px de cada lado e sem os itens de menu.
  - **Tabela:** as linhas alternadas e a miniatura, que o usuário pode desligar.
- **Seção 7.2:** os padrões das preferências que o protótipo não tinha (avisos e tabelas).
- **Apêndice B:** as linhas do Aviso e do Cursor.

### 15. Testes
- **Unitários (Vitest):**
  - **busca:** normalização, palavras em qualquer ordem, ordem no grupo, um destino só e os grupos;
  - **executor de provedores:** pausa, cancelamento, limite de 5 s e resposta velha;
  - **cursor:** a suavização em 60 e em 120 Hz, a forma do abraço e a visibilidade;
  - **fila dos avisos:** o quarto aviso, os críticos, a espera e o tempo contado só depois de aparecer;
  - **central:** o agrupamento por dia;
  - **preferências:** os padrões, os intervalos e a leitura das preferências do F1a.
- **Catálogo (Storybook com Vitest no navegador):**
  - **busca:** atalho, setas entre grupos, Enter, Esc com o foco de volta, provedor lento e provedor com falha;
  - **cursor:** abraço num botão, some no campo, não abraça item de menu e fica acima de um menu aberto;
  - **sino e central:** filtros, abrir, marcar como lida e os estados vazios;
  - **prévia:** espaço, setas, limites, Esc com o foco na linha, carregando e erro;
  - **tabela:** Enter, controle dentro da linha, sem linhas alternadas e sem miniatura;
  - **região de avisos:** a regra dos três.
- **Ponta a ponta (Playwright, web compilada):**
  - **busca:** Ctrl+K e "aparencia" levam à seção; um ajuste abre com o foco no controle; a ação de tema muda o tema;
  - **cursor:** aparece com o mouse, some no campo, com movimento reduzido e com "Do sistema";
  - **notificações:** o aviso de exemplo com 10 s, medido pelo relógio do Playwright; o sino sem não lidas; a central vazia;
  - **tabelas:** o exemplo sem linhas alternadas e sem miniaturas;
  - **celular:** a busca e o sino à vista, e a central e a busca sem rolagem horizontal.
- **Regressão visual:**
  - as histórias novas nos temas Grafite e Névoa, nas três larguras;
  - a história "Casca", já com a busca e o sino, de novo na matriz de resoluções da seção 7.8.

## Risks / Trade-offs

- [O cursor do sistema escondido com o suavizado parado por um erro] → O atributo que esconde o cursor do sistema só existe enquanto o ponto e o anel estão à vista. Um erro no laço remove o atributo (`try/finally`) e devolve o cursor do sistema.
- [Custo por quadro do abraço] → O laço só lê o retângulo do elemento abraçado e só enquanto roda. Ele para em repouso.
- [Ctrl+K do navegador] → `preventDefault` na captura. Nos navegadores-alvo, o atalho da página vence enquanto ela tem o foco. Com o foco na barra de endereço, vale o do navegador, como esperado.
- [API instável dos avisos no React Aria (`UNSTABLE_`)] → A regra fica na fila própria (decisão 6). Uma atualização que mude a API quebra os testes da região, e não a regra.
- [Foco virtual e resultados que chegam depois] → Testes de interação cobrem as setas entre grupos e a chegada dos resultados sem trocar a escolha. Se o foco virtual não preservar a escolha, a busca guarda a chave escolhida e a aplica de novo.
- [Nenhum produtor real de notificações no F1b] → O comportamento completo é coberto no catálogo com dados de exemplo e pelo aviso de exemplo dos Ajustes. O app não inventa notificações, como a spec exige.
- [O espaço dentro da prévia] → O espaço fecha a prévia só fora dos botões. Num botão, ele aciona o botão, e um teste cobre os dois casos.
- [A camada modal da prévia tirar a lista do leitor de tela] → O título e "3 de 120" dão o contexto, e ao fechar o foco volta à linha do registro mostrado.
- [O cursor aparecer nas capturas] → O cursor só é montado no app e na história própria dele, que tem interação e por isso fica fora das capturas, como no F0.

## Migration Plan

Não há nada em produção. As preferências gravadas pelo F1a continuam válidas: as seções novas caem nos padrões de fábrica. Desfazer é reverter os commits da change.

## Open Questions

- **Ordem entre vários provedores de busca:** vale a ordem do registro. Se isso não servir quando houver mais de um provedor (o P1 traz o primeiro), a ordem vira um campo do provedor, sem mudar o contrato das entradas.
