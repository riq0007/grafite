## Context

A motivação está em `proposal.md`, e os requisitos, nas specs desta change. As decisões de produto vêm da spec mestre:
- **Relacionamentos e imagem:** seção 5.2, decisão 3 (os ativos se relacionam entre si, e cada ficha leva aos registros ligados a ela; a imagem é do modelo, e o ativo sobrescreve quando precisa) e seção 7.9 (os formatos, a sanitização, a regravação e as miniaturas).
- **Arquivo e imagem:** seção 5.3 (os tipos chegam com a ficha, que traz o envio de arquivos) e seção 9, item 8 (os arquivos servidos com o tipo correto, como anexo quando cabível, só a quem pode ver o registro dono).
- **Histórico:** seção 5.2, decisão 8 (toda alteração vira um evento de auditoria com antes → depois).

As escolhas do usuário na proposta: as duas formas de ligação (os campos do tipo ativo e a ligação livre), o histórico para quem vê o ativo e o campo de arquivo com os documentos comuns até 25 MB.

Pontos de partida no código, depois do P1c:
- **Domínio:**
  - `TIPOS_DE_CAMPO`, `ROTULOS_DOS_TIPOS_DE_CAMPO` e `ConfiguracaoDoCampo` em `campos/tipos.ts`; `lerValor` e `mostrarValor` em `campos/valores.ts`, com `lerReferencia` para pessoa, local e ativo; `conferirConfiguracao` e `chavesDoTipo` em `campos/configuracao.ts`;
  - `POR_TIPO` em `ativos/colunas.ts`, um `Record<TipoDeCampo, …>`, e `conferirValoresDoAtivo`, que pula o valor igual ao guardado antes de ler;
  - `ACOES_DA_AUDITORIA` e `EVENTO_DA_ACAO`, este com `satisfies Record<AcaoDaAuditoria, …>`.
- **Banco:**
  - `TIPOS_DE_CAMPO_NO_BANCO` e o CHECK `campos_tipo_valido` (`0018_catalogo.sql`);
  - `ativos` sem imagem; `arquivos` sem o nome original; `modelos.imagem_id`, com a chave estrangeira composta para `arquivos`, como modelo da imagem do ativo;
  - `orgScoped()`, `app.isolar_por_organizacao` e a próxima migration, a 0021, gerada pelo `drizzle-kit generate` no `packages/db`.
- **API:**
  - `gravarAtivo`, `conferirReferencias` e `visaoDoAtivo` em `ativos/escrita.ts`; `fichaDoAtivo`, `referenciasDos` e `ativoNaLista` em `ativos/leitura.ts`; os esquemas em `ativos/esquemas.ts`;
  - `trocarImagem`, `tirarImagem`, `entregarImagem` e `aceitarImagens` (o corpo cru até 10 MiB) em `arquivos/imagem-do-registro.ts`; `tratarImagem`; `rotasDaImagemDoModelo`, o padrão da imagem de um registro; a chave do armazenamento, que aceita só as cinco variantes;
  - `apagarArquivosRemovidos`, na manutenção diária;
  - `GET /auditoria`, só com `auditoria.ver`, que não dá nome ao alvo `ativo`; o índice `auditoria_alvo_idx`;
  - `saidaDoAtivo`, o público de `ativos.mudaram`.
- **UI:** a `MiniaturaDeAtivo`, que já prefere a imagem do ativo à do modelo; o `VisualDoRegistro.imagemDoAtivo` do `QuickLook`; a `EscolhaDeImagem`; as `Abas`, que só montam a aba aberta. Não há envio de arquivo genérico.
- **Web:**
  - `FichaDoAtivo`, `FormularioDoAtivo`, `CampoDoAtivo` (a escolha do ativo pelo `SeletorDeConta`, com `GET /ativos?busca&limite=20`) e `AtivoNovo`;
  - `FotoDaPessoa` e `ImagemDoModelo`, o padrão da troca de imagem, e `enviarArquivo`, o `PUT` com o corpo cru;
  - `FichaDaPessoa`, com as abas, `HistoricoDaPessoa` e `VerNaAuditoria`; o `registro.ts` da auditoria, que mostra o `campos` aninhado como JSON;
  - `celulas.tsx`, a `TabelaDosAtivos` e a `PreviaDoAtivo`, que só passam a imagem do modelo;
  - os eventos do módulo, em `modulo.ts`.

## Goals / Non-Goals

**Goals:**
- A ficha como o lugar de entender um ativo: os dados, o que está ligado a ele e o que mudou, com a imagem dele.
- Os campos do tipo ativo como o jeito principal de ligar ativos, com a trava, a origem e a importação que os campos já têm, e a ligação livre para o resto.
- Nada de um campo restrito chega a quem não o vê: nem no lado de lá, nem no histórico, nem nos arquivos.

**Non-Goals:**
- **Ligar pelo lado de lá:** a ligação por campo muda no ativo que tem o campo. A ficha do lado de lá mostra e abre, mas não liga.
- **Ligações com posição e tipo:** o rack U a U e a porta do switch ficam para o T2, como campos das capacidades dele.
- **Vários arquivos num campo, a pré-visualização de documentos e a busca dentro deles.**
- **Importar arquivos (P1e) e o 3D do ativo (T1).**
- **O histórico das outras fichas para quem não tem `auditoria.ver`:** a pessoa, o perfil, o grupo e o local continuam como estão.
- **A imagem do ativo na busca (Ctrl+K):** o resultado da busca não tem imagem hoje.

## Decisions

### 1. O campo do tipo ativo: os tipos aceitos e o lado de lá
- **Configuração:** `ConfiguracaoDoCampo` ganha `tipos?: string[]`, os ids dos tipos aceitos, até 20 e sem repetir, e `ladoDeLa?: string`, de 1 a 60 caracteres sem as pontas. `chavesDoTipo('ativo')` passa a ser `['tipos', 'ladoDeLa']`.
- **Quem confere o quê:** o domínio confere a forma; a API confere, nos tipos que entram na configuração, que cada um existe ("Tipo de ativo não encontrado.") e está ativo ("O tipo Nobreak está inativo."). Um tipo aceito que é inativado depois fica na configuração.
- **Na gravação:** `conferirReferencias` lê também o tipo do ativo escolhido e recusa o tipo fora dos aceitos, com a mensagem de `mensagemDosTiposAceitos(nomes)`, no domínio. Como `conferirValoresDoAtivo` pula o valor igual ao guardado, o ativo escolhido antes da mudança dos tipos continua.
- **Na escolha:** a busca do `CampoDoAtivo` manda o filtro `ativo.tipo` `qualquer` com os tipos aceitos, que a lista já entende.
- **No catálogo:** a ficha do campo do tipo ativo ganha os tipos aceitos, numa lista de caixas com os tipos ativos, e o nome do lado de lá.
- **Alternativa:** um campo "lista de ativos", com vários valores. O lado de lá já cobre o "muitos" (os monitores apontam para o computador), e um valor só segue o motor de campos, a trava e a importação como estão.

### 2. O lado de lá
- **Rota:** `GET /ativos/:id/ligados`, com `ativos.ver` no local do ativo, separada da ficha para a aba carregar quando é aberta. Ela devolve:
  - `porCampos`: um grupo por campo do tipo ativo, com o campo (id, rótulo e lado de lá), o total e até 100 ativos, na ordem do nome;
  - `livres`: as ligações livres, cada uma com o id dela e o outro ativo;
  - `permite.ligar`.
- **Consulta:** os campos do tipo ativo ativos; para cada um, os ativos com `valores @> {campo: id}`, juntados aos tipos que usam o campo. Um índice GIN `jsonb_path_ops` em `ativos.valores` atende a consulta.
- **Acesso:**
  - cada ativo ligado passa por `podeEm('ativos.ver')` no local dele, e o de fora do acesso volta só como `{ foraDoAcesso: true }`, sem id;
  - num campo restrito, o ativo que aponta entra só quando a conta tem `ativos.restritos` no local dele.
- **O ativo ligado:** a forma de `AtivoNaLista` sem os valores, com a imagem do ativo e a do modelo.

### 3. A ligação livre
- **Tabela `ligacoes_de_ativos`,** criada com `orgScoped()`:
  - `ativo_a` e `ativo_b`, com as chaves estrangeiras compostas para `ativos`, e `CHECK (ativo_a < ativo_b)`: o par vai sempre na mesma ordem;
  - `UNIQUE (org_id, ativo_a, ativo_b)`, que também atende a busca pelo `ativo_a`, e o índice `(org_id, ativo_b)`;
  - `criado_por`, com a chave estrangeira para `contas`, nulo como o `enviado_por` dos arquivos, e `criado_em`.
- **Domínio:** `parDaLigacao(x, y)` devolve o par em ordem ou a recusa "Um ativo não se liga a ele mesmo."; `LIMITE_DE_LIGACOES = 100`.
- **Rotas:**
  - `POST /ativos/:id/ligacoes`, com `{ outroId }`: devolve 201 com a ligação;
  - `DELETE /ativos/:id/ligacoes/:ligacaoId`: devolve 204.
- **Permissão e concorrência:** `ativos.editar` e `exigirEm` nos locais dos dois ativos. As duas linhas são travadas `FOR UPDATE` na ordem dos ids, e as ligações dos dois são contadas depois disso: duas ligações juntas não passam do limite nem travam uma à outra.
- **Recusas:** o outro que não existe, 404 "Ativo não encontrado."; um dos dois inativo, 409; o par repetido, 409 pela violação da unicidade; o limite, deste ativo ou do escolhido, 409; o ativo com ele mesmo, 400.
- **Desfazer:** a linha sai da tabela. A ligação é uma relação, e não um registro de negócio, e o histórico dela fica na auditoria dos dois ativos.
- **Alternativa:** marcar a ligação como desfeita, como a inativação. A ficha só mostraria as de agora, e a tabela guardaria o mesmo que a auditoria já guarda.
- **Auditoria:** `ativo.ligado` e `ativo.desligado`, um registro em cada ativo, com `dados: { ligacaoId, outro: { id, rotulo } }`. Cada registro manda o `ativos.mudaram` do ativo dele, pelo `saidaDoAtivo`.

### 4. A imagem do ativo
- **Banco:** `ativos.imagem_id`, com a chave estrangeira composta para `arquivos`, como `modelos.imagem_id`.
- **Rotas,** no padrão de `rotasDaImagemDoModelo`, com `trocarImagem`, `tirarImagem` e `entregarImagem`:
  - `PUT /ativos/:id/imagem` e `DELETE /ativos/:id/imagem`, com `ativos.editar` no local do ativo;
  - `GET /ativos/:id/imagem/:arquivo/:tamanho`, com `ativos.ver` no local do ativo.
- **Auditoria:** `imagem-do-ativo.trocada` e `imagem-do-ativo.removida`, com o alvo no ativo e o `ativos.mudaram`.
- **Leitura:** `AtivoNaLista.imagem: { id } | null`, na lista, na ficha e nos ligados.
- **Web:** `imagemDoAtivo(ativo, lado)` dá o endereço, passado à `MiniaturaDeAtivo` e à prévia, que já preferem a imagem do ativo. Na ficha, a imagem fica no alto da aba Dados, pela `EscolhaDeImagem`, e no cabeçalho.

### 5. Os tipos arquivo e imagem
- **Domínio:**
  - `TIPOS_DE_CAMPO` ganha `arquivo` e `imagem`, com os rótulos "Arquivo" e "Imagem";
  - `lerValor` lê o identificador, como as referências, para o valor guardado se ler igual;
  - `conferirValoresDoAtivo` recusa, antes de ler, qualquer pedido para esses tipos, com "Envie o arquivo pela ficha do ativo.";
  - `mostrarValor` mostra o nome do arquivo pelo `nomeDoRegistro`;
  - `POR_TIPO`: sem filtro além de vazio e preenchido, sem ordem;
  - a conferência dos campos do tipo recusa a obrigatoriedade, com a mensagem da spec catalogo-de-ativos.
- **Banco:** `TIPOS_DE_CAMPO_NO_BANCO` e o CHECK com os dois tipos; `arquivos.nome`, de 1 a 200 caracteres, nulo nos arquivos que não guardam nome, como a foto da pessoa.
- **O documento:**
  - `conferirDocumento(conteudo, nome)`, em `apps/api/src/arquivos/documentos.ts`, devolve o tipo e a extensão pelo conteúdo:
    - o PDF pelo `%PDF-`, e as imagens pela assinatura;
    - os ZIP pelo diretório central, sem descompactar: o `[Content_Types].xml` com `word/`, `xl/` ou `ppt/` é do Office; o `mimetype` do ODF diz o documento, a planilha ou a apresentação; o resto é ZIP;
    - o CFB dos formatos antigos do Office pelos nomes dos fluxos: `WordDocument`, `Workbook` ou `Book` e `PowerPoint Document`. Outro CFB, como um instalador, é recusado;
    - o texto sem byte nulo, em UTF-8 válido ou só com os caracteres imprimíveis do Windows-1252: `text/csv` com a extensão `.csv`, e `text/plain` nos outros;
  - `nomeDoArquivo(original, extensao)` tira o caminho e os caracteres de controle, corta em 200 caracteres e garante a extensão do tipo;
  - grava só a variante `completa`, que a chave do armazenamento já aceita, e a manutenção diária a apaga como as outras.
- **Rotas:**
  - `PUT /ativos/:id/campos/:campoId/arquivo?nome=`, com o corpo cru. O tipo do campo decide: a imagem passa pelo `tratarImagem` (10 MB), e o arquivo, pelo `conferirDocumento` (25 MB). Um plugin próprio aceita `application/octet-stream` até 25 MiB;
  - `DELETE /ativos/:id/campos/:campoId/arquivo`;
  - `GET /ativos/:id/campos/:campoId/arquivo/:arquivo/:variante`: o documento só na `completa`, como anexo (`Content-Disposition: attachment; filename*=UTF-8''…`), e a imagem como as outras.
- **Permissões:** mudar pede `ativos.editar` no local do ativo e, no campo restrito, `ativos.restritos`. Entregar pede `ativos.ver` e, no restrito, `ativos.restritos`. O arquivo pedido precisa ser o valor atual do campo, senão 404 "Arquivo não encontrado.".
- **Gravação,** como `trocarImagem`:
  1. o conteúdo é conferido e gravado no armazenamento fora da transação;
  2. com a linha do ativo travada: o registro em `arquivos` com o nome, o valor do campo no JSONB, o estado pelo `registrarGravacao` (manual, o autor e o momento), o anterior marcado como removido, a auditoria `ativo.alterado` com o campo antes → depois pelos nomes, e o `ativos.mudaram`;
  3. a trava não impede, porque a gravação é manual.
- **Leitura:** `referencias.arquivos: Record<id, { nome, bytes, tipo }>` na ficha e na lista, das colunas pedidas, por `referenciasDos`.
- **Web:** a célula mostra o nome do arquivo e a miniatura da imagem; o texto da célula, que vai para copiar, o resumo e a prévia, é o nome nos dois.
- **Alternativa:** guardar no JSONB o nome e o tamanho junto do id. O nome ficaria em dois lugares, e o registro do arquivo já é a fonte dele.

### 6. O histórico do ativo
- **Rota:** `GET /ativos/:id/historico?cursor&limite`, com `ativos.ver` no local do ativo. Ela lê a `auditoria` pelo alvo do ativo, `momento desc, id desc`, pelo índice `auditoria_alvo_idx`, nas ações do ativo: `ativo.criado`, `ativo.alterado`, `ativo.inativado`, `ativo.reativado`, `imagem-do-ativo.*`, `ativo.ligado` e `ativo.desligado`.
- **Resposta:** cada item com o id, o momento, a ação e o rótulo dela, quem fez pelo nome atual, as mudanças `{ campo, antes, depois }`, as travas ligadas e desligadas e, nas ligações, o outro ativo. O outro aparece pelo nome atual, ou como "Ativo fora do seu acesso".
- **As mudanças:** `mudancasDoAtivo(antes, depois)`, no domínio, compara o `campos`, o `travados`, o modelo e a situação das visões gravadas.
- **Os restritos:**
  - `visaoDoAtivo` passa a gravar `restritos: string[]`, os rótulos dos campos restritos que estão na visão;
  - nos registros de antes do P1d, sem a lista, valem os rótulos dos campos restritos de hoje e os rótulos antigos deles, lidos na auditoria do catálogo;
  - sem `ativos.restritos` no local do ativo, essas mudanças saem do item, e o item de edição que fica sem nenhuma mudança sai da página. A página pode vir menor que o limite, e o cursor continua.
- **Alternativa:** guardar na auditoria a chave do campo junto do rótulo. Seria mais exato, mas mudaria a forma dos registros que a consulta da auditoria já mostra.
- **Auditoria:** `GET /auditoria` passa a dar nome ao alvo `ativo`, pelo `rotuloDoAtivo`, para o filtro de "Ver na auditoria" mostrar o ativo.

### 7. A ficha com as abas
- **Endereço:** a rota `/ativos/$id` ganha `validateSearch` com `aba`: `dados`, o padrão, que fica fora do endereço, `ligados` ou `historico`. As `Abas` ficam controladas, e a troca de aba substitui a entrada do histórico.
- **Abas:**
  - **Dados:** a imagem do ativo e o formulário;
  - **Ligados:** a contagem no título;
  - **Histórico:** com "Carregar mais" e "Ver na auditoria".
- **O formulário não se perde:** as `Abas` só montam a aba aberta, e trocar de aba perderia o que foi digitado. A UI ganha `manterMontadas`, com as abas que ficam montadas escondidas, pelo `shouldForceMount` do React Aria. A ficha mantém a Dados.
- **Consultas e eventos:**
  - as chaves são `['ativo', id]`, `['ativo', id, 'historico']` e `['ligados', id]`;
  - `ativos.mudaram` invalida `['ativos']`, `['ativo', alvo]`, que já cobre o histórico, e `['ligados']`, porque a mudança de um ativo muda as listas de ligados em que ele aparece.
- **A auditoria na web:** `registro.ts` ganha o alvo `ativo` e mostra o `campos` aninhado campo a campo ("Local: A → B"), e não como JSON.

### 8. A UI
- **`EscolhaDeArquivo`:**
  - sem arquivo: "Enviar arquivo", pelo `FileTrigger` e pelo `DropZone`, com os tipos aceitos;
  - com arquivo: o nome, o tamanho, "Baixar", "Trocar" e "Remover", com a confirmação;
  - o progresso, a recusa e a regra "PDF, imagem, documento, planilha, apresentação, texto, CSV ou ZIP, até 25 MB.".
- **`formatarTamanho(bytes)`:** "240 KB" e "1,2 MB", em pt-BR.
- **`ListaDoHistorico`:** os itens com a ação, quem fez, quando e as mudanças "Campo: antes → depois", com "—" no vazio, as travas e um detalhe livre, e "Carregar mais" e o vazio. Ela não sabe de ativos e serve depois à pessoa e aos outros registros.
- **`Abas`** ganha `manterMontadas`.
- **A `EscolhaDeImagem`** já serve à imagem do ativo e ao campo de imagem.

### 9. A ordem do trabalho
Todas as tarefas ficam numa sessão só, sem subagentes, na ordem das dependências: a spec mestre e o domínio, o banco, a API com o contrato de cada rota, a UI, a web, as pontas a ponta e o fechamento. Cada rota entra com o esquema, o corpo e os testes na mesma tarefa, e o cliente é gerado de novo nela. O PR para a `main` sai no fim.

## Risks / Trade-offs

- **[A busca do lado de lá varre o JSONB]** → o índice GIN `jsonb_path_ops` em `ativos.valores` atende o `@>`. Um teste de integração mede o p95 da aba Ligados com 10 mil ativos, abaixo de 300 ms.
- **[Um documento válido recusado pela conferência]** → os testes usam arquivos de exemplo pequenos de cada formato, com o Office e o LibreOffice, e um CSV em Windows-1252. A recusa diz os formatos aceitos.
- **[Um executável dentro de um ZIP]** → o ZIP não é aberto, e o arquivo sai sempre como anexo, com o tipo conferido e `nosniff`. Fica dito na spec que o ZIP é aceito como está.
- **[Os registros de antes do P1d com um restrito renomeado]** → os rótulos antigos vêm da auditoria do catálogo. Um campo que só passou a ser restrito depois esconde também as mudanças de antes.
- **[A volta à versão anterior depois de criar um campo de arquivo ou de imagem]** → a versão anterior não conhece os tipos, e a leitura dos campos falharia nela. O runbook diz que a volta só vale antes do primeiro campo desses.
- **[25 MB na memória por envio]** → o corpo é lido inteiro, como o das imagens. O servidor interno tem poucos envios ao mesmo tempo, e o limite do corpo barra o que passa.

## Migration Plan

- **Migrations:** a 0021, com o CHECK de `campos.tipo` com os dois tipos, junto com os tipos no domínio; a 0022, com `arquivos.nome`, `ativos.imagem_id` com a chave estrangeira, a tabela `ligacoes_de_ativos`, com `app.isolar_por_organizacao`, e o índice GIN em `ativos.valores`. Elas só acrescentam.
- **Auditoria:** as ações novas entram no mapa, e `visaoDoAtivo` grava `restritos` daqui em diante. Os registros antigos ficam como estão.
- **Volta:** a versão anterior ignora a tabela, as colunas e o índice novos. Com um campo de arquivo ou de imagem criado, a volta deixa de valer (Risks).
- **Permissões:** nenhuma nova.
