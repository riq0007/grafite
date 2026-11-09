## ADDED Requirements

### Requirement: Tabela na largura toda

A tabela SHALL ocupar a largura da área em que está. Na tabela redimensionável:
- a coluna sem largura guardada SHALL dividir com as outras o espaço que sobra;
- a coluna principal SHALL ficar com o dobro;
- a largura que a conta arrasta SHALL continuar guardada.

A linha que abre um registro SHALL mudar de fundo ao passar o ponteiro, sem outra animação.

#### Scenario: Tabela com quatro colunas
- **WHEN** a tabela dos ativos mostra só quatro colunas numa janela de 1.400 px
- **THEN** as colunas dividem a largura toda, com a do nome maior que as outras

### Requirement: Ação principal da tela em destaque

O cabeçalho de cada tela SHALL ter o título à esquerda, com a ação principal logo ao lado:
- a ação principal SHALL vir no nível primário, maior que os outros botões;
- as outras ações SHALL vir depois dela;
- uma linha SHALL separar o cabeçalho do conteúdo.

#### Scenario: Lista das solicitações
- **WHEN** a técnica abre a lista das solicitações
- **THEN** "Nova solicitação" aparece logo ao lado do título, maior que os outros botões
