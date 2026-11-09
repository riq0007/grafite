## ADDED Requirements

### Requirement: Limite vertical do dock lateral

O dock lateral SHALL ficar inteiramente abaixo da barra superior. Quando os itens não couberem na altura disponível, eles SHALL manter o tamanho escolhido e ficar acessíveis por rolagem e pelas setas do teclado. A ampliação SHALL ficar suspensa enquanto houver rolagem.

#### Scenario: Tela baixa com muitos módulos
- **WHEN** o dock lateral com itens grandes não cabe entre a barra superior e o rodapé da tela
- **THEN** a barra superior permanece livre, e o último item pode ser alcançado rolando o dock ou pelo teclado
