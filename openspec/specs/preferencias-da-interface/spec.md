# preferencias-da-interface Specification

## Purpose

Guardar e aplicar as preferências de interface de cada conta (aparência, dock, cursor, notificações, tabelas, região, tela inicial e acessibilidade), resolvidas campo a campo sobre os padrões de fábrica da spec mestre e os padrões da organização, gravadas no servidor e com uma cópia no navegador.

## Requirements

### Requirement: Padrões de fábrica

Sem padrão da organização nem escolha da conta, a interface SHALL usar os padrões de fábrica da seção 7.2 da spec mestre:
- tema Grafite, destaque Grafite, densidade normal e raio base de 10 px;
- dock embaixo, com itens de 48 px, ampliação ligada e ocultar automático desligado;
- cursor suavizado, com suavização de 95% e "Abraçar botões" ligado;
- movimento e transparência seguindo o sistema operacional, normais quando o sistema não pede redução;
- fuso horário seguindo o sistema operacional.

As preferências que a seção 7.2 não lista SHALL seguir o comportamento das seções 7.4, 6.5 e 7.6:
- avisos na tela de Atenção e de Informação ligados, com 6 s de tempo, e o modo Foco desligado;
- o e-mail do crítico na hora ligado, o resumo diário por e-mail ligado e o push só do Crítico;
- linhas alternadas, miniaturas e o resumo da linha ligados nas tabelas;
- em cada tabela com visões, a visão de fábrica, como "Todos os ativos";
- a tela inicial na ordem de fábrica: severidade e, dentro dela, a mais antiga primeiro.

#### Scenario: Primeiro acesso
- **WHEN** o usuário abre a aplicação numa organização sem padrões, com uma conta que nunca mudou um ajuste
- **THEN** a casca aparece no tema Grafite, com o destaque Grafite, densidade normal, o raio base de 10 px e o dock embaixo, com itens de 48 px e ampliação ligada

#### Scenario: Primeiro acesso com mouse
- **WHEN** o usuário abre a aplicação num computador, numa organização sem padrões, com uma conta que nunca mudou um ajuste, e move o mouse
- **THEN** aparece o cursor suavizado, com suavização de 95% e o abraço ligado

#### Scenario: Primeiro aviso
- **WHEN** chega uma notificação de Informação, numa organização sem padrões, para uma conta que nunca mudou um ajuste
- **THEN** ela vira aviso na tela e some em 6 s

#### Scenario: Primeiro e-mail
- **WHEN** abre um alerta crítico, numa organização sem padrões, para uma conta que nunca mudou um ajuste e cuja pessoa tem e-mail
- **THEN** o e-mail do crítico sai na hora, e o aparelho inscrito recebe o push

#### Scenario: Primeiro relógio
- **WHEN** o usuário abre a aplicação numa organização sem padrões, com uma conta que nunca mudou um ajuste e o sistema no Horário de Brasília
- **THEN** o relógio da barra mostra a hora de Brasília

#### Scenario: Primeira tabela dos ativos
- **WHEN** uma conta que nunca escolheu uma visão abre os ativos, numa organização sem padrões
- **THEN** a tabela abre em "Todos os ativos", e o resumo da linha aparece ao parar o mouse

#### Scenario: Quem já escolheu o azul
- **WHEN** uma conta que escolheu o destaque azul abre a aplicação depois da mudança do padrão de fábrica
- **THEN** a interface continua com o destaque azul

### Requirement: Validação campo a campo

Cada preferência SHALL ser validada sozinha, na conta, nos padrões da organização e na cópia do navegador. Um valor ausente ou desconhecido SHALL dar lugar ao da camada de baixo: o padrão da organização e, sem ele, o de fábrica. As preferências válidas SHALL continuar valendo. Um valor numérico fora do intervalo SHALL ser trazido para o limite mais próximo:
- raio base de 0 a 24 px;
- itens do dock de 28 a 64 px;
- suavização do cursor de 0 a 100%.

O tempo do aviso SHALL ser 6, 10 ou 20 s. Qualquer outro valor SHALL dar lugar ao da camada de baixo.

O resumo por e-mail SHALL ser desligado ou diário. Qualquer outro valor SHALL dar lugar ao da camada de baixo.

O fuso horário SHALL ser um que o navegador reconhece. Qualquer outro valor SHALL dar lugar ao da camada de baixo, e, se nenhuma tem um fuso reconhecido, a "Seguir o sistema".

A ordem da tela inicial SHALL ser uma das colunas ordenáveis, com a direção crescente ou decrescente. Qualquer outro valor SHALL dar lugar ao da camada de baixo.

A visão escolhida de uma tabela SHALL ser a visão de fábrica ou uma visão da tabela que a camada pode usar: na conta, uma visão da organização ou da própria conta; nos padrões da organização, só uma visão da organização. Uma visão que não existe mais, ou que a camada não pode usar, SHALL dar lugar à da camada de baixo.

A API SHALL recusar com 400 a gravação de um ajuste desconhecido ou de um valor fora do permitido, com a mensagem no campo, sem gravar nenhum ajuste daquele pedido. A visão que a camada não pode usar SHALL ser recusada com "Escolha uma visão que você pode usar.", na conta, e com "Escolha uma visão da organização.", nos padrões da organização.

#### Scenario: Tema desconhecido salvo
- **WHEN** as preferências salvas trazem um tema que não existe e o dock à esquerda, numa organização sem padrões
- **THEN** o tema volta ao Grafite, e o dock continua à esquerda

#### Scenario: Valor desconhecido com padrão da organização
- **WHEN** a cópia do navegador traz um tema que não existe, e o padrão da organização é o tema Névoa
- **THEN** a interface usa o tema Névoa

#### Scenario: Tamanho fora do intervalo
- **WHEN** o tamanho salvo dos itens do dock é 90 px
- **THEN** o dock usa itens de 64 px

#### Scenario: Suavização fora do intervalo
- **WHEN** a suavização salva é 130%
- **THEN** o cursor usa 100%, e as demais preferências continuam as salvas

#### Scenario: Tempo do aviso inválido
- **WHEN** o tempo do aviso salvo é 15 s, numa organização sem padrões
- **THEN** os avisos usam 6 s, e as demais preferências continuam as salvas

#### Scenario: Resumo inválido
- **WHEN** o resumo por e-mail salvo é "semanal", numa organização sem padrões
- **THEN** o resumo fica diário, e as demais preferências continuam as salvas

#### Scenario: Fuso desconhecido
- **WHEN** o fuso salvo é "Marte/Olympus", numa organização sem padrões
- **THEN** a interface segue o fuso do sistema, e as demais preferências continuam as salvas

#### Scenario: Ordem desconhecida
- **WHEN** a ordem salva da tela inicial é por uma coluna que não existe, numa organização sem padrões
- **THEN** a tela inicial usa a ordem de fábrica, e as demais preferências continuam as salvas

#### Scenario: Preferências do F1a
- **WHEN** a aplicação abre com preferências salvas antes do F1b, sem cursor, notificações nem tabelas
- **THEN** essas seções usam os padrões, e a aparência, o dock e a acessibilidade salvos continuam valendo

#### Scenario: Preferências do F1b
- **WHEN** a aplicação abre com preferências salvas antes do F1c, sem fuso nem ordem da tela inicial
- **THEN** o fuso e a ordem da tela inicial usam os padrões, e as demais preferências salvas continuam valendo

#### Scenario: Preferências do P1b
- **WHEN** a aplicação abre com preferências salvas antes do P1c, sem o resumo da linha nem a visão dos ativos
- **THEN** o resumo da linha fica ligado, a tabela dos ativos abre na visão que vale, e as demais preferências salvas continuam valendo

#### Scenario: Gravação de um valor fora do permitido
- **WHEN** um pedido à API grava o tamanho dos itens do dock em 90 px e o tema Papel
- **THEN** a API responde 400, com a mensagem no tamanho do dock, e nem o tamanho nem o tema mudam

#### Scenario: Visão de uma conta como padrão da organização
- **WHEN** um pedido grava nos padrões da organização, como a visão dos ativos, uma visão que é de uma conta
- **THEN** a API responde 400, com "Escolha uma visão da organização." na visão, e os padrões não mudam

### Requirement: Dock certo desde a primeira pintura

A posição do dock, o tamanho dos itens e o ocultar automático SHALL valer antes da primeira pintura, como o tema. A primeira pintura SHALL usar a cópia do navegador. As preferências da conta, que chegam com o estado da sessão, SHALL ser aplicadas antes de a casca aparecer. O dock SHALL NOT aparecer numa posição e pular para outra, nem a janela de conteúdo mudar de lugar depois de aparecer.

#### Scenario: Reabertura com o dock à esquerda
- **WHEN** o usuário reabre a aplicação com o dock salvo à esquerda
- **THEN** a primeira pintura já mostra o dock à esquerda, e a janela de conteúdo não muda de lugar depois

#### Scenario: Dock mudado em outro dispositivo
- **WHEN** o usuário pôs o dock à direita no notebook e reabre a aplicação no computador, onde a cópia ainda tem o dock embaixo
- **THEN** a casca aparece já com o dock à direita, sem mostrá-lo embaixo antes

### Requirement: Padrões da organização

Cada organização SHALL poder definir os próprios padrões para qualquer preferência de interface. Um padrão da organização SHALL valer para quem não mudou aquele ajuste. A preferência que vale SHALL ser resolvida campo a campo:
1. o padrão de fábrica;
2. por cima dele, o padrão da organização, se houver;
3. por cima dos dois, a escolha da conta, se houver.

Sem sessão, a interface SHALL usar os padrões da organização do endereço. Uma mudança nos padrões SHALL chegar às telas abertas da organização em até 5 s, e valer para quem não mudou aqueles ajustes.

#### Scenario: Tema padrão da organização
- **WHEN** a organização define o tema Névoa como padrão, e uma conta que nunca mudou o tema entra
- **THEN** a casca aparece no tema Névoa

#### Scenario: Escolha da conta acima do padrão
- **WHEN** a organização define o tema Névoa como padrão, e uma conta escolheu o Grafite nos Ajustes
- **THEN** a casca dessa conta continua no Grafite

#### Scenario: Campo a campo
- **WHEN** a organização define o dock à esquerda, e uma conta só mudou o tamanho dos itens do dock para 36 px
- **THEN** a casca dessa conta mostra o dock à esquerda, com itens de 36 px

#### Scenario: Tela de entrada
- **WHEN** a organização define o tema Papel como padrão, e alguém abre o endereço dela sem sessão, num navegador sem a cópia das preferências
- **THEN** a tela de entrada aparece no tema Papel

### Requirement: Preferências guardadas na conta

Cada mudança de preferência SHALL ser gravada no servidor, na conta, e valer em qualquer navegador em que a conta entrar. A conta SHALL guardar só os ajustes que ela mudou. Restaurar uma seção SHALL tirar da conta os ajustes daquela seção, que voltam aos padrões da organização.

Uma mudança feita num dispositivo SHALL chegar às outras sessões abertas da mesma conta em até 5 s. As preferências de cada conta SHALL NOT ir para a auditoria.

#### Scenario: Outro navegador
- **WHEN** o usuário põe o dock à direita no computador e depois entra pelo notebook
- **THEN** o notebook mostra o dock à direita

#### Scenario: Duas sessões abertas
- **WHEN** o usuário tem a casca aberta no computador e no notebook, e escolhe o destaque verde no computador
- **THEN** em até 5 s o notebook passa ao destaque verde, sem uma ação do usuário

#### Scenario: Restaurar volta ao padrão da organização
- **WHEN** a organização define o dock à esquerda, o usuário põe o dock à direita e depois restaura a seção Dock
- **THEN** o dock volta para a esquerda

### Requirement: Cópia no navegador

O navegador SHALL guardar uma cópia das preferências que valem, para a primeira pintura e para quando o servidor não responde. Com o servidor fora do ar, uma mudança SHALL valer na hora e ficar guardada na cópia. Ela SHALL ser enviada à conta quando o servidor voltar com a sessão da mesma conta, e descartada se voltar com outra conta ou sem sessão.

Se o navegador recusar guardar a cópia, as mudanças SHALL valer até a página fechar, sem mensagem de erro. Depois da saída, a cópia SHALL voltar aos padrões da organização.

#### Scenario: Mudança sem servidor
- **WHEN** o servidor está fora do ar, o usuário põe o dock à esquerda, e o servidor volta com a sessão dele valendo
- **THEN** o dock continua à esquerda, e a escolha passa a valer também nos outros navegadores da conta

#### Scenario: Armazenamento bloqueado
- **WHEN** o navegador recusa guardar a cópia das preferências
- **THEN** a mudança vale até a página fechar, e nenhuma mensagem de erro aparece

#### Scenario: Saída num computador compartilhado
- **WHEN** Ana, com o tema OLED, sai, e a tela de entrada aparece
- **THEN** a tela de entrada usa os padrões da organização, e não o tema de Ana

### Requirement: Preferências do navegador passam para a conta

Na primeira entrada depois desta versão, se a conta ainda não tem preferências no servidor e o navegador tem preferências salvas antes dela, os ajustes que diferem dos padrões de fábrica SHALL passar para a conta. A passagem SHALL acontecer uma vez por navegador. Se a conta já tem preferências no servidor, as do servidor SHALL valer, e as do navegador SHALL ser descartadas.

#### Scenario: Primeira entrada com o tema salvo no navegador
- **WHEN** o usuário tinha escolhido o tema Meia-noite neste navegador antes desta versão, e entra pela primeira vez depois dela
- **THEN** o tema Meia-noite passa para a conta e vale também nos outros navegadores dele

#### Scenario: Conta com preferências no servidor
- **WHEN** a conta já tem o tema Papel no servidor, e entra por um navegador com o tema Meia-noite salvo antes desta versão
- **THEN** a casca aparece no tema Papel, e o Meia-noite do navegador é descartado

### Requirement: Tema e destaque personalizados nas preferências

A aparência SHALL aceitar o tema `personalizado` e o destaque `personalizado`, além dos de fábrica. As entradas deles SHALL ficar em dois campos da aparência, cada um trocado inteiro:
- **o tema personalizado:** o tom, escuro ou claro, a matiz da base, o tingimento dos cinzas e o contraste;
- **o destaque personalizado:** a matiz e a intensidade.

Os padrões de fábrica SHALL ser:
- **o tema personalizado:** escuro, na matiz 265, com 10% de tingimento e o contraste 45, que é o Grafite;
- **o destaque personalizado:** na matiz 258, com 85% de intensidade, que é o azul.

Cada número SHALL ser inteiro e SHALL ser trazido para o limite mais próximo quando vier fora do intervalo:
- a matiz, da base e do destaque, de 0 a 359 graus;
- o tingimento e a intensidade, de 0 a 100%;
- o contraste, de 0 a 100.

Um tom desconhecido, ou um campo sem algum número, SHALL dar lugar ao campo inteiro da camada de baixo. A API SHALL recusar com 400 a gravação de um tom desconhecido, com a mensagem no campo.

#### Scenario: Primeiro tema personalizado
- **WHEN** uma conta que nunca ajustou o tema personalizado o escolhe
- **THEN** a interface fica como no Grafite, escura, na matiz 265, com 10% de tingimento e o contraste 45

#### Scenario: Matiz fora do intervalo
- **WHEN** o tema personalizado salvo traz a matiz 400 e o tom claro
- **THEN** a matiz usada é 359, e o tom continua claro

#### Scenario: Tom desconhecido
- **WHEN** o tema personalizado salvo traz o tom "sépia", e o padrão da organização é o tema personalizado claro na matiz 80
- **THEN** a interface usa o tema personalizado da organização, claro na matiz 80

#### Scenario: Gravação de um tom desconhecido
- **WHEN** um pedido à API grava o tema personalizado com o tom "sépia"
- **THEN** a API responde 400, com a mensagem no tema personalizado, e a aparência não muda

### Requirement: Blocos do Início nas preferências

A ordem e a visibilidade dos blocos do Início SHALL ficar num campo da tela inicial, trocado inteiro: a lista dos blocos, cada um com o id e se está à vista. O padrão de fábrica SHALL ser a lista vazia, em que vale a ordem do registro, com todos à vista.

A lista SHALL ter até 20 blocos, sem repetir o id, e cada id SHALL ter só letras minúsculas, números, ponto e hífen, com até 40 caracteres. O bloco inválido SHALL sair da lista, e os válidos SHALL continuar. O id de um bloco que nenhum módulo registra SHALL ser ignorado na tela.

#### Scenario: Bloco repetido
- **WHEN** a lista salva traz "ativos.suprimentos" duas vezes
- **THEN** vale só a primeira, e os outros blocos continuam

#### Scenario: Bloco de um módulo que saiu
- **WHEN** a lista salva traz um bloco que nenhum módulo registra mais
- **THEN** o Início o ignora e mostra os outros na ordem salva

### Requirement: Barra de rolagem nas preferências

A aparência SHALL ter a preferência da barra de rolagem, com dois valores: "Ao rolar" e "Sempre visível". O padrão de fábrica SHALL ser "Ao rolar". A organização SHALL poder definir o padrão dela, e a conta, a escolha dela, como nas outras preferências.

Um valor ausente ou desconhecido SHALL dar lugar ao da camada de baixo, e as outras preferências SHALL continuar valendo. A API SHALL recusar com 400 a gravação de um valor fora dos dois, com a mensagem no campo.

A preferência SHALL valer antes da primeira pintura, pela cópia do navegador, como o tema: a barra SHALL NOT aparecer de um jeito e mudar depois.

#### Scenario: Primeiro acesso
- **WHEN** uma conta que nunca mudou um ajuste abre a aplicação, numa organização sem padrões
- **THEN** a barra de rolagem vale como "Ao rolar"

#### Scenario: Padrão da organização
- **WHEN** a organização define "Sempre visível" como padrão, e uma conta que nunca mudou esse ajuste entra
- **THEN** a barra de rolagem dessa conta fica sempre visível

#### Scenario: Valor desconhecido da barra
- **WHEN** as preferências salvas trazem a barra de rolagem como "grossa" e o dock à esquerda, numa organização sem padrões
- **THEN** a barra vale como "Ao rolar", e o dock continua à esquerda

#### Scenario: Sempre visível antes da primeira pintura
- **WHEN** o usuário reabre a aplicação com "Sempre visível" salvo
- **THEN** a primeira pintura já mostra o polegar da janela à vista
