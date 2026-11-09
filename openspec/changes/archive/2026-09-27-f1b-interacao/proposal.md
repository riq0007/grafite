## Why

O F1a deixou a estrutura da casca: módulos, dock, barra superior, posturas e Ajustes. Faltam as interações que fazem dela uma ferramenta de trabalho:
- achar qualquer coisa sem descer menu a menu;
- saber onde está o ponteiro e o que ele vai acionar;
- receber avisos e rever o histórico;
- espiar um registro sem sair da lista.

Os módulos da fase 2 dependem desses contratos prontos. A busca de ativos (P1), os alertas (P3) e a prévia da tabela de ativos (P1) entram sem mudar a casca, que só muda pela sessão orquestradora (regra 7 do `CLAUDE.md`).

Esta change implementa a **segunda parte do subprojeto F1 · Casca OS** da spec mestre (`docs/superpowers/specs/2026-09-24-grafite-design.md`, seções 3.2, 3.3, 7.2, 7.4, 7.10 e Apêndice B): **F1b · Interação**. Ela vem depois do F1a e antes do F1c · Chegada e PWA, e a fase 1 segue F1b → F1c → F2, como a seção 3.3 define.

## What Changes

- **Busca (Ctrl+K)**
  - Abre com Ctrl+K (⌘K no Mac) ou pelo botão da barra superior, e fecha com Esc.
  - Encontra módulos e itens de menu ("Ir para"), seções e ajustes ("Ajustes") e ações ("Ações"), sem diferenciar acentos nem maiúsculas e com as palavras em qualquer ordem.
  - As setas escolhem e Enter abre. Fechar sem escolher devolve o foco para onde estava.
  - **Contrato para os módulos:** entradas fixas no registro e provedores assíncronos, com "Buscando…", erro e cancelamento. O P1 liga a busca de ativos por ele, sem mudar a casca.
- **Cursor suavizado**
  - O ponto segue o mouse sem atraso, e o anel acompanha com a suavização do Apêndice B (95% de fábrica), igual em telas de 60 e de 120 Hz.
  - Sobre botões, itens de menu, abas e itens do dock, o anel abraça o elemento.
  - O cursor do sistema volta em campos de texto, onde a interface pede outro cursor, no toque, com movimento reduzido e quando o usuário escolhe "Do sistema".
- **Notificações**
  - Os avisos da tela seguem a seção 7.4: canto superior direito, mola, pausa com o ponteiro ou o foco, e o crítico fica até ser reconhecido ou adiado.
  - **No máximo três na tela,** e um crítico nunca sai da tela por causa de outro aviso. Hoje a fila do F0 mostra os três mais novos e pode esconder um crítico.
  - **Sino na barra superior:** mostra o número de não lidas e abre a central lateral, com histórico, filtros por severidade e por não lidas, "Abrir" e "Marcar como lida".
  - **Contrato `notificar` para os módulos,** que o P3 alimenta com os alertas do servidor. No F1b ainda não há produtor real: a central começa vazia, com um estado vazio honesto.
- **Quick Look**
  - Um componente de prévia do registro, com imagem (ou a genérica do tipo), campos principais, ações e a posição ("3 de 120").
  - **Na tabela base:** a barra de espaço na linha em foco abre a prévia. As setas trocam de registro, e Esc ou espaço fecham, com o foco na linha do registro mostrado.
  - O lugar do 3D fica reservado para o T1.
- **Tabela base**
  - A linha em foco fica marcada.
  - Enter e clique abrem o registro (exceto sobre controles), e a barra de espaço abre a prévia.
  - As linhas alternadas e a miniatura seguem as preferências.
- **Ajustes do Sistema:** seções Cursor, Notificações e Tabelas, com prévia ao vivo e "Restaurar padrões".
  - **Cursor:** suavizado ou do sistema, suavização de 0 a 100% e "Abraçar botões".
  - **Notificações:** se Atenção e Informação viram aviso na tela (o Crítico sempre vira) e o tempo do aviso temporário (6 s de fábrica, 10 s ou 20 s). Um botão mostra um aviso de exemplo.
  - **Tabelas:** linhas alternadas e miniaturas, com uma tabela de exemplo marcada como exemplo.
- **Preferências:** o modelo ganha as seções de cursor, notificações e tabelas, com os padrões de fábrica da seção 7.2 e a validação campo a campo do F1a.
- **Spec mestre:** a seção 7.4 e o Apêndice B passam a registrar:
  - o tempo ajustável dos avisos e as severidades escolhidas por usuário;
  - a regra dos três avisos com críticos;
  - a medida do abraço do cursor (4 px de cada lado).

**Fora desta change:**
- **F1c · Chegada e PWA:** carregamento, boas-vindas e montagem da casca; "O que resolver agora"; a base da PWA; a seção Idioma e região.
- **F2:** preferências gravadas no servidor.
- **P1:**
  - a busca de ativos, pelo contrato de provedor;
  - a tabela de ativos, com visões, colunas configuráveis, seleção múltipla, menu de contexto e resumo da linha;
  - a prévia ligada a ela.
- **P3:**
  - alertas reais, com as notificações gravadas por usuário;
  - reconhecer e adiar no servidor;
  - os canais e-mail e push e o modo Foco;
  - um só aviso quando há várias abas abertas.
- **T1:** o 3D dentro da prévia.

## Capabilities

### New Capabilities
- `busca-global`: a busca Ctrl+K, com as fontes, os grupos, o teclado, a busca sem acento e o contrato de provedores dos módulos.
- `cursor-suavizado`: o ponto e o anel, a suavização, o abraço e quando o cursor do sistema volta.
- `notificacoes`: o contrato `notificar`, o aviso na tela conforme as preferências, o sino com as não lidas e a central lateral.
- `quick-look`: a prévia de um registro, aberta a partir da tabela base.

### Modified Capabilities
- `ajustes-do-sistema`: o app ganha as seções Cursor, Notificações e Tabelas, na ordem da seção 7.4 da spec mestre.
- `preferencias-da-interface`: os padrões de fábrica e a validação passam a cobrir cursor, notificações e tabelas.
- `estrutura-da-casca`: a barra superior ganha a busca e o sino, e o registro de módulos ganha as entradas e os provedores de busca.
- `componentes-base`: o aviso passa a ter o tempo vindo da preferência e a regra dos três na tela com críticos. A tabela base ganha a linha em foco, abrir e prever, e segue as preferências de linhas alternadas e miniaturas.

## Impact

- **Código**
  - `packages/ui`:
    - busca global, cursor suavizado, sino e central de notificações e Quick Look;
    - mudanças no aviso e na tabela base;
    - tokens novos: tempos da busca e dos provedores, medidas e cores do cursor;
    - histórias no catálogo, testes de interação e regressão visual.
  - `apps/web`:
    - preferências novas e as seções dos Ajustes;
    - as fontes da busca (registro, ajustes e ações);
    - as notificações da sessão;
    - a casca ligada a tudo isso.
  - `docs/casca/modulos.md`: entradas e provedores de busca, `notificar`, a prévia da tabela e o atributo que pede o cursor do sistema.
- **Dependências:**
  - Nenhuma nova no repositório. A busca usa o `Autocomplete` do React Aria, que já está no projeto.
  - A web passa a declarar o `@grafite/domain`, para a busca usar o `normalizarTexto` do F0.
- **Testes:**
  - **unitários:** suavização, abraço, regras dos avisos, busca sem acento e ordenação, e preferências;
  - **catálogo:** teclado, foco, acessibilidade e tempos;
  - **ponta a ponta:** Ctrl+K, cursor, sino e central, e as seções dos Ajustes;
  - **regressão visual:** as histórias novas.
- **PMG:** nenhum impacto.
