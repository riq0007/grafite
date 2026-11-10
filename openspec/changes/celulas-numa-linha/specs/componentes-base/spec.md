## ADDED Requirements

### Requirement: Célula numa linha só

Toda linha da tabela SHALL ter a altura da densidade, com o conteúdo de cada célula numa linha só. O conteúdo que não cabe na largura da coluna SHALL NOT passar para a linha de baixo nem aumentar a altura da linha: ele SHALL terminar cortado, com reticências no texto.

Na célula com mais de uma parte, como a situação com a idade da leitura, as partes SHALL ficar lado a lado, e o corte SHALL seguir esta ordem:
- os rótulos de situação ficam inteiros, enquanto couberem na coluna;
- o texto que os acompanha, como "há 2 min" ou a descrição do suprimento, é o que encolhe e termina em reticências.

A regra SHALL valer na tabela base e na que desenha só as linhas perto da área visível, em todas as densidades. Fora das tabelas, como na ficha, as mesmas partes SHALL continuar quebrando a linha quando falta largura. As colunas da coleta dos ativos SHALL nascer com, pelo menos, a largura que mostra a situação e a idade de uma leitura em dia sem corte, também quando a tabela divide a sobra entre as colunas (requisito "Tabela na largura toda").

#### Scenario: Disponibilidade numa coluna estreita
- **WHEN** a coluna "Disponibilidade" da tabela dos ativos está com 96 px, e uma impressora está "Offline", lida "há 2 min"
- **THEN** a linha dela tem a mesma altura das outras, o rótulo "Offline" aparece inteiro, e a idade termina cortada, sem ir para a linha de baixo

#### Scenario: Suprimentos numa coluna estreita
- **WHEN** a coluna "Suprimentos" está com 140 px, e o menor nível é "8% · Black Toner Cartridge"
- **THEN** o medidor e "8%" ficam à vista, e a descrição termina em reticências, na mesma linha

#### Scenario: Leitura desatualizada
- **WHEN** a leitura do Control iD de um controle está "Sem resposta" e "Desatualizado", numa coluna com a largura de fábrica
- **THEN** os dois rótulos e a idade ficam lado a lado, numa linha só, e o que não cabe termina cortado na borda da célula

#### Scenario: Densidade compacta
- **WHEN** a tabela dos ativos está na densidade compacta, com a coluna "Total de páginas" em 80 px
- **THEN** toda linha tem a altura da densidade compacta

#### Scenario: Largura de fábrica
- **WHEN** uma conta que nunca mexeu nas colunas mostra a coluna "Disponibilidade" entre outras nove colunas, numa janela de 1.280 px, e uma impressora está "Offline", lida "há 2 min"
- **THEN** a coluna tem pelo menos 210 px, "Offline" e "há 2 min" aparecem inteiros, e a tabela rola de lado

#### Scenario: Ficha continua quebrando
- **WHEN** a ficha do ativo mostra a mesma disponibilidade numa janela estreita
- **THEN** a situação e a idade quebram a linha, sem corte

## MODIFIED Requirements

### Requirement: Tabela na largura toda

A tabela SHALL ocupar a largura da área em que está. Na tabela redimensionável:
- a coluna sem largura guardada SHALL dividir com as outras o espaço que sobra;
- a coluna principal SHALL ficar com o dobro;
- a coluna que declara a largura que o conteúdo dela pede, como as da coleta dos ativos, SHALL NOT ficar mais estreita que essa largura na divisão, e a tabela SHALL rolar de lado quando as larguras passam da área;
- a largura que a conta arrasta SHALL continuar guardada, e com ela a coluna SHALL poder ficar mais estreita que o conteúdo pede.

A linha que abre um registro SHALL mudar de fundo ao passar o ponteiro, sem outra animação.

#### Scenario: Tabela com quatro colunas
- **WHEN** a tabela dos ativos mostra só quatro colunas numa janela de 1.400 px
- **THEN** as colunas dividem a largura toda, com a do nome maior que as outras

#### Scenario: Coluna que pede mais que a divisão
- **WHEN** a tabela dos ativos mostra dez colunas sem largura guardada numa janela de 1.280 px, entre elas a "Disponibilidade"
- **THEN** a "Disponibilidade" fica com a largura que o conteúdo dela pede, as outras ficam com a parte delas na divisão, e a tabela rola de lado

#### Scenario: Coluna estreitada pela conta
- **WHEN** a conta arrasta a "Disponibilidade" até 64 px
- **THEN** a coluna fica com 64 px, e o conteúdo dela termina cortado, numa linha só
