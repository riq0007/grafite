## ADDED Requirements

### Requirement: Célula numa linha só

Toda linha da tabela SHALL ter a altura da densidade, com o conteúdo de cada célula numa linha só. O conteúdo que não cabe na largura da coluna SHALL NOT passar para a linha de baixo nem aumentar a altura da linha: ele SHALL terminar cortado, com reticências no texto.

Na célula com mais de uma parte, como a situação com a idade da leitura, as partes SHALL ficar lado a lado, e o corte SHALL seguir esta ordem:
- os rótulos de situação ficam inteiros, enquanto couberem na coluna;
- o texto que os acompanha, como "há 2 min" ou a descrição do suprimento, é o que encolhe e termina em reticências.

A regra SHALL valer na tabela base e na que desenha só as linhas perto da área visível, em todas as densidades. Fora das tabelas, como na ficha, as mesmas partes SHALL continuar quebrando a linha quando falta largura. As colunas da coleta dos ativos SHALL nascer com a largura que mostra a situação e a idade sem corte.

#### Scenario: Disponibilidade numa coluna estreita
- **WHEN** a coluna "Disponibilidade" da tabela dos ativos está com 96 px, e uma impressora está "Offline", lida "há 12 min"
- **THEN** a linha dela tem a mesma altura das outras, o rótulo "Offline" aparece inteiro, e a idade termina cortada, sem ir para a linha de baixo

#### Scenario: Suprimentos numa coluna estreita
- **WHEN** a coluna "Suprimentos" está com 140 px, e o menor nível é "8% · Black Toner Cartridge"
- **THEN** o medidor e "8%" ficam à vista, e a descrição termina em reticências, na mesma linha

#### Scenario: Leitura desatualizada
- **WHEN** a leitura do Control iD de um controle está "Sem resposta" e "Desatualizado", numa coluna com a largura de fábrica
- **THEN** os dois rótulos e a idade ficam lado a lado, numa linha só

#### Scenario: Densidade compacta
- **WHEN** a tabela dos ativos está na densidade compacta, com a coluna "Total de páginas" em 80 px
- **THEN** toda linha tem a altura da densidade compacta

#### Scenario: Largura de fábrica
- **WHEN** uma conta que nunca mexeu nas colunas mostra a coluna "Disponibilidade"
- **THEN** "Offline" e "há 12 min" aparecem inteiros

#### Scenario: Ficha continua quebrando
- **WHEN** a ficha do ativo mostra a mesma disponibilidade numa janela estreita
- **THEN** a situação e a idade quebram a linha, sem corte
