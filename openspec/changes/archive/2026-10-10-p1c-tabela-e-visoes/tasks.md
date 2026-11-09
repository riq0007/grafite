# P1c · Tabela e visões — plano de implementação

**Objetivo:** a tabela dos ativos com as colunas que cada um escolhe, ordena e redimensiona, a ordenação e os filtros por coluna no servidor, a seleção, o menu de contexto, o resumo da linha, copiar as linhas e a prévia; e as visões salvas da conta e da organização, com a que abre em qualquer aparelho e o estado no endereço.

**Arquitetura:**
- **`packages/domain`:**
  - a definição da visão, os filtros, a visão de fábrica e a descrição em texto;
  - as colunas dos ativos;
  - a visão que vale e as preferências novas;
  - a permissão, as ações da auditoria e o evento.
- **`packages/db`:** a tabela `visoes`.
- **`apps/api`:**
  - a lista dos ativos com as colunas, os filtros e a ordem;
  - as rotas das visões;
  - a conferência da visão nas preferências;
  - as visões removidas na anonimização.
- **`packages/ui`:** a tabela configurável (larguras, virtualização, seleção, menu de contexto, resumo), o painel de colunas, a escolha da visão, o editor de filtro e a prévia paginada.
- **`apps/web`:** o estado da tabela no endereço, as visões, a tabela dos ativos, os filtros, a prévia, a busca e Ajustes › Tabelas.

**Tecnologias:**
- o Node 24 com TypeScript;
- o Fastify com o Zod, o Drizzle e o PostgreSQL 18;
- o React com o React Aria (`Virtualizer`, `TableLayout`, `ResizableTableContainer`, `ColumnResizer`, `TableLoadMoreItem` e `GridList` com `useDragAndDrop`) e o TanStack Query;
- o Vitest, o Storybook e o Playwright.

**Spec:** `proposal.md`, `specs/` e `design.md` desta change. Cada tarefa cita a decisão do design que segue.

## Restrições globais

- **Limites:**
  - visão: nome de 1 a 60 caracteres, até 60 colunas, larguras de 64 a 800 px, até 20 filtros, um por coluna, até 100 valores num filtro, texto do filtro até 200 caracteres e a definição até 32 KB;
  - até 50 visões de cada conta e 100 da organização, por tabela;
  - o resumo da linha depois de 1,5 s parado;
  - a página da lista continua de 1 a 100 itens.
- **Chaves fixas:**
  - as colunas especiais dos ativos: `ativo.rotulo`, `ativo.tipo`, `ativo.modelo`, `ativo.situacao`, `ativo.criado-em` e `ativo.atualizado-em`;
  - os operadores: `contem`, `vazio`, `preenchido`, `entre`, `qualquer`, `em` e `situacao`;
  - a visão de fábrica: `fabrica`; a tabela com visões: `ativos`;
  - as preferências: `tabelas.resumoDaLinha` e `tabelas.visoes`;
  - as ações: `visao.criada`, `visao.alterada` e `visao.removida`; o evento: `visoes.mudaram`;
  - os parâmetros do endereço: `visao`, `busca`, `colunas`, `ordem` e `filtros`.
- **Textos da interface, exatamente:**
  - **visões:**
    - "Todos os ativos", "Da organização", "Minhas visões", "Alterada";
    - "Salvar alterações", "Salvar como nova visão…", "Descartar alterações", "Renomear…", "Remover…", "Usar como padrão da organização";
    - no diálogo: "Nome" e "Compartilhar com a organização";
    - na remoção: "Remover a visão <nome>?", "A visão sai do seu menu.", "A visão sai do menu de todos na organização." e "Remover visão";
  - **retornos:** "Visão salva.", "Visão criada.", "Visão renomeada.", "Visão removida.", "Padrão da organização definido.", "1 linha copiada.", "<n> linhas copiadas.", "Patrimônio copiado." e "Link copiado.";
  - **recusas:**
    - "Dê um nome à visão.", "Use até 60 caracteres." e "Já existe uma visão com este nome.";
    - "Você já tem 50 visões nesta tabela. Remova uma para criar outra." e "A organização já tem 100 visões nesta tabela. Remova uma para criar outra.";
    - "Escolha uma visão que você pode usar." e "Escolha uma visão da organização.";
  - **avisos:** "A visão <nome> foi removida." e "A visão do endereço não está disponível.";
  - **tabela:**
    - "Colunas", "Buscar colunas", "Mover para cima" e "Mover para baixo";
    - "Ordenar crescente", "Ordenar decrescente", "Filtrar…", "Ocultar coluna" e "Redimensionar coluna";
    - "Filtros", "Aplicar filtro", "Tirar filtro", "Contém", "De", "Até", "É qualquer de", "Em", "Está vazio" e "Está preenchido";
    - "Carregando mais…", "1 selecionado", "<n> selecionados" e "Limpar seleção";
    - "Abrir", "Prévia", "Copiar linhas", "Copiar patrimônio" e "Copiar link";
    - "Fora do seu acesso" e "—";
  - **colunas dos ativos:** "Ativo", "Tipo", "Modelo", "Situação", "Cadastrado em" e "Atualizado em";
  - **filtros ativos:** "Hostname: contém almox", "Garantia até: de 01/01/2026 até 31/12/2026", "Garantia até: até 31/12/2026", "Responsável: está vazio", "Tipo: Impressora, Switch" e "Local: em Jundiaí";
  - **Ajustes:** "Resumo da linha" e "Ao parar o mouse 1,5 s sobre uma linha, mostra as colunas que estão fora da tela.";
  - **busca:** "Ativos › Visões".
- **Commits:** um por tarefa, no padrão `tipo(escopo): assunto`, com "Tarefa X.Y do p1c-tabela-e-visoes." no corpo (regra 8). Esta sessão é a orquestradora: os pacotes compartilhados mudam aqui (regra 7).

## Foco da revisão

Situações que as specs implicam e que nenhum cenário cobre, cada uma com o teste na tarefa dona:
1. **A visão com um campo inativado:** a coluna, o filtro e a ordem por ele saem, sem marcar a visão como alterada, e voltam com o campo (tarefas 2.1 e 6.1).
2. **O filtro de situação em `filtros` e o parâmetro `situacao`:** o filtro substitui o padrão `ativos` do parâmetro, e "Inativos" não vira uma lista vazia (tarefa 4.1).
3. **O cursor no meio de valores iguais e entre os vazios:** a página seguinte não pula nem repete nenhum ativo, nas duas direções (tarefa 4.3).
4. **O restrito num ramo:** o filtro e a ordem só usam o valor onde a conta vê os restritos, e o `vazio` não pega o valor oculto (tarefas 4.1 e 4.3).
5. **Duas criações juntas no limite:** só uma passa (tarefa 4.5).
6. **A visão padrão da organização removida:** a tabela abre na de fábrica, sem erro, e a preferência fica (tarefas 2.4 e 6.2).
7. **O clique simples com uma seleção:** abre o registro, e o Ctrl+clique não abre (tarefa 5.3).
8. **O espaço com a seleção:** a prévia passa só pelos selecionados, e a seleção continua (tarefas 5.8 e 6.7).
9. **Copiar um restrito oculto:** a célula fica vazia no texto copiado (tarefa 6.3).
10. **O resumo:** nunca no toque, cancelado pela rolagem e por uma tecla (tarefa 5.5).
11. **O endereço com a visão de outra conta:** as mudanças do endereço valem sobre a visão que abre, com o aviso (tarefas 6.1 e 6.2).
12. **A anonimização:** remove as visões da conta, e não as da organização (tarefa 4.7).

## 1. Spec mestre

- [x] 1.1 Atualizar a spec mestre conforme o design:
  - **seção 4.2:** a virtualização e o redimensionamento pelo React Aria, no lugar do TanStack Table e do Virtual;
  - **seção 5.2, decisão 9:** o que a visão guarda, as visões da organização e as de cada conta, a visão que abre e a padrão da organização;
  - **seção 7.4, Tabela:** o painel "Colunas", o menu da coluna, a seleção sem tirar do clique a abertura, o menu de contexto, copiar as linhas, o resumo das colunas fora da área visível e o estado no endereço.

  Verificar: o diff da spec mestre bate com as specs e o design desta change.

## 2. Domínio

- [x] 2.1 Escrever os testes e depois a definição da visão (decisão 1):
  - `DefinicaoDaVisao`, os filtros por operador e `lerDefinicaoDaVisao`, com os limites, as larguras trazidas ao limite e a coluna repetida de fora;
  - `mesmaDefinicao`, sem a ordem dos filtros;
  - a conferência do nome;
  - `TABELAS_COM_VISOES`, com o módulo e a permissão de cada tabela, e a visão de fábrica dos ativos;
  - a aplicação de uma definição às colunas disponíveis, que tira as colunas, os filtros e a ordem que deixaram de valer, sem mudar a definição (foco 1).

  Verificar: os testes do `packages/domain` passam.
- [x] 2.2 Escrever os testes e depois `colunasDosAtivos` (decisão 2):
  - as especiais, os campos comuns, os da organização ativos e usados por um tipo ativo, nos grupos deles, e os das capacidades ligadas;
  - a ordem e os operadores de cada tipo de campo, o alinhamento, a fonte mono e a largura padrão;
  - os restritos só com `verRestritos`;
  - a coluna principal.

  Verificar: os testes do `packages/domain` passam.
- [x] 2.3 Escrever os testes e depois a descrição em texto (decisões 1 e 6):
  - `descreverFiltro`, com os textos dos filtros ativos das restrições globais, os valores pelo motor de campos e os nomes das referências;
  - `descreverDefinicao`, para a auditoria: as colunas pelos rótulos, a ordenação e os filtros.

  Verificar: os testes do `packages/domain` passam.
- [x] 2.4 Escrever os testes e depois as preferências novas (decisão 7):
  - `tabelas.resumoDaLinha`, ligado na fábrica;
  - `tabelas.visoes`, com o leitor que guarda só as tabelas conhecidas e os valores `fabrica` ou uuid;
  - `visaoQueVale`, que pula a visão que não está entre as que a conta pode usar, até a de fábrica (foco 6).

  Verificar: os testes do `packages/domain` passam, e o teste da web que confere as listas das preferências continua passando.
- [x] 2.5 Escrever os testes e depois os catálogos (decisão 6):
  - a descrição nova de `organizacao.editar`;
  - as ações `visao.*`, com o rótulo e o evento de cada uma;
  - o evento `visoes.mudaram`, com o público dado por quem grava.

  Verificar: os testes do `packages/domain` passam.

## 3. Banco

- [x] 3.1 Escrever os testes de integração e depois a migration (decisão 5):
  - a tabela `visoes`, com `orgScoped()` e `app.isolar_por_organizacao`;
  - a referência à conta com o `org_id`;
  - os dois índices únicos parciais do nome normalizado;
  - as conferências da tabela e da forma e do tamanho da definição.

  Verificar:
  - o teste-guarda e o das chaves com `org_id` passam com a tabela nova;
  - o nome repetido na organização e o repetido na mesma conta são recusados pelo banco, e o mesmo nome numa conta e na organização é aceito;
  - `pnpm test:integration` passa no `packages/db`.

## 4. API

- [x] 4.1 Escrever os testes de integração e depois os filtros da lista (decisões 3 e 4):
  - a forma sem acento do `translate`, comparada com o `normalizarTexto` letra a letra;
  - cada operador por tipo de coluna, com o `entre` nas datas e nos momentos pelo `fuso`;
  - o filtro de situação em `filtros` no lugar do padrão do parâmetro (foco 2);
  - o restrito só onde a conta o vê, também no `vazio` (foco 4);
  - o filtro malformado com 400, e o de uma coluna indisponível de fora.

  Verificar: `pnpm test:integration` passa no `apps/api`, e `pnpm contrato:verificar` está em dia depois do `pnpm contrato:gerar`.
- [x] 4.2 Escrever os testes de integração e depois as colunas da resposta (decisões 3 e 4):
  - `colunas`, com os valores pedidos do JSONB;
  - a série, o hostname, o cadastro, a última mudança e `permite.verRestritos` em cada item;
  - as `referencias` das pessoas, dos ativos e dos modelos da página e dos filtros;
  - os restritos fora da resposta onde a conta não os vê.

  Verificar: `pnpm test:integration` passa no `apps/api`, e `pnpm contrato:verificar` está em dia.
- [x] 4.3 Escrever os testes de integração e depois a ordem e o cursor (decisões 3 e 4):
  - a chave da ordem de cada coluna: o Ativo, o tipo, o modelo, a situação, os momentos, o texto sem acento, o IP pelos números, os números, a data, a ordem das opções, o nome da pessoa e o caminho do local;
  - os vazios no fim nas duas direções, o desempate pelo cadastro e o restrito oculto tratado como vazio;
  - o cursor no meio de valores iguais e entre os vazios, sem pular nem repetir (foco 3).

  Verificar: `pnpm test:integration` passa no `apps/api`, e `pnpm contrato:verificar` está em dia.
- [x] 4.4 Escrever o teste de integração do desempenho: 10 mil ativos, a página ordenada por uma coluna do JSONB com dois filtros e a contagem, com o p95 de 20 pedidos abaixo de 300 ms.

  Verificar: o teste passa no `pnpm test:integration` do `apps/api`.
- [x] 4.5 Escrever os testes de integração e depois as rotas das visões (decisões 5 e 6):
  - `GET`, `POST`, `PATCH` e `DELETE /visoes`, com o `permite`;
  - a permissão da tabela, `organizacao.editar` nas da organização, com a recusa auditada, e o 404 na de outra conta;
  - o nome único, os limites com a linha travada (foco 5) e a definição conferida;
  - o módulo da tabela desligado;
  - a auditoria nas da organização, e o evento para todas as sessões ou só para as da conta.

  Verificar: `pnpm test:integration` passa no `apps/api`, e `pnpm contrato:verificar` está em dia.
- [x] 4.6 Escrever os testes de integração e depois a visão nas preferências (decisão 7): `PATCH /conta/preferencias` e `PATCH /organizacao/padroes` aceitam `tabelas.resumoDaLinha` e `tabelas.visoes`, e recusam a visão que a camada não pode usar, com as mensagens.

  Verificar: `pnpm test:integration` passa no `apps/api`, e `pnpm contrato:verificar` está em dia.
- [x] 4.7 Escrever os testes de integração e depois as visões na anonimização (decisão 5): a anonimização remove as visões da conta da pessoa, na mesma transação, e mantém as da organização (foco 12).

  Verificar: `pnpm test:integration` passa no `apps/api`.

## 5. UI

- [x] 5.1 Escrever as histórias com os testes e depois as larguras e o menu da coluna (decisão 9):
  - o arraste da borda, o teclado por "Redimensionar coluna" e os limites de 64 e 800 px;
  - o menu da coluna, com as opções conforme a coluna, e o clique no rótulo que ordena;
  - o alinhamento à direita dos números.

  Verificar: `pnpm test:stories` passa, com os testes de interação e de acessibilidade, e `pnpm test:visual --atualizar` grava as referências novas.
- [x] 5.2 Escrever as histórias com os testes e depois a tabela virtualizada (decisão 9):
  - 10 mil linhas, com só as linhas perto da área visível no DOM e o cabeçalho fixo;
  - a página seguinte ao fim da rolagem e ao fim pelo teclado, com "Carregando mais…" e sem pedido duplo;
  - as tabelas de hoje, sem a virtualização, iguais.

  Verificar: `pnpm test:stories` passa, e `pnpm test:visual --atualizar` grava as referências novas.
- [x] 5.3 Escrever as histórias com os testes e depois a seleção (decisão 9):
  - o Ctrl+clique, o Shift+clique, o Shift com as setas, o Ctrl+A e o Esc;
  - o clique simples que abre, com ou sem seleção (foco 7);
  - o espaço que continua pedindo a prévia;
  - "<n> selecionados" com "Limpar seleção" e as linhas anunciadas como selecionadas.

  Verificar: `pnpm test:stories` passa, com os testes de interação e de acessibilidade.
- [x] 5.4 Escrever as histórias com os testes e depois o menu de contexto e copiar (decisão 9):
  - o `MenuDeContexto`, pelo clique direito, pela tecla de menu, por Shift+F10 e pelo toque longo;
  - o menu sobre a seleção e sobre uma linha fora dela;
  - Ctrl+C com a seleção e com a linha em foco, e o trecho de texto selecionado, que o navegador copia como sempre;
  - o foco de volta à linha com Esc.

  Verificar: `pnpm test:stories` passa, e `pnpm test:visual --atualizar` grava as referências novas.
- [x] 5.5 Escrever os testes e depois o resumo da linha (decisão 9):
  - `relogioDoResumo` com o tempo falso: 1,5 s parado, e o cancelamento pelo movimento, pela saída, pela rolagem e pelas teclas;
  - as colunas fora da área visível, e nenhum resumo com todas à vista;
  - só com o mouse e com a preferência ligada, e sem a escala com o movimento reduzido (foco 10).

  Verificar: os testes do `packages/ui` e `pnpm test:stories` passam, e `pnpm test:visual --atualizar` grava as referências novas.
- [x] 5.6 Escrever as histórias com os testes e depois o `PainelDeColunas` (decisão 9):
  - a busca e os grupos com a marca de cada coluna;
  - a lista das colunas à vista, com "Mover para cima", "Mover para baixo" e o arraste pelo teclado e pelo mouse;
  - a coluna principal fixa.

  Verificar: `pnpm test:stories` passa, e `pnpm test:visual --atualizar` grava as referências novas.
- [x] 5.7 Escrever as histórias com os testes e depois a `EscolhaDaVisao` e o `EditorDeFiltro` (decisão 9):
  - a escolha com o nome, "Alterada" em texto e o menu com as seções e as ações conforme o que a conta pode;
  - o editor com o operador e os campos de cada tipo de filtro, as recusas no campo, "Aplicar filtro" e "Tirar filtro".

  Verificar: `pnpm test:stories` passa, e `pnpm test:visual --atualizar` grava as referências novas.
- [x] 5.8 Escrever os testes e depois a prévia paginada no `usePrevia` (decisão 9):
  - a posição pelo total da lista;
  - a página seguinte pedida pela seta, com o esqueleto;
  - só os selecionados, com a posição na seleção (foco 8);
  - a assinatura de hoje continua valendo para as pessoas e a auditoria.

  Verificar: os testes do `packages/ui` e `pnpm test:stories` passam.

## 6. Web

- [x] 6.1 Escrever os testes e depois o estado da tabela no endereço (decisão 8):
  - a leitura e a escrita de `visao`, `busca`, `colunas`, `ordem` e `filtros`, com as mudanças só quando diferem da visão;
  - "Alterada" e "Descartar";
  - o endereço sem `visao`, reescrito com a visão que abre;
  - a visão do endereço que a conta não pode usar (foco 11);
  - os links antigos com `tipo`, `local` e `situacao`;
  - as colunas indisponíveis de fora (foco 1).

  Verificar: os testes da web passam.
- [x] 6.2 Escrever os testes e depois as visões na web (decisões 6 e 7):
  - `useVisoes` e as mutações: criar, salvar, renomear, remover e o padrão da organização;
  - escolher a visão grava a preferência da conta;
  - a visão que abre pelas duas camadas, com a removida pulada (foco 6);
  - `visoes.mudaram` atualiza o menu, e a tabela aberta numa visão removida passa à que abre, com o aviso.

  Verificar: os testes da web passam.
- [x] 6.3 Escrever os testes e depois copiar e o menu de contexto dos ativos (decisão 10):
  - `linhasParaCopiar`, com os rótulos, as tabulações e as quebras de linha trocadas e o restrito oculto vazio (foco 9);
  - os itens "Abrir", "Prévia", "Copiar linhas", "Copiar patrimônio" e "Copiar link", conforme as linhas, e os retornos.

  Verificar: os testes da web passam.
- [x] 6.4 Escrever os testes de componente e depois a `TabelaDosAtivos` (decisões 2 e 10):
  - as colunas da visão, a partir do catálogo, e as células de cada tipo, com as referências, a fonte mono, os números à direita e "Fora do seu acesso";
  - o painel "Colunas", as larguras, ocultar e a ordem pelas colunas, tudo pelo estado do endereço;
  - a tabela na altura da janela, virtualizada, com a carga ao fim e a contagem.

  Verificar: os testes de componente passam.
- [x] 6.5 Escrever os testes de componente e depois os filtros dos ativos (decisões 2 e 10):
  - "Filtros" e "Filtrar…", com os editores dos ativos: o local, os tipos, os modelos, as pessoas, as opções, o texto e os intervalos;
  - os filtros ativos com os textos do domínio e o filtro de situação à vista;
  - a barra sem os filtros de tipo e de local do P1b, e o estado vazio com "Limpar filtros".

  Verificar: os testes de componente passam.
- [x] 6.6 Escrever os testes de componente e depois as visões na tela dos ativos (decisões 6 e 10):
  - a escolha da visão e "Alterada";
  - salvar, salvar como, com "Compartilhar com a organização" só para quem tem `organizacao.editar`, descartar, renomear, remover com a confirmação e "Usar como padrão da organização";
  - as recusas do nome no diálogo e os retornos.

  Verificar: os testes de componente passam.
- [x] 6.7 Escrever os testes de componente e depois a prévia e o resumo na tabela dos ativos (decisão 10):
  - a prévia com o título, a imagem, os campos principais e as outras colunas da visão, "Abrir" e o Enter, a página seguinte e a seleção (foco 8);
  - o resumo com as colunas fora da área visível, e a seleção limpa quando a busca, um filtro, a ordem ou a visão mudam.

  Verificar: os testes de componente passam.
- [x] 6.8 Escrever os testes e depois as visões na busca e o resumo nos Ajustes (decisão 10):
  - o provedor "Visões" do Ativos, com "Ativos › Visões" e o destino na visão;
  - o interruptor "Resumo da linha" em Ajustes › Tabelas e nos padrões da organização;
  - **o contrato de módulo (`docs/casca/modulos.md`):** a tabela configurável e as visões (decisão 11).

  Verificar: `registro.test.ts`, `documentacao.test.ts` e os testes da web passam.
- [x] 6.9 Estender a ponta a ponta com a API simulada:
  - a coluna "IP" mostrada, a largura mudada e a ordem pelo IP, com "Alterada" e o endereço;
  - salvar como nova visão, descartar e reabrir pela busca;
  - um filtro de texto e o de local, com os filtros ativos;
  - a seleção com Ctrl e Shift, copiar e o menu de contexto;
  - a prévia com as setas até a página seguinte;
  - o resumo ao parar o mouse.

  Verificar: `pnpm test:e2e` passa.
- [x] 6.10 Estender a ponta a ponta da pilha, com as duas contas em dois navegadores:
  - a visão que a administradora compartilha aparece no menu da outra conta pelo evento;
  - a padrão da organização abre a tabela da outra conta;
  - a visão pessoal de uma conta não aparece para a outra;
  - a coluna de um campo restrito mostra o valor só onde a conta vê os restritos.

  Verificar: `pnpm test:e2e:pilha` passa.

## 7. Fechamento

- [x] 7.1 Atualizar o `CLAUDE.md`, com o P1c nas referências, e conferir as verificações:
  - `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:stories`, `pnpm test:e2e`, `pnpm test:e2e:pilha` e `pnpm test:visual` verdes;
  - `pnpm tokens:verificar`, `pnpm marca:verificar`, `pnpm contrato:verificar` e `pnpm fila:verificar` em dia;
  - `openspec validate p1c-tabela-e-visoes --strict` sem erros.

  Verificar: os comandos passam, e o CI fica verde no PR.
