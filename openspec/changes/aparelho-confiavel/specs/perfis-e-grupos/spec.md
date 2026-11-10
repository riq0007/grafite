## ADDED Requirements

### Requirement: Prazo da confiança no perfil e na organização

Cada perfil SHALL poder ter um prazo da confiança nos aparelhos (spec verificacao-em-dois-passos, "Prazo da confiança"): "Seguir a organização", o de fábrica, um número de 1 a 90 dias, ou "Pedir o código em toda entrada". Quem administra os acessos SHALL mudar o prazo de qualquer perfil, inclusive o do Administrador. O perfil inativo SHALL NOT contar no prazo de quem o tem.

A tela dos perfis SHALL mostrar, acima da lista, o prazo da organização, como "Confiança nos aparelhos: 30 dias", com "Mudar…" para quem administra os acessos, e SHALL mostrar o prazo de cada perfil que tem um. A mudança SHALL dizer o efeito antes de confirmar: reduzir o prazo, ou pedir o código sempre, vale já na entrada seguinte de cada conta. Os retornos SHALL ser "Prazo da confiança alterado.".

#### Scenario: Prazo da organização
- **WHEN** quem administra os acessos muda o prazo da organização para 7 dias
- **THEN** a tela dos perfis mostra "Confiança nos aparelhos: 7 dias", e a auditoria registra "de 30 para 7 dias"

#### Scenario: Perfil mais exigente
- **WHEN** quem administra os acessos dá ao perfil Administrador o prazo "Pedir o código em toda entrada"
- **THEN** as contas com esse perfil, sem prazo próprio, passam a digitar o código em toda entrada

#### Scenario: Perfil inativo
- **WHEN** o perfil "Plantão", com o prazo de 1 dia, é inativado, e Bruno só tinha esse perfil com prazo
- **THEN** passa a valer para Bruno o prazo da organização

#### Scenario: Quem só vê os acessos
- **WHEN** uma conta só com `acessos.ver` abre a tela dos perfis
- **THEN** ela vê o prazo da organização, sem "Mudar…"
