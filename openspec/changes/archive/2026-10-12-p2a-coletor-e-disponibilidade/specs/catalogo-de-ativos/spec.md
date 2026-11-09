## MODIFIED Requirements

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
  - **Hardware:** Processador (texto), Memória (GB) (número inteiro de 0 a 100.000) e Discos (texto longo);
  - **Software:** Sistema operacional (texto), Versão do sistema (texto), Licença do Windows (licença), Licença do Office (licença) e Antivírus (texto).

  Esses campos SHALL aceitar a importação e a coleta.
- a `rede.disponibilidade` (Disponibilidade na rede), sem campos, com o campo de IP do ping escolhido pelo tipo (spec disponibilidade-de-rede).

Ligar uma capacidade num tipo SHALL acrescentar os campos dela aos ativos desse tipo, no grupo da capacidade. Eles SHALL NOT poder ser editados nem tirados um a um.

Desligar a capacidade SHALL esconder os campos dela, sem apagar os valores, e tirar do tipo a configuração dela.

#### Scenario: Inventário ligado no computador
- **WHEN** o tipo "Computador" liga o Inventário de hardware
- **THEN** a ficha do tipo mostra os oito campos da capacidade no grupo dela, sem a opção de tirá-los um a um

#### Scenario: Capacidade sem código
- **WHEN** se pede para ligar a capacidade `snmp.suprimentos`, que ainda não tem código, num tipo
- **THEN** o pedido é recusado com "Capacidade desconhecida: snmp.suprimentos."

#### Scenario: Disponibilidade desligada
- **WHEN** o tipo "Impressora" desliga a disponibilidade na rede
- **THEN** o tipo deixa de guardar o campo de IP do ping, as impressoras deixam de ser alvo do coletor, e o "IP" continua no tipo

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
