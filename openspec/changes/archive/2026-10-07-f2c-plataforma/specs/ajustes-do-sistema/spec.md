## MODIFIED Requirements

### Requirement: Efeito imediato, sem salvar

Toda mudança de preferência em Ajustes SHALL valer na hora em toda a casca e ficar gravada na conta, sem botão de salvar. A seção Conta SHALL confirmar cada ação dela com um botão próprio, como "Trocar senha", e a foto SHALL mudar só depois de escolhida e enviada.

#### Scenario: Mudança gravada
- **WHEN** o usuário põe o dock à esquerda e reabre a aplicação
- **THEN** o dock continua à esquerda, sem ter havido botão de salvar

#### Scenario: Mudança em outro navegador
- **WHEN** o usuário põe o dock à esquerda no computador e entra pelo notebook
- **THEN** o notebook mostra o dock à esquerda

#### Scenario: Ação da seção Conta
- **WHEN** o usuário preenche a senha atual e a nova na seção Conta
- **THEN** nada muda até ele escolher "Trocar senha"

### Requirement: Restaurar os padrões da seção

Cada seção de preferências SHALL oferecer "Restaurar padrões", que volta os campos daquela seção aos padrões da organização, sem mexer nas outras seções. O campo sem padrão da organização SHALL voltar ao padrão de fábrica. A seção Conta SHALL NOT oferecer "Restaurar padrões".

#### Scenario: Restaurar a seção Dock
- **WHEN** o usuário, numa organização sem padrões, restaura os padrões da seção Dock
- **THEN** o dock volta para embaixo, com itens de 48 px, ampliação ligada e sem ocultar, e o tema escolhido continua o mesmo

#### Scenario: Restaurar com padrão da organização
- **WHEN** a organização tem o dock à esquerda como padrão, e o usuário, com o dock à direita, restaura a seção Dock
- **THEN** o dock vai para a esquerda, e os demais campos da seção voltam aos padrões de fábrica

#### Scenario: Seção Conta sem restaurar
- **WHEN** o usuário abre a seção Conta
- **THEN** ela não mostra "Restaurar padrões"

### Requirement: Seção Conta

A seção Conta SHALL mostrar a foto, o nome da pessoa, o usuário e, se houver, o e-mail. Só a foto muda por aqui. Ela SHALL reunir quatro partes:
- **Foto:**
  - a foto da pessoa, ou as iniciais quando não há foto;
  - "Trocar foto", com a escolha de imagem e as regras de envio de imagens;
  - "Remover foto", com confirmação, só quando há foto.
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
