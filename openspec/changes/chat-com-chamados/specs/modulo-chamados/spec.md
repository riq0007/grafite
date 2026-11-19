## MODIFIED Requirements

### Requirement: Primeira tela ao entrar

Abrir a aplicação no endereço da organização, sem caminho nem parâmetros, SHALL levar ao Início dos chamados a conta que vê os chamados, com o módulo ligado. A conta que, entre os módulos da casca, só vê o Chat SHALL ir ao app do chat, em `/chat` (spec modulo-chat, "App do chat"). As outras contas SHALL ver o Início. Escolher o Início no dock SHALL abrir o Início, sem levar aos chamados.

A troca SHALL acontecer só na primeira carga de cada aba do navegador, e de novo quando outra conta entra na mesma aba. Recarregar a página SHALL manter a tela em que a conta estava, também o Início.

Com a sessão desconhecida na primeira carga, porque o servidor não respondeu, a casca SHALL ficar no Início, também quando o servidor volta.

#### Scenario: Ana entra
- **WHEN** Ana, que atende os chamados, entra pelo endereço da organização
- **THEN** a primeira tela é o Início dos chamados, com "Bom dia, Ana"

#### Scenario: Início pelo dock
- **WHEN** Ana escolhe o Início no dock
- **THEN** a casca mostra o Início, e não volta aos chamados

#### Scenario: Recarregar no Início
- **WHEN** Ana, no Início que ela escolheu no dock, recarrega a página
- **THEN** a casca continua no Início

#### Scenario: Aba nova
- **WHEN** Ana, já com uma aba no Início, abre o endereço da organização numa aba nova
- **THEN** a aba nova abre no Início dos chamados

#### Scenario: Conta sem os chamados
- **WHEN** Paula, sem nenhuma permissão dos chamados, entra
- **THEN** a primeira tela é o Início

#### Scenario: Outra conta na mesma aba
- **WHEN** Ana sai, e Bruno, que também atende os chamados, entra na mesma aba, no endereço da organização
- **THEN** a primeira tela de Bruno é o Início dos chamados

#### Scenario: O servidor volta
- **WHEN** Ana abre o endereço da organização sem resposta do servidor, e o servidor volta
- **THEN** a casca continua no Início, e recarregar a página mantém o Início

#### Scenario: Quem só usa o chat
- **WHEN** Fernanda Rocha, com `chat.usar` e `chamados.pedir` e nenhum outro módulo, entra pelo endereço da organização
- **THEN** a primeira tela é o app do chat, em `/chat`

### Requirement: Campo de escrever

O campo de escrever SHALL ficar no pé do chamado aberto, só para quem atende os locais do chamado, com:
- a chave "Mensagem para Fernanda | Nota interna" e, na mensagem, "Esperar a resposta", que troca "Enviar à Fernanda" por "Enviar e esperar a resposta";
- a caixa do texto, que cresce com ele, e embaixo dela os anexos, cada um com o nome, o tamanho e "Tirar", até 5;
- o cartão do ativo e as opções de resposta, quando há, entre a caixa e os anexos;
- "Respostas prontas", o menu com todas as do tipo do chamado, e as duas primeiras ao lado, em botões, como "Pedir o print do erro";
- o clipe, para os anexos, "Cartão do ativo", "Pedir uma escolha" e "Enviar à Fernanda", com o primeiro nome da pessoa. Ctrl+Enter manda.

A nota interna SHALL mudar o campo para o quadro tracejado da nota, sem as respostas prontas, sem "Pedir uma escolha" e sem "Esperar a resposta", e o botão SHALL dizer "Salvar a nota".

A resposta pronta SHALL entrar no campo onde está o cursor, numa linha dela quando o cursor está colado no texto, com o primeiro nome da pessoa, e ser mandada só pela ação de quem atende. A que espera a resposta SHALL ligar "Esperar a resposta". A que tem opções SHALL pôr as opções no campo, no lugar das que havia.

O cartão do ativo (spec chamados, "Cartão do ativo na mensagem") SHALL entrar no campo:
- por "/ativo" no começo de uma linha, seguido do patrimônio, como "/ativo PAT-00137", que vira o cartão quando o patrimônio é de um ativo que a conta vê;
- por "/ativo" sozinho, com o ativo ligado ao chamado;
- por "Cartão do ativo", que escolhe o ativo como o "Trocar o ativo".

No campo, o cartão SHALL mostrar os dados de agora, que vão na mensagem como estiverem na hora de mandar, com "Tirar". O patrimônio que não acha um ativo SHALL dizer "O ativo PAT-00999 não foi encontrado." embaixo do campo, e o texto fica como foi escrito.

"Pedir uma escolha" SHALL pôr no campo duas opções de resposta, para escrever, com "Acrescentar opção" até 3 e "Tirar" em cada uma (spec chamados, "Pergunta com opções").

A ajuda do campo SHALL dizer "Fernanda vê esta mensagem no chat." quando a conta da pessoa usa o chat, e "Fernanda ainda não usa o chat: a mensagem fica no chamado." quando não usa.

"Enviar à Fernanda" e "Salvar a nota" SHALL ficar sem ação enquanto a caixa está vazia.

O que se escreve SHALL continuar no campo quando a conversa se atualiza. Mandado, o campo SHALL esvaziar, e a conversa SHALL ir à última mensagem. A recusa SHALL ficar embaixo do campo, com a frase dela.

No chamado resolvido, o campo SHALL dar lugar a "Reabra o chamado para escrever.", com "Reabrir". No fechado, SHALL dar lugar a "O chamado fechou em 18/11.", sem ação (requisito "Chamado fechado na tela").

#### Scenario: Nota pelo atalho
- **WHEN** Ana escolhe "Nota interna", escreve e aperta Ctrl+Enter
- **THEN** a nota entra na conversa com "Só a TI vê", e o chamado continua na situação em que estava

#### Scenario: Resposta pronta que espera a resposta
- **WHEN** Ana escolhe "Pedir o print do erro", que espera a resposta, no #1041 de Fernanda Rocha
- **THEN** o texto entra no campo com "Fernanda", "Esperar a resposta" fica ligado, e o botão diz "Enviar e esperar a resposta"

#### Scenario: Conversa que se atualiza enquanto se escreve
- **WHEN** chega uma mensagem de Fernanda enquanto Ana escreve no #1041
- **THEN** a mensagem entra na conversa, e o que Ana escrevia continua no campo

#### Scenario: Escrever no resolvido
- **WHEN** Ana abre o #1040, resolvido
- **THEN** no lugar do campo fica "Reabra o chamado para escrever.", com "Reabrir"

#### Scenario: Cartão pelo /ativo
- **WHEN** Bruno escreve "/ativo PAT-00137" no #1045
- **THEN** o cartão da Impressora Financeiro aparece no campo, com o toner de agora e "Tirar", e o botão diz "Enviar à Fernanda"

#### Scenario: Pedir uma escolha
- **WHEN** Bruno escolhe "Pedir uma escolha", escreve "Pode ser" e "Daqui a meia hora, por favor" e manda "Passo aí em 10 minutos. Pode ser?"
- **THEN** a mensagem entra na conversa com as duas opções, e Fernanda as vê em botões no chat

#### Scenario: Pessoa sem o chat
- **WHEN** Ana abre o #1050, de Marina Lopes, que não tem conta
- **THEN** a ajuda do campo diz "Marina ainda não usa o chat: a mensagem fica no chamado."

### Requirement: Respostas prontas e horário da TI na tela

A tela "Respostas prontas" SHALL listar as respostas na ordem, com a alça de arrastar, o rótulo, o começo do texto, "Espera a resposta" escrito, as opções contadas, como "3 opções", e os tipos. "Nova resposta" e a escolha de uma resposta SHALL abri-la numa gaveta, com as opções de resposta, "Acrescentar opção" até 3 e "Tirar" em cada uma, "Salvar" e "Remover".

A tela "Horário da TI" SHALL ter:
- os dias da semana, para marcar;
- o início e o fim;
- o fuso, numa lista;
- a carga cheia;
- "Salvar", com o retorno "Horário salvo.".

#### Scenario: Resposta pronta nova
- **WHEN** quem configura cria "Pedir o caminho da pasta", com "Espera a resposta" ligado, só no Acesso e senha
- **THEN** o campo de escrever dos chamados de Acesso e senha mostra o botão "Pedir o caminho da pasta"

#### Scenario: Resposta pronta com opções na tela
- **WHEN** quem configura acrescenta à resposta "Passo aí" as opções "Pode ser", "Daqui a meia hora, por favor" e "Estou em reunião, volte às 14h"
- **THEN** a lista mostra "3 opções" na linha da resposta

## ADDED Requirements

### Requirement: Conversa com a pessoa no chamado aberto

A conversa do chamado aberto SHALL mostrar, nas duas formas da conversa:
- **as mensagens de quem participa,** com o nome e a hora, como as da pessoa, e, de quem abriu pelo chat no nome de outra pessoa, "Fernanda Rocha · abriu o chamado". Na forma "nos cantos", elas ficam à esquerda;
- **a origem pelo chat,** no começo: "Aberto a partir da conversa Equipe Financeiro", com a mensagem citada (quem escreveu, a hora, o texto e os anexos) e, a quem participa da conversa, "Abrir a conversa", que leva ao chat nessa mensagem;
- **a pergunta com opções:** as opções em botões, sem ação para a TI, e, respondida, a escolhida com o ✓, quem escolheu e a hora, e as outras apagadas;
- **o cartão do ativo,** com "Abrir a ficha" a quem vê o ativo;
- **no resolvido,** o resumo dos tempos e, quando há, a avaliação, como "Fernanda Rocha avaliou: Ótimo · Resolveu muito bem", com o comentário.

A conversa SHALL se atualizar sozinha com as mensagens e as escolhas de quem participa (requisito "Telas atualizadas e módulo desligado").

#### Scenario: Origem na conversa
- **WHEN** Bruno Lima abre o #1045, aberto pela mensagem das 10:19 de Paulo Nunes na Equipe Financeiro
- **THEN** a conversa começa com "Aberto a partir da conversa Equipe Financeiro" e a mensagem de Paulo, sem "Abrir a conversa", porque Bruno não é da equipe

#### Scenario: Escolha que chega
- **WHEN** Fernanda Rocha escolhe "Pode ser" no chat, com Bruno no #1045
- **THEN** a pergunta das 10:52 mostra "Pode ser" com o ✓, Fernanda e a hora, sem recarregar

### Requirement: Chamado fechado na tela

O chamado Fechado SHALL ter o selo "Fechado", com a marca neutra e a caixa de arquivo, e a mesma marca em todas as telas dos chamados. O cabeçalho SHALL ficar sem as ações, e o campo de escrever SHALL dar lugar a "O chamado fechou em 18/11.".

O chamado resolvido SHALL dizer, junto da situação, até quando se reabre, como "fecha em 18/11". A Linha do tempo SHALL ganhar "Fechado · 18/11".

#### Scenario: Chamado fechado
- **WHEN** Ana abre o #1030, fechado em 18/10
- **THEN** o cabeçalho mostra o selo "Fechado" sem as ações, e no lugar do campo fica "O chamado fechou em 18/10."
