## MODIFIED Requirements

### Requirement: Suprimentos que acabam primeiro

O Ativos SHALL registrar o bloco "Suprimentos que acabam primeiro", para quem vê os ativos. O bloco SHALL mostrar até 6 impressoras, do menor nível para o maior. Cada uma SHALL trazer:
- o cartucho do suprimento de menor nível, na tinta dele;
- o nome da impressora e a descrição do suprimento;
- o nível, como "8%";
- a estimativa de quando acaba, como "Acaba em cerca de 9 dias", quando as leituras permitem.

Clicar numa impressora SHALL abrir a ficha dela. Sem impressora com o nível lido, o bloco SHALL mostrar "Nenhuma impressora com o nível lido.".

O bloco SHALL ter estas opções (requisito "Opções dos blocos"):
- **Tipos de suprimento:** Toner, Cilindro, Fusor e Outros, pelo tipo que a leitura dá a cada suprimento (spec impressoras-por-snmp, "Nível dos suprimentos"); de fábrica, os quatro. Pelo menos um SHALL ficar escolhido;
- **Locais:** os locais cujas impressoras entram, com os de dentro; de fábrica, todos os que a conta vê;
- **Impressoras:** quantas o bloco mostra, de 3 a 12; de fábrica, 6;
- **Nível:** só os suprimentos até o nível escolhido, de 5% a 100%; de fábrica, 100%, que não corta nada.

Com os tipos escolhidos, o suprimento de menor nível de cada impressora SHALL ser o menor entre os tipos escolhidos, e a impressora sem suprimento desses tipos com o nível lido SHALL ficar de fora. Quando alguma opção difere da de fábrica, o bloco SHALL dizer o recorte em texto, abaixo do título, como "Toner · até 30% · Jundiaí". Sem nenhuma impressora no recorte, o bloco SHALL dizer "Nenhuma impressora neste recorte.".

#### Scenario: Toner quase no fim
- **WHEN** a Impressora do RH tem o toner preto em 8%, e a do Financeiro, o ciano em 40%
- **THEN** o bloco mostra a do RH primeiro, com o cartucho preto, "8%" e a estimativa, e depois a do Financeiro

#### Scenario: Só o toner
- **WHEN** a Impressora do RH tem o fusor em 3% e o toner preto em 60%, e a conta escolhe só Toner nos tipos
- **THEN** o bloco mostra a Impressora do RH com o toner preto em "60%", e o fusor não aparece

#### Scenario: Só o fusor
- **WHEN** a conta escolhe só Fusor, e só a Impressora do RH informa o nível do fusor
- **THEN** o bloco mostra só a Impressora do RH, com o fusor em "3%"

#### Scenario: Até 30%
- **WHEN** a conta escolhe Toner e o nível até 30%, e nenhuma impressora tem toner em 30% ou menos
- **THEN** o bloco diz "Nenhuma impressora neste recorte.", com "Toner · até 30%" abaixo do título

#### Scenario: Recorte em texto
- **WHEN** a conta escolhe só Toner, até 30%, no local Jundiaí
- **THEN** o bloco mostra "Toner · até 30% · Jundiaí" abaixo do título

### Requirement: Personalizar o Início

O Início SHALL ter "Personalizar o Início", que abre um modo em que cada bloco ganha Subir, Descer e Ocultar. "O que resolver agora" SHALL ficar sempre à vista: ele sobe e desce, sem Ocultar. Os blocos ocultos SHALL ficar numa lista, cada um com Mostrar. "Concluir" SHALL fechar o modo. A ordem e os ocultos SHALL ficar gravados na conta, e o bloco novo de um módulo SHALL entrar no fim, à vista.

No mesmo modo, cada bloco de módulo SHALL ganhar também:
- "Largura", com "Inteira" e "Metade" (requisito "Largura dos blocos");
- "Opções…", quando o bloco tem opções (requisito "Opções dos blocos").

#### Scenario: Subir um bloco
- **WHEN** o usuário personaliza o Início e sobe "Suprimentos que acabam primeiro" acima de "O que resolver agora"
- **THEN** o Início passa a abrir com os suprimentos primeiro, também depois de sair e voltar

#### Scenario: Ocultar e mostrar
- **WHEN** o usuário oculta "Backups do Control iD"
- **THEN** o bloco sai do Início e aparece na lista dos ocultos, com Mostrar, que o devolve ao fim

#### Scenario: O que resolver agora sempre à vista
- **WHEN** o usuário personaliza o Início
- **THEN** "O que resolver agora" tem Subir e Descer, sem Ocultar

#### Scenario: Bloco sem opções
- **WHEN** o usuário personaliza o Início, e "Backups do Control iD" não declara opções
- **THEN** esse bloco tem Subir, Descer, Ocultar e Largura, sem "Opções…"

## ADDED Requirements

### Requirement: Opções dos blocos

Um módulo SHALL poder declarar as opções do bloco dele, sem mudança na casca. Cada opção SHALL ter o rótulo, o valor de fábrica e uma destas formas:
- uma escolha de um ou mais valores de uma lista fixa;
- um número, com o mínimo, o máximo e a unidade;
- uma escolha de locais, na árvore de locais.

No modo Personalizar, "Opções…" SHALL abrir uma gaveta com as opções do bloco, e cada mudança SHALL valer na hora no bloco e ficar gravada na conta, sem botão de salvar. A gaveta SHALL ter "Restaurar as opções", que volta todas às de fábrica. As opções SHALL valer em qualquer aparelho em que a conta entrar.

Um valor guardado que a opção não aceita mais, como um número fora do intervalo, SHALL dar lugar ao valor de fábrica daquela opção, e as outras SHALL continuar valendo. Numa escolha de vários, o valor que saiu da lista e o local que foi inativado SHALL sair da escolha, e os outros SHALL continuar; quando não sobra nenhum, ou sobram menos que o mínimo, SHALL valer o de fábrica.

#### Scenario: Opção gravada
- **WHEN** o usuário escolhe só Toner nas opções dos suprimentos, no computador, e abre o Início no notebook
- **THEN** o bloco do notebook mostra só o toner

#### Scenario: Restaurar as opções
- **WHEN** o usuário, com só Toner e até 30%, escolhe "Restaurar as opções"
- **THEN** o bloco volta aos quatro tipos, sem corte de nível, e o recorte some de baixo do título

#### Scenario: Local inativado nas opções
- **WHEN** as opções guardadas trazem só um local, que foi inativado
- **THEN** a opção dos locais volta a todos os locais, e o tipo escolhido continua valendo

#### Scenario: Um dos locais inativado
- **WHEN** as opções guardadas trazem Jundiaí e Campinas, e Campinas foi inativado
- **THEN** o bloco continua só com Jundiaí

### Requirement: Largura dos blocos

Cada bloco de módulo SHALL ter a largura "Inteira", a de fábrica, ou "Metade". Na janela larga, dois blocos de metade seguidos SHALL ficar lado a lado, e o bloco de metade sem um par SHALL ocupar a metade esquerda. Na janela estreita, no tablet e no celular, todo bloco SHALL ocupar a largura inteira. "O que resolver agora" SHALL ser sempre inteiro. A ordem da leitura e do teclado SHALL ser a ordem dos blocos, da esquerda para a direita e de cima para baixo.

#### Scenario: Dois blocos lado a lado
- **WHEN** o usuário põe "Suprimentos que acabam primeiro" e "Backups do Control iD" na largura Metade, um depois do outro, numa janela de 1.920 px
- **THEN** os dois ficam lado a lado, cada um com a metade da largura

#### Scenario: Metade no celular
- **WHEN** os mesmos dois blocos de metade abrem no celular
- **THEN** cada um ocupa a largura inteira, um embaixo do outro
