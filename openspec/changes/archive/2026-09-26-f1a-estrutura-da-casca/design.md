## Context

O F0 deixou na web:
- a rota raiz com a casca vazia (TanStack Router, rotas em código);
- a página Início com um painel provisório de aparência;
- as preferências de aparência no `localStorage`, validadas campo a campo;
- o script anti-flash no `index.html`, que copia atributos já calculados, a partir de uma lista fechada.

No `packages/ui` já existem os componentes base em React Aria + CSS Modules. Entre eles estão:
- o menu com submenu, com a tolerância diagonal ajustada por patch;
- o popover, a gaveta, o diálogo, os avisos e a dica;
- os tokens de casca (`--altura-barra-superior`, `--tamanho-item-dock`, `--margem-lateral`) e os tempos em `tempos.ts`.

A motivação está em `proposal.md` (Why), e os requisitos nas specs desta change.

Restrições:
- **Fase 1:** só a sessão principal trabalha. Os componentes compartilhados podem mudar aqui (regra 7 do `CLAUDE.md`).
- **Fase 2:** agentes em paralelo vão acrescentar módulos. A casca precisa deixar um contrato de módulo claro, que dispense tocar nela.
- **Preferências:** ficam no navegador até o F2, que as leva ao servidor em três níveis (fábrica, organização e usuário) sem mudar a interface.
- **Testes da casca:** a spec mestre (seção 11.4) pede testes de componente para os atrasos dos menus, o triângulo de tolerância, o teclado e o foco, com a acessibilidade checada automaticamente.

## Goals / Non-Goals

**Goals:**
- **Contrato de módulo:** um módulo novo entra na casca com uma pasta e uma entrada no registro.
- **Tempos testáveis:** os tempos do dock ficam em máquinas de estado puras, testadas com relógio falso, e não espalhados em manipuladores de evento.
- **Primeira pintura:** a posição do dock já sai certa, sem JavaScript.
- **Ampliação do dock:** acompanha o ponteiro a 60 quadros por segundo, sem renderizar o React a cada movimento.

**Non-Goals:**
- **Preferências no servidor e por organização (F2).** O modelo em camadas deixa o lugar pronto, mas a camada da organização não existe no F1a.
- **Módulos de negócio (P1 em diante).** O catálogo usa um registro de exemplo, marcado como exemplo.
- **Busca, cursor, notificações e Quick Look (F1b).** A barra reserva o espaço à direita, mas não cria esses itens.
- **Carregamento, boas-vindas e montagem da casca com mola (F1c).** No F1a, a casca aparece pronta.

## Decisions

### 1. Componentes da casca no `packages/ui`, composição no `apps/web`
- **Escolha:**
  - Barra superior, dock, menu do dock, barra de abas, painel que sobe de baixo e janela de conteúdo ficam em `packages/ui/src/casca/`. São componentes de apresentação, guiados por dados (módulos, módulo atual, preferências e callbacks).
  - O `apps/web` liga esses componentes ao roteador, ao registro de módulos e às preferências.
- **Por quê:**
  - **Testes:** a infraestrutura do catálogo (Storybook + Vitest no navegador + checagem de acessibilidade) atende de uma vez os testes de componente pedidos na seção 11.4.
  - **Regressão visual:** o contêiner do Playwright já captura as histórias.
  - **Dados de exemplo:** com os componentes presos aos dados reais do app, só dariam para testar pela ponta a ponta, mais lenta e menos precisa nos tempos.
- **Alternativa:** a casca inteira no `apps/web`, testada só por ponta a ponta. Descartada pela falta de testes finos de tempo e de teclado, e pela ausência no catálogo.

### 2. Registro de módulos declarativo
- **Escolha:**
  - Cada módulo vive em `apps/web/src/modulos/<id>/`, com suas rotas e uma entrada tipada no registro.
  - A entrada declara nome, ícone, endereço inicial, prioridade no celular, os menus em árvore (rótulo, destino, filhos, separadores) e os menus da barra.
  - Os destinos são endereços tipados do roteador, de modo que um menu que aponta para rota inexistente não compila.
  - A casca monta o dock, a barra de abas e os menus da barra a partir do registro.
  - Módulos do F1a: `inicio` e `ajustes`, este último sempre no fim, depois do separador.
- **Por quê:** na fase 2, cada agente acrescenta a pasta do seu módulo e uma linha no registro, sem tocar na casca. É o contrato congelado que a seção 12.3 da spec mestre pede.
- **Ligar e desligar por organização (seção 4.4):** entra no F2 como um filtro sobre o registro.
- **Alternativa:** itens do dock escritos na casca, como no F0. Não escala para a fase 2 e obriga cada módulo a mexer num componente compartilhado.

### 3. Rotas em código, compostas pelo registro
- **Escolha:**
  - TanStack Router com rotas em código, como no F0. A rota raiz renderiza a casca, e cada módulo contribui com a sua subárvore.
  - O `notFoundComponent` da raiz mostra "Página não encontrada" dentro da casca.
  - Depois de cada navegação, o foco vai ao título do conteúdo (um `h1` focável), e o link "Ir para o conteúdo" é o primeiro da página.
- **Por quê:** mantém o F0, sem gerador de rotas nem plugin novo. As rotas continuam tipadas.
- **Alternativa:** rotas por arquivos, com o plugin do Vite. Traz um passo de geração que ainda não compensa.

### 4. Preferências: um modelo em camadas, por seção dos Ajustes
- **Escolha:**
  - **Modelo:** `PreferenciasDaInterface` substitui `PreferenciasDeAparencia`, agrupada como as seções dos Ajustes:
    - `aparencia`: tema, destaque, densidade e raio;
    - `dock`: posição, tamanho, ampliar e ocultar;
    - `acessibilidade`: movimento e transparência.
  - **Resolução:** campo a campo, na ordem fábrica → (organização, no F2) → usuário. Cada campo é validado sozinho, e os números ficam presos ao intervalo, como já faz o `lerPreferencias` do F0.
  - **Gravação:** em `localStorage`, na chave `grafite.preferencias`, com `versao: 1`.
    - Na primeira leitura, se a chave nova não existir, a aparência é lida da chave do F0 (`grafite.aparencia`).
    - Os atributos já calculados para o script anti-flash vão em `grafite.preferencias.atributos`.
  - **Estado:** um provedor React na raiz (`usePreferencias`) é a fonte única para a casca e os Ajustes. Cada mudança aplica os atributos no `<html>` e grava na hora.
  - **Restaurar padrões:** volta uma seção inteira aos valores de fábrica.
- **Por quê:** o agrupamento por seção torna direto restaurar os padrões de uma seção. As camadas deixam o F2 plugar a organização e o servidor atrás do mesmo hook.
- **Alternativas:**
  - TanStack Query já agora: não há servidor para as preferências até o F2.
  - Uma biblioteca de estado global: dependência nova sem necessidade, porque um contexto basta.

### 5. Anti-flash estendido ao dock
- **Escolha:**
  - O script do `index.html` passa a copiar também `data-dock` (`embaixo`, `esquerda` ou `direita`), `data-dock-ocultar` e `--tamanho-item-dock`.
  - Um teste roda o script contra os atributos que o app calcula, para as duas listas não divergirem.
  - O dock e a reserva de espaço da janela usam atributos do próprio componente da casca (`data-posicao`, `data-dock`), que o app renderiza já com as preferências: o provedor as lê de forma síncrona antes do primeiro render, então a casca nunca aparece com o dock em outro lugar (ajuste feito na implementação).
- **Por quê:** o tema continua certo antes do React (F0, decisão 4), e o dock nasce no lugar certo no primeiro render. Os componentes ficam testáveis no catálogo sem depender de atributos no `<html>`.
- **Alternativa:** posicionar o dock por um efeito do React depois da montagem. Descartada, porque a posição padrão apareceria por um quadro e depois mudaria.

### 6. Posturas por media queries, com os limites nos tokens
- **Escolha:**
  - **Limites:** 768 px e 1024 px entram nos tokens (`escalas.ts`).
  - **Layout:** o CSS decide com `@media (pointer: fine|coarse)` e largura, usando o ponteiro primário.
  - **Comportamento:** um hook `usePostura()` lê as mesmas condições com `matchMedia` e decide o que muda no comportamento: a ampliação só com ponteiro fino, os popovers no tablet e os painéis no celular.
  - **Consistência:** um teste confere que as media queries do CSS da casca usam os limites dos tokens.
  - **Tablet:** o componente `Casca` usa a postura para pôr o dock embaixo, com itens de pelo menos 44 px e sem ampliação, sem alterar a preferência salva. O comportamento do dock (seta que abre o menu, lado do menu) precisa da posição real, por isso a decisão fica no JavaScript, e não só no CSS (ajuste feito na implementação).
  - **Camadas em portal:** o `Casca` marca a postura também no `<html>` (`data-postura`), para os menus, que ficam fora da casca, terem itens de 44 px no toque.
  - **Container queries:** o componente adaptável é o próprio container (`container-type: inline-size` no elemento de fora) e se arranja pela largura que recebe. Assim ele funciona igual na janela, num painel ou numa coluna, sem depender de quem o contém declarar um container. O primeiro é a linha de campos do formulário: lado a lado a partir de 480 px, um abaixo do outro abaixo disso. Ajuste feito na implementação: com o container na janela e nos painéis, cada coluna de um módulo teria de declarar o seu, e um componente numa coluna estreita que não o declarasse usaria o arranjo largo.
  - **Margem lateral:** `clamp(16px, 16px + 1vw, 40px)`, com 19,9 px no celular de 390 px e 40 px a partir de 2400 px. A seção 7.8 da spec mestre dizia `1rem + 1vw`, mas a raiz da interface usa o corpo de texto (13 px). Com isso, a margem ficava em 16,9 px no celular e só chegava a 40 px em 2700 px. Isso foi descoberto na implementação, e a spec mestre foi corrigida.
- **Por quê:** o CSS resolve o layout sem esperar o JavaScript, e o hook evita regras duplicadas de comportamento. Media query não aceita variável CSS, por isso o teste de consistência.
- **Alternativa:** detectar o aparelho pelo user agent. Descartada: não acompanha janela redimensionada nem aparelhos híbridos.

### 7. Ampliação do dock quadro a quadro, fora do React
- **Escolha:**
  - **Cálculo:** a posição do ponteiro alimenta um laço `requestAnimationFrame`. Ele calcula o alvo de cada item pela gaussiana (σ = 1,3 × tamanho do item, até +55%) e aproxima o tamanho atual do alvo a cada quadro.
  - **Aplicação:** escala e deslocamento, escritos por referência (transform), afastam os vizinhos a partir do item sob o ponteiro. O fundo do dock acompanha, e nada muda o layout da janela.
  - **Onde:** o cálculo é uma função pura, testada: 48 px no centro dão cerca de 74 px.
  - **Quando desliga:** com movimento reduzido, com ponteiro de toque ou com a preferência desligada.
- **Por quê:** renderizar o React a cada movimento do ponteiro custa quadros. Transform não causa layout.
- **Alternativa:** CSS `:hover` com escala fixa nos vizinhos. Não produz a curva gaussiana contínua do protótipo aprovado.

### 8. Menus do dock e ocultar automático como máquinas de estado puras
- **Escolha:**
  - **Menus:** uma máquina (`menusDoDock`) recebe eventos (entrar e sair do item, entrar e sair do menu, tempo esgotado, toque, teclado) e usa os tempos do Apêndice B, que entram em `tempos.ts`:
    - abrir: 150 ms;
    - trocar: 60 ms;
    - fechar: 320 ms;
    - animação do menu: 170 ms.
  - **Ocultar:** uma segunda máquina controla o ocultar automático, com 650 ms para esconder, animação de 280 ms e faixa de 18 px.
  - **Visibilidade:** o dock fica visível enquanto tiver o foco (`:focus-within`) ou um menu aberto.
  - **Ligação com o React Aria:** o componente liga as máquinas ao `MenuTrigger` controlado (`isOpen`). Os submenus reutilizam o menu do F0, com a tolerância já corrigida.
  - **Posicionamento:** acima do item com o dock embaixo, à direita com o dock à esquerda, à esquerda com o dock à direita. O `shouldFlip` põe o submenu no lado com espaço.
- **Por quê:**
  - As regras de tempo ficam testáveis com relógio falso, em milissegundos exatos, sem depender do navegador.
  - O F0 mostrou que testes de tempo no navegador são frágeis: as dicas herdavam o estado "aquecido" de uma história para a outra.
  - O teclado e o foco continuam com o React Aria.
- **Alternativa:** temporizadores direto nos manipuladores do componente. Funciona, mas só dá para testar pelo navegador.

### 9. Toque e celular sobre as camadas do F0
- **Tablet:** o item do dock vira botão, e o primeiro toque abre o menu num popover ancorado, pelo popover do F0. A área de toque mínima de 44 × 44 px vem de um token (`alvoDeToqueMinimo`).
- **Celular:**
  - **Barra de abas:** ordenada pela prioridade do registro, com até cinco abas, ou quatro e "Mais".
  - **Painel que sobe de baixo:** uma variante da gaveta do F0 (lado inferior), com uma pilha de níveis para os submenus e o botão Voltar.
  - **Barra superior:** o nome do módulo vira um botão que abre, nesse painel, a árvore do módulo e os menus da barra.
- **Por quê:** reutiliza o foco preso, o Esc e a acessibilidade das camadas do F0, sem uma segunda implementação de modal.

### 10. Itens de status da barra
- **Rede:**
  - A perda de rede do navegador aparece na hora, pelos eventos `online` e `offline` e por `navigator.onLine`.
  - O servidor é conferido pelo `/api/health`, e só uma resposta 2xx conta como alcançado:
    - quando a página abre;
    - quando a rede volta;
    - a cada 50 s com a página visível. Com a aba oculta, a conferência pausa; quando a aba volta a aparecer, confere na hora e retoma o ciclo.
  - A conferência desiste em 10 s. Assim, a falta de resposta aparece em até 1 minuto (50 s + 10 s), como a spec pede. Ajuste feito na implementação: com 60 s entre as conferências, o pior caso ficava em 70 s.
  - No celular, o item de rede entra na barra só quando não há conexão, ao lado do menu do usuário.
  - No F2, a conexão de eventos (SSE) substitui a conferência.
- **Relógio:**
  - O formato vem de `Intl.DateTimeFormat('pt-BR')`: dia da semana curto, dia, mês curto, hora e minuto, sem os pontos de abreviação ("qui 24 set 14:32").
  - É atualizado por um temporizador alinhado à virada do minuto, na fonte mono dos horários.
- **Usuário:** avatar neutro, com o ícone de pessoa, e um menu com "Ajustes do Sistema". O nome e as iniciais chegam com o login do F2.
- **Barra estreita:** abaixo de 1024 px, o nome do módulo vira um menu que reúne os menus da barra como submenus.

### 11. Ajustes do Sistema como módulo
- **Rotas:** `/ajustes/aparencia`, `/ajustes/dock` e `/ajustes/acessibilidade`. Em `/ajustes`, o computador mostra a primeira seção, e o celular mostra a lista.
- **Controles da biblioteca:**
  - **Aparência:** o tema é um grupo de rádios com amostras, os escuros separados dos claros; o destaque, um grupo de rádios; a densidade, um controle segmentado; os cantos, um controle deslizante de 0 a 24 px.
  - **Dock:** a posição é um controle segmentado; o tamanho, um controle deslizante de 28 a 64 px, com passo de 1 px; a ampliação e o ocultar, interruptores.
  - **Acessibilidade:** "Seguir o sistema" e "Reduzir", num controle segmentado, com o que o sistema pede no momento lido por `matchMedia`.
- **Restaurar padrões:** um botão terciário por seção.
- **Painel do F0:** o painel provisório de aparência e a página "Casca vazia" saem.
- **Início:** mostra um estado vazio honesto até o F1c trazer "O que resolver agora".

### 12. Controle deslizante na biblioteca
- **Escolha:**
  - Construído com os hooks do React Aria (`useSlider` e `useSliderThumb`) e o estado do React Stately, com estilo por tokens.
  - O valor sai de um formatador próprio, com a unidade ("48 px", "95%"), para o texto à vista e para o leitor de tela. O `Slider` pronto do React Aria só aceita as unidades do `Intl`, que não incluem pixel (descoberto na implementação).
  - Por isso o `packages/ui` passa a declarar `react-aria` e `react-stately`, nas mesmas versões que o `react-aria-components` já usa.
  - Tem histórias no catálogo, com teste de teclado e de limites.
- **Por quê:** os Ajustes precisam dele agora (cantos e tamanho do dock), e o F1b precisa para a suavização do cursor. O `<input type="range">` nativo do painel do F0 não segue os tokens nem mostra o valor com a unidade.

### 13. Tokens novos
- **Tempos (`tempos.ts`):** abrir, trocar e fechar os menus do dock; a animação do menu; esconder o dock; a animação de esconder.
- **Casca (`escalas.ts`):**
  - itens do dock de 28 a 64 px;
  - faixa de revelar de 18 px;
  - ampliação máxima de 0,55 e σ de 1,3;
  - alvo de toque de 44 px;
  - limites de postura de 768 e 1024 px;
  - formulário de até 960 px.
- **Geração:** tudo passa pelo gerador do F0 (CSS, tipos e DTCG).

### 14. Testes
- **Unitários (Vitest):**
  - resolução e validação das preferências, inclusive a leitura da chave do F0;
  - as duas máquinas de estado, com relógio falso;
  - a função da gaussiana;
  - o formato do relógio;
  - a escolha da postura;
  - a consistência do registro (ids únicos, destinos válidos) e das listas do anti-flash.
- **Catálogo (Storybook + Vitest no navegador):**
  - dock (atrasos, troca, fechamento, teclado e ocultar), barra superior, barra de abas, painel que sobe de baixo e controle deslizante, com checagem de acessibilidade;
  - uma história "Casca" com registro de exemplo, capturada nas sete resoluções da seção 7.8 pela regressão visual existente.
- **Ponta a ponta (Playwright, web compilada):**
  - navegação e página não encontrada;
  - "Ir para o conteúdo" e o foco no título;
  - preferências gravadas e aplicadas na primeira pintura (o dock à esquerda já na primeira pintura);
  - rede, com o `/api/health` interceptado;
  - posturas tablet (1024×768, com toque) e celular (390×844), com alvos de 44 px e sem rolagem horizontal.

## Risks / Trade-offs

- [Ampliação do dock pesada em máquina fraca] → Só transform, laço por quadro, sem render do React; desliga com movimento reduzido. Se a ponta a ponta medir tarefas longas durante o movimento, o laço passa a pular quadros.
- [Testes de tempo instáveis no navegador, como o da dica no F0] → As regras de tempo são testadas nas máquinas puras, com relógio falso. No navegador, os testes conferem o resultado com folga e começam com o cursor real fora da página, como no F0.
- [A abertura por hover conflitar com o `MenuTrigger` do React Aria] → Menu controlado (`isOpen`) e manipuladores de ponteiro próprios no item. Teclado e toque continuam com o React Aria.
- [A emulação de toque do Playwright não reproduzir `pointer: coarse`] → A escolha da postura é função pura, testada. Se a emulação não servir, a ponta a ponta liga o toque pelo protocolo do Chromium, como no F0.
- [Aparelho híbrido, notebook com tela de toque] → Vale o ponteiro primário. No computador, o toque também abre o menu no primeiro toque.
- [A lista do anti-flash divergir da do app] → Teste que compara as duas (decisão 5).
- [A casca de exemplo do catálogo divergir da do app] → As duas usam os mesmos componentes. A composição real é coberta pela ponta a ponta.

## Migration Plan

Não há nada em produção. A leitura única da chave do F0 (decisão 4) preserva a aparência já salva nos navegadores de desenvolvimento. Desfazer é reverter os commits da change.

## Open Questions

- **Prioridade dos módulos no celular:** cada módulo da fase 2 declara a sua ao entrar no registro. A ordem entre eles se resolve quando houver mais de cinco módulos, sem mudar a casca.
