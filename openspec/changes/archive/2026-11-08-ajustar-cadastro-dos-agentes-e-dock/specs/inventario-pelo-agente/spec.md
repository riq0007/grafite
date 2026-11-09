## ADDED Requirements

### Requirement: Orientação para habilitar o cadastro

A tela dos agentes SHALL mostrar os seletores de tipo e local sem sobreposição. Quando faltar um tipo elegível, ela SHALL indicar como habilitar Inventário de hardware em um tipo ativo e oferecer acesso aos Tipos de ativo a quem administra o catálogo. A tela SHALL explicar que, após salvar, máquinas sem ativo precisam enviar um inventário completo.

#### Scenario: Inventário recebido com o cadastro desligado
- **WHEN** uma máquina sem ativo envia um inventário enquanto o cadastro está desligado, a TI configura o tipo e chega outro inventário completo da máquina
- **THEN** o Grafite cadastra e liga o computador se ele atender às regras de identidade e do tipo
