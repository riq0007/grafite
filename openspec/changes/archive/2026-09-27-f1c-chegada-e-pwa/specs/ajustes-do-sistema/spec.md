## MODIFIED Requirements

### Requirement: App Ajustes com seções

Ajustes SHALL ser um módulo com a lista de seções e o conteúdo da seção escolhida, e cada seção SHALL ter endereço próprio. As seções SHALL ser, nesta ordem: Aparência, Dock, Cursor, Notificações, Tabelas, Idioma e região e Acessibilidade, como na seção 7.4 da spec mestre. No celular, a lista e a seção SHALL aparecer uma de cada vez, com Voltar para a lista.

#### Scenario: Seção pelo endereço
- **WHEN** o usuário abre o endereço da seção Dock
- **THEN** Ajustes abre com a seção Dock escolhida na lista

#### Scenario: Seção pelo menu do dock
- **WHEN** o usuário escolhe "Dock" no menu de Ajustes do dock
- **THEN** a seção Dock abre

#### Scenario: Ajustes no celular
- **WHEN** o usuário abre Ajustes no celular
- **THEN** aparece só a lista de seções, e escolher uma mostra a seção, com Voltar para a lista

#### Scenario: Ordem das seções
- **WHEN** o usuário abre Ajustes
- **THEN** a lista mostra Aparência, Dock, Cursor, Notificações, Tabelas, Idioma e região e Acessibilidade, nessa ordem

## ADDED Requirements

### Requirement: Seção Idioma e região

A seção Idioma e região SHALL mostrar o idioma da interface, Português (Brasil), como informação, sem controle. Ela SHALL ajustar o fuso horário:
- "Seguir o sistema", que diz qual é o fuso do sistema, como "Horário de Brasília";
- ou um fuso escolhido numa lista com busca, com os fusos do Brasil primeiro e cada fuso com o nome em português e a diferença para o UTC, como "Horário do Amazonas · Manaus (UTC−4)".

A seção SHALL mostrar a data e a hora de agora no fuso escolhido, no formato do relógio da barra. A escolha SHALL valer na hora em toda a interface.

#### Scenario: Escolher um fuso
- **WHEN** o usuário escolhe o fuso de Manaus
- **THEN** a prévia da seção e o relógio da barra passam a mostrar a hora de Manaus na hora

#### Scenario: Seguir o sistema
- **WHEN** o fuso é "Seguir o sistema" e o sistema está no Horário de Brasília
- **THEN** a seção diz que o fuso do sistema é o Horário de Brasília, e a interface usa esse fuso

#### Scenario: Buscar um fuso
- **WHEN** o usuário digita "manaus" na busca de fusos
- **THEN** a lista mostra o Horário do Amazonas, de Manaus
