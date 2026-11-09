## ADDED Requirements

### Requirement: Cadastro exigido no meio do uso

Quando a conta passa a exigir a verificação em dois passos com a casca aberta, a tela de entrada SHALL cobrir a casca, que fica inerte e escondida, na próxima requisição recusada pela pendência. A tela SHALL mostrar o cadastro dos dois passos, com "A verificação em dois passos passou a ser exigida para a sua conta.". Concluído o cadastro e vistos os códigos de recuperação, a casca SHALL voltar, no mesmo endereço e no mesmo estado.

#### Scenario: Perfil que exige com a casca aberta
- **WHEN** Bruno está na lista de pessoas, recebe um perfil que exige os dois passos e escolhe outra tela
- **THEN** a tela de entrada cobre a casca com o cadastro dos dois passos e a mensagem da exigência

#### Scenario: Voltar depois do cadastro
- **WHEN** Bruno conclui o cadastro e escolhe "Continuar" nos códigos de recuperação
- **THEN** a casca volta na lista de pessoas, como estava
