## MODIFIED Requirements

### Requirement: Escolha da visão e editor de filtro

A escolha da visão SHALL mostrar o nome da visão aberta e, quando a conta tem mudanças guardadas sobre ela, "Personalizada" em texto, ou "Do link" quando a tabela veio de um endereço com mudanças, e abrir o menu das visões com os grupos e as ações (spec visoes-de-tabela). O editor de filtro SHALL mostrar a coluna, o operador e os campos do valor conforme o tipo do filtro, com "Aplicar filtro" e, num filtro que já existe, "Tirar filtro", e as recusas no próprio campo.

#### Scenario: Visão alterada à vista
- **WHEN** a conta tem mudanças guardadas sobre a visão "Impressoras"
- **THEN** a escolha da visão mostra "Impressoras" e "Personalizada" em texto, e não só por um ponto ou por uma cor

#### Scenario: Tabela de um link
- **WHEN** a tabela abre por um endereço com mudanças sobre "Impressoras"
- **THEN** a escolha da visão mostra "Impressoras" e "Do link" em texto
