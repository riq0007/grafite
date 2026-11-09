## MODIFIED Requirements

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
