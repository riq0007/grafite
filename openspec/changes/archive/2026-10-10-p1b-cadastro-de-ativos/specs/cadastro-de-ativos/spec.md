## Purpose

Guardar os ativos da organização: os dados comuns a todo ativo e os campos do tipo, cada valor com a origem, o momento, o autor e a trava, com o acesso pelo local do ativo, a lista simples, o cadastro e a ficha básica.

## ADDED Requirements

### Requirement: Ativo

A organização SHALL cadastrar os próprios ativos. Cada ativo SHALL ter:
- o tipo de ativo, entre os ativos no cadastro, que SHALL NOT mudar depois;
- o modelo, opcional, que SHALL ser do mesmo tipo e estar ativo quando escolhido;
- os campos comuns a todo ativo, os campos da organização que o tipo usa e os campos das capacidades que o tipo liga;
- a situação do cadastro, ativo ou inativo.

O ativo SHALL NOT ser excluído, só inativado. O ativo inativo:
- SHALL sair da lista, que só o mostra pelo filtro de situação;
- SHALL guardar todos os valores e o histórico;
- SHALL voltar como estava quando reativado.

#### Scenario: Modelo de outro tipo
- **WHEN** alguém cadastra uma impressora com o modelo "Dell OptiPlex 7010", que é de computador
- **THEN** o cadastro é recusado com "O modelo escolhido não é do tipo do ativo."

#### Scenario: Ativo inativado
- **WHEN** quem edita ativos inativa a impressora PAT-00412
- **THEN** ela sai da lista dos ativos, e o filtro "Inativos" a mostra com os valores que tinha

### Requirement: Campos comuns a todo ativo

Todo ativo SHALL ter os campos comuns, com uma chave fixa no código e a mesma em toda organização, conferidos pelo motor de campos (spec campos-personalizados):

| Grupo | Campo | Tipo de campo |
|---|---|---|
| Identificação | Nome | texto |
| Identificação | Patrimônio | texto |
| Identificação | Número de série | texto |
| Identificação | Hostname | texto |
| Uso | Situação de uso | lista: Em uso, Em estoque ou Em manutenção |
| Uso | Local | local |
| Uso | Responsável | pessoa |
| Administrativo | Fornecedor | texto |
| Administrativo | Nota fiscal | texto |
| Administrativo | Data de compra | data |
| Administrativo | Valor de compra | moeda |
| Administrativo | Garantia até | data |
| Administrativo | Propriedade | lista: Próprio, Alugado ou Comodato |
| Administrativo | Contrato | texto |
| Administrativo | Custo mensal | moeda |
| Administrativo | Centro de custo | texto |
| Administrativo | Vida útil (meses) | número inteiro, de 0 a 600 |

O patrimônio SHALL ser único na organização, sem diferenciar acento e maiúsculas, entre os ativos ativos e os inativos. Os outros campos comuns SHALL ser opcionais, fora a situação de uso, que SHALL começar em "Em uso".

#### Scenario: Patrimônio repetido
- **WHEN** já existe o ativo de patrimônio "PAT-00412" e alguém cadastra outro com "pat-00412"
- **THEN** o cadastro é recusado com "Já existe um ativo com este patrimônio.", no campo Patrimônio

#### Scenario: Ativo novo sem situação de uso
- **WHEN** alguém cadastra um ativo sem escolher a situação de uso
- **THEN** o ativo fica "Em uso"

### Requirement: Campos do tipo no ativo

O ativo SHALL usar os campos da organização que o tipo dele usa, na ordem do tipo, e os campos das capacidades ligadas ao tipo.

Cada valor SHALL ser conferido pelo motor de campos, com a recusa no próprio campo. Um campo obrigatório no tipo:
- SHALL ser preenchido no cadastro;
- SHALL NOT ser esvaziado numa edição.

A edição SHALL conferir só os campos que mudaram: um valor guardado que deixou de valer, como uma opção inativada, SHALL continuar até alguém mudá-lo.

Um campo inativo, ou que saiu do tipo, SHALL sair do formulário e SHALL NOT ser gravado, e os valores dele SHALL continuar guardados. Um valor para um campo que o tipo não usa SHALL ser recusado.

#### Scenario: Obrigatório no cadastro
- **WHEN** o "IP" é obrigatório no tipo "Impressora" e alguém cadastra uma impressora sem o IP
- **THEN** o cadastro é recusado com "Preencha este campo.", no campo IP

#### Scenario: Valor recusado
- **WHEN** alguém digita "10.0.0.300" no IP de uma impressora
- **THEN** a gravação é recusada com a mensagem do motor de campos, no campo IP

#### Scenario: Campo inativado depois de preenchido
- **WHEN** o campo "Tensão" de um nobreak preenchido com "220" é inativado
- **THEN** o campo sai da ficha do nobreak, e o "220" volta quando o campo for reativado

### Requirement: Nome do ativo

As telas SHALL mostrar o ativo pelo nome, quando ele tem um. Sem nome, pelo fabricante e pelo modelo e, sem modelo, pelo nome do tipo. O patrimônio SHALL aparecer junto, para distinguir os ativos do mesmo modelo.

#### Scenario: Ativo sem nome
- **WHEN** a impressora PAT-00412 não tem nome e é do modelo "HP LaserJet M404"
- **THEN** a lista a mostra como "HP LaserJet M404", com o patrimônio PAT-00412 ao lado

### Requirement: Origem, momento, autor e trava

Cada valor do ativo SHALL guardar, junto dele:
- a origem: manual, planilha, coleta ou API;
- o momento da última gravação;
- o autor, a conta que gravou, quando houver;
- a trava.

O modelo do ativo SHALL ter o mesmo estado que um campo.

Quem edita ativos SHALL poder travar e destravar cada campo, com o valor ou sem ele. Um campo travado SHALL mudar só pela edição manual. A edição manual SHALL respeitar a trava de quem a ligou: ela muda o valor e mantém a trava. A política de escrita do campo só manual (spec catalogo-de-ativos) SHALL valer como uma trava que não se desliga.

A ficha SHALL mostrar, em cada campo gravado, a origem, o autor e o momento, no fuso escolhido.

#### Scenario: Valor digitado
- **WHEN** Ana muda o hostname da impressora para "IMP-ALMOX-01" e salva
- **THEN** a ficha mostra, no Hostname, "Manual · Ana Souza", com o momento da gravação

#### Scenario: Campo travado
- **WHEN** quem edita ativos trava o Local de um computador
- **THEN** o Local passa a mostrar a trava, e uma gravação que não seja manual não pode mudá-lo

### Requirement: Acesso pelo local do ativo

O acesso a um ativo SHALL seguir o local dele (spec permissoes):
- **ver:** `ativos.ver` no ramo do local do ativo;
- **cadastrar, editar, travar, inativar e reativar:** `ativos.editar` no ramo do local do ativo;
- **mudar o local:** `ativos.editar` no local de antes e no de depois.

Um ativo sem local SHALL ser alcançado só por quem tem a permissão na organização inteira. A lista SHALL mostrar só os ativos que a conta pode ver, e cada ativo SHALL dizer o que a conta pode fazer com ele.

#### Scenario: Técnico de uma unidade
- **WHEN** Bruno tem `ativos.editar` em "Jundiaí" e abre a lista dos ativos
- **THEN** a lista mostra só os ativos dos locais de Jundiaí, e o cadastro só aceita um local dentro de Jundiaí

#### Scenario: Mudança para fora do escopo
- **WHEN** Bruno tenta mudar o local de um ativo de "Jundiaí" para "Campinas", onde ele não edita ativos
- **THEN** a API recusa com 403, e a recusa vai para a auditoria

### Requirement: Campos restritos do ativo

O valor de um campo restrito (spec catalogo-de-ativos) SHALL aparecer só para quem tem `ativos.restritos` no local do ativo. Para os outros, o campo SHALL NOT aparecer na ficha, na lista nem na busca, e a API SHALL NOT devolver o valor nem o estado dele.

Editar ou travar um campo restrito SHALL exigir `ativos.restritos` e `ativos.editar` no local do ativo.

#### Scenario: Valor de compra restrito
- **WHEN** o "Valor de compra" é restrito e Bruno, sem `ativos.restritos`, abre a ficha do ativo
- **THEN** a ficha não mostra o "Valor de compra", e a resposta da API não traz o valor

### Requirement: Referências do ativo

O local, o responsável e os campos de pessoa, de local e de ativo SHALL guardar o identificador do registro. Ao escolher, o registro SHALL estar ativo:
- "O local escolhido está inativo. Escolha um local ativo.";
- "A pessoa escolhida está inativa. Escolha uma pessoa ativa.";
- "O ativo escolhido está inativo.".

Um ativo SHALL NOT referenciar a si mesmo. A ficha SHALL mostrar cada referência pelo nome atual: o caminho do local, o nome da pessoa e o nome do ativo. Um ativo que a conta não pode ver SHALL aparecer como "Ativo fora do seu acesso".

#### Scenario: Responsável anonimizado
- **WHEN** o responsável por um computador é anonimizado
- **THEN** a ficha do computador mostra o responsável como "Pessoa anonimizada" com o código, e o computador continua com a referência

### Requirement: Inativação e reativação do ativo

Quem edita ativos no local do ativo SHALL poder inativá-lo, depois de confirmar, e reativá-lo. A inativação SHALL dizer que o ativo sai da lista e que os dados ficam guardados.

#### Scenario: Reativação
- **WHEN** quem edita ativos reativa a impressora PAT-00412
- **THEN** ela volta à lista, com os valores e a situação de uso que tinha

### Requirement: Lista dos ativos

A lista dos ativos SHALL mostrar, para cada ativo:
- a miniatura da imagem do modelo ou o ícone do tipo;
- o nome do ativo, com o tipo;
- o patrimônio;
- o caminho do local;
- a situação, em texto: a situação de uso, ou "Inativo".

A lista SHALL:
- buscar pelo nome, pelo patrimônio, pela série, pelo hostname e pelo fabricante e o nome do modelo, sem diferenciar acento e maiúsculas;
- filtrar pelo tipo, pelo local, com tudo o que estiver dentro dele, e pela situação: os ativos (o padrão), cada situação de uso, os inativos ou todos;
- guardar a busca e os filtros no endereço, e mostrar os filtros ativos;
- mostrar quantos ativos atendem aos filtros e trazer mais ao fim da lista, os cadastrados por último primeiro;
- oferecer "Novo ativo" a quem pode cadastrar.

Uma lista vazia SHALL dizer "Nenhum ativo encontrado.", com "Limpar filtros" quando há filtro e "Novo ativo" quando não há.

#### Scenario: Busca pelo modelo
- **WHEN** alguém digita "laserjet" na busca da lista
- **THEN** a lista mostra as impressoras do modelo "HP LaserJet M404", e a busca fica no endereço

#### Scenario: Filtro pelo local
- **WHEN** alguém filtra a lista por "Jundiaí"
- **THEN** a lista mostra os ativos de Jundiaí e dos locais dentro dele

### Requirement: Cadastro e ficha do ativo

O cadastro SHALL começar pelo tipo, entre os tipos ativos, e mostrar em seguida os campos dele. Sem nenhum tipo ativo, o cadastro SHALL dizer "Nenhum tipo de ativo ainda." e oferecer o catálogo a quem cuida dele.

A ficha SHALL mostrar o nome do ativo, a situação, o patrimônio e a miniatura do modelo, e os campos nestes grupos, nesta ordem:
1. Identificação, com o tipo, só para leitura, e o modelo;
2. Uso;
3. os grupos dos campos da organização, na ordem do tipo, e os campos sem grupo em "Outros";
4. um grupo por capacidade ligada;
5. Administrativo.

Cada campo SHALL mostrar o estado dele e a trava. As recusas da API SHALL aparecer no próprio campo, e o formulário SHALL continuar preenchido. Quem não pode editar o ativo SHALL ver a ficha só para leitura.

Os retornos SHALL ser "Ativo cadastrado.", "Ativo salvo.", "Ativo inativado." e "Ativo reativado.".

#### Scenario: Primeiro ativo
- **WHEN** quem edita ativos escolhe o tipo "Impressora" no cadastro
- **THEN** o formulário mostra o modelo, os campos comuns, os campos do tipo e os da capacidade ligada, nos grupos da ficha

#### Scenario: Ficha só para leitura
- **WHEN** uma conta só com `ativos.ver` abre a ficha de um ativo
- **THEN** ela vê os valores e o estado de cada campo, sem as ações de salvar, travar e inativar
