## MODIFIED Requirements

### Requirement: App Ajustes com seções

Ajustes SHALL ser um módulo com a lista de seções e o conteúdo da seção escolhida, e cada seção SHALL ter endereço próprio. As seções SHALL ser, nesta ordem: Aparência, Dock, Cursor, Notificações, Tabelas e Acessibilidade. A seção Idioma e região, que chega no F1c, entra entre Tabelas e Acessibilidade, como na seção 7.4 da spec mestre. No celular, a lista e a seção SHALL aparecer uma de cada vez, com Voltar para a lista.

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
- **THEN** a lista mostra Aparência, Dock, Cursor, Notificações, Tabelas e Acessibilidade, nessa ordem

## ADDED Requirements

### Requirement: Seção Cursor

A seção Cursor SHALL ajustar:
- o cursor, "Suavizado" ou "Do sistema";
- a suavização, de 0 a 100%, em passos de 5%, com o valor à vista;
- "Abraçar botões", ligado ou desligado.

Com "Do sistema", a suavização e "Abraçar botões" SHALL ficar desabilitados, sem perder os valores. Quando o cursor suavizado não pode aparecer, por movimento reduzido ou por toque, a seção SHALL dizer por quê.

#### Scenario: Cursor do sistema
- **WHEN** o usuário escolhe "Do sistema"
- **THEN** o cursor do sistema volta na hora, e a suavização e "Abraçar botões" ficam desabilitados, com os valores mantidos

#### Scenario: Suavização
- **WHEN** o usuário leva a suavização a 50%
- **THEN** o controle mostra "50%", e o anel passa na hora a acompanhar o ponto mais depressa

#### Scenario: Movimento reduzido
- **WHEN** o sistema operacional pede movimento reduzido e o usuário abre a seção Cursor
- **THEN** a seção informa que, com movimento reduzido, a casca usa o cursor do sistema

### Requirement: Seção Notificações

A seção Notificações SHALL ajustar:
- quais severidades viram aviso na tela: Atenção e Informação, cada uma ligada ou desligada, com o Crítico sempre ligado e indicado como tal;
- o tempo do aviso de Atenção e de Informação: 6 s, 10 s ou 20 s.

A seção SHALL informar que o que não vira aviso continua na central. O botão "Mostrar aviso de exemplo" SHALL mostrar um aviso marcado como exemplo, com o tempo escolhido, que SHALL NOT entrar na central.

#### Scenario: Aviso de exemplo
- **WHEN** o usuário escolhe 10 s e depois "Mostrar aviso de exemplo"
- **THEN** aparece um aviso marcado como exemplo, que some em 10 s e não entra na central

#### Scenario: Crítico sempre ligado
- **WHEN** o usuário abre a seção Notificações
- **THEN** o Crítico aparece ligado e sem como desligar, com a explicação de que ele sempre vira aviso

### Requirement: Seção Tabelas

A seção Tabelas SHALL ajustar, para todas as tabelas:
- as linhas alternadas, ligadas ou desligadas;
- a miniatura no início da linha, ligada ou desligada.

A seção SHALL mostrar uma tabela de exemplo, com dados fictícios marcados como exemplo, que muda na hora com os ajustes.

#### Scenario: Sem linhas alternadas
- **WHEN** o usuário desliga as linhas alternadas
- **THEN** a tabela de exemplo passa a ter todas as linhas no mesmo fundo, ainda separadas pelas linhas divisórias

#### Scenario: Sem miniaturas
- **WHEN** o usuário desliga as miniaturas
- **THEN** a coluna da miniatura sai da tabela de exemplo, e o nome passa a ser a primeira coluna

### Requirement: Ajuste pelo endereço

Cada ajuste SHALL ter um endereço que abre a seção dele, com o foco no controle do ajuste. Um ajuste desconhecido no endereço SHALL abrir a seção sem mover o foco para nenhum controle.

#### Scenario: Endereço de um ajuste
- **WHEN** o usuário abre o endereço do ajuste "Tamanho do dock"
- **THEN** a seção Dock abre, com o foco no controle do tamanho

#### Scenario: Ajuste desconhecido
- **WHEN** o endereço da seção Dock traz um ajuste que não existe
- **THEN** a seção Dock abre normalmente, e o foco vai para o título, como em qualquer navegação
