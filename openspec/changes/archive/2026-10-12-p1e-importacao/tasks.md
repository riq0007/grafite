## 1. Spec mestre e domínio

- [x] 1.1 Atualizar a spec mestre: na seção 3.2, o P1e com os formatos (XLSX, a primeira aba, e CSV), os limites (10 MB, 5.000 linhas), as colunas pelo rótulo, o casamento, as referências por texto, a prévia e a aplicação na fila, com a trava e o só manual. Verificar: o teste do mapa passa, com as seções citadas ainda com título.
- [x] 1.2 Domínio, as colunas, com o teste antes: `camposDaImportacao` (sem arquivo e imagem, com o modelo, os restritos só para quem os vê), `sugerirColunas` (pelo rótulo normalizado e pelos nomes conhecidos dos campos comuns, sem repetir um campo) e `conferirMapeamento` (um campo numa coluna, e pelo menos uma coluna). Verificar: os testes do domínio passam, com o cenário "Colunas pelo rótulo" da spec.
- [x] 1.3 Domínio, o casamento e as referências, com o teste antes: `casarLinha` (patrimônio, série e hostname normalizados, com as recusas de outro tipo, inativo, repetido entre linhas e de série ou hostname de mais de um ativo) e as leituras por texto do local (caminho com "›" ou ">", ou nome único), da pessoa (matrícula, e-mail ou nome único), do ativo (patrimônio) e do modelo (fabricante e nome, ou nome único), com as mensagens da spec. Verificar: os testes do domínio passam.
- [x] 1.4 Domínio, a linha, com o teste antes: `planejarLinha`, com a ação, o pedido de gravação, o "antes → depois", os campos travados e só manuais, a célula vazia que não muda nada, a linha sem valor, os obrigatórios do ativo novo, o escopo e os restritos pelo acesso dado; as ações `importacao.aplicada` e `importacao.concluida` na auditoria, com o evento; o tipo `importacoes.mudaram`. Verificar: os testes do domínio passam, com os cenários da prévia da spec.

## 2. Banco

- [x] 2.1 A migration 0023, com o teste de integração antes: a tabela `importacoes` isolada pela organização, com as chaves compostas da conta e do tipo, os CHECKs da situação e do conteúdo depois do fim, o índice da lista de cada conta e as exportações. Verificar: `pnpm --filter @grafite/db test:integration` passa, com o teste-guarda do isolamento e o das chaves compostas.

## 3. API

Cada tarefa entra com os esquemas das rotas dela e o cliente gerado de novo (`pnpm contrato:gerar`).

- [x] 3.1 A leitura da planilha, com o teste antes: o XLSX (a primeira aba pelo `workbook.xml` e as relações, os textos compartilhados com formatação, o texto da célula, o número, o booleano, as células puladas, as entidades e o `_xHHHH_`, a bomba de compressão recusada) e o CSV (UTF-8 com e sem BOM, Windows-1252, os três separadores, as aspas com o separador e a quebra de linha), com os títulos vazios, as linhas vazias e os limites; planilhas de exemplo montadas no teste. Verificar: os testes unitários passam.
- [x] 3.2 A gravação do ativo fora da requisição, com o teste antes: `gravarAtivo` e `mudarSituacaoDoAtivo` com quem grava (a conta, o acesso, a origem, o rastreio e a importação), o escopo pelo `podeEm` e a origem diferente de `manual` sem as chaves travadas e só manuais. Verificar: os testes de integração da escrita dos ativos continuam verdes, e um teste novo grava com a origem `planilha` e confere o estado e a auditoria.
- [x] 3.3 As rotas da importação, com o teste de integração antes: `POST /ativos/importacoes` (o corpo cru até 10 MiB, as recusas da spec, o rascunho com as colunas sugeridas), `GET /ativos/importacoes` e `GET /ativos/importacoes/:id` (só as da conta, 404 nas outras), `PUT /ativos/importacoes/:id/colunas`, `GET /ativos/importacoes/:id/previa` (os totais, a página por ação, o "antes → depois", as travas e os erros) e `DELETE /ativos/importacoes/:id` (o descarte, com o evento). Verificar: os testes de integração, com os cenários das colunas, do casamento, dos valores e da prévia da spec.
- [x] 3.4 A aplicação na fila, com o teste de integração antes: `POST /ativos/importacoes/:id/aplicacao` com a auditoria e a tarefa na mesma transação; a tarefa `importacao-de-ativos`, linha a linha, com a origem `planilha`, a conta que importou, o acesso do momento, a trava ligada depois da prévia, a interrupção que continua da linha seguinte, a conclusão sem o conteúdo, a auditoria e os eventos; o `aoFalhar` do catálogo, chamado pela fila das falhas, e o "Tentar de novo" que continua; o rascunho de mais de 7 dias descartado pela manutenção diária. Verificar: os testes de integração, com os cenários da aplicação e da lista da spec, e uma importação de 5.000 linhas em menos de 3 min.

## 4. UI

- [x] 4.1 `EscolhaDeArquivo` com os formatos, o limite e as regras dados, com as histórias antes: a escolha da planilha, com "XLSX ou CSV, até 10 MB" e a recusa antes do envio pelo limite dado. Verificar: `pnpm test:stories` passa.
- [x] 4.2 `PreviaDaImportacao`, com as histórias antes: o número da linha, a ação em texto, o ativo, cada campo "antes → depois" com "—" no vazio, os travados e os só manuais com o motivo, os erros pelo campo, "Carregar mais" e o vazio. Verificar: `pnpm test:stories` passa, e a captura nova entra na regressão visual.

## 5. Web

- [x] 5.1 As releituras de uma rajada de eventos, com o teste antes: `ligarEventosDosModulos` relê cada consulta uma vez por vez, e a última começa depois do último evento. Verificar: os testes dos eventos.
- [x] 5.2 A lista e a importação nova, com o teste antes: o item Importações no menu e "Importar planilha" na busca, para quem tem `ativos.editar`; a lista das importações da conta, com a situação em texto e os totais; a importação nova, com o tipo, a planilha e as recusas; o evento `importacoes.mudaram`. Verificar: os testes do módulo e das telas.
- [x] 5.3 O rascunho, com o teste antes: as colunas, com o título, os primeiros valores e a escolha do campo, e as recusas; a prévia, com os totais, o filtro por ação e a `PreviaDaImportacao`; "Importar", com a confirmação dos totais, e "Descartar". Verificar: os testes da tela.
- [x] 5.4 O acompanhamento e o resultado, com o teste antes: o progresso com as linhas processadas, que avança pelo evento; o resultado, com os totais e as linhas com erro; a falha e o descarte, em texto. Verificar: os testes da tela.

## 6. Ponta a ponta

- [x] 6.1 Estender a ponta a ponta com a API simulada: a simulação ganha as importações, com a prévia e o progresso; os cenários: importar uma planilha com um ativo novo, um alterado com um campo travado e uma linha com erro, ajustar uma coluna, ver a prévia filtrada, importar e ver o resultado. Verificar: `pnpm test:e2e` passa.
- [x] 6.2 Estender a ponta a ponta da pilha: uma conta importa um CSV e um XLSX de verdade, a outra vê os ativos chegarem na lista aberta, a ficha mostra "Planilha" e o autor, e a importação não aparece para a outra conta. Verificar: `pnpm test:e2e:pilha` passa.

## 7. Fechamento

- [x] 7.1 Documentação: os termos novos e a change no mapa (a capacidade `importacao-de-ativos` entra no mapa no arquivamento, junto com a sincronização das specs); o contrato de módulo, se algo mudou nele. Verificar: o teste do mapa passa.
- [x] 7.2 Conferir `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:stories`, `pnpm test:e2e`, `pnpm test:e2e:pilha` e `pnpm test:visual` verdes; `tokens:verificar`, `marca:verificar`, `contrato:verificar` e `fila:verificar` em dia; `openspec validate p1e-importacao --strict` sem erros. Verificar: os comandos passam, e o CI fica verde no PR para a `main`.
