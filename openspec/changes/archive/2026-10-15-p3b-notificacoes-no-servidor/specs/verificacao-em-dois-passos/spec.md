## MODIFIED Requirements

### Requirement: Códigos de recuperação

Ao ativar a verificação, o usuário SHALL receber 10 códigos de recuperação, mostrados uma vez, com "Copiar". Cada código SHALL servir uma vez, no lugar do código do app. Os códigos SHALL ser guardados só em hash.

A conta SHALL mostrar quantos códigos ainda restam. O usuário SHALL poder gerar códigos novos, confirmando com um código do app ou de recuperação, e então os antigos SHALL deixar de valer.

#### Scenario: Entrada com um código de recuperação
- **WHEN** o usuário escolhe "Usar um código de recuperação" e digita um dos códigos
- **THEN** a sessão passa a valer, o código não serve de novo, e a tela avisa "Restam 9 códigos de recuperação."

#### Scenario: Códigos novos
- **WHEN** o usuário gera códigos novos
- **THEN** a tela mostra os 10 novos uma vez, e nenhum dos antigos é aceito

#### Scenario: Último código
- **WHEN** o usuário entra com o último código de recuperação
- **THEN** a tela avisa "Este era o seu último código de recuperação. Gere novos na sua conta.", e a notificação de Atenção com esse texto fica na central da conta, com "Abrir" na seção Conta dos Ajustes
