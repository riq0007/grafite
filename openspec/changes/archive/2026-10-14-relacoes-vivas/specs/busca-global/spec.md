## MODIFIED Requirements

### Requirement: O que a busca encontra

A busca SHALL encontrar, em grupos com nome:
- **Nesta tela:** as ações da tela aberta, que o módulo dela registra, como "Novo ativo" e "Filtrar por tipo…" na tabela dos ativos, ou "Imprimir etiqueta" na ficha de um ativo;
- **Ir para:** os módulos e os itens dos menus de cada módulo registrado;
- **Ações:** comandos da casca e dos módulos, como abrir as notificações e trocar o tema;
- **Ajustes:** cada seção dos Ajustes e cada ajuste delas, como "Tamanho do dock".

Cada resultado SHALL mostrar o nome e, em texto secundário, onde fica, como "Ajustes › Dock". Com o campo vazio, a busca SHALL mostrar "Nesta tela", quando a tela aberta registra ações, e os módulos, no grupo Ir para. Cada grupo de registros de um provedor SHALL terminar com "Ver todos os N em <módulo>", quando o provedor conhece mais resultados que os mostrados, que abre a lista do módulo com a busca preenchida.

#### Scenario: Um ajuste
- **WHEN** o usuário digita "tamanho do dock"
- **THEN** aparece "Tamanho do dock", no grupo Ajustes, com "Ajustes › Dock" em texto secundário

#### Scenario: Campo vazio
- **WHEN** a busca abre
- **THEN** ela mostra os módulos no grupo Ir para, antes de qualquer digitação

#### Scenario: Ações da tela
- **WHEN** o usuário abre a busca com a tabela dos ativos aberta
- **THEN** o grupo "Nesta tela" mostra "Novo ativo" e "Filtrar por tipo…", antes de "Ir para"

#### Scenario: Ver todos
- **WHEN** o usuário busca "laserjet", e o provedor dos ativos acha 23 ativos
- **THEN** o grupo dos ativos mostra os primeiros e termina com "Ver todos os 23 em Ativos", que abre a tabela com a busca "laserjet"
