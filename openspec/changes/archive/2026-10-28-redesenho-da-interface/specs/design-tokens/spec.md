## MODIFIED Requirements

### Requirement: Três densidades

O sistema SHALL oferecer três densidades:

| Densidade | Linha | Miniatura | Controle |
|---|---|---|---|
| Compacta | 36 px | 24 px | 32 px |
| Normal (padrão de fábrica) | 44 px | 30 px | 36 px |
| Confortável | 52 px | 36 px | 40 px |

#### Scenario: Troca de densidade
- **WHEN** a densidade muda de normal para confortável
- **THEN** a altura das linhas passa de 44 px para 52 px e a miniatura de 30 px para 36 px

#### Scenario: Conta nova
- **WHEN** uma conta entra pela primeira vez, sem ter escolhido a densidade
- **THEN** a interface usa a densidade Normal

### Requirement: Tipografia auto-hospedada e escala definida

A interface SHALL usar Instrument Sans e JetBrains Mono, servidas pela própria aplicação, sem depender de internet. A tipografia SHALL ter uma escala definida: 12 px no rótulo, 13 no dado, 14 no corpo, 16 no subtítulo, 20 no título e 26 no título grande. Números em tabelas e indicadores SHALL usar algarismos tabulares. Identificadores (patrimônio, série, IP, MAC, horários) SHALL usar a fonte monoespaçada.

#### Scenario: Servidor sem internet
- **WHEN** a aplicação roda num servidor sem acesso à internet
- **THEN** as fontes carregam normalmente

#### Scenario: Coluna numérica
- **WHEN** uma coluna mostra valores numéricos em linhas seguidas
- **THEN** os algarismos ficam alinhados verticalmente

#### Scenario: Texto do corpo
- **WHEN** uma tela mostra um parágrafo
- **THEN** ele aparece em 14 px
