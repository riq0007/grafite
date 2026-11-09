## MODIFIED Requirements

### Requirement: Seção Conta

A seção Conta SHALL mostrar o nome da pessoa, o usuário e, se houver, o e-mail, sem edição. Ela SHALL reunir três partes:
- **Senha:**
  - trocar a senha, com "Senha atual", "Senha nova" e "Confirmar a senha nova";
  - a regra da senha à vista;
  - o aviso, depois da troca, de que as outras sessões foram encerradas.
- **Verificação em dois passos:**
  - a situação em texto: "Ativa" ou "Desativada";
  - quando exigida, quem exige: "Exigida para a sua conta" ou "Exigida pelo perfil <nome>";
  - "Ativar", com o cadastro pelo QR code;
  - "Desativar", só quando não é exigida, confirmado por um código;
  - "Gerar novos códigos de recuperação", confirmado por um código, e quantos códigos restam.
- **Sessões:** a lista das sessões abertas, com "Esta sessão" na atual, "Encerrar" em cada outra e "Encerrar as outras sessões".

Cada parte SHALL ter endereço próprio, com o foco nela, e uma entrada na busca, no grupo Ajustes. Com a sessão desconhecida, a seção SHALL dizer "Sem conexão com o servidor. A sua conta aparece quando a conexão voltar.".

#### Scenario: Seção Conta pela busca
- **WHEN** o usuário digita "sessoes" na busca e escolhe "Sessões"
- **THEN** a seção Conta abre, com o foco nas sessões

#### Scenario: Ativar os dois passos nos Ajustes
- **WHEN** o usuário escolhe "Ativar" e confirma com o código do app
- **THEN** a seção mostra os códigos de recuperação uma vez, e depois a situação "Ativa", com "Restam 10 códigos de recuperação."

#### Scenario: Exigida pelo perfil
- **WHEN** o usuário tem o perfil Administrador, que exige os dois passos, e abre a seção Conta
- **THEN** a parte da verificação diz "Exigida pelo perfil Administrador" e não oferece "Desativar"

#### Scenario: Encerrar uma sessão nos Ajustes
- **WHEN** o usuário escolhe "Encerrar" na sessão do celular
- **THEN** a sessão some da lista, e o celular passa a mostrar a tela de entrada

#### Scenario: Conta sem servidor
- **WHEN** o usuário abre a seção Conta com a sessão desconhecida
- **THEN** a seção diz "Sem conexão com o servidor. A sua conta aparece quando a conexão voltar."
