## MODIFIED Requirements

### Requirement: Origem, momento, autor e trava

Cada valor do ativo SHALL guardar, junto dele:
- a origem: manual, planilha, coleta ou API;
- o momento da última gravação;
- o autor: a conta que gravou ou, na coleta, o coletor que leu o valor;
- a trava.

O modelo do ativo SHALL ter o mesmo estado que um campo.

Quem edita ativos SHALL poder travar e destravar cada campo, com o valor ou sem ele. Um campo travado SHALL mudar só pela edição manual. A edição manual SHALL respeitar a trava de quem a ligou: ela muda o valor e mantém a trava. A política de escrita do campo só manual (spec catalogo-de-ativos) SHALL valer como uma trava que não se desliga.

A ficha SHALL mostrar, em cada campo gravado, a origem, o autor e o momento, no fuso escolhido. O valor gravado pela importação (spec importacao-de-ativos) SHALL ter a origem "planilha" e, como autor, a conta que importou. O valor gravado pela coleta (spec impressoras-por-snmp) SHALL ter a origem "coleta" e, como autor, o nome do coletor; a mudança SHALL entrar na auditoria com o coletor como quem fez.

#### Scenario: Valor digitado
- **WHEN** Ana muda o hostname da impressora para "IMP-ALMOX-01" e salva
- **THEN** a ficha mostra, no Hostname, "Manual · Ana Souza", com o momento da gravação

#### Scenario: Campo travado
- **WHEN** quem edita ativos trava o Local de um computador
- **THEN** o Local passa a mostrar a trava, e uma gravação que não seja manual não pode mudá-lo

#### Scenario: Valor importado
- **WHEN** Ana importa uma planilha que muda o hostname da impressora PAT-00412
- **THEN** a ficha mostra, no Hostname, "Planilha · Ana Souza", com o momento da gravação

#### Scenario: Valor coletado
- **WHEN** o "Coletor de Jundiaí" lê o número de série da impressora PAT-00412
- **THEN** a ficha mostra, no Número de série, "Coleta · Coletor de Jundiaí", com o momento da gravação

### Requirement: Cadastro e ficha do ativo

O cadastro SHALL começar pelo tipo, entre os tipos ativos, e mostrar em seguida os campos dele. Sem nenhum tipo ativo, o cadastro SHALL dizer "Nenhum tipo de ativo ainda." e oferecer o catálogo a quem cuida dele. Os campos de arquivo e de imagem SHALL aparecer no cadastro com "Envie depois de cadastrar o ativo.", sem o envio.

O cabeçalho da ficha SHALL mostrar a imagem do ativo, ou a do modelo, ou o ícone do tipo, o nome do ativo, a situação e o patrimônio, e oferecer "Imprimir etiqueta", que abre a tela das etiquetas com o ativo (spec etiquetas-de-ativos). A ficha SHALL ter as abas Dados, Ligados (spec ligacoes-de-ativos) e Histórico, e a aba aberta SHALL ficar no endereço.

A aba Dados SHALL mostrar os campos nestes grupos, nesta ordem:
1. Identificação, com o tipo, só para leitura, e o modelo;
2. Uso;
3. os grupos dos campos da organização, na ordem do tipo, e os campos sem grupo em "Outros";
4. um grupo por capacidade ligada;
5. Administrativo.

No ativo de um tipo com a disponibilidade na rede, o grupo dela SHALL mostrar a situação (spec disponibilidade-de-rede), desde quando ela vale, a idade da última leitura, a latência e o coletor que a fez, ou "Não verificado" com o motivo. No ativo de um tipo com os suprimentos e contadores, o grupo dela SHALL mostrar o painel Suprimentos (spec impressoras-por-snmp).

Cada campo SHALL mostrar o estado dele e a trava. As recusas da API SHALL aparecer no próprio campo, e o formulário SHALL continuar preenchido. Quem não pode editar o ativo SHALL ver a ficha só para leitura.

Os retornos SHALL ser "Ativo cadastrado.", "Ativo salvo.", "Ativo inativado." e "Ativo reativado.".

#### Scenario: Primeiro ativo
- **WHEN** quem edita ativos escolhe o tipo "Impressora" no cadastro
- **THEN** o formulário mostra o modelo, os campos comuns, os campos do tipo e os da capacidade ligada, nos grupos da ficha

#### Scenario: Ficha só para leitura
- **WHEN** uma conta só com `ativos.ver` abre a ficha de um ativo
- **THEN** ela vê os valores e o estado de cada campo, sem as ações de salvar, travar e inativar

#### Scenario: Aba no endereço
- **WHEN** alguém abre a aba Histórico da ficha da PAT-00412 e recarrega a página
- **THEN** a ficha volta na aba Histórico

#### Scenario: Etiqueta pela ficha
- **WHEN** quem vê ativos escolhe "Imprimir etiqueta" na ficha da PAT-00412
- **THEN** a tela das etiquetas abre com a etiqueta da PAT-00412

#### Scenario: Arquivo no cadastro
- **WHEN** o tipo "Notebook" usa o campo de arquivo "PDF da nota fiscal" e alguém cadastra um notebook
- **THEN** o cadastro mostra o "PDF da nota fiscal" com "Envie depois de cadastrar o ativo.", e a ficha do notebook cadastrado oferece o envio

#### Scenario: Disponibilidade na ficha
- **WHEN** alguém abre a ficha da impressora PAT-00412, offline desde as 10:32 e lida há 1 minuto pelo "Coletor de Jundiaí"
- **THEN** o grupo "Disponibilidade na rede" mostra "Offline", desde 10:32, "há 1 min" e o "Coletor de Jundiaí"

#### Scenario: Suprimentos na ficha
- **WHEN** alguém abre a ficha da impressora PAT-00412, de um tipo com os suprimentos e contadores
- **THEN** o grupo "Suprimentos e contadores" mostra o painel Suprimentos

### Requirement: Colunas da tabela dos ativos

A tabela dos ativos SHALL oferecer as colunas:
- **do ativo:** Ativo, a coluna principal, Tipo, Modelo, Situação, e "Cadastrado em" e "Atualizado em";
- **os campos comuns:** Patrimônio, Número de série, Hostname, Local, Responsável e os administrativos;
- **os campos da organização** ativos que algum tipo ativo usa, nos grupos deles;
- **os campos das capacidades** ligadas a algum tipo ativo, um grupo por capacidade;
- **a coleta:**
  - Disponibilidade, no grupo "Disponibilidade na rede", quando algum tipo ativo liga a capacidade (spec disponibilidade-de-rede);
  - Suprimentos e Total de páginas, no grupo "Suprimentos e contadores", quando algum tipo ativo liga a capacidade (spec impressoras-por-snmp).

Cada coluna SHALL mostrar o valor como a ficha o mostra:
- a pessoa, o local e o ativo pelo nome atual, e um ativo que a conta não pode ver como "Ativo fora do seu acesso";
- os identificadores (patrimônio, série, hostname, IP e MAC) e os números na fonte monoespaçada, com os números alinhados à direita e com algarismos tabulares;
- as datas em dd/mm/aaaa, e "Cadastrado em" e "Atualizado em" com a hora, no fuso escolhido;
- o arquivo pelo nome, e a imagem pela miniatura, no tamanho da miniatura da linha;
- a disponibilidade pela situação, com o ícone e o texto, e a idade da última leitura, com "Desatualizado" quando for o caso (spec leituras-e-estado). Num ativo de um tipo sem a capacidade, ou inativo, a coluna fica vazia;
- Suprimentos pelo menor nível medido entre os suprimentos da impressora, em percentual, com o suprimento ao lado, e Total de páginas pelo último total lido, cada um com a idade da leitura e "Desatualizado" quando for o caso. Sem nível medido nem total, ou num ativo de um tipo sem a capacidade, ou inativo, a coluna fica vazia.

A coluna de um campo restrito SHALL ser oferecida só a quem tem `ativos.restritos` em algum ramo. Ela SHALL mostrar o valor só nos ativos em que a conta tem `ativos.restritos`, e "Fora do seu acesso" nos outros.

#### Scenario: Campo da capacidade
- **WHEN** o tipo "Computador" liga o inventário de hardware, e o usuário abre o painel "Colunas"
- **THEN** o painel mostra o grupo "Inventário de hardware", com o processador, a memória e os outros campos da capacidade

#### Scenario: Restrito em parte
- **WHEN** Bruno tem `ativos.restritos` só em "Jundiaí" e mostra a coluna "Valor de compra"
- **THEN** os ativos de Jundiaí mostram o valor de compra, e os de Campinas mostram "Fora do seu acesso"

#### Scenario: Sem os restritos
- **WHEN** uma conta sem `ativos.restritos` abre o painel "Colunas"
- **THEN** o painel não oferece as colunas dos campos restritos

#### Scenario: Coluna de arquivo
- **WHEN** alguém mostra a coluna "PDF da nota fiscal", um campo de arquivo
- **THEN** cada ativo com a nota mostra o nome do arquivo, e os outros ficam com a coluna vazia

#### Scenario: Coluna da disponibilidade
- **WHEN** o tipo "Impressora" liga a disponibilidade na rede, e o usuário mostra a coluna "Disponibilidade"
- **THEN** cada impressora mostra "Online", "Offline", "Sem dado" ou "Não verificado", com o ícone e a idade da última leitura, e os computadores ficam com a coluna vazia

#### Scenario: Coluna dos suprimentos
- **WHEN** a PAT-00412 tem o toner a 8% e o cilindro a 60%, e o usuário mostra a coluna "Suprimentos"
- **THEN** a linha da PAT-00412 mostra "8%" com o toner ao lado e a idade da leitura

### Requirement: Ordenação e filtros dos ativos

Cada coluna da tabela dos ativos SHALL ordenar e filtrar conforme o que mostra:

| Coluna | Ordena por | Filtros |
|---|---|---|
| Ativo | o nome mostrado, em ordem alfabética | contém |
| Tipo e Modelo | o nome do tipo; o fabricante e o modelo | é qualquer de |
| Situação | em uso, em estoque, em manutenção e inativo | o filtro de situação da lista |
| Cadastrado em e Atualizado em | o momento | de e até |
| texto, texto longo, licença, URL e MAC | o texto, em ordem alfabética | contém |
| IP | o endereço, pelos números, e não pelo texto | contém |
| número inteiro, decimal e moeda | o número | de e até |
| data | a data | de e até |
| lista | a ordem das opções no campo | é qualquer de |
| lista múltipla | não ordena | é qualquer de, com pelo menos uma das opções |
| pessoa | o nome atual | é qualquer de |
| local | o caminho | em, com tudo o que estiver dentro |
| ativo | não ordena | só "Está vazio" e "Está preenchido" |
| arquivo e imagem | não ordena | só "Está vazio" e "Está preenchido" |
| Disponibilidade | Offline, Sem dado, Online e Não verificado, e na mesma situação, a leitura mais antiga primeiro | é qualquer de, entre Online, Offline, Sem dado e Não verificado |
| Suprimentos | o menor nível medido | de e até, em percentual |
| Total de páginas | o último total lido | de e até |

"Está vazio" e "Está preenchido" SHALL valer em toda coluna que pode ficar sem valor. A ordem alfabética SHALL ser a do português, com as letras acentuadas junto das sem acento.

A ordenação e os filtros SHALL valer sobre todos os ativos que a conta pode ver, no servidor. Num campo restrito, o filtro SHALL considerar só os ativos em que a conta tem `ativos.restritos`, e a ordenação SHALL tratar como vazio o valor que ela não vê.

#### Scenario: Ordenar pelo IP
- **WHEN** a tabela é ordenada pelo IP, crescente, com os IPs 10.0.0.10 e 10.0.0.9
- **THEN** o 10.0.0.9 vem antes do 10.0.0.10

#### Scenario: Lista pela ordem das opções
- **WHEN** o campo "Criticidade" tem as opções Alta, Média e Baixa, nessa ordem, e a tabela é ordenada por ele, crescente
- **THEN** os ativos de criticidade Alta vêm primeiro, depois os de Média e os de Baixa, e os sem criticidade por último

#### Scenario: Filtro pelo restrito
- **WHEN** Bruno, com `ativos.restritos` só em "Jundiaí", filtra "Valor de compra" de R$ 1.000,00 até R$ 5.000,00
- **THEN** a tabela mostra só os ativos de Jundiaí com o valor nesse intervalo, e nenhum de Campinas

#### Scenario: Ativos sem a nota fiscal
- **WHEN** alguém filtra a coluna "PDF da nota fiscal", um campo de arquivo, por "Está vazio"
- **THEN** a tabela mostra só os ativos sem a nota fiscal enviada

#### Scenario: Só os offline
- **WHEN** alguém filtra a coluna "Disponibilidade" por "Offline" e "Sem dado"
- **THEN** a tabela mostra só os ativos com essas situações, e o filtro fica no endereço, como os outros

#### Scenario: O que caiu primeiro
- **WHEN** a tabela é ordenada pela disponibilidade, crescente
- **THEN** os ativos offline vêm primeiro, e entre eles, o de leitura mais antiga

#### Scenario: Impressoras com pouco suprimento
- **WHEN** alguém filtra a coluna "Suprimentos" de 0% até 20% e ordena por ela, crescente
- **THEN** a tabela mostra só as impressoras com algum suprimento medido até 20%, a de menor nível primeiro
