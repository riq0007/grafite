## Purpose

Deixar a organização dizer que tipos de ativo tem, que campos cada tipo usa, que capacidades ele liga e que modelos de equipamento existem, sem programação. Isso vem antes do cadastro dos ativos.

## ADDED Requirements

### Requirement: Tipos de ativo

A organização SHALL cadastrar os próprios tipos de ativo, e nenhum tipo SHALL vir pronto numa organização nova.

Cada tipo SHALL ter:
- um nome de até 60 caracteres, único na organização, sem diferenciar acento e maiúsculas;
- um dos ícones genéricos: impressora, computador, notebook, monitor, switch, rack, controle de acesso, câmera, storage, nobreak ou genérico;
- as capacidades que liga;
- os campos que usa;
- a situação, ativo ou inativo.

O tipo SHALL NOT ser excluído, só inativado. O tipo inativo:
- SHALL sair das escolhas para os modelos e os ativos novos;
- SHALL deixar como estão os modelos e os ativos que já o usam;
- SHALL voltar às escolhas quando reativado.

#### Scenario: Organização nova
- **WHEN** uma organização é criada
- **THEN** ela não tem nenhum tipo de ativo

#### Scenario: Nome repetido
- **WHEN** já existe o tipo "Impressora" e alguém cadastra o tipo "impressora"
- **THEN** o cadastro é recusado com "Já existe um tipo com este nome."

#### Scenario: Tipo inativado
- **WHEN** o tipo "Câmera" é inativado
- **THEN** ele sai das escolhas do cadastro de modelos, e os modelos de câmera continuam cadastrados

### Requirement: Campos da organização

Os campos SHALL ser da organização, e cada tipo de ativo SHALL escolher os que usa.

Cada campo SHALL ter:
- um rótulo de até 60 caracteres, único na organização, sem diferenciar acento e maiúsculas;
- o tipo de campo (spec campos-personalizados), que SHALL NOT mudar depois de criado;
- um grupo opcional, de até 40 caracteres, como "Rede", que reúne os campos nos formulários;
- a configuração do tipo de campo;
- a marca de restrito: só quem pode ver os campos restritos vê o valor dele;
- a política de escrita: só a edição manual, ou também a importação e a coleta;
- a situação, ativo ou inativo.

O campo SHALL NOT ser excluído, só inativado. O campo inativo:
- SHALL sair dos formulários de todos os tipos;
- SHALL NOT perder nenhum valor guardado;
- SHALL trazer os valores de volta quando reativado.

#### Scenario: O mesmo campo em vários tipos
- **WHEN** o campo "IP" é usado pelos tipos "Impressora", "Switch" e "Câmera"
- **THEN** a tela de campos mostra que o "IP" é usado por 3 tipos

#### Scenario: Tipo do campo fixo
- **WHEN** alguém abre um campo de texto já cadastrado
- **THEN** o tipo aparece só para leitura, e mudar o tipo exige um campo novo

#### Scenario: Campo inativado
- **WHEN** o campo "Tensão" é inativado
- **THEN** ele some dos tipos que o usam, e os valores dele continuam guardados para quando for reativado

### Requirement: Campos do tipo

Cada tipo SHALL ter a lista dos campos da organização que usa, em ordem. Na ligação com cada tipo, o campo SHALL dizer se é obrigatório. Um tipo SHALL ter até 100 campos.

O mesmo campo SHALL poder ser obrigatório num tipo e opcional em outro.

Só um campo ativo SHALL entrar num tipo. Tirar um campo de um tipo SHALL esconder o campo nos ativos desse tipo, sem apagar os valores, e pôr o campo de volta SHALL trazer os valores.

#### Scenario: Obrigatório num tipo só
- **WHEN** o "IP" é obrigatório no "Switch" e opcional na "Câmera"
- **THEN** o cadastro de um switch exige o IP, e o de uma câmera, não

#### Scenario: Campo inativo
- **WHEN** alguém tenta incluir no tipo um campo inativo
- **THEN** a inclusão é recusada com "O campo Tensão está inativo."

### Requirement: Capacidades

Uma capacidade SHALL existir só no código. Ela SHALL trazer:
- o nome em pt-BR;
- a descrição;
- os campos dela, cada um com uma chave fixa no código, um rótulo, um tipo de campo e um grupo.

Um tipo SHALL poder ligar só as capacidades que já têm código. A primeira capacidade SHALL ser a `hardware.inventario` (Inventário de hardware), com os campos:
- **Hardware:** Processador (texto), Memória (GB) (número inteiro de 0 a 100.000) e Discos (texto longo);
- **Software:** Sistema operacional (texto), Versão do sistema (texto), Licença do Windows (licença), Licença do Office (licença) e Antivírus (texto).

Esses campos SHALL aceitar a importação e a coleta.

Ligar uma capacidade num tipo SHALL acrescentar os campos dela aos ativos desse tipo, no grupo da capacidade. Eles SHALL NOT poder ser editados nem tirados um a um.

Desligar a capacidade SHALL esconder os campos dela, sem apagar os valores.

#### Scenario: Inventário ligado no computador
- **WHEN** o tipo "Computador" liga o Inventário de hardware
- **THEN** a ficha do tipo mostra os oito campos da capacidade no grupo dela, sem a opção de tirá-los um a um

#### Scenario: Capacidade sem código
- **WHEN** se pede para ligar a capacidade `snmp.suprimentos`, que ainda não tem código, num tipo
- **THEN** o pedido é recusado com "Capacidade desconhecida: snmp.suprimentos."

### Requirement: Modelos de equipamento

A organização SHALL cadastrar os modelos de equipamento. Cada modelo SHALL ter:
- o tipo de ativo dele, que SHALL NOT mudar depois de criado;
- o fabricante, de até 60 caracteres;
- o nome do modelo, de até 80 caracteres;
- a imagem, opcional;
- a situação, ativo ou inativo.

O fabricante e o nome do modelo SHALL ser únicos juntos dentro do tipo, sem diferenciar acento e maiúsculas.

O fabricante SHALL ser comparado sem diferenciar acento e maiúsculas, e a primeira grafia cadastrada SHALL valer para os modelos seguintes. A tela SHALL sugerir os fabricantes já usados.

Um modelo novo SHALL usar um tipo ativo.

O modelo SHALL NOT ser excluído, só inativado. O modelo inativo SHALL sair das escolhas para os ativos novos, e os ativos que já o usam SHALL continuar como estão.

#### Scenario: Fabricante com outra grafia
- **WHEN** já existe um modelo do fabricante "HP" e alguém cadastra um modelo do fabricante "hp"
- **THEN** o modelo novo fica com o fabricante "HP"

#### Scenario: Modelo repetido
- **WHEN** já existe a impressora "HP LaserJet M404" e alguém cadastra outra com o mesmo fabricante e nome
- **THEN** o cadastro é recusado com "Já existe este modelo neste tipo."

### Requirement: Imagem do modelo

O modelo SHALL ter uma imagem opcional, tratada como as imagens da spec arquivos-e-imagens: o tipo conferido pelo conteúdo, o SVG sanitizado, a imagem regravada sem metadados e as miniaturas de 64, 128, 256 e 512 px.

A imagem trocada ou removida SHALL deixar de ser entregue na hora.

Toda sessão da organização SHALL poder ver a imagem de um modelo. Sem imagem, a tela SHALL mostrar o ícone genérico do tipo.

#### Scenario: Imagem trocada
- **WHEN** quem edita modelos troca a imagem da "HP LaserJet M404"
- **THEN** a tela de modelos mostra a imagem nova, e o endereço da antiga responde 404

#### Scenario: Modelo sem imagem
- **WHEN** um modelo do tipo "Impressora" não tem imagem
- **THEN** a tela mostra o ícone genérico de impressora no lugar da imagem

### Requirement: Leitura do catálogo

Toda sessão ativa da organização SHALL poder ler o catálogo:
- os tipos;
- os campos;
- as capacidades;
- os modelos e a imagem deles;
- as sugestões de fabricante.

Mudar os tipos e os campos SHALL exigir `catalogo.administrar`, e mudar os modelos e a imagem deles SHALL exigir `modelos.editar`, as duas na organização inteira.

Cada resposta SHALL dizer o que a conta pode fazer com o registro.

#### Scenario: Leitura sem permissão de mudar
- **WHEN** uma conta sem `catalogo.administrar` lê os tipos de ativo
- **THEN** ela recebe os tipos, com a indicação de que não pode editá-los

#### Scenario: Mudança sem permissão
- **WHEN** uma conta sem `modelos.editar` tenta cadastrar um modelo
- **THEN** a API recusa com 403, e a recusa vai para a auditoria

### Requirement: Telas do catálogo

O módulo Ativos SHALL ter as telas de tipos, de campos e de modelos.

A tela de tipos SHALL:
- listar os tipos ativos pelo nome, com o ícone, o número de campos, as capacidades e a situação em texto;
- mostrar também os inativos pelo filtro de situação.

A tela de campos SHALL listar:
- o rótulo, o tipo de campo e o grupo;
- quantos tipos usam o campo;
- a marca de restrito e a situação, em texto.

A tela de modelos SHALL:
- listar os modelos pelo fabricante e pelo nome, com a miniatura da imagem ou o ícone do tipo, o tipo e a situação;
- filtrar pelo tipo e pela situação;
- buscar pelo fabricante e pelo nome;
- carregar mais modelos ao fim da lista.

Cada tela SHALL:
- oferecer o cadastro a quem pode mudar o catálogo;
- abrir a ficha de cada registro, com a edição, a inativação e a reativação.

A ficha do tipo SHALL:
- escolher o ícone numa grade com o nome de cada ícone;
- ligar e desligar as capacidades, com a descrição de cada uma;
- incluir, ordenar e tirar os campos, marcando os obrigatórios;
- mostrar os campos das capacidades ligadas, no grupo de cada uma, só para leitura.

A ficha do campo SHALL:
- editar a configuração conforme o tipo de campo, como as opções da lista;
- mostrar os tipos que usam o campo.

Inativar um campo usado por algum tipo SHALL pedir confirmação, dizendo de quantos tipos ele sai.

Quem não pode mudar o catálogo SHALL ver as telas só para leitura.

Sem nenhum tipo, a tela de tipos SHALL dizer "Nenhum tipo de ativo ainda." e oferecer, a quem pode, o cadastro do primeiro tipo.

#### Scenario: Primeiro uso
- **WHEN** quem administra o catálogo abre a tela de tipos numa organização sem tipos
- **THEN** a tela diz "Nenhum tipo de ativo ainda." e oferece "Novo tipo"

#### Scenario: Opções de uma lista
- **WHEN** quem administra o catálogo inclui a opção "Comodato" no campo "Propriedade" e salva
- **THEN** a ficha do campo mostra a opção nova, e a tela de qualquer outra sessão aberta se atualiza sozinha

#### Scenario: Só leitura
- **WHEN** uma conta com `modelos.editar`, sem `catalogo.administrar`, abre a tela de tipos
- **THEN** ela vê os tipos sem as ações de cadastro, edição e inativação
