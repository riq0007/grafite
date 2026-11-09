## ADDED Requirements

### Requirement: Consumíveis do fornecedor

Com o módulo Operação ligado, a ficha do fornecedor SHALL mostrar:
- para quem vê os consumíveis, "Consumíveis deste fornecedor", com os consumíveis ativos que ele vende (spec consumiveis), pelo código, com o nome, cada um levando à ficha do consumível;
- para quem vê o estoque, "Entradas no estoque", com quantas entradas dele houve nos locais que a conta vê, a data da última e o caminho para as Movimentações filtradas por ele.

Sem nenhum, as linhas SHALL dizer "Nenhum consumível deste fornecedor." e "Nenhuma entrada deste fornecedor no estoque.".

#### Scenario: Toners da HP Brasil
- **WHEN** quem vê os fornecedores, os consumíveis e o estoque abre a ficha da "HP Brasil", que vende o CF258A e o CF258X e teve 3 entradas, a última em 12/10
- **THEN** a ficha mostra os dois consumíveis e "Entradas no estoque: 3, a última em 12/10", com o caminho para as movimentações

#### Scenario: Sem ver os consumíveis
- **WHEN** quem vê os fornecedores, sem `consumiveis.ver` e sem `estoque.ver`, abre a ficha da HP Brasil
- **THEN** a ficha não mostra os consumíveis nem as entradas
