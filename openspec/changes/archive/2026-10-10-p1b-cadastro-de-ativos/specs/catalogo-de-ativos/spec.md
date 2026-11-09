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
