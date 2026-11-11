## MODIFIED Requirements

### Requirement: Passos pendentes na tela

A tela SHALL mostrar o passo pendente da vez:
- **código:** um campo para os 6 dígitos do app, com "Usar um código de recuperação", que troca o campo pelo do código de recuperação;
- **troca da senha:** "Senha nova" e "Confirmar a senha nova", com a regra da senha à vista e o motivo de uma recusa antes de enviar;
- **cadastro dos dois passos:**
  - o QR code e a chave em texto, com "Copiar";
  - o campo do código;
  - depois de ativar, os códigos de recuperação, com "Copiar" e "Continuar".

Cada passo SHALL oferecer "Sair", que encerra a sessão pendente e volta ao usuário e senha.

No passo do código, com o prazo da confiança da conta maior que zero (spec verificacao-em-dois-passos, "Prazo da confiança"), a tela SHALL oferecer a caixa "Confiar neste aparelho por N dias", com o prazo da conta, desmarcada de início, e a explicação "Nas próximas entradas neste navegador, só a senha. O Cofre continua pedindo o código.". A caixa SHALL sumir quando o usuário escolhe "Usar um código de recuperação" e com o prazo zero.

#### Scenario: Confirmação diferente
- **WHEN** o usuário digita senhas novas diferentes nos dois campos
- **THEN** a tela mostra "As senhas não são iguais." antes de enviar

#### Scenario: Códigos de recuperação no cadastro
- **WHEN** o usuário ativa os dois passos na entrada
- **THEN** a tela mostra os 10 códigos de recuperação, e só "Continuar" leva à casca

#### Scenario: Sair de um passo pendente
- **WHEN** o usuário escolhe "Sair" no passo do código
- **THEN** a sessão pendente termina, e a tela volta ao usuário e senha

#### Scenario: Caixa do aparelho confiável
- **WHEN** a tela pede o código a uma conta com o prazo de 30 dias
- **THEN** ela mostra "Confiar neste aparelho por 30 dias", desmarcada, com a explicação

#### Scenario: Prazo zero
- **WHEN** a tela pede o código a uma conta cujo prazo da confiança é zero
- **THEN** ela não mostra a caixa

#### Scenario: Código de recuperação sem a caixa
- **WHEN** o usuário escolhe "Usar um código de recuperação"
- **THEN** a caixa "Confiar neste aparelho" some
