## ADDED Requirements

### Requirement: Verificação no cofre

O cofre SHALL abrir só para a conta com a verificação em dois passos ativa, e revelar e copiar um segredo SHALL pedir o código atual do app, mesmo com a sessão aberta (spec cofre-de-segredos). O código certo SHALL liberar o cofre naquela sessão por 5 minutos e SHALL contar como usado, como na entrada: ele não vale de novo. Os códigos de recuperação SHALL NOT liberar o cofre.

Desativar a verificação, removê-la pela administração ou cadastrá-la de novo SHALL terminar a liberação do cofre em todas as sessões da conta.

#### Scenario: Código usado na entrada
- **WHEN** Bruno entra com o código do app e, no mesmo intervalo de 30 segundos, digita o mesmo código para liberar o cofre
- **THEN** a liberação é recusada, porque o código já foi usado, e o código seguinte do app libera o cofre

#### Scenario: Verificação removida com o cofre liberado
- **WHEN** quem administra as contas remove os dois passos de Bruno enquanto o cofre dele está liberado
- **THEN** a revelação seguinte de Bruno é recusada, e o cofre pede o cadastro da verificação
