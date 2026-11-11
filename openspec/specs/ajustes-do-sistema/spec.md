# ajustes-do-sistema Specification

## Purpose

Reunir num app Ajustes as preferências de interface da conta, organizadas em seções, com efeito imediato em toda a casca, gravadas na conta e com a volta aos padrões da organização, e a seção Conta, com a foto, a senha, os dois passos e as sessões.

## Requirements

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

### Requirement: Seção Aparência

A seção Aparência SHALL ajustar:
- o tema, com os escuros (Grafite, Meia-noite e OLED) separados dos claros (Névoa, Papel e Alto contraste), e o Personalizado;
- a cor de destaque (azul, verde, laranja e grafite), e a Personalizada;
- os cantos, com o raio base de 0 a 24 px;
- a densidade (compacta, normal e confortável);
- a barra de rolagem, com "Ao rolar" e "Sempre visível" (spec componentes-base, "Barra de rolagem própria").

Com o tema Personalizado, a seção SHALL mostrar:
- o tom, escuro ou claro;
- a matiz da base, com a trilha pintada das matizes;
- o tingimento dos cinzas;
- o contraste, com a dureza do lápis ao lado do número: 2H, H, HB, B, 2B e 4B, do mais leve ao mais forte.

Com o destaque Personalizado, a seção SHALL mostrar a matiz e a intensidade, e a intensidade 0 SHALL ser o monocromático.

A seção SHALL mostrar a razão de contraste do texto, do texto secundário e do destaque contra a superfície, no tema e no destaque que valem, como "Texto 15,2:1".

A escolha da barra de rolagem SHALL explicar cada opção em texto: "Ao rolar: aparece com o ponteiro sobre a área ou enquanto ela rola." e "Sempre visível: fica à vista em toda área que rola.". Onde vale a barra do sistema, a seção SHALL dizer "Neste aparelho vale a barra de rolagem do sistema.", e a escolha SHALL continuar valendo nos outros aparelhos.

#### Scenario: Trocar o destaque
- **WHEN** o usuário escolhe o destaque verde
- **THEN** a interface inteira passa ao verde na hora, inclusive a própria tela de Ajustes

#### Scenario: Montar o próprio tema
- **WHEN** o usuário escolhe o tema Personalizado, o tom claro e a matiz 80
- **THEN** a interface inteira passa ao tema claro com os cinzas puxados para a matiz 80, na hora, e a leitura do contraste mostra o texto com pelo menos 7:1

#### Scenario: Lápis do contraste
- **WHEN** o usuário leva o contraste do tema Personalizado a 45
- **THEN** o controle mostra "HB · 45", e o leitor de tela anuncia "HB, 45 de 100"

#### Scenario: Destaque monocromático pela intensidade
- **WHEN** o usuário escolhe o destaque Personalizado e leva a intensidade a 0
- **THEN** o destaque fica monocromático, como o Grafite, em qualquer matiz

#### Scenario: Escolher Sempre visível
- **WHEN** o usuário escolhe "Sempre visível" na barra de rolagem
- **THEN** o polegar da lista das seções e o da janela ficam à vista na hora, sem botão de salvar

#### Scenario: Barra de rolagem no celular
- **WHEN** o usuário abre a seção Aparência no celular
- **THEN** a seção diz "Neste aparelho vale a barra de rolagem do sistema.", e a escolha feita continua valendo no computador

#### Scenario: Barra de rolagem pela busca
- **WHEN** o usuário digita "rolagem" na busca e escolhe "Barra de rolagem"
- **THEN** a seção Aparência abre, com o foco na escolha da barra

### Requirement: Seção Dock

A seção Dock SHALL ajustar a posição (embaixo, à esquerda ou à direita), o tamanho dos itens (de 28 a 64 px, com o valor à vista), a ampliação ao passar o mouse e o ocultar automático. Na postura tablet, a seção SHALL informar que o dock fica embaixo naquele aparelho.

#### Scenario: Tamanho do dock
- **WHEN** o usuário leva o tamanho a 36 px
- **THEN** o dock muda na hora, e o controle mostra "36 px"

#### Scenario: Seção Dock no tablet
- **WHEN** o usuário abre a seção Dock num tablet
- **THEN** a seção informa que o dock fica embaixo neste aparelho, e a posição escolhida continua valendo no computador

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
- o tempo do aviso de Atenção e de Informação: 6 s, 10 s ou 20 s;
- o modo Foco, ligado ou desligado, com a explicação "Com o Foco ligado, só o Crítico vira aviso. O resto vai para a central.".

A seção SHALL informar que o que não vira aviso continua na central. O botão "Mostrar aviso de exemplo" SHALL mostrar um aviso marcado como exemplo, com o tempo escolhido, que SHALL NOT entrar na central.

O grupo "Por e-mail" SHALL mostrar para qual e-mail as notificações vão, que é o da pessoa da conta, e SHALL ajustar (spec notificacoes):
- o e-mail do crítico na hora, ligado ou desligado;
- o resumo das outras: "Desligado" ou "Diário, às 8h";
- "Mandar um e-mail de teste".

O grupo "No celular" SHALL ajustar (spec notificacoes):
- "Receber neste aparelho", que pede a permissão do navegador e inscreve o aparelho;
- as severidades que vão para o push: Crítico, Atenção e Informação, com a explicação de que, com o Foco ligado, só o Crítico vai;
- a lista dos aparelhos da conta, com "Este aparelho" e "Tirar";
- "Mandar um aviso de teste".

Quando um canal não pode funcionar, o grupo dele SHALL dizer o motivo em texto, com os ajustes desligados:
- o servidor sem o canal configurado, ou o ambiente de teste;
- a pessoa sem e-mail, com "Peça à administração para cadastrar o seu e-mail.";
- o aparelho sem como receber o push, ou com os avisos bloqueados no navegador.

#### Scenario: Aviso de exemplo
- **WHEN** o usuário escolhe 10 s e depois "Mostrar aviso de exemplo"
- **THEN** aparece um aviso marcado como exemplo, que some em 10 s e não entra na central

#### Scenario: Crítico sempre ligado
- **WHEN** o usuário abre a seção Notificações
- **THEN** o Crítico aparece ligado e sem como desligar, com a explicação de que ele sempre vira aviso

#### Scenario: Foco pelos Ajustes
- **WHEN** o usuário liga o Foco na seção Notificações
- **THEN** o sino passa a mostrar "Foco", e a central mostra o Foco ligado

#### Scenario: E-mail da pessoa
- **WHEN** a pessoa da conta tem o e-mail ana.souza@empresa.com.br, e o usuário abre a seção Notificações
- **THEN** o grupo "Por e-mail" diz que as notificações vão para ana.souza@empresa.com.br, com o crítico na hora ligado e o resumo diário

#### Scenario: Pessoa sem e-mail
- **WHEN** a pessoa da conta não tem e-mail, e o usuário abre a seção Notificações
- **THEN** o grupo "Por e-mail" diz que a pessoa não tem e-mail, com "Peça à administração para cadastrar o seu e-mail.", e os ajustes do e-mail ficam desligados

#### Scenario: Receber neste aparelho
- **WHEN** o usuário escolhe "Receber neste aparelho", e o navegador permite os avisos
- **THEN** o aparelho aparece na lista como "Este aparelho", e "Mandar um aviso de teste" fica disponível

### Requirement: Seção Tabelas

A seção Tabelas SHALL ajustar, para todas as tabelas:
- as linhas alternadas, ligadas ou desligadas;
- a miniatura no início da linha, ligada ou desligada;
- o resumo da linha, ligado ou desligado, com a explicação "Ao parar o mouse 1,5 s sobre uma linha, mostra as colunas que estão fora da tela.".

A seção SHALL mostrar uma tabela de exemplo, com dados fictícios marcados como exemplo, que muda na hora com os ajustes.

Quando a conta tem mudanças guardadas sobre alguma visão (spec visoes-de-tabela, "Tabela alterada"), a seção SHALL dizer em quantas visões e oferecer "Restaurar as minhas mudanças nas tabelas", que as apaga todas depois de uma confirmação, com o retorno "Mudanças nas tabelas restauradas.".

#### Scenario: Sem linhas alternadas
- **WHEN** o usuário desliga as linhas alternadas
- **THEN** a tabela de exemplo passa a ter todas as linhas no mesmo fundo, ainda separadas pelas linhas divisórias

#### Scenario: Sem miniaturas
- **WHEN** o usuário desliga as miniaturas
- **THEN** a coluna da miniatura sai da tabela de exemplo, e o nome passa a ser a primeira coluna

#### Scenario: Sem o resumo da linha
- **WHEN** o usuário desliga o resumo da linha e para o mouse 1,5 s sobre uma linha dos ativos com colunas fora da tela
- **THEN** nenhum resumo aparece

#### Scenario: Restaurar as mudanças das tabelas
- **WHEN** o usuário tem mudanças sobre "Todos os ativos" e sobre uma visão da organização, e escolhe "Restaurar as minhas mudanças nas tabelas"
- **THEN** depois da confirmação, as duas visões voltam a abrir como estão salvas, sem a marca de personalizada

### Requirement: Seção Idioma e região

A seção Idioma e região SHALL mostrar o idioma da interface, Português (Brasil), como informação, sem controle. Ela SHALL ajustar o fuso horário:
- "Seguir o sistema", que diz qual é o fuso do sistema, como "Horário de Brasília";
- ou um fuso escolhido numa lista com busca, com os fusos do Brasil primeiro e cada fuso com o nome em português e a diferença para o UTC, como "Horário do Amazonas · Manaus (UTC−4)".

A seção SHALL mostrar a data e a hora de agora no fuso escolhido, no formato do relógio da barra. A escolha SHALL valer na hora em toda a interface.

#### Scenario: Escolher um fuso
- **WHEN** o usuário escolhe o fuso de Manaus
- **THEN** a prévia da seção e o relógio da barra passam a mostrar a hora de Manaus na hora

#### Scenario: Seguir o sistema
- **WHEN** o fuso é "Seguir o sistema" e o sistema está no Horário de Brasília
- **THEN** a seção diz que o fuso do sistema é o Horário de Brasília, e a interface usa esse fuso

#### Scenario: Buscar um fuso
- **WHEN** o usuário digita "manaus" na busca de fusos
- **THEN** a lista mostra o Horário do Amazonas, de Manaus

### Requirement: Seção Acessibilidade

A seção Acessibilidade SHALL ajustar o movimento e a transparência, cada um com as opções "Seguir o sistema" e "Reduzir", e mostrar o que o sistema operacional pede no momento.

#### Scenario: Reduzir a transparência
- **WHEN** o usuário escolhe reduzir a transparência
- **THEN** o dock e os menus ficam com superfície sólida na hora

#### Scenario: Sistema com movimento reduzido
- **WHEN** o sistema operacional pede movimento reduzido e a opção é "Seguir o sistema"
- **THEN** a seção informa que o sistema pede movimento reduzido, e a casca já o respeita

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

### Requirement: Ajuste pelo endereço

Cada ajuste SHALL ter um endereço que abre a seção dele, com o foco no controle do ajuste. Um ajuste desconhecido no endereço SHALL abrir a seção sem mover o foco para nenhum controle.

#### Scenario: Endereço de um ajuste
- **WHEN** o usuário abre o endereço do ajuste "Tamanho do dock"
- **THEN** a seção Dock abre, com o foco no controle do tamanho

#### Scenario: Ajuste desconhecido
- **WHEN** o endereço da seção Dock traz um ajuste que não existe
- **THEN** a seção Dock abre normalmente, e o foco vai para o título, como em qualquer navegação

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
