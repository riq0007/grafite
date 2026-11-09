## Context

A motivação está em `proposal.md`, e os requisitos, nas specs desta change. As decisões de produto vêm da spec mestre: a seção 3.2 (o P1e, com a prévia linha a linha e o casamento por patrimônio → série → hostname, na fila de tarefas) e a seção 5.2, decisão 4 (a importação e a coleta não mudam um campo travado nem um campo só manual). A referência do PMG é o `ImportWizard.tsx` (seção 12).

Pontos de partida no código, depois do P1d:
- **Domínio:**
  - `lerValor` e `mostrarValor` (`campos/valores.ts`), que já aceitam o número de uma célula: o texto vira texto, a data pelo número de série do Excel, e a lista pelo rótulo, sem diferenciar acento e maiúsculas. A pessoa, o local e o ativo só pelo id;
  - `camposDoAtivo`, `conferirValoresDoAtivo` e `CAMPOS_DO_ATIVO`; `podeGravar`, `registrarGravacao` e `ORIGENS_DO_VALOR`, com a origem `planilha` desde o P1b;
  - `normalizarTexto`; `podeEm` e `carregarAcesso`; `TIPOS_DE_EVENTO`, `ACOES_DA_AUDITORIA` e `EVENTO_DA_ACAO`.
- **Banco:** `ativos` com o patrimônio normalizado e único, a série e o hostname em colunas; `pessoas` com o e-mail e a matrícula; `orgScoped()`, `app.isolar_por_organizacao` e a próxima migration, a 0023.
- **API:**
  - `gravarAtivo` (`ativos/escrita.ts`), presa à requisição: o escopo pelo `exigirEm`, a origem `manual` e a auditoria com o IP;
  - `entradasDoZip` e `eTexto` em `arquivos/documentos.ts`, que conferem o conteúdo sem descompactar;
  - o catálogo da fila (`fila/tarefas.ts`), a fila das falhas, que grava a tarefa na lista da organização pelo `orgId` dos dados, e a manutenção diária;
  - `registrarEvento`, com o público por contas.
- **UI:** a `EscolhaDeArquivo`, com os formatos e o limite dos documentos fixos; a `ListaDoHistorico`, o desenho de "Campo: antes → depois"; a `BarraDeProgresso`.
- **Web:** o módulo Ativos, com o menu, a busca e os eventos em `modulo.ts`; o `enviarArquivo` do cliente, o `PUT` com o corpo cru; `ligarEventosDosModulos`, que invalida a consulta a cada evento.

## Goals / Non-Goals

**Goals:**
- A prévia e a gravação usam a mesma regra, linha por linha: o que a prévia mostra é o que a tarefa grava, salvo o que mudou no meio, como uma trava ligada.
- Uma importação interrompida continua de onde parou, sem gravar uma linha duas vezes.
- Uma planilha de 5.000 linhas não trava a API, a fila nem as telas abertas.

**Non-Goals:**
- Guardar a planilha depois da importação, ou permitir baixá-la de volta.
- Uma prévia guardada: ela é refeita a cada pedido.
- Importar com outra conta, ou agendar uma importação.

## Decisions

### 1. A planilha lida uma vez, no envio, e guardada na importação

O envio confere o tipo pelo conteúdo, lê a primeira aba (ou o CSV) e guarda, na própria linha da importação, os títulos das colunas e as células, como JSONB: uma lista de linhas, cada uma uma lista de células, com o texto, o número ou `null`. A prévia e a tarefa leem dali. No fim (concluída ou descartada), as células saem (`conteudo = null`), e ficam o nome do arquivo, os títulos e os totais.

Alternativa: guardar o arquivo no armazenamento, como os documentos dos campos, e lê-lo de novo a cada prévia e na tarefa. Foi descartada: cada página da prévia descompactaria e leria o XML de novo, a tarefa dependeria do armazenamento, e o apagamento passaria pela manutenção. As células cabem no banco: 5.000 linhas de 20 colunas são menos de 2 MB, e o limite de 10 MB do arquivo segura o pior caso.

### 2. Um leitor próprio de XLSX e CSV, sem dependência nova

- **XLSX:** o ZIP pelo diretório central (o `entradasDoZip` de `documentos.ts`, exportado), cada entrada pelo `inflateRawSync` do `node:zlib`, com `maxOutputLength` para barrar a bomba de compressão (até 100 MB descompactados no total). A primeira aba é a primeira do `<sheets>` do `xl/workbook.xml`, achada pelo `xl/_rels/workbook.xml.rels`. As células vêm do XML da aba: o texto compartilhado (`t="s"`, pelo `xl/sharedStrings.xml`, juntando os trechos de formatação), o texto da célula (`inlineStr` e `str`), o número (`n`, guardado como número), o booleano (como "VERDADEIRO" e "FALSO") e o erro (como texto, que o campo recusa). A posição vem da referência da célula (`B7`), porque o Excel pula as vazias. As entidades do XML e o escape `_x000D_` do OOXML são desfeitos.
- **CSV:** UTF-8, com ou sem BOM, e, se não for UTF-8 válido, Windows-1252 (`TextDecoder`). O separador é o que mais aparece na linha dos títulos, fora das aspas, entre ponto e vírgula, vírgula e tabulação, com o ponto e vírgula no empate. As aspas seguem a RFC 4180: o separador e a quebra de linha dentro delas, e `""` como aspas.
- **Comum:** a primeira linha são os títulos; o título vazio vira "Coluna C", pela letra; as linhas inteiramente vazias saem; o texto sai sem espaços nas pontas. Os limites (5.000 linhas, 200 colunas) são conferidos na leitura.

O número fica número porque a regra dos campos lê "1.024" em pt-BR como mil e vinte e quatro: a célula numérica do Excel com 1,024 chegaria errada se virasse texto. A data do Excel é um número com o formato de data; o campo de data lê o número de série, então o leitor não precisa do `styles.xml`.

Alternativa: uma biblioteca de planilhas (SheetJS, ExcelJS). Foi descartada pela regra de não trazer dependência para o que o projeto já tem quase pronto: o ZIP já é lido para conferir os documentos, e só a primeira aba, sem fórmulas nem estilos, é pouco XML.

### 3. As tabelas `importacoes` e `erros_da_importacao`

`orgScoped`, com RLS ativo e forçado, e:
- `criada_por` (a conta, chave estrangeira composta), `tipo_id` (o tipo de ativo), `nome_do_arquivo`, `colunas` (os títulos, JSONB), `conteudo` (as células, JSONB, nulo depois do fim) e `linhas` (quantas);
- `mapeamento` (JSONB: para cada coluna, pela posição, a chave do campo ou nada);
- `situacao`: `rascunho`, `na-fila`, `aplicando`, `concluida`, `com-falha` ou `descartada`, com o CHECK, e o CHECK de que a concluída e a descartada não têm conteúdo;
- `processadas` e `totais` (JSONB com novos, alterados, sem mudança e com erro);
- `criada_em`, `atualizada_em`, `aplicada_em` e `concluida_em`.

As linhas com erro ficam em `erros_da_importacao`, também isolada: a importação, o número da linha (único na importação) e as mensagens, cada uma com o rótulo do campo, quando houver. Uma lista JSONB na própria importação seria regravada inteira a cada linha com erro, e a planilha de 5.000 linhas com erro custaria gigabytes de escrita; numa tabela, cada linha com erro é uma inclusão, e o resultado é lido por páginas (`GET /ativos/importacoes/:id/erros`).

O índice `(org_id, criada_por, criada_em desc, id)` serve à lista de cada conta. Cada conta vê só as dela: a consulta filtra por `criada_por`, e a de outra conta responde 404, como se não existisse.

### 4. A regra da linha no domínio, a mesma para a prévia e para a tarefa

Em `packages/domain/src/importacao/`, funções puras:
- `camposDaImportacao(definicoes, { restritos })`: os campos oferecidos, na ordem da ficha, sem arquivo e imagem, com o modelo (`ativo.modelo`) e os restritos só para quem os vê em algum ramo;
- `sugerirColunas(titulos, campos)`: pelo rótulo normalizado e pelos nomes conhecidos dos campos comuns (como "Série", "Serial", "S/N" e "Nº de série" para o número de série, e "Localização" para o local), sem repetir um campo;
- `conferirMapeamento`: um campo numa coluna só, e pelo menos uma coluna com campo;
- `casarLinha(linha, indice)`: o patrimônio, depois a série, depois o hostname, normalizados, com as recusas de ativo de outro tipo, inativo, repetido entre linhas e de série ou hostname de mais de um ativo;
- `planejarLinha`: lê cada célula pela regra do campo, as referências pelo texto, compara com o valor guardado, separa o que muda, o que fica igual e o que a trava ou o só manual seguram (`podeGravar` com a origem `planilha`), confere o escopo e os restritos pelo acesso dado e devolve a ação (`novo`, `alterar`, `sem-mudanca`, `com-erro`), o pedido de gravação e as mensagens.

As consultas ao banco ficam do lado da API, que monta os índices e entrega ao domínio funções de busca: o ativo pelo patrimônio, pela série e pelo hostname; o local pelo caminho e pelo nome; a pessoa pela matrícula, pelo e-mail e pelo nome; o modelo pelo fabricante e pelo nome. Assim a mesma função roda com os índices da prévia, montados uma vez para a planilha inteira, e com os da tarefa, relidos na linha.

### 5. A prévia refeita a cada pedido, sem gravar

`GET /ativos/importacoes/:id/previa?acao&cursor` monta os índices (os ativos da organização pela identificação, leves; os casados inteiros, numa consulta só; os locais pela árvore; as pessoas e os modelos ativos do tipo), planeja todas as linhas, devolve os totais da planilha inteira e uma página de 50 linhas da ação pedida, cada uma com o "antes → depois" pelo valor mostrado. Mudar as colunas (`PUT .../colunas`) muda a prévia seguinte.

Alternativa: calcular a prévia uma vez e guardá-la. Foi descartada: ela envelheceria com as edições e as travas feitas depois, e a tarefa teria de refazê-la de qualquer jeito.

### 6. A gravação do ativo fora da requisição

`gravarAtivo` passa a receber quem grava em vez da requisição e da sessão: `{ contaId, acesso, origem, rastreio, importacaoId? }`. O escopo e os restritos são conferidos pelo `podeEm` com o acesso dado, com a mesma `RecusaDePermissao`; a origem vai para o estado dos campos, o rastreio (o IP e o código) para a auditoria, e a importação, para os dados do registro. Com a origem diferente de `manual`, as chaves que o `podeGravar` recusa saem do pedido, como uma guarda a mais: a tarefa já as tirou pela regra da linha. As rotas montam quem grava pela sessão, com a origem `manual`, e a importação, pela conta que importou e pelo acesso dela no momento.

### 7. A tarefa `importacao-de-ativos`

Os dados são `{ orgId, importacaoId }`, e as opções, cinco tentativas a partir de 1 min, até 1 h, a fila das falhas, 1 h para rodar (`expireInSeconds`) e o sinal de vida a cada 60 s (`heartbeatSeconds`), para uma API que caiu devolver a tarefa sem esperar a hora inteira.

O trabalho, na organização dos dados:
1. trava a importação; se não está na fila, aplicando ou com falha, termina sem fazer nada (a repetida não grava de novo); senão, passa a "aplicando";
2. monta os índices dos ativos uma vez e os atualiza a cada ativo novo;
3. para cada linha depois da `processadas`, numa transação: trava a importação e confere que a linha é a próxima (outra execução pode ter passado); relê o ativo casado com a trava da linha (`for update`) e as referências; carrega o acesso de quem importou; planeja a linha; grava pelo `gravarAtivo`, num ponto de retorno (a recusa da gravação vira erro da linha sem desfazer o resto), ou guarda os erros em `erros_da_importacao`; soma os totais e avança a `processadas`, tudo junto. A cada 25 linhas, o evento `importacoes.mudaram`;
4. no fim, a importação concluída, sem o conteúdo, com a auditoria `importacao.concluida` e o evento.

Entre as linhas, o sinal de interrupção (o encerramento da API) para o trabalho com um erro, e a fila devolve a tarefa, que continua da linha seguinte. A tarefa que falha em todas as tentativas deixa a importação "Com falha" pelo novo `aoFalhar` do catálogo: a fila das falhas o chama na mesma transação em que grava a tarefa na lista. "Tentar de novo" põe a tarefa na fila outra vez, e ela continua.

Alternativa: uma transação para a importação inteira. Foi descartada: 5.000 linhas travariam os ativos por minutos, a interrupção perderia tudo, e o acompanhamento não teria o que mostrar.

### 8. A auditoria e os eventos

- `importacao.aplicada` (a conta, a importação, com o tipo, o nome do arquivo e as linhas) e `importacao.concluida` (com os totais), as duas com o evento `importacoes.mudaram` para as sessões de quem importou (o público dado, como o das preferências).
- Cada ativo gravado: `ativo.criado` ou `ativo.alterado`, como na tela, com a conta que importou como ator, sem o IP, e `dados: { importacao: { id, arquivo } }`, e o `ativos.mudaram` de cada um, pelo público de sempre.
- O descarte do rascunho não é auditado (nada foi aplicado), mas manda o evento.

### 9. As telas do módulo

- `/ativos/importacoes`: a lista das importações da conta, com "Importar planilha";
- `/ativos/importacoes/nova`: o tipo e a planilha; o envio cria o rascunho e abre a importação;
- `/ativos/importacoes/$id`, pela situação:
  - **rascunho:** as colunas, cada uma com o título, os primeiros valores e a escolha do campo, e a prévia, com os totais, o filtro por ação e a lista das linhas, com "Importar" e "Descartar";
  - **na fila e importando:** o progresso, pela `BarraDeProgresso`, com as linhas processadas em texto;
  - **concluída:** os totais e as linhas com erro;
  - **com falha e descartada:** a situação em texto, com o que fazer.

A UI ganha a `EscolhaDeArquivo` com os formatos, o limite e as regras dados (os de hoje como padrão) e a `PreviaDaImportacao`, a lista das linhas: o número, a ação em texto, o ativo, cada campo "antes → depois", os campos que a trava e o só manual seguraram e os erros, com "Carregar mais", como a `ListaDoHistorico`.

### 10. As releituras de uma rajada de eventos

`ligarEventosDosModulos` passa a reler cada consulta uma vez por vez: o evento marca a chave; se ela não está sendo relida, a releitura começa; se está, a próxima espera ela terminar e começa depois do último evento. Hoje cada evento invalida na hora, e o TanStack Query corta a releitura em andamento: numa importação com dezenas de ativos por segundo, a lista aberta ficaria relendo sem nunca terminar.

## Risks / Trade-offs

- **[A prévia de 5.000 linhas a cada página pesa]** → Os índices dos ativos são leves (identificação e tipo), os ativos casados vêm numa consulta, e a regra é em memória. Se pesar, guardar os índices da prévia num cache curto por importação, sem mudar o contrato.
- **[O XML do Excel tem variações que o leitor não conhece]** → Testes com planilhas do Excel, do LibreOffice e do Google Planilhas, montadas nos testes; o que não se lê é recusado como formato não aceito, sem gravar nada.
- **[Uma importação longa e outra na fila]** → A fila roda uma de cada vez por API. A segunda espera, com a situação "Na fila" à vista.
- **[O acesso de quem importou muda no meio]** → Cada linha usa o acesso do momento da gravação: o que deixou de valer vira erro na linha.
- **[Muitos eventos `ativos.mudaram`]** → Cada um é pequeno e some em 24 h; as telas releem uma vez por vez (decisão 10).

## Migration Plan

A migration 0023 cria a tabela `importacoes`, isolada pela organização. Nada muda nos dados existentes. Voltar a versão deixa a tabela sem uso, sem perda: o runbook já diz que a volta não desfaz a migration.

## Open Questions

- O tamanho da página da prévia (50) e de quantas em quantas linhas vai o evento do progresso (25) podem mudar com o uso, sem mudar o contrato.
