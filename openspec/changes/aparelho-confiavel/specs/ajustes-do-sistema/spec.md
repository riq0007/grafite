## MODIFIED Requirements

### Requirement: Seção Conta

A seção Conta SHALL mostrar a foto, o nome da pessoa, o usuário e, se houver, o e-mail. Só a foto muda por aqui. Ela SHALL reunir cinco partes:
- **Foto:**
  - a foto da pessoa, ou as iniciais quando não há foto;
  - "Trocar foto", com a escolha de imagem e as regras de envio de imagens;
  - "Remover foto", com confirmação, só quando há foto.
- **Senha:**
  - trocar a senha, com "Senha atual", "Senha nova" e "Confirmar a senha nova";
  - a regra da senha à vista;
  - o aviso, depois da troca, de que as outras sessões foram encerradas e os aparelhos confiáveis, esquecidos.
- **Verificação em dois passos:**
  - a situação em texto: "Ativa" ou "Desativada";
  - quando exigida, quem exige: "Exigida para a sua conta" ou "Exigida pelo perfil <nome>";
  - "Ativar", com o cadastro pelo QR code;
  - "Desativar", só quando não é exigida, confirmado por um código;
  - "Gerar novos códigos de recuperação", confirmado por um código, e quantos códigos restam.
- **Aparelhos confiáveis** (spec verificacao-em-dois-passos, "Aparelho confiável"), só com a verificação em dois passos ativa:
  - o prazo que vale para a conta, em texto: "O código é pedido de novo a cada 30 dias em cada aparelho confiável." ou, com o prazo zero, "O código é pedido em toda entrada.";
  - a lista dos aparelhos, cada um com o dispositivo, desde quando é confiável, o último uso e até quando vale, com "Este aparelho" no navegador atual;
  - "Esquecer" em cada um e "Esquecer todos";
  - sem nenhum, "Nenhum aparelho confiável.".
- **Sessões:** a lista das sessões abertas, com "Esta sessão" na atual, "Encerrar" em cada outra e "Encerrar as outras sessões".

Cada parte SHALL ter endereço próprio, com o foco nela, e uma entrada na busca, no grupo Ajustes. Com a sessão desconhecida, a seção SHALL dizer "Sem conexão com o servidor. A sua conta aparece quando a conexão voltar.". Os retornos dos aparelhos SHALL ser "Aparelho esquecido." e "Aparelhos esquecidos.".

#### Scenario: Seção Conta pela busca
- **WHEN** o usuário digita "sessoes" na busca e escolhe "Sessões"
- **THEN** a seção Conta abre, com o foco nas sessões

#### Scenario: Trocar a própria foto
- **WHEN** o usuário escolhe "Trocar foto" e envia uma imagem JPG
- **THEN** a seção e o menu do usuário passam a mostrar a foto nova

#### Scenario: Remover a própria foto
- **WHEN** o usuário escolhe "Remover foto" e confirma
- **THEN** a seção e o menu do usuário passam a mostrar as iniciais

#### Scenario: Ativar os dois passos nos Ajustes
- **WHEN** o usuário escolhe "Ativar" e confirma com o código do app
- **THEN** a seção mostra os códigos de recuperação uma vez, e depois a situação "Ativa", com "Restam 10 códigos de recuperação."

#### Scenario: Exigida pelo perfil
- **WHEN** o usuário tem o perfil Administrador, que exige os dois passos, e abre a seção Conta
- **THEN** a parte da verificação diz "Exigida pelo perfil Administrador" e não oferece "Desativar"

#### Scenario: Encerrar uma sessão nos Ajustes
- **WHEN** o usuário escolhe "Encerrar" na sessão do celular
- **THEN** a sessão some da lista, e o celular passa a mostrar a tela de entrada em até 5 s

#### Scenario: Conta sem servidor
- **WHEN** o usuário abre a seção Conta com a sessão desconhecida
- **THEN** a seção diz "Sem conexão com o servidor. A sua conta aparece quando a conexão voltar."

#### Scenario: Aparelhos confiáveis nos Ajustes
- **WHEN** Bruno, com o computador e o notebook marcados, abre a seção Conta no computador
- **THEN** a parte dos aparelhos mostra os dois, com "Este aparelho" no do computador, e o prazo que vale em texto

#### Scenario: Esquecer o notebook
- **WHEN** Bruno escolhe "Esquecer" no aparelho do notebook
- **THEN** o aparelho some da lista, com o retorno "Aparelho esquecido.", e a entrada seguinte no notebook pede o código

#### Scenario: Aparelhos confiáveis pela busca
- **WHEN** o usuário digita "aparelhos" na busca e escolhe "Aparelhos confiáveis"
- **THEN** a seção Conta abre, com o foco nos aparelhos confiáveis
