## 1. Spec mestre e domínio

- [x] 1.1 Atualizar a spec mestre: a seção 5.2, decisão 3, com as ligações pelos campos do tipo ativo (os tipos aceitos e o lado de lá) e a ligação livre; a seção 5.3, com o que o arquivo aceita, os 25 MB, o envio depois do cadastro e a obrigatoriedade recusada; a seção 7.9, com a imagem do ativo na tabela, na prévia e nos ligados. Verificar: o teste do mapa passa, com as seções citadas ainda com título.
- [x] 1.2 Domínio, os tipos arquivo e imagem, com o teste antes: `TIPOS_DE_CAMPO` e os rótulos; `lerValor` com o identificador; `mostrarValor` pelo nome; a recusa "Envie o arquivo pela ficha do ativo." em `conferirValoresDoAtivo`; `POR_TIPO`; a obrigatoriedade recusada nos campos do tipo, com a mensagem da spec; e, para o banco aceitar os dois tipos, `TIPOS_DE_CAMPO_NO_BANCO` e a migration 0021, com o CHECK do tipo do campo. Verificar: os testes do domínio passam, com a lista e os rótulos conferidos em `valores.test.ts`.
- [x] 1.3 Domínio, o campo do tipo ativo, com o teste antes: `tipos` e `ladoDeLa` em `ConfiguracaoDoCampo`, `chavesDoTipo`, as recusas da forma em `conferirConfiguracao` e `mensagemDosTiposAceitos(nomes)`, com um tipo e com vários. Verificar: os testes do domínio passam.
- [x] 1.4 Domínio, as ligações e o histórico, com o teste antes: `parDaLigacao` e `LIMITE_DE_LIGACOES`; `mudancasDoAtivo(antes, depois, { restritos, verRestritos })`, com os campos, as travas, o modelo e a situação, e o item que fica vazio sem os restritos; as ações `ativo.ligado`, `ativo.desligado`, `imagem-do-ativo.trocada` e `imagem-do-ativo.removida` na auditoria e no `EVENTO_DA_ACAO`. Verificar: os testes do domínio passam.

## 2. Banco

- [x] 2.1 A migration 0022, com o teste de integração antes: `arquivos.nome`; `ativos.imagem_id` com a chave estrangeira composta; a tabela `ligacoes_de_ativos` isolada pela organização, com o `CHECK (ativo_a < ativo_b)` e a unicidade do par; o índice GIN em `ativos.valores`; as exportações. Verificar: `pnpm --filter @grafite/db test:integration` passa, com o teste-guarda do isolamento e o das chaves compostas, e o teste de paridade da API (`listas.test.ts`) também.

## 3. API

Cada tarefa entra com os esquemas das rotas dela e o cliente gerado de novo (`pnpm contrato:gerar`).

- [x] 3.1 A imagem do ativo, com o teste de integração antes: `PUT`, `DELETE` e `GET` de `/ativos/:id/imagem`, pelo padrão da imagem do modelo, com a auditoria e o `ativos.mudaram`; `AtivoNaLista.imagem` na lista e na ficha. Verificar: a troca, a remoção com o 404 do endereço antigo, o 403 fora do acesso, a auditoria e o evento, nos testes de integração.
- [x] 3.2 O campo do tipo ativo, com o teste antes: os esquemas com `tipos` e `ladoDeLa`; a API confere que os tipos da configuração existem e estão ativos, e a gravação recusa o ativo de um tipo que não é aceito, mantendo o valor já guardado. Verificar: os testes de integração do campo e da gravação.
- [x] 3.3 A conferência dos documentos, com o teste antes: `conferirDocumento` e `nomeDoArquivo`, com arquivos de exemplo pequenos de cada formato aceito (PDF, imagens, DOCX, XLSX, PPTX, ODT, ODS, ODP, DOC, XLS, PPT, TXT, CSV em UTF-8 e em Windows-1252, ZIP), as recusas (executável, CFB de instalador, arquivo vazio, mais de 25 MB) e o nome com outra extensão. Verificar: os testes unitários passam.
- [x] 3.4 Os arquivos dos campos, com o teste de integração antes: o envio, a troca, a remoção e a entrega de `/ativos/:id/campos/:campoId/arquivo`, com o plugin do corpo cru até 25 MiB, o estado do campo, a auditoria pelos nomes e o evento; `referencias.arquivos`; os restritos. Verificar: o anexo com o nome original e o `nosniff`, a imagem do campo com as miniaturas, o 404 do anterior, o 403 do restrito e o documento removido apagado pela manutenção diária, nos testes.
- [x] 3.5 As ligações livres, com o teste de integração antes: `POST` e `DELETE` de `/ativos/:id/ligacoes`, com as duas linhas travadas, o limite, as recusas, a auditoria nos dois ativos e os dois eventos. Verificar: duas ligações ao mesmo tempo sem passar do limite, o par repetido nos dois sentidos e o 403 com um dos locais fora do acesso, nos testes.
- [x] 3.6 O lado de lá, com o teste de integração antes: `GET /ativos/:id/ligados`, com um grupo por campo, os livres, o fora do acesso sem id, os restritos e o campo tirado do tipo. Verificar: os testes de integração e o p95 abaixo de 300 ms com 10 mil ativos.
- [x] 3.7 O histórico, com o teste de integração antes: `visaoDoAtivo` com `restritos`; `GET /ativos/:id/historico`, com as mudanças pelo `mudancasDoAtivo`, os restritos escondidos nos registros novos e nos antigos (pelos rótulos antigos, da auditoria do catálogo), as ligações com o outro ativo e a paginação; o nome do alvo `ativo` em `GET /auditoria`. Verificar: os testes de integração.

## 4. UI

- [x] 4.1 `EscolhaDeArquivo` e `formatarTamanho`, com as histórias antes: o envio, o nome e o tamanho, "Baixar", "Trocar", "Remover" com a confirmação, o progresso, a recusa e a regra dos formatos. Verificar: `pnpm test:stories` passa, e a captura nova entra na regressão visual.
- [x] 4.2 `ListaDoHistorico`, com as histórias antes: a ação, quem fez, quando, as mudanças "Campo: antes → depois" com "—" no vazio, as travas, o detalhe livre, "Carregar mais" e o vazio. Verificar: `pnpm test:stories` passa, e a captura nova entra na regressão visual.
- [x] 4.3 `manterMontadas` nas `Abas`, com a história antes: a aba mantida continua montada, escondida, e guarda o que foi digitado. Verificar: `pnpm test:stories` passa.

## 5. Web

- [x] 5.1 A ficha com as abas, com o teste antes: `aba` no endereço da `/ativos/$id`, as `Abas` controladas com a Dados montada, o cabeçalho com a imagem e as chaves `['ativo', id, 'historico']` e `['ligados', id]` nos eventos. Verificar: os testes da ficha (a aba no endereço, o que foi digitado continua depois de trocar de aba e o evento que atualiza os ligados).
- [x] 5.2 A imagem do ativo, com o teste antes: `imagemDoAtivo`, a `EscolhaDeImagem` no alto da aba Dados, com a confirmação da remoção, e a imagem do ativo na tabela, na prévia e nos ligados. Verificar: os testes conferem os endereços das imagens e os retornos.
- [x] 5.3 Os campos de arquivo e de imagem no formulário, com o teste antes: "Envie depois de cadastrar o ativo." no cadastro, a `EscolhaDeArquivo` e a `EscolhaDeImagem` de cada campo na ficha, com os retornos e a confirmação da remoção, e a escolha do ativo só com os tipos aceitos do campo. Verificar: os testes do formulário e da ficha.
- [x] 5.4 A tabela com os tipos novos, com o teste antes: a célula com o nome do arquivo e a miniatura da imagem, o texto da célula com o nome, e os filtros "Está vazio" e "Está preenchido". Verificar: os testes da tabela.
- [x] 5.5 O catálogo, com o teste antes: na ficha do campo do tipo ativo, os tipos aceitos e o nome do lado de lá; na ficha do tipo, a recusa da obrigatoriedade de arquivo e imagem. Verificar: os testes do catálogo.
- [x] 5.6 A aba Ligados, com o teste antes: os grupos por campo com o lado de lá, o "Ligado a", "Ligar a outro ativo" com a busca, "Desfazer ligação" com a confirmação, o fora do acesso, "Mostrando 100 de <total>." e o vazio. Verificar: os testes da aba.
- [x] 5.7 A aba Histórico, com o teste antes: a `ListaDoHistorico` com as mudanças, "Carregar mais" e "Ver na auditoria"; na auditoria, o alvo `ativo` e o `campos` mostrado campo a campo. Verificar: os testes do histórico e da auditoria.

## 6. Ponta a ponta

- [x] 6.1 Estender a ponta a ponta com a API simulada: a simulação ganha a imagem do ativo, os arquivos, as ligações, os ligados e o histórico, com a da administração registrada antes da dos ativos para a auditoria; os cenários: ligar pelo campo e ver o lado de lá, ligar e desfazer a ligação livre, enviar e baixar um PDF, trocar a imagem do ativo e vê-la na tabela e na prévia, o histórico com o local mudado e a aba no endereço. Verificar: `pnpm test:e2e` passa.
- [x] 6.2 Estender a ponta a ponta da pilha, com as duas contas em dois navegadores: a ligação livre feita por uma aparece na ficha aberta da outra pelo evento; o histórico de um campo restrito mostra a mudança só a quem vê os restritos; o PDF enviado por uma é baixado pela outra com o nome original; a imagem do ativo aparece na tabela da outra. Verificar: `pnpm test:e2e:pilha` passa.

## 7. Fechamento

- [x] 7.1 Documentação: os termos novos e a change no mapa (a capacidade `ligacoes-de-ativos` entra no mapa no arquivamento, junto com a sincronização das specs, quando a pasta passa a existir); o Purpose de `cadastro-de-ativos` sem "a lista simples" e "a ficha básica"; o runbook com a volta que só vale antes do primeiro campo de arquivo ou de imagem. Verificar: o teste do mapa passa.
- [x] 7.2 Conferir `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:stories`, `pnpm test:e2e`, `pnpm test:e2e:pilha` e `pnpm test:visual` verdes; `tokens:verificar`, `marca:verificar`, `contrato:verificar` e `fila:verificar` em dia; `openspec validate p1d-ficha-e-relacionamentos --strict` sem erros. Verificar: os comandos passam, e o CI fica verde no PR para a `main`.
