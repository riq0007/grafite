## MODIFIED Requirements

### Requirement: App Ajustes com seções

Ajustes SHALL ser um módulo com a lista de seções e o conteúdo da seção escolhida, e cada seção SHALL ter endereço próprio. As seções SHALL ser, nesta ordem: Conta, Aparência, Dock, Cursor, Notificações, Tabelas, Idioma e região e Acessibilidade. A Conta vem no topo da lista, separada das seções de preferências, como a conta nos ajustes do macOS. No celular, a lista e a seção SHALL aparecer uma de cada vez, com Voltar para a lista.

#### Scenario: Seção pelo endereço
- **WHEN** o usuário abre o endereço da seção Dock
- **THEN** Ajustes abre com a seção Dock escolhida na lista

#### Scenario: Seção pelo menu do dock
- **WHEN** o usuário escolhe "Dock" no menu de Ajustes do dock
- **THEN** a seção Dock abre

#### Scenario: Ajustes no celular
- **WHEN** o usuário abre Ajustes no celular
- **THEN** aparece só a lista de seções, e escolher uma mostra a seção, com Voltar para a lista

#### Scenario: Ordem das seções
- **WHEN** o usuário abre Ajustes
- **THEN** a lista mostra Conta no topo e, depois dela, Aparência, Dock, Cursor, Notificações, Tabelas, Idioma e região e Acessibilidade, nessa ordem

### Requirement: Efeito imediato, sem salvar

Toda mudança de preferência em Ajustes SHALL valer na hora em toda a casca e ficar gravada, sem botão de salvar. A seção Conta, que não guarda preferências, SHALL confirmar cada ação dela com um botão próprio, como "Trocar senha".

#### Scenario: Mudança gravada
- **WHEN** o usuário põe o dock à esquerda e reabre a aplicação
- **THEN** o dock continua à esquerda, sem ter havido botão de salvar

#### Scenario: Ação da seção Conta
- **WHEN** o usuário preenche a senha atual e a nova na seção Conta
- **THEN** nada muda até ele escolher "Trocar senha"

### Requirement: Restaurar os padrões da seção

Cada seção de preferências SHALL oferecer "Restaurar padrões", que volta os campos daquela seção aos padrões de fábrica, sem mexer nas outras seções. A seção Conta SHALL NOT oferecer "Restaurar padrões".

#### Scenario: Restaurar a seção Dock
- **WHEN** o usuário restaura os padrões da seção Dock
- **THEN** o dock volta para embaixo, com itens de 48 px, ampliação ligada e sem ocultar, e o tema escolhido continua o mesmo

#### Scenario: Seção Conta sem restaurar
- **WHEN** o usuário abre a seção Conta
- **THEN** ela não mostra "Restaurar padrões"

## ADDED Requirements

### Requirement: Seção Conta

A seção Conta SHALL mostrar o nome da pessoa, o usuário e, se houver, o e-mail, sem edição. Ela SHALL reunir três partes:
- **Senha:**
  - trocar a senha, com "Senha atual", "Senha nova" e "Confirmar a senha nova";
  - a regra da senha à vista;
  - o aviso, depois da troca, de que as outras sessões foram encerradas.
- **Verificação em dois passos:**
  - a situação em texto: "Ativa", "Desativada" ou "Exigida para a sua conta";
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

#### Scenario: Encerrar uma sessão nos Ajustes
- **WHEN** o usuário escolhe "Encerrar" na sessão do celular
- **THEN** a sessão some da lista, e o celular passa a mostrar a tela de entrada

#### Scenario: Conta sem servidor
- **WHEN** o usuário abre a seção Conta com a sessão desconhecida
- **THEN** a seção diz "Sem conexão com o servidor. A sua conta aparece quando a conexão voltar."
