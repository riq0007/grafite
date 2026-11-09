## MODIFIED Requirements

### Requirement: Postura celular

No celular, o dock SHALL dar lugar a uma barra de abas embaixo, com os módulos em ordem de prioridade: até cinco abas, ou quatro e "Mais" quando houver mais de cinco módulos. Um módulo SHALL poder declarar que fica sempre em "Mais", como a Administração; com um módulo assim, a barra SHALL mostrar "Mais" mesmo com menos de cinco módulos, e as abas SHALL ser os outros, até quatro. "Mais" SHALL listar os módulos restantes num painel que sobe de baixo. A barra superior SHALL mostrar o nome do módulo e o menu do usuário. Tocar no nome do módulo SHALL abrir a árvore de menus do módulo e os menus da barra num painel que sobe de baixo, com os submenus no próprio painel e um botão Voltar. Todo alvo de toque SHALL ter pelo menos 44 × 44 px.

#### Scenario: Sete módulos no celular
- **WHEN** há sete módulos disponíveis e a casca está no celular
- **THEN** a barra de abas mostra os quatro de maior prioridade e "Mais", que lista os outros três num painel que sobe de baixo

#### Scenario: Módulo que fica em "Mais"
- **WHEN** a conta vê Início, Administração e Ajustes, e a casca está no celular
- **THEN** a barra de abas mostra Início, Ajustes e "Mais", que lista a Administração

#### Scenario: Árvore de menus no celular
- **WHEN** o usuário toca no nome do módulo na barra superior
- **THEN** a árvore de menus do módulo abre num painel que sobe de baixo, e um submenu abre no próprio painel, com Voltar
