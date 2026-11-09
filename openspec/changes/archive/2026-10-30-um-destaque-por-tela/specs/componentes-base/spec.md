## MODIFIED Requirements

### Requirement: Ação principal da tela em destaque

O cabeçalho de cada tela SHALL trazer a ação principal no grupo das ações, à direita do título (requisito "Cabeçalho da página"):
- a ação principal SHALL vir primeiro no grupo, no nível primário, na altura dos outros botões;
- as outras ações SHALL vir depois dela;
- uma linha SHALL separar o cabeçalho do conteúdo.

Cada tela SHALL ter no máximo uma ação no nível primário à vista, fora dos diálogos e das gavetas. O estado vazio que repete a ação do cabeçalho SHALL oferecê-la no nível secundário.

#### Scenario: Lista das solicitações
- **WHEN** a técnica abre a lista das solicitações
- **THEN** "Nova solicitação" aparece à direita do título, no nível primário, e é a única ação primária da tela

#### Scenario: Lista vazia
- **WHEN** a lista dos modelos não tem nenhum modelo
- **THEN** o estado vazio oferece "Novo modelo" no nível secundário, e o "Novo modelo" do cabeçalho continua a única ação primária
