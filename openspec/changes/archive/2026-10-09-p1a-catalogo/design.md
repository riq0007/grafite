## Context

A motivação está em `proposal.md`, e os requisitos, nas specs desta change. As decisões de produto vêm do brainstorming com o usuário:
- **A divisão do P1:** seis changes.
- **Tipos:** a organização começa sem tipos.
- **Campos:** são da organização, e cada tipo escolhe os seus.
- **Valores:** ficam num JSONB pelo id do campo, com o estado ao lado.
- **Lugar:** o catálogo fica no módulo Ativos.

Pontos de partida no código:
- **Banco (`packages/db`):**
  - `orgScoped()` dá o `id` em uuidv7, o `org_id` e o `unique (org_id, id)`;
  - as referências entre tabelas de negócio levam o `org_id` junto;
  - a migration chama `app.isolar_por_organizacao`, e o teste-guarda reprova a tabela sem isolamento;
  - o papel da aplicação inclui, lê, altera e apaga nas tabelas do esquema `public`.
- **API (`apps/api`):**
  - as rotas declaram `config.permissao` ou `semPermissao`, e a guarda recusa e audita;
  - `registrarNaAuditoria` grava o antes → depois e o evento de saída na transação do dado;
  - a leitura dos locais é `referencia`: toda sessão ativa lê;
  - a foto da pessoa (`rotas/fotos.ts`) faz o caminho completo de uma imagem: confere, trata fora da transação, grava as variantes, registra, troca e audita, apagando o que gravou se a transação falha. As funções de gravar e apagar são internas e presas às pessoas.
- **Domínio (`packages/domain`):**
  - os catálogos de permissões (`PERMISSOES`), de ações da auditoria (`ACOES_DA_AUDITORIA`) e de eventos (`TIPOS_DE_EVENTO`, `EVENTO_DA_ACAO`, `publicoDerivado`);
  - o `normalizarTexto`;
  - o pacote não tem dependências.
- **UI (`packages/ui`):**
  - a `Tabela` (React Aria), com ordenação, "Carregar mais" e as colunas de miniatura;
  - a `MiniaturaDeAtivo` e os `iconesDeAtivo` do F0;
  - a `EscolhaDeImagem` e os `FiltrosAtivos`.
- **Web (`apps/web`):**
  - o contrato de módulo (`docs/casca/modulos.md`);
  - a Administração como modelo das listas com fichas, de `perfis/` e `pessoas/`;
  - o `provedorDePessoas` como modelo do provedor de busca.

## Goals / Non-Goals

**Goals:**
- A organização cadastra tipos, campos e modelos sem programação, com as regras de cada tipo de campo iguais na API, nas telas e, depois, na importação.
- O catálogo segue as regras da casa: isolamento pelo banco, nada se exclui, auditoria e evento em toda mudança, e as telas atualizadas pelos eventos.

**Non-Goals:**
- **O ativo:** o cadastro, a lista e a ficha ficam no P1b; a tabela e as visões, no P1c; os relacionamentos e a ficha completa, no P1d; a importação, no P1e; a etiqueta, no P1f.
- **Tipos de campo arquivo e imagem:** entram no P1d.
- **3D e portas:** o 3D do modelo fica no T1, e o layout de portas, no T2.
- **Outras capacidades:** só a `hardware.inventario` entra agora; as outras chegam com os subprojetos delas.
- **Módulos por organização:** ligar e desligar módulos fica no P1b.

## Decisions

### 1. As tabelas do catálogo
- **Escolha:** quatro tabelas criadas com `orgScoped()`, todas isoladas pela organização:
  - **`tipos_de_ativo`:**
    - colunas: `nome`, `nome_normalizado`, `icone`, `capacidades text[]`, `situacao`, `criado_em` e `atualizado_em`;
    - o nome é único na organização pela forma normalizada;
    - um `check` confere o ícone contra a lista do domínio, como nos tipos de local.
  - **`campos`:**
    - colunas: `rotulo`, `rotulo_normalizado`, `tipo`, `grupo`, `configuracao jsonb`, `restrito`, `escrita` (`manual` ou `automatica`), `situacao`, `criado_em` e `atualizado_em`;
    - o rótulo é único pela forma normalizada;
    - a configuração é um objeto de até 32 KB.
  - **`campos_do_tipo`:**
    - colunas: `tipo_id`, `campo_id`, `ordem` e `obrigatorio`;
    - as referências levam o `org_id` às duas tabelas;
    - o par tipo e campo é único.
  - **`modelos`:**
    - colunas: `tipo_id`, `fabricante`, `fabricante_normalizado`, `nome`, `nome_normalizado`, `imagem_id`, `busca`, `situacao`, `criado_em` e `atualizado_em`;
    - o fabricante e o nome são únicos juntos dentro do tipo;
    - a `busca` é o texto normalizado de fabricante e nome, como a das pessoas;
    - a imagem referencia `arquivos`.
- **A lista de campos do tipo:** é configuração. Mudar a lista reescreve as linhas de `campos_do_tipo` do tipo, e a auditoria guarda a lista antes e depois. Os valores dos ativos ficam no ativo, pelo id do campo (P1b), e não dependem da linha da ligação.
- **Alternativa:** a lista de campos num JSONB do tipo. O banco deixaria de conferir que o campo existe e é da mesma organização.

### 2. O motor de campos no domínio
- **Escolha:** um módulo `campos/` no `packages/domain`, sem dependências, com:
  - `TIPOS_DE_CAMPO`, com o rótulo de cada tipo em pt-BR;
  - `lerValor(definicao, entrada)`:
    - aceita o texto digitado ou da planilha, o número de uma célula e o valor já guardado;
    - devolve o valor na forma única ou a recusa em pt-BR;
    - ler de novo o valor guardado dá o mesmo valor, e um teste confere isso em todos os tipos;
  - `mostrarValor(definicao, valor)`, o texto da tela;
  - `conferirConfiguracao(tipo, configuracao)`.
- **As formas guardadas:**
  - texto como texto;
  - inteiro, decimal e moeda como número do JSON, com até 15 algarismos, que o número de ponto flutuante guarda sem perder nada. As casas a mais são recusadas, e nada é arredondado;
  - data como aaaa-mm-dd;
  - lista com os ids das opções;
  - IP na forma canônica, com o IPv6 comprimido e em minúsculas;
  - MAC em AA:BB:CC:DD:EE:FF.
- **Referências:** pessoa, local e ativo são lidos como identificadores. Quem confere se existem é a API, porque o domínio não lê o banco.
- **Por quê:** a mesma função na tela, na API e na importação mantém as mensagens iguais. Por ser pura, cada tipo é testado com uma tabela de casos.
- **Números como número, e não como texto:** guardado como texto, o decimal "1.024" (um vírgula zero dois quatro) seria lido de volta como mil e vinte e quatro, pela leitura em pt-BR. Como número do JSON, o valor guardado é lido sem passar pela leitura do texto.

### 3. As opções da lista na configuração
- **Escolha:** `configuracao.opcoes` guarda cada opção como `{ id, rotulo, situacao }`.
  - A API dá o id, em uuidv7, à opção nova.
  - Gravar a configuração sem uma opção que existia é recusado, com "As opções não são excluídas: inative a opção."
  - O rótulo é único na lista pela forma normalizada.
- **Por quê:** os ativos guardam o id. Renomear a opção não toca neles, e a opção inativa continua sendo mostrada onde já foi escolhida.

### 4. As capacidades no código
- **Escolha:** o registro `CAPACIDADES` no domínio, com a `chave`, o `nome`, a `descricao` e os `campos` de cada capacidade.
  - Cada campo tem uma chave fixa, como `hardware.processador`, o rótulo, o tipo, o grupo e a configuração.
  - O tipo de ativo guarda as chaves das capacidades ligadas, e a API recusa a chave desconhecida.
  - A primeira capacidade é a `hardware.inventario`, com os oito campos da spec, na política de escrita automática.
- **Por quê:** a capacidade traz lógica, que é código (decisão 2 da spec mestre). A chave fixa deixa a coleta, depois, gravar no mesmo lugar em toda organização.
- **Monitores:** o campo "Monitores" do PMG fica fora. O monitor é um ativo, ligado ao computador pelos relacionamentos do P1d.

### 5. O fabricante como texto normalizado
- **Escolha:** o fabricante é texto, guardado com a forma normalizada.
  - Ao gravar, se já existe um modelo com a mesma forma normalizada, a API usa a grafia dele.
  - `GET /modelos/fabricantes` devolve os fabricantes já usados, para a sugestão.
- **Alternativa:** um cadastro de fabricantes. Seria uma tela e uma tabela a mais para um nome. A grafia única já resolve "HP" e "hp", e os fornecedores do P4 são outra coisa.

### 6. A imagem do modelo pelo fluxo comum das imagens
- **Escolha:**
  - **O fluxo comum:** o caminho da foto da pessoa vira `arquivos/imagem-do-registro.ts`, com as peças:
    - `trocarImagem`, que confere, trata, grava as variantes, registra o arquivo, aponta o registro, marca a imagem anterior como removida e audita;
    - `tirarImagem` e `entregarImagem`;
    - `gravarVariantes`, `apagarChaves` e `aceitarImagens`.

    O registro dono entra por funções: a que confere o dono e trava a linha dele, a que aponta a imagem nova e a que audita.
  - **A foto da pessoa:** passa a usar o fluxo comum, sem mudar o comportamento, e os testes atuais da foto continuam passando.
  - **As rotas do modelo:**
    - `PUT` e `DELETE /modelos/:id/imagem` pedem `modelos.editar`;
    - `GET /modelos/:id/imagem/:arquivo/:tamanho` é `referencia`.
  - **Ações da auditoria:** `imagem-do-modelo.trocada` e `imagem-do-modelo.removida`.
- **Por quê:** a imagem do ativo (P1d) e a do 3D (T1) vão usar o mesmo caminho. Duas cópias divergiriam nas recusas e na limpeza.

### 7. As permissões e a leitura
- **Escolha:**
  - **`catalogo.administrar`:** para os tipos e os campos, na área Ativos, só na organização inteira.
  - **`modelos.editar`:** para os modelos, na mesma área e no mesmo escopo.
  - **Leitura:** todas as leituras do catálogo são `referencia`, como a dos locais:
    - `GET /tipos-de-ativo`, `/campos` e `/capacidades`;
    - `GET /modelos`, `/modelos/:id` e `/modelos/fabricantes`;
    - a imagem do modelo.
  - **O que a conta pode:** cada resposta traz `permite` com o que a conta pode fazer.
- **Por quê:**
  - o catálogo não tem dado pessoal;
  - o cadastro de ativos (P1b) e a importação (P1e) precisam ler o catálogo com as permissões deles;
  - cadastrar o modelo de uma impressora nova é trabalho de quem cuida dos ativos, e não de quem desenha o cadastro.

### 8. Auditoria e o evento `catalogo.mudou`
- **Escolha:**
  - **As ações:**
    - `tipo-de-ativo.criado`, `.alterado`, `.inativado` e `.reativado`;
    - `campo.criado`, `.alterado`, `.inativado` e `.reativado`;
    - `modelo.criado`, `.alterado`, `.inativado` e `.reativado`;
    - `imagem-do-modelo.trocada` e `.removida`.

    Todas têm rótulo em pt-BR e gravam o evento `catalogo.mudou`, com o alvo e o público de toda sessão da organização.
  - **O antes → depois do tipo:** leva o nome, o ícone, as capacidades e a lista de campos, com os rótulos.
  - **O antes → depois do campo:** leva a configuração inteira.
- **Por quê:** o catálogo é dado de referência, como os locais, e toda tela que mostra um tipo, um campo ou um modelo precisa saber que ele mudou.

### 9. O módulo Ativos na casca
- **A entrada:**
  - o módulo `ativos`, com o ícone `Boxes` do lucide;
  - leva a `/ativos/catalogo/tipos`, até o P1b trazer a lista dos ativos para `/ativos`;
  - no celular, fica logo depois do Início;
  - aparece para quem tem `catalogo.administrar` ou `modelos.editar`;
  - o menu é Catálogo › Tipos, Campos e Modelos.
- **As rotas:** `/ativos/catalogo/tipos`, `/novo` e `/$id`; o mesmo para `/ativos/catalogo/campos` e `/ativos/catalogo/modelos`. O catálogo é uma janela com seções, como a Administração e os Ajustes: a lista das seções ao lado, e uma de cada vez no celular.
- **A entrada no registro:** o módulo entra com a tela de tipos, porque nenhum item do menu leva a uma tela em construção, e ganha os campos e os modelos com as telas deles.
- **A busca:** as ações de cadastro, com a permissão de cada uma, e um provedor de modelos sobre `GET /modelos?busca=`.
- **Os eventos:** `catalogo.mudou` invalida as consultas `tipos-de-ativo`, `campos`, `capacidades`, `modelos` e `modelo`.
- **As telas:** seguem a Administração. A lista na `Tabela`, a ficha com o formulário e as ações de situação com confirmação, e os filtros nos `FiltrosAtivos` e no endereço.
- **Peças novas em `packages/ui`,** com histórias e testes no catálogo:
  - `EscolhaDeIcone`, a grade dos ícones de tipo com o nome;
  - `EditorDeOpcoes`, as opções de uma lista, para incluir, renomear, mover, inativar e reativar.

### 10. O contrato da API
- **Escolha:**
  - **Tipos:**
    - `GET /tipos-de-ativo` e `POST /tipos-de-ativo`;
    - `PATCH /tipos-de-ativo/:id`, que muda o nome, o ícone, as capacidades e a lista de campos;
    - `POST /tipos-de-ativo/:id/inativacao` e `/reativacao`.
  - **Campos:**
    - `GET /campos` e `POST /campos`;
    - `PATCH /campos/:id`, sem o tipo de campo;
    - `POST /campos/:id/inativacao` e `/reativacao`.
  - **Capacidades:** `GET /capacidades`.
  - **Modelos:**
    - `GET /modelos`, com `tipo`, `situacao`, `busca` e cursor;
    - `GET /modelos/fabricantes`, `GET /modelos/:id` e `POST /modelos`;
    - `PATCH /modelos/:id`, sem o tipo;
    - `POST /modelos/:id/inativacao` e `/reativacao`;
    - a imagem.

  O nome repetido e a opção excluída respondem 409, com a mensagem no campo. A configuração fora das regras responde 400 (`dados-invalidos`), com o motivo em cada parte, como `configuracao.minimo` ou `configuracao.opcoes.2`, como as outras regras do domínio na API.
  - **Ids das opções:** o id que o pedido traz só vale se a opção já existia no campo. A opção nova ganha um id dado pela API, e um id desconhecido é tratado como o de uma opção nova.
- **Por quê:** é o padrão das rotas de locais e de perfis. O OpenAPI e o cliente tipado saem do `pnpm contrato:gerar`.

## Risks / Trade-offs

- **[A lista dos ícones em dois lugares]** → O domínio tem as chaves, e a UI tem os desenhos. Um teste da UI reprova a chave sem desenho.
- **[Filtrar e ordenar pelos campos em JSONB, no P1c]** → Os números ficam como número do JSON, e a data em aaaa-mm-dd ordena como texto. Os índices de expressão entram no P1c, quando a tabela precisar deles.
- **[Configuração de um campo que muda depois de usado]** → Os limites novos valem para os valores gravados depois. Os ativos que já têm um valor fora deles só são recusados quando alguém muda aquele valor. A regra é do P1b, e a API não reconfere o que não mudou.
- **[Ler o catálogo inteiro a cada tela]** → Tipos e campos são poucos e vêm de uma vez. Os modelos podem ser muitos, e a lista deles é paginada e buscada no servidor.

## Migration Plan

Uma migration nova, com as quatro tabelas e o isolamento delas. As organizações existentes começam sem tipos, campos e modelos, como as novas. O perfil Administrador ganha as duas permissões sozinho.
