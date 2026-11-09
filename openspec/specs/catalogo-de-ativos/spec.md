# catalogo-de-ativos Specification

## Purpose
Deixar a organização dizer que tipos de ativo tem, que campos cada tipo usa, que capacidades ele liga e que modelos de equipamento existem, sem programação. Isso vem antes do cadastro dos ativos.

## Requirements

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

Os rótulos dos campos comuns a todo ativo (spec cadastro-de-ativos) e dos campos das capacidades SHALL ficar reservados, sem diferenciar acento e maiúsculas:
- "Este rótulo é de um campo que todo ativo já tem.";
- "Este rótulo é de um campo da capacidade <nome da capacidade>.".

O campo SHALL NOT ser excluído, só inativado. O campo inativo:
- SHALL sair dos formulários de todos os tipos;
- SHALL NOT perder nenhum valor guardado;
- SHALL trazer os valores de volta quando reativado.

O campo escolhido como o IP da disponibilidade na rede de algum tipo (spec disponibilidade-de-rede) SHALL NOT ser inativado: "O campo IP é o IP da disponibilidade em 2 tipos: escolha outro campo neles antes de inativá-lo.".

#### Scenario: O mesmo campo em vários tipos
- **WHEN** o campo "IP" é usado pelos tipos "Impressora", "Switch" e "Câmera"
- **THEN** a tela de campos mostra que o "IP" é usado por 3 tipos

#### Scenario: Tipo do campo fixo
- **WHEN** alguém abre um campo de texto já cadastrado
- **THEN** o tipo aparece só para leitura, e mudar o tipo exige um campo novo

#### Scenario: Campo inativado
- **WHEN** o campo "Tensão" é inativado
- **THEN** ele some dos tipos que o usam, e os valores dele continuam guardados para quando for reativado

#### Scenario: Rótulo reservado
- **WHEN** quem administra o catálogo cadastra um campo com o rótulo "patrimonio"
- **THEN** o cadastro é recusado com "Este rótulo é de um campo que todo ativo já tem."

#### Scenario: IP da disponibilidade inativado
- **WHEN** o campo "IP" é o IP da disponibilidade na rede dos tipos "Impressora" e "Switch", e alguém tenta inativá-lo
- **THEN** a inativação é recusada com "O campo IP é o IP da disponibilidade em 2 tipos: escolha outro campo neles antes de inativá-lo."

### Requirement: Campos do tipo

Cada tipo SHALL ter a lista dos campos da organização que usa, em ordem. Na ligação com cada tipo, o campo SHALL dizer se é obrigatório. Um tipo SHALL ter até 100 campos.

O mesmo campo SHALL poder ser obrigatório num tipo e opcional em outro. Um campo de arquivo ou de imagem SHALL NOT ser obrigatório, porque ele é enviado depois do cadastro do ativo: "Arquivo e imagem não podem ser obrigatórios: eles são enviados depois do cadastro.".

Só um campo ativo SHALL entrar num tipo. Tirar um campo de um tipo SHALL esconder o campo nos ativos desse tipo, sem apagar os valores, e pôr o campo de volta SHALL trazer os valores.

O campo escolhido como o IP da disponibilidade na rede do tipo SHALL NOT sair dele: "O campo IP é o IP da disponibilidade neste tipo: escolha outro antes de tirá-lo.".

#### Scenario: Obrigatório num tipo só
- **WHEN** o "IP" é obrigatório no "Switch" e opcional na "Câmera"
- **THEN** o cadastro de um switch exige o IP, e o de uma câmera, não

#### Scenario: Campo inativo
- **WHEN** alguém tenta incluir no tipo um campo inativo
- **THEN** a inclusão é recusada com "O campo Tensão está inativo."

#### Scenario: Arquivo obrigatório
- **WHEN** quem administra o catálogo marca como obrigatório o campo de arquivo "PDF da nota fiscal" no tipo "Notebook"
- **THEN** a gravação do tipo é recusada com "Arquivo e imagem não podem ser obrigatórios: eles são enviados depois do cadastro."

#### Scenario: IP da disponibilidade tirado do tipo
- **WHEN** a impressora usa o "IP" na disponibilidade na rede, e alguém tira o "IP" do tipo "Impressora"
- **THEN** a gravação do tipo é recusada com "O campo IP é o IP da disponibilidade neste tipo: escolha outro antes de tirá-lo."

### Requirement: Capacidades

Uma capacidade SHALL existir só no código. Ela SHALL trazer:
- o nome em pt-BR;
- a descrição;
- os campos dela, cada um com uma chave fixa no código, um rótulo, um tipo de campo e um grupo;
- a configuração que o tipo escolhe ao ligá-la, quando ela pede uma.

Um tipo SHALL poder ligar só as capacidades que já têm código. As capacidades SHALL ser:
- a `hardware.inventario` (Inventário de hardware), com os campos:
  - **Hardware:** UUID (texto), IP do computador (IP), MAC (MAC), Processador (texto), Memória (GB) (número inteiro de 0 a 100.000) e Discos (texto longo);
  - **Software:** Sistema operacional (texto), Versão do sistema (texto), Licença do Windows (licença), Licença do Office (licença), Antivírus (texto), Último usuário informado (texto) e Última inicialização (texto).

  Esses campos SHALL aceitar a importação e a coleta.
- a `rede.disponibilidade` (Disponibilidade na rede), sem campos, com o campo de IP do ping escolhido pelo tipo (spec disponibilidade-de-rede).
- a `snmp.suprimentos` (Suprimentos e contadores), sem campos, com o campo de IP, a versão do SNMP e a comunidade escolhidos pelo tipo (spec impressoras-por-snmp).
- a `controlid.saude` (Saúde do Control iD), sem campos, com o campo de IP, a porta e o login escolhidos pelo tipo (spec saude-do-control-id).
- a `consumiveis.compatibilidade` (Consumíveis compatíveis), sem campos e sem configuração, que deixa os modelos do tipo terem consumíveis compatíveis (spec consumiveis), mostrados na ficha do modelo (spec modulo-operacao) e na de cada ativo dele (spec cadastro-de-ativos).

Ligar uma capacidade num tipo SHALL acrescentar os campos dela aos ativos desse tipo, no grupo da capacidade. Eles SHALL NOT poder ser editados nem tirados um a um.

Desligar a capacidade SHALL esconder os campos dela, sem apagar os valores, e tirar do tipo a configuração dela.

O campo do tipo IP escolhido por uma capacidade SHALL NOT sair do tipo nem ser inativado enquanto ela estiver ligada com ele, com a recusa que diz qual capacidade o usa.

#### Scenario: Inventário ligado no computador
- **WHEN** o tipo "Computador" liga o Inventário de hardware
- **THEN** a ficha do tipo mostra os treze campos da capacidade no grupo dela, sem a opção de tirá-los um a um

#### Scenario: Capacidade sem código
- **WHEN** se pede para ligar a capacidade `controlid.backup`, que ainda não tem código, num tipo
- **THEN** o pedido é recusado com "Capacidade desconhecida: controlid.backup."

#### Scenario: Disponibilidade desligada
- **WHEN** o tipo "Impressora" desliga a disponibilidade na rede
- **THEN** o tipo deixa de guardar o campo de IP do ping, as impressoras deixam de ser alvo do coletor, e o "IP" continua no tipo

#### Scenario: Suprimentos ligados na impressora
- **WHEN** o tipo "Impressora" liga os suprimentos e contadores com o campo "IP"
- **THEN** a ficha do tipo mostra a capacidade com o campo de IP, a versão e a comunidade, e o "IP" não pode sair do tipo enquanto ela estiver ligada

#### Scenario: Saúde do Control iD ligada
- **WHEN** o tipo "Controle de acesso" liga a saúde do Control iD com o campo "IP"
- **THEN** a ficha do tipo mostra a capacidade com o campo de IP, a porta e o login, e o "IP" não pode sair do tipo enquanto ela estiver ligada

#### Scenario: Consumíveis compatíveis ligados na impressora
- **WHEN** o tipo "Impressora" liga os consumíveis compatíveis
- **THEN** a ficha do tipo mostra a capacidade, sem campos e sem configuração, e os modelos de impressora passam a poder ser escolhidos nos consumíveis

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

A Gestão de ativos SHALL ter as telas de tipos, de campos e de modelos (spec modulo-gestao-de-ativos).

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
- ligar e desligar as capacidades, com a descrição de cada uma, e escolher a configuração da que pede uma, como o campo de IP da disponibilidade na rede, entre os campos do tipo IP que estão no tipo;
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

#### Scenario: Campo de IP na ficha do tipo
- **WHEN** o tipo "Switch" usa os campos "IP" e "IP da gerência", do tipo IP, e "Hostname de gerência", de texto, e quem administra o catálogo liga a disponibilidade na rede
- **THEN** a ficha do tipo pede o campo de IP do ping e oferece só o "IP" e o "IP da gerência"

#### Scenario: Catálogo na Gestão de ativos
- **WHEN** quem administra o catálogo escolhe "Gestão de ativos › Catálogo › Modelos" no dock
- **THEN** a tela de modelos abre, com as seções Tipos, Campos e Modelos ao lado

### Requirement: Ativos do modelo e do tipo

A ficha de um modelo e a de um tipo SHALL mostrar quantos ativos ativos os usam, no escopo de quem vê, com "Ver na tabela", que abre a tabela dos ativos com a origem do modelo ou do tipo (spec cadastro-de-ativos). Sem nenhum, a ficha SHALL dizer "Nenhum ativo deste modelo." ou "Nenhum ativo deste tipo.".

#### Scenario: Ativos de um modelo
- **WHEN** alguém abre a ficha do modelo "HP LaserJet M404", usado por 12 ativos
- **THEN** a ficha mostra "Ativos: 12" e "Ver na tabela"

### Requirement: Tipo e modelo cadastrados numa aba

O Novo tipo e o Novo modelo SHALL abrir numa aba da janela quando um campo os pede (spec estrutura-da-casca), com o mesmo formulário, as mesmas validações e os mesmos retornos das telas do catálogo, "Tipo cadastrado." e "Modelo cadastrado.". Na aba, salvar SHALL devolver o registro criado ao campo que o pediu, em vez de abrir a ficha dele. O Novo tipo SHALL exigir `catalogo.administrar`, e o Novo modelo, `modelos.editar`.

No cadastro do modelo, o campo Tipo SHALL mostrar embaixo "Cadastrar novo tipo" (spec componentes-base) para quem tem `catalogo.administrar`. Pedido pelo campo Modelo de um ativo, o Novo modelo SHALL vir com o tipo do ativo, só para leitura e sem o link (spec cadastro-de-ativos).

As telas do catálogo SHALL continuar como antes: o Novo tipo e o Novo modelo abertos pelo menu ou pela lista SHALL abrir a ficha do registro criado.

#### Scenario: Tipo criado pelo modelo
- **WHEN** quem administra o catálogo cadastra um modelo e escolhe "Cadastrar novo tipo" embaixo do Tipo, e salva o tipo "Leitor de código de barras"
- **THEN** a aba "Novo tipo" fecha, e o cadastro do modelo volta com "Leitor de código de barras" no Tipo

#### Scenario: Recusa dentro da aba
- **WHEN** alguém tenta salvar, na aba "Novo tipo", um tipo com o nome de um que já existe
- **THEN** a aba continua aberta, com a recusa no campo do nome, como na tela do catálogo

#### Scenario: Tela do catálogo sem mudança
- **WHEN** quem administra o catálogo cadastra um tipo pelo menu do catálogo
- **THEN** depois de salvar, abre a ficha do tipo criado, como antes

### Requirement: Primeiro cartão da ficha

Quem administra o catálogo SHALL poder escolher, no tipo, o cartão em que a ficha dos ativos dele abre (spec cadastro-de-ativos, "Aba Dados em cartões"):
- "Automático", o padrão, abre no cartão da capacidade principal do tipo;
- a Visão geral;
- uma capacidade do tipo que tem cartão na ficha: Inventário de hardware, Disponibilidade na rede, Suprimentos e contadores, Saúde do Control iD, Backup do Control iD ou Consumíveis compatíveis.

A seleção "Primeiro cartão da ficha" SHALL dizer, no "Automático", qual cartão ele abre, como "Automático: Suprimentos e contadores". Desligar a capacidade escolhida SHALL esquecer a escolha, e o tipo volta ao automático, como a configuração da capacidade desligada. Uma escolha que não é a Visão geral nem uma capacidade com cartão SHALL ser recusada com "Escolha a Visão geral ou uma capacidade do tipo com cartão na ficha.". A escolha SHALL entrar na auditoria do tipo, com o antes e o depois.

#### Scenario: Impressora no automático
- **WHEN** o tipo "Impressora" liga a disponibilidade na rede e os suprimentos e contadores, sem escolher o primeiro cartão
- **THEN** a seleção diz "Automático: Suprimentos e contadores", e a ficha das impressoras abre nos suprimentos

#### Scenario: Visão geral escolhida
- **WHEN** quem administra o catálogo escolhe a Visão geral no tipo "Impressora" e salva
- **THEN** a ficha das impressoras abre na Visão geral, e a auditoria registra a mudança do tipo

#### Scenario: Capacidade escolhida desligada
- **WHEN** o tipo "Face ID" escolheu a Saúde do Control iD, e quem administra o catálogo desliga essa capacidade
- **THEN** o tipo volta ao automático
