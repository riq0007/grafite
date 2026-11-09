## MODIFIED Requirements

### Requirement: Imagens genéricas de ativo

Quando nem o ativo nem o seu modelo têm imagem, o sistema SHALL exibir a imagem genérica do tipo. A imagem genérica SHALL caber no quadrado da miniatura em qualquer densidade, sem distorção e com a mesma margem interna das imagens reais.

#### Scenario: Ativo sem imagem na densidade compacta
- **WHEN** um nobreak sem imagem aparece numa tabela em densidade compacta
- **THEN** a miniatura mostra a imagem genérica de nobreak dentro do quadrado de 24 px, sem distorção
