## ADDED Requirements

### Requirement: Aviso do ambiente de teste

No ambiente de teste, a tela de entrada SHALL mostrar, acima do formulário, o texto "Ambiente de teste" com um ícone, e a frase "Os dados são uma cópia da produção. O que mudar aqui não vai para a produção." Nos outros ambientes, o aviso SHALL NOT aparecer.

#### Scenario: Entrada no teste
- **WHEN** alguém abre o endereço do ambiente de teste sem sessão
- **THEN** a tela de entrada mostra "Ambiente de teste" e a frase sobre a cópia da produção, antes do usuário e da senha

#### Scenario: Entrada na produção
- **WHEN** alguém abre o endereço da produção sem sessão
- **THEN** a tela de entrada não mostra o aviso
