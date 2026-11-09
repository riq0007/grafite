## MODIFIED Requirements

### Requirement: Campos do tipo

Cada tipo SHALL ter a lista dos campos da organização que usa, em ordem. Na ligação com cada tipo, o campo SHALL dizer se é obrigatório. Um tipo SHALL ter até 100 campos.

O mesmo campo SHALL poder ser obrigatório num tipo e opcional em outro. Um campo de arquivo ou de imagem SHALL NOT ser obrigatório, porque ele é enviado depois do cadastro do ativo: "Arquivo e imagem não podem ser obrigatórios: eles são enviados depois do cadastro.".

Só um campo ativo SHALL entrar num tipo. Tirar um campo de um tipo SHALL esconder o campo nos ativos desse tipo, sem apagar os valores, e pôr o campo de volta SHALL trazer os valores.

#### Scenario: Obrigatório num tipo só
- **WHEN** o "IP" é obrigatório no "Switch" e opcional na "Câmera"
- **THEN** o cadastro de um switch exige o IP, e o de uma câmera, não

#### Scenario: Campo inativo
- **WHEN** alguém tenta incluir no tipo um campo inativo
- **THEN** a inclusão é recusada com "O campo Tensão está inativo."

#### Scenario: Arquivo obrigatório
- **WHEN** quem administra o catálogo marca como obrigatório o campo de arquivo "PDF da nota fiscal" no tipo "Notebook"
- **THEN** a gravação do tipo é recusada com "Arquivo e imagem não podem ser obrigatórios: eles são enviados depois do cadastro."
