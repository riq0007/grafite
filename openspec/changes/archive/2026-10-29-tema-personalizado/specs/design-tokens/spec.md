## ADDED Requirements

### Requirement: Tema e destaque personalizados em tempo de execução

O tema e o destaque personalizados SHALL ser gerados no navegador pelo mesmo gerador dos temas de fábrica, com as mesmas garantias de contraste, e SHALL ser aplicados como variáveis no `<html>`. Por baixo deles SHALL valer o tema de fábrica do mesmo tom (o Grafite, no escuro, e o Névoa, no claro), para os tokens que não são cor.

O tema e o destaque personalizados SHALL valer desde a primeira pintura, pela cópia do navegador. O script anti-flash SHALL aceitar só as variáveis de cor e de sombra, com valores feitos de números, cores em hexadecimal e `rgb()` ou `rgba()`, e SHALL ignorar as outras.

#### Scenario: Reabertura com o tema personalizado
- **WHEN** o usuário reabre a aplicação com o tema personalizado claro, na matiz 80, salvo
- **THEN** a primeira pintura já usa esse tema, sem piscar o Grafite

#### Scenario: Volta a um tema de fábrica
- **WHEN** o usuário troca o tema Personalizado pelo Névoa, com o destaque azul
- **THEN** nenhuma variável do tema personalizado fica no `<html>`, e a interface usa o Névoa com o azul gerado para ele

#### Scenario: Valor estranho na cópia
- **WHEN** a cópia do navegador traz uma variável de cor com `url(` no valor
- **THEN** o anti-flash ignora essa variável e aplica as demais
