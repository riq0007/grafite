## Context

A motivação está em `proposal.md`, e os requisitos, nas specs desta change. As decisões de produto vêm do brainstorming do P1 com o usuário e da spec mestre:
- **A divisão do P1:** o P1b é o cadastro, a lista simples e a ficha básica; as colunas e as visões ficam no P1c, a ficha completa no P1d, a importação no P1e e a etiqueta no P1f.
- **Valores:** num JSONB pelo id do campo, com a origem, o momento, o autor e a trava num segundo JSONB (spec mestre, seção 5.2, decisão 4).
- **Dados administrativos:** comuns a todo ativo, como o `AssetProfile` do PMG, e não uma capacidade (seção 5.4).
- **Telas aprovadas:** a lista com "Ativo | Patrimônio | Local | Situação", o nome com o tipo embaixo e a situação de uso em texto ("Em uso", "Em manutenção"), e a busca por "nome, patrimônio, IP…" (`docs/referencias/brainstorm/02-casca-ajustes.html`).
- **Módulos por organização:** chegam com o primeiro módulo opcional, o Ativos (seção 4.4).

Pontos de partida no código, depois do P1a:
- **Domínio:** o motor de campos (`lerValor`, `mostrarValor`), as `CAPACIDADES` com as chaves fixas dos campos, `conferirCamposDoTipo`, o acesso com escopo (`pode`, `podeEm`, `alcance`) e os eventos com o público dado por quem grava, como `pessoas.mudaram`.
- **Banco:** `tipos_de_ativo`, `campos`, `campos_do_tipo` e `modelos`, isoladas pela organização; as pessoas e os locais, com o `org_id` nas referências; a coluna `preferencias` das organizações, dos padrões do F2c.
- **API:** as rotas das pessoas como modelo do escopo pelo local (`exigirEm`, `alcance`, `permite` por registro, o evento para os locais de antes e de depois) e da lista paginada com busca; `exigirLocalAtivo`; o catálogo do P1a.
- **Web:** o módulo Ativos com o catálogo; a lista das pessoas como modelo da lista com filtros no endereço; o `SeletorDeLocal`; o formulário do campo (`FormularioDoCampo`) como modelo da leitura com o motor antes do envio.
- **UI:** `CampoDeTexto`, `AreaDeTexto`, `CampoDeData`, `Selecao`, `GrupoDeCheckboxes`, `BuscaComSugestoes`, `Interruptor`, `MiniaturaDeAtivo`, `Dica` e `BotaoDeIcone`.

## Goals / Non-Goals

**Goals:**
- Cadastrar, editar, inativar e reativar ativos com os campos comuns e os do tipo, com as regras de cada tipo de campo iguais na API e na tela.
- Cada valor dizer de onde veio, quando e por quem, e a trava proteger o que foi conferido à mão, antes de a importação e a coleta existirem.
- O acesso pelo local do ativo, como o das pessoas pelo local de trabalho.
- Ligar e desligar o Ativos por organização, de ponta a ponta.

**Non-Goals:**
- **Tabela e visões:** colunas configuráveis, visões, ordenação pelas colunas, Quick Look e resumo ao parar o mouse ficam no P1c.
- **Ficha completa:** o histórico na ficha, os ativos ligados entre si, a imagem própria do ativo e os tipos de campo arquivo e imagem ficam no P1d.
- **Importação e coleta:** a planilha fica no P1e, e a coleta, no P2. Esta change só guarda a origem e as travas que elas vão respeitar.
- **Fornecedores e contratos como cadastros:** o fornecedor e o contrato são texto até o P4 e o A2.
- **Mudar o tipo de um ativo:** o tipo é fixo, como o do modelo. Um ativo cadastrado com o tipo errado é inativado e cadastrado de novo.
- **Motivo da inativação:** a inativação não pede motivo; a auditoria guarda quem e quando.

## Decisions

### 1. A tabela `ativos`
- **Escolha:** uma tabela criada com `orgScoped()`, isolada pela organização:
  - **estrutura:** `tipo_id`, `modelo_id`, `situacao` (`ativo` ou `inativo`), `criado_em` e `atualizado_em`;
  - **campos comuns em colunas:** `nome`, `patrimonio`, `patrimonio_normalizado`, `serie`, `hostname`, `uso`, `local_id` e `responsavel_id`;
  - **`valores jsonb`:** os outros campos, pela chave: os administrativos (`ativo.*`), os da organização (pelo id) e os das capacidades (`hardware.*`, `software.*`);
  - **`estado jsonb`:** o estado de cada campo, pela mesma chave, inclusive os das colunas e o do modelo (`ativo.modelo`);
  - **`busca`:** o texto normalizado do nome, do patrimônio, da série, do hostname e dos valores de texto, IP, MAC, URL e licença que não são restritos.
- **Referências, todas com o `org_id`:**
  - o tipo;
  - o modelo, por `(org_id, modelo_id, tipo_id)` contra um `unique (org_id, id, tipo_id)` novo em `modelos`: o banco garante que o modelo é do tipo do ativo;
  - o local e o responsável.
- **Conferências:** o `uso` e a `situacao` contra as listas do domínio; `valores` e `estado` como objetos de até 256 KB; o patrimônio único na organização pela forma normalizada, com o índice parcial onde ele existe.
- **Índices:** `(org_id, id)` já vem do `orgScoped()`; mais `(org_id, local_id)`, `(org_id, tipo_id)` e `(org_id, situacao, uso)`.
- **Por quê as colunas:** o que o banco precisa garantir ou filtrar (a unicidade do patrimônio, as referências, o escopo pelo local, os filtros da lista) fica em colunas. O resto fica no JSONB, como os campos da organização, e a API e a tela tratam os dois do mesmo jeito, pela chave.
- **Alternativa:** tudo no JSONB, com colunas derivadas para as restrições. Seriam duas fontes do mesmo valor, e as referências ao local e à pessoa ficariam sem chave estrangeira.

### 2. Os campos comuns no domínio
- **Escolha:** `CAMPOS_DO_ATIVO`, no `packages/domain`, define os 17 campos comuns da spec cadastro-de-ativos:
  - cada um com a chave fixa (`ativo.nome`, `ativo.patrimonio`, `ativo.local`…), o rótulo, o tipo do motor de campos, a configuração, o grupo (Identificação, Uso ou Administrativo) e, nos que têm, a coluna;
  - as listas fixas `USOS_DO_ATIVO` (`em-uso`, `em-estoque`, `em-manutencao`) e `PROPRIEDADES_DO_ATIVO` (`proprio`, `alugado`, `comodato`), no formato das opções do motor, com o id estável;
  - todos com a escrita automática: a importação e a coleta podem gravar, salvo trava.
- **O nome que o ativo mostra:** `rotuloDoAtivo({ nome, modelo, tipo })`: o nome, ou o fabricante e o modelo, ou o nome do tipo.
- **Por quê:** a mesma lista monta o formulário, confere a gravação na API e vai mapear as colunas da planilha no P1e.

### 3. Os campos de um ativo
- **Escolha:** `camposDoAtivo({ tipo, campos, capacidades })` devolve a lista ordenada das definições que o ativo usa, cada uma com a chave, o rótulo, o tipo de campo, a configuração, o grupo, a obrigatoriedade, a marca de restrito, a escrita e a origem da definição (comum, da organização ou da capacidade):
  - os comuns de Identificação e de Uso;
  - os da organização que o tipo usa e estão ativos, na ordem do tipo, pelos grupos deles, e os sem grupo em "Outros";
  - os das capacidades ligadas, um grupo por capacidade;
  - os comuns Administrativos.
- **Uso:** a API confere a gravação por ela, e a tela monta o formulário por ela. As duas leem o tipo, os campos e as capacidades do catálogo.

### 4. A conferência dos valores
- **Escolha:** `conferirValoresDoAtivo({ definicoes, atuais, pedidos, cadastro })`, no domínio, devolve os valores lidos pelo motor ou as recusas pela chave do campo:
  - **chave que o ativo não usa:** "Este campo não é do tipo do ativo.";
  - **campo da organização inativo:** "O campo <rótulo> está inativo.", como no tipo;
  - **obrigatório:** vazio no cadastro, ou esvaziado na edição, é "Preencha este campo.";
  - **valor:** a recusa do `lerValor`.
- **Só o que mudou:** na edição, só as chaves pedidas são conferidas. Um valor guardado que deixou de valer, como uma opção inativada, fica até alguém mudá-lo. Um valor pedido igual ao guardado não conta como mudança.
- **Quem confere o resto:** a API confere o que depende do banco: a unicidade do patrimônio, as referências ativas e o escopo.

### 5. O estado e as travas
- **Escolha:** `estado` guarda, por chave, `{ origem, momento, autorId, trava }`:
  - a origem é `manual`, `planilha`, `coleta` ou `api`;
  - o momento e o autor são os da última gravação do valor;
  - travar ou destravar não muda o momento nem o autor do valor.
- **Regras, em funções puras do domínio:**
  - `registrarGravacao(estado, chaves, { origem, momento, autorId })` atualiza as chaves gravadas e mantém a trava de cada uma;
  - `aplicarTravas(estado, travas)` liga e desliga as travas pedidas, com ou sem valor;
  - `podeGravar(definicao, estadoDoCampo, origem)`: a gravação manual sempre pode; a de outra origem não pode num campo travado nem num campo só manual. A importação e a coleta vão usá-la.
- **Na tela:** a ficha mostra a origem, o autor e o momento abaixo do campo, e a trava ao lado do rótulo. A trava faz parte do formulário e é gravada com "Salvar alterações".

### 6. O acesso pelo local do ativo
- **Escolha:** como as pessoas pelo local de trabalho:
  - **lista:** `alcance(acesso, 'ativos.ver', arvore)` filtra a consulta; o ativo sem local só entra com a organização inteira;
  - **ficha e escrita:** `exigirEm` com o local do ativo; a mudança de local confere o de antes e o de depois;
  - **cadastro:** `exigirEm` com o local pedido;
  - **`permite`:** cada ativo diz se a conta pode editar e se vê e edita os restritos.
- **Restritos:**
  - sem `ativos.restritos` no local, a API tira da resposta o valor e o estado dos campos restritos;
  - gravar ou travar um campo restrito exige `ativos.restritos` e `ativos.editar`, e a falta dá 403;
  - a `busca` nunca leva valor restrito, e por isso a lista não acha um ativo pelo valor de um campo restrito.

### 7. As referências
- **Escolha:** a pessoa, o local e o ativo ficam guardados pelo id, como o motor já lê.
- **Na escrita:** só a referência que mudou é conferida, com a mensagem de cada uma:
  - o local existe e está ativo, com a mensagem de `exigirLocalAtivo`;
  - a pessoa existe e está ativa;
  - o ativo existe, está ativo e não é o próprio.
- **Na ficha:** a resposta traz `referencias`, com o caminho de cada local, o nome atual de cada pessoa e o nome de cada ativo que a conta pode ver; os outros ativos vêm como "Ativo fora do seu acesso".

### 8. A API
- **Rotas:**
  - `GET /ativos`, com `ativos.ver`: `busca`, `tipo`, `local` (com o ramo), `situacao` (`ativos`, `inativos` ou `todos`), `uso`, `cursor` e `limite`;
  - `GET /ativos/:id`, com `ativos.ver`: a ficha, com `valores`, `estado` (com o nome do autor), `referencias` e `permite`;
  - `POST /ativos` e `PATCH /ativos/:id`, com `ativos.editar`: o tipo (só no cadastro), o modelo, os `valores` pela chave e as `travas`;
  - `POST /ativos/:id/inativacao` e `POST /ativos/:id/reativacao`, com `ativos.editar`.
- **Lista:**
  - os cadastrados por último primeiro, pelo id em uuidv7, com o cursor nele. A ordenação pelas colunas fica no P1c;
  - a busca casa cada palavra com a `busca` do ativo ou com a do modelo, pela junção;
  - cada item traz o nome do ativo, o tipo, o modelo com a imagem, o patrimônio, o local com o caminho, o responsável, o uso, a situação e `permite`.
- **Escrita:**
  - a edição trava a linha do ativo;
  - o patrimônio repetido é 409 em `ativo.patrimonio`;
  - as recusas de campo vêm pela chave do campo, como `valores.<chave>`;
  - a resposta é a ficha.
- **Contrato:** os esquemas `AtivoNaLista`, `ListaDeAtivos`, `FichaDoAtivo`, `PedidoDeAtivo` e `PedidoDeAlteracaoDoAtivo`, gerados no cliente.

### 9. Auditoria e eventos
- **Ações:** `ativo.criado`, `ativo.alterado`, `ativo.inativado`, `ativo.reativado`, `modulo.ligado` e `modulo.desligado`.
- **O antes → depois do ativo:** pelo rótulo de cada campo e pelo valor mostrado (`mostrarValor`, com os nomes das referências), o modelo, o tipo, a situação e as travas ligadas. Os restritos entram como os outros: a auditoria é de quem tem `auditoria.ver`, na organização inteira.
- **Eventos:**
  - `ativos.mudaram`, com o público dado por quem grava, como `pessoas.mudaram`: quem tem `ativos.ver` no local de antes ou no de depois;
  - `modulos.mudaram`, para toda sessão.
- **Na web:**
  - `ativos.mudaram` invalida `['ativos']` e `['ativo', id]`;
  - `catalogo.mudou`, `locais.mudaram` e `pessoas.mudaram` também invalidam `['ativos']` e `['ativo']`, pelos nomes que a lista e a ficha mostram;
  - `modulos.mudaram` valida a sessão de novo.

### 10. Os nomes das pessoas
- **Escolha:** `GET /pessoas/nomes?busca=`, `referencia`: até 20 pessoas ativas, com o id e o nome, em ordem alfabética.
- **Por quê:** quem edita ativos escolhe o responsável sem ver a Administração. Só o nome sai, como os locais saem só com o caminho.
- **Alternativa:** exigir `pessoas.ver` para escolher o responsável. O técnico de campo, que cadastra o computador, não veria as pessoas.

### 11. Os rótulos reservados
- **Escolha:** `rotuloReservado(rotulo)`, no domínio, diz se o rótulo é de um campo comum ou de um campo de capacidade, sem diferenciar acento e maiúsculas. `POST` e `PATCH /campos` recusam em 400, no rótulo.
- **Os exemplos do P1a:** os testes que usam "Propriedade" como campo da organização passam a usar "Criticidade", com as opções Alta, Média e Baixa.

### 12. Os módulos opcionais
- **Domínio:** `MODULOS_OPCIONAIS`, com o id, o nome e a descrição. Só o `ativos`, por enquanto.
- **Banco:** `organizacoes.modulos_desligados text[]`, vazio por padrão: um módulo novo começa ligado em toda organização.
- **API:**
  - `GET /organizacao/modulos`, com `organizacao.editar`, lista os opcionais com a situação;
  - `PUT /organizacao/modulos/:id`, com `organizacao.editar`, liga ou desliga, com a auditoria e o evento;
  - o estado da sessão traz `modulosDesligados` na organização;
  - as rotas do catálogo e dos ativos ficam num escopo próprio do Fastify, com a guarda do módulo (`exigirModuloLigado`), que recusa com 403 (`modulo-desligado`) quando a organização o desligou. A guarda lê a organização a cada requisição, antes da rota e sem cache, e a mudança vale na hora. Uma rota nova do módulo entra no escopo e já nasce guardada, sem declarar nada.
- **Web:**
  - o registro da conta tira os módulos desligados, como tira os que a conta não pode ver: o dock, a barra de abas, a busca e o Início;
  - a casca mostra, no lugar das telas do módulo desligado aberto pela URL, "O módulo Ativos está desligado nesta organização." e a quem pedir; quem define os padrões vai dali à seção Módulos;
  - `modulos.mudaram` e a recusa `modulo-desligado` de uma leitura validam a sessão de novo, e a casca tira o módulo sem recarregar;
  - a seção Módulos da Administração, com o `Interruptor` e a confirmação para desligar.

### 13. As telas
- **Rotas:** `/ativos` (a lista), `/ativos/novo` e `/ativos/$id`, ao lado de `/ativos/catalogo`. O endereço do módulo leva à lista e, para quem não vê ativos, à tela de tipos.
- **Os endereços que a API também tem:** `/ativos` e `/ativos/:id` são rotas da API sem o `/api`, como as outras, para o proxy do desenvolvimento. Com a web compilada, o pedido de página (GET que aceita HTML, sem extensão) fora do `/api` vai ao `index.html` antes das rotas, e só o `/health` fica com a API: recarregar a lista dos ativos abre a web, e não o JSON da API.
- **Menu:** Ativos, para `ativos.ver`, e o Catálogo, para `catalogo.administrar` ou `modelos.editar`.
- **Busca:** "Novo ativo" e o provedor dos ativos, ao lado do dos modelos. O contrato de módulo passa a aceitar vários provedores (`busca.provedores`), cada um no seu grupo, na ordem da lista; o dos modelos fica para quem vê o catálogo.
- **Campo de entrada por tipo de campo (`CampoDoAtivo`):**
  - texto, licença, URL, IP e MAC: `CampoDeTexto`, com a fonte mono no IP e no MAC;
  - texto longo: `AreaDeTexto`;
  - número inteiro, decimal e moeda: `CampoDeTexto` com o teclado numérico;
  - data: `CampoDeData`;
  - lista: `Selecao`, com "Nenhum" nos opcionais e a opção inativa guardada à vista, marcada como inativa;
  - lista múltipla: `GrupoDeCheckboxes`;
  - local: `SeletorDeLocal`;
  - pessoa: o seletor de registros da Administração (`SeletorDeConta`), que busca enquanto se digita, sobre `/pessoas/nomes`;
  - ativo: o mesmo seletor, sobre `GET /ativos?busca=`, sem o próprio ativo.
- **Formulário:** a tela lê cada valor pelo `lerValor` antes de enviar, para a recusa aparecer no campo com a mesma mensagem da API, e envia só as chaves que mudaram, com as travas mudadas.
- **As telas seguem as do catálogo:** a lista na `Tabela`, com os filtros no endereço e os `FiltrosAtivos`; a ficha com as ações de situação e a confirmação.

### 14. O estado do campo na UI
- **Escolha:** `EstadoDoCampo`, no `packages/ui`: a origem, o autor e o momento em texto ("Manual · Ana Souza · 09/10/2026 14:32") e, para quem edita, o botão da trava, com o nome do campo ("Travar Local", "Destravar Local") e o estado em texto, não só pelo ícone.
- **Por quê no `packages/ui`:** a prévia da importação (P1e) mostra o mesmo estado.

## Risks / Trade-offs

- **[A `busca` desatualizada]** → o nome do modelo entra pela junção, e não na `busca` do ativo; o resto da `busca` é refeito em toda gravação do ativo. Um campo que vira restrito sai da `busca` só quando o ativo é gravado de novo: o risco é baixo, porque a lista só mostra os ativos que a conta pode ver, e nunca o valor.
- **[JSONB grande]** → 256 KB por ativo, conferido no banco. Os textos longos são o maior peso, até 5.000 caracteres cada.
- **[O módulo desligado lido a cada requisição]** → uma consulta pela chave primária, antes da rota, só nas rotas do módulo.
- **[Os restritos na auditoria]** → quem consulta a auditoria vê o valor restrito que mudou. A auditoria é de quem tem `auditoria.ver`, na organização inteira, e a spec diz isso.
- **[Nomes das pessoas para toda sessão]** → só o nome das ativas, e no máximo 20 por busca.

## Migration Plan

- **Migration nova:**
  - a tabela `ativos`, com `app.isolar_por_organizacao`;
  - o `unique (org_id, id, tipo_id)` nos modelos;
  - `organizacoes.modulos_desligados`.
  Ela só acrescenta: a versão anterior continua funcionando com o banco migrado.
- **Volta:** a versão anterior ignora a tabela e a coluna novas. Os ativos cadastrados ficam guardados para a volta à versão nova.
- **Permissões:** as novas entram no catálogo; o Administrador as recebe sem mudança no perfil, como as do P1a.
