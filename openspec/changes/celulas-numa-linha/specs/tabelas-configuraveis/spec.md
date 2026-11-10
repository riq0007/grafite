## MODIFIED Requirements

### Requirement: Resumo da linha

Quando o mouse para 1,5 s sobre uma linha, a tabela SHALL mostrar junto dela o resumo das colunas à vista que estão fora da área visível, cortadas ou além da rolagem, e das colunas cujo conteúdo não coube na célula (spec componentes-base, "Célula numa linha só"), com o rótulo e o valor inteiro de cada uma, e "—" no valor vazio. Sem coluna fora da área visível e sem conteúdo cortado, o resumo SHALL NOT aparecer.

O resumo SHALL:
- mostrar cada valor inteiro, sem reticências: o que passa da largura do resumo continua na linha de baixo, também quando o valor tem a situação e um texto ao lado;
- fechar quando o mouse vai para outra linha ou sai da tabela, quando a tabela rola e com uma tecla;
- não receber o foco nem mudar a linha em foco;
- não aparecer pelo toque nem quando o usuário o desligou nos Ajustes › Tabelas;
- aparecer sem animação de escala com o movimento reduzido.

#### Scenario: Colunas fora da tela
- **WHEN** a tabela tem doze colunas, as quatro últimas além da rolagem, e o mouse para 1,5 s sobre uma linha
- **THEN** aparece o resumo com as quatro colunas e os valores daquela linha

#### Scenario: Todas à vista
- **WHEN** todas as colunas da tabela cabem na janela, com o conteúdo inteiro em cada célula, e o mouse para sobre uma linha
- **THEN** nenhum resumo aparece

#### Scenario: Mouse em movimento
- **WHEN** o mouse passa sobre várias linhas sem parar 1,5 s em nenhuma
- **THEN** nenhum resumo aparece

#### Scenario: Toque
- **WHEN** o usuário toca e segura numa linha num tablet
- **THEN** o resumo não aparece, e o menu de contexto abre

#### Scenario: Conteúdo cortado na célula
- **WHEN** a coluna "Suprimentos" corta "8% · Black Toner Cartridge" numa linha, com todas as colunas dentro da tela, e o mouse para 1,5 s sobre ela
- **THEN** o resumo aparece com "Suprimentos" e o valor inteiro, e as colunas que couberam ficam fora dele

#### Scenario: Valor mais largo que o resumo
- **WHEN** o resumo traz "Suprimentos" com "8%", o rótulo "Desatualizado", a descrição do suprimento e "há 12 dias", e tudo junto passa da largura do resumo
- **THEN** o rótulo "Desatualizado" aparece inteiro, a descrição e a idade continuam na linha de baixo, e nada termina em reticências nem sai do resumo
