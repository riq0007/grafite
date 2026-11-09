## ADDED Requirements

### Requirement: Módulos excedentes no botão Mais

Quando os módulos não couberem no eixo do dock, a casca SHALL manter o tamanho escolhido e mostrar os primeiros módulos que couberem, reservando a última posição para o botão Mais, com ícone de três pontos. O menu SHALL oferecer os módulos restantes e seus submenus, com navegação por teclado. O dock SHALL manter a barra superior livre e recalcular os módulos visíveis quando a área disponível mudar. A ampliação SHALL ficar suspensa enquanto houver módulos no menu Mais.

#### Scenario: Dock sem espaço para todos os módulos
- **WHEN** não há espaço para todos os módulos do dock
- **THEN** o usuário pode abrir os módulos excedentes pelo menu Mais

## MODIFIED Requirements

### Requirement: Limite vertical do dock lateral

O dock lateral SHALL ficar inteiramente abaixo da barra superior. Quando os itens não couberem na altura disponível, eles SHALL manter o tamanho escolhido, e os que não couberem SHALL ir para o botão Mais, sem rolagem no dock (requirement "Módulos excedentes no botão Mais").

#### Scenario: Tela baixa com muitos módulos
- **WHEN** o dock lateral com itens grandes não cabe entre a barra superior e o rodapé da tela
- **THEN** a barra superior permanece livre, e os módulos que não cabem abrem pelo menu Mais, também pelo teclado
