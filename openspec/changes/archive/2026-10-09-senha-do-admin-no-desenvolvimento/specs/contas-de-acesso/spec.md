## MODIFIED Requirements

### Requirement: Regra da senha

Uma senha nova SHALL ter de 12 a 128 caracteres, sem exigência de maiúsculas, números ou símbolos. Ela SHALL ser recusada se:
- for uma senha comum;
- repetir um caractere só ou seguir uma sequência simples, como "123456789012";
- contiver o usuário.

A recusa SHALL dizer o motivo em pt-BR, e a tela SHALL mostrar o mesmo motivo antes de enviar.

A única senha que não passa pela regra é a senha fixa da conta de administração da organização de desenvolvimento, gravada pelo comando de desenvolvimento (spec plataforma-base). Uma senha que a pessoa escolhe SHALL passar pela regra, nessa conta também.

#### Scenario: Senha curta
- **WHEN** o usuário escolhe "curta123"
- **THEN** a senha é recusada com "Use pelo menos 12 caracteres."

#### Scenario: Senha com o usuário
- **WHEN** o usuário "joao.silva" escolhe "joao.silva2026!"
- **THEN** a senha é recusada com "A senha não pode conter o seu usuário."

#### Scenario: Senha comum
- **WHEN** o usuário escolhe "password1234"
- **THEN** a senha é recusada com "Esta senha é comum demais. Escolha outra."

#### Scenario: Frase longa sem símbolos
- **WHEN** o usuário escolhe "cavalo bateria grampo correto"
- **THEN** a senha é aceita

#### Scenario: Senha curta na conta de desenvolvimento
- **WHEN** a conta `admin` da organização de desenvolvimento tenta trocar a senha por "admin1234"
- **THEN** a senha é recusada com "Use pelo menos 12 caracteres."

### Requirement: Senha temporária com troca obrigatória

Uma senha criada pelo comando no servidor ou pela administração SHALL ser temporária. Ela SHALL ser gerada ao acaso e SHALL aparecer uma vez só: na saída do comando, ou na tela de quem a criou. Além do hash, ela SHALL NOT ficar gravada em lugar nenhum. A entrada com uma senha temporária SHALL exigir a troca antes de qualquer outra ação, e a senha nova SHALL ser diferente da temporária.

A exceção é a conta de administração da organização de desenvolvimento, que entra com a senha fixa do ambiente de desenvolvimento, sem troca (spec plataforma-base).

#### Scenario: Primeira entrada
- **WHEN** o usuário entra com a senha temporária
- **THEN** a tela pede uma senha nova antes de mostrar a casca

#### Scenario: Senha nova igual à temporária
- **WHEN** o usuário tenta trocar a temporária por ela mesma
- **THEN** a troca é recusada com "A senha nova precisa ser diferente da atual."

#### Scenario: Senha temporária pela administração
- **WHEN** quem administra contas cria uma conta pela tela
- **THEN** a senha temporária aparece uma vez na tela dele, e nem a API nem a tela a mostram de novo

#### Scenario: Conta de administração do desenvolvimento
- **WHEN** a conta `admin` entra com `admin123` na organização de desenvolvimento
- **THEN** a casca abre, sem pedir uma senha nova
