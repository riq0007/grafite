## MODIFIED Requirements

### Requirement: Base de software

A organização SHALL ter os pacotes de software. Cada pacote tem:
- o nome, de até 120 caracteres, único sem diferenciar acento;
- a versão, que é a versão-alvo;
- a descrição;
- a categoria, opcional, entre as da organização;
- o nome no inventário, de até 120 caracteres, que liga o pacote aos programas do inventário e é o próprio nome quando fica vazio;
- o comando, de até 2.000 caracteres;
- os códigos de saída de sucesso, de fábrica 0 e 3010;
- o arquivo, opcional, de até 512 MB, com quem o guardou e quando;
- a situação: ativo ou inativo.

A gravação SHALL recusar:
- o nome vazio, com "Informe o nome do pacote.";
- o nome repetido, com "Já existe um pacote com este nome.";
- o comando vazio, com "Informe o comando que o agente roda.";
- o código fora de -2147483648 a 4294967295, com "Informe os códigos de sucesso como números, separados por vírgula.";
- a categoria de outra organização.

O arquivo SHALL ser guardado em partes de até 8 MB, cada uma comprimida pelo gzip, com o SHA-512 de cada parte e o do arquivo inteiro. Trocar o arquivo SHALL trocar as partes e gravar quem trocou e quando. Quem vê a base SHALL baixar o arquivo inteiro, montado das partes, com o nome original.

O tipo do pacote SHALL vir da extensão do arquivo: "Instalador MSI", "Instalador EXE", "Pacote MSIX", "Roteiro do PowerShell", "Roteiro em lote" (`.bat` e `.cmd`), "Arquivo ZIP", a extensão em maiúsculas nas outras, e "Só o comando" sem arquivo.

O pacote inativo SHALL NOT ser escolhido numa distribuição nova, e as distribuições dele SHALL continuar no histórico. As máquinas que o aguardam SHALL ficar na fila até ele ser reativado ("Pacote inativado na fila").

#### Scenario: Pacote cadastrado
- **WHEN** quem administra o software cadastra o "7-Zip", versão 23.01, com o arquivo `7z2301-x64.msi` e o comando `msiexec /i "7z2301-x64.msi" /qn /norestart`
- **THEN** o pacote fica na base como "Instalador MSI", com o tamanho do arquivo e quem o guardou, e as partes ficam prontas para o agente

#### Scenario: Nome no inventário vazio
- **WHEN** quem administra cadastra o "Google Chrome" sem o nome no inventário
- **THEN** o pacote casa com os programas "Google Chrome" do inventário

### Requirement: Distribuição às máquinas

Quem tem `software.distribuir` SHALL criar uma distribuição de um pacote ativo para uma ou mais máquinas: os ativos ativos com um agente ligado, nos locais em que a conta pode distribuir. A distribuição SHALL ter o quando (spec deste documento, "Quando instalar").

A criação SHALL classificar cada máquina frente ao pacote ("Pacote frente ao inventário") e à fila, nesta ordem:
- a que já tem a versão-alvo, ou uma mais nova, SHALL ser pulada, mesmo sem contato;
- a que já aguarda o mesmo pacote, ou o instala, noutra distribuição SHALL ser pulada, com esse motivo;
- as outras SHALL entrar em "Aguardando o agente", inclusive as sem contato (spec inventario-pelo-agente, "Agente sem contato").

As puladas SHALL NOT entrar na distribuição.

As máquinas achadas por uma visão, pela busca ou pela lista colada, fora dos locais em que a conta pode distribuir, SHALL ficar de fora sem aviso, e as da lista colada SHALL aparecer como não achadas.

O "Para quem" da distribuição SHALL ser o nome da máquina, quando é uma só; o local mais fundo que contém todas; ou "N locais".

A distribuição SHALL recusar:
- sem máquinas, com "Escolha pelo menos uma máquina.";
- o ativo sem agente ligado, com "O ativo PAT-00321 não tem o agente do GLPI ligado.";
- todas as máquinas puladas, com "Todas as máquinas escolhidas já têm a versão <versão>.", "Todas as máquinas escolhidas já aguardam este pacote." ou, com os dois motivos, "Todas as máquinas escolhidas já têm a versão <versão> ou já aguardam este pacote.";
- o dia marcado antes de amanhã, com "Escolha um dia de amanhã em diante.", ou depois de um ano, com "Escolha um dia até daqui a um ano.";
- o dia marcado fora do instante ISO 8601 com o fuso, com "Escolha o dia e a hora.";
- o fuso que não existe, com 400;
- a visão que deixou de valer, com "A visão <nome> deixou de valer. Refaça os filtros dela na tabela do Ativos.";
- o local ou o ativo, mandado pelo id, sem a permissão, com 403;
- a visão de outra conta, com 404.

A criação SHALL ir para a auditoria, com o pacote, as máquinas, quantas foram puladas pela versão, quantas por já aguardarem o pacote e o quando.

#### Scenario: Distribuição para três máquinas
- **WHEN** a técnica distribui o 7-Zip agora para três computadores com o agente ligado e sem o 7-Zip
- **THEN** a distribuição fica com as três máquinas em "Aguardando o agente", e o progresso diz "0 de 3 concluídas"

#### Scenario: Máquina que já tem a versão
- **WHEN** a técnica distribui o Driver HP Universal 7.3 às 18 máquinas do Financeiro, e 5 delas já têm a 7.3
- **THEN** a distribuição fica com 13 máquinas, e a auditoria registra as 5 puladas

#### Scenario: Máquina que já aguarda o pacote
- **WHEN** a técnica distribuiu o Google Chrome 131 ao Financeiro na janela da noite, com 12 máquinas aguardando, e às 15:00 distribui o Chrome 131 de novo ao Financeiro, agora
- **THEN** as 12 ficam de fora da nova, e a auditoria registra as 12 puladas por já aguardarem o pacote

### Requirement: Deploy pelo agente do GLPI

O endereço dos agentes SHALL atender a tarefa Deploy do agente do GLPI, por GET, pelo token:
- **O `getConfig`** SHALL responder com o `schedule` da tarefa Deploy e o `remote` no mesmo endereço.
- **O `getJobs`** SHALL responder com as tarefas das máquinas aguardando daquele `machineid`, com o pacote ativo ("Pacote inativado na fila"), que podem seguir agora ("Quando instalar"), na ordem em que as distribuições foram criadas, e com os arquivos delas:
  - o nome do arquivo;
  - as partes pelo SHA-512;
  - o espelho no endereço dos agentes;
  - o comando, com os códigos de sucesso em `okCode`.
  As máquinas respondidas SHALL passar a "Em andamento".
- **As partes do arquivo** SHALL ser servidas no espelho, pelo caminho `<a>/<ab>/<sha512>`, só as dos pacotes da organização.
- **O `setStatus`** SHALL guardar, em cada máquina:
  - a etapa ("Conferindo", "Baixando", "Preparando" ou "Executando");
  - a mensagem no log;
  - o código de saída, da mensagem "exit status" da execução;
  - "Falhou", no `status` "ko";
  - "Concluída", na mensagem final de sucesso.

O log SHALL guardar as últimas 200 linhas. O CONTACT SHALL anunciar a tarefa Deploy e desligar as tarefas que o Grafite não atende.

Ao agente com um pedido aguardando, do pacote ativo, que ainda não pode seguir, o CONTACT e a resposta do INVENTORY SHALL dar o `expiration` em minutos, até uma hora depois do próximo momento em que o pedido pode seguir, com o máximo de 24 horas (spec inventario-pelo-agente, "Protocolo do agente do GLPI"). O agente SHALL guardar até quando deve voltar.

#### Scenario: Instalação concluída
- **WHEN** o agente de um computador pede as tarefas, baixa o arquivo, roda o comando com o código 0 e manda "job successfully completed"
- **THEN** a máquina fica em "Concluída", com o log das mensagens e o momento do fim

#### Scenario: Instalação que falhou
- **WHEN** o comando sai com o código 1603 e o agente manda o `status` "ko"
- **THEN** a máquina fica em "Falhou", com a etapa "Executando", o código 1603 e a mensagem do agente no log

#### Scenario: Fora da janela da noite
- **WHEN** o agente de uma máquina da distribuição da janela da noite manda o CONTACT e pede as tarefas às 15:00
- **THEN** o `getJobs` não traz essa tarefa, a máquina continua em "Aguardando o agente", e o CONTACT responde com o `expiration` de "480m", para o agente voltar entre 22:00 e 23:00

### Requirement: Histórico das distribuições

A lista das distribuições SHALL vir da mais nova para a mais antiga, com:
- o pacote e a versão;
- o "Para quem";
- quem criou e quando;
- o progresso em texto, como "2 de 3 concluídas, 1 falhou".

A lista, a distribuição aberta, as distribuições da ficha do pacote e a última distribuição da base SHALL mostrar e contar só as máquinas dos locais em que a conta tem `software.distribuir`. A distribuição sem nenhuma máquina nesses locais SHALL ficar fora da lista, e abri-la SHALL dar 404.

A distribuição aberta SHALL ter, à esquerda, as distribuições do mesmo pacote, cada uma com o "Para quem", o momento e a situação em rótulo ("1 FALHOU", "1 SEM CONTATO", "TODAS CONCLUÍDAS"), com a aberta em borda forte e "Distribuir este pacote" no pé. No centro, ela SHALL ter:
- o título com o "Para quem" e o momento ("Financeiro, hoje às 09:02"), e a linha com as máquinas, quem enviou e o resumo do comando ("18 máquinas · enviada por Ricardo V., sem perguntar e sem reiniciar");
- as concluídas em número grande ("14 de 18 concluídas"), a régua com um pedaço por situação e um rótulo por situação;
- "N máquinas em locais fora do seu alcance", quando houver;
- **Precisa de você:** as que falharam, com o código e a explicação dele ("O que a instalação faz"), "Tentar de novo" e "Ver a ficha"; e as que aguardam com o agente sem contato, com há quanto tempo, "Ver a ficha" e "Tirar da fila";
- **Na fila:** as que aguardam com o agente em contato, com quando o pedido segue e, na que não respondeu ao chamado, até quando o agente volta ("Não respondeu ao chamado das 22:00; o agente volta até 23:00");
- **Em andamento:** com a pessoa da máquina ("Pessoa da máquina"), o rótulo "INSTALANDO", o início e a etapa ("09:36 · executando");
- **Concluídas:** em chips, com o nome da máquina e a hora;
- **Tiradas da fila:** em chips, quando houver;
- "Exportar", que grava no navegador um CSV das máquinas, com a situação, a etapa, o código e os momentos.

Com o pacote inativo, a distribuição aberta SHALL dizer que as máquinas que aguardam ficam na fila até ele ser reativado, cada uma com "Pacote inativado" no lugar de quando o pedido segue, e SHALL NOT ter "Tentar de novo" ("Pacote inativado na fila").

O CSV do "Exportar", aqui e na matriz, SHALL usar o ";" e começar pelo BOM; a célula que começa por "=", "+", "-", "@", tabulação ou retorno de carro SHALL ganhar o apóstrofo, para a planilha não a executar.

O nome de cada máquina SHALL abrir o log dela, com as mensagens do agente na ordem em que chegaram. A ficha do ativo SHALL mostrar as distribuições dele na aba Software (spec inventario-pelo-agente, "Softwares na ficha do ativo").

#### Scenario: Log da máquina
- **WHEN** a técnica abre o nome da máquina que falhou na distribuição
- **THEN** a tela mostra o log com as mensagens do agente, na ordem em que chegaram

#### Scenario: O que precisa de você
- **WHEN** a técnica abre a distribuição do Chrome ao Financeiro, com 14 concluídas, 2 instalando, a PC-FIN-17 que falhou com o 1603 e a PC-FIN-18 sem contato há 3 dias
- **THEN** "Precisa de você" mostra a PC-FIN-17 com "Falhou · 1603", a explicação do erro fatal e "Tentar de novo", e a PC-FIN-18 com "Sem contato · há 3 dias" e "Tirar da fila"

#### Scenario: Máquinas fora do alcance
- **WHEN** um técnico com `software.distribuir` só no Financeiro abre a distribuição do Chrome à Sede, com 18 máquinas no Financeiro e 4 no RH
- **THEN** a distribuição mostra e conta só as 18 do Financeiro, com "de 18 concluídas", e diz "4 máquinas em locais fora do seu alcance"

### Requirement: Permissões da distribuição

O catálogo SHALL ter:
- `software.distribuir`, "Distribuir software às máquinas", na área "Software", por local, para ver a base, a matriz e as distribuições e distribuir às máquinas dos locais;
- `software.administrar`, "Administrar a base de software", na área "Software", na organização, que inclui `software.distribuir`.

O perfil Administrador SHALL ter as duas. A auditoria SHALL registrar:
- o pacote cadastrado, alterado, inativado e reativado;
- o arquivo do pacote trocado;
- a categoria criada, renomeada, reordenada e removida;
- a distribuição criada;
- a máquina que tenta de novo e a tirada da fila.

As mudanças dos pacotes, das categorias e das distribuições SHALL publicar o evento `software.mudou` a quem tem `software.distribuir`.

#### Scenario: Técnico sem a administração
- **WHEN** um técnico com `software.distribuir` abre a base
- **THEN** ele vê os pacotes e distribui, mas não tem "Novo pacote" nem "Categorias…"

## REMOVED Requirements

### Requirement: Pedir agora

**Reason**: O m02 da rodada 3 tirou o botão "Pedir agora" da distribuição, e o Grafite passa a acordar os agentes sozinho, na hora em que o pedido pode seguir.

**Migration**: "Acordar os agentes", neste documento. A rota `POST /software/distribuicoes/:id/agora` sai.

## ADDED Requirements

### Requirement: Categorias da base

A organização SHALL ter as categorias de software, cada uma com o nome, de 1 a 40 caracteres e único sem diferenciar acento, e a ordem. A organização SHALL começar com Navegadores, Compactadores, Drivers, Escritório, Utilitários, Rede e segurança e Mídia, nessa ordem.

Quem tem `software.administrar` SHALL criar, renomear, ordenar e remover as categorias em "Categorias…", no cabeçalho da base. A remoção da categoria com pacotes SHALL ser recusada com "Tire os pacotes desta categoria antes de removê-la.". O nome repetido SHALL ser recusado com "Já existe uma categoria com este nome.".

#### Scenario: Categorias de fábrica
- **WHEN** a organização é criada
- **THEN** a base tem as 7 categorias, de Navegadores a Mídia

#### Scenario: Categoria com pacotes
- **WHEN** quem administra tenta remover Navegadores, que tem o Google Chrome
- **THEN** a remoção é recusada com "Tire os pacotes desta categoria antes de removê-la."

### Requirement: Pacote frente ao inventário

Um programa do inventário SHALL ser do pacote quando o nome dele, sem acento, sem diferenciar maiúscula e com os espaços juntados, é igual ao nome no inventário do pacote, ou começa por ele seguido de um espaço e de um algarismo ou de "(". Com o pacote duas vezes numa máquina, SHALL valer a versão mais alta.

As versões SHALL ser comparadas pedaço a pedaço, sem o "v" do começo, separadas por ponto, hífen, sublinhado, espaço e pela troca entre algarismo e letra: número com número pelo valor, letra com letra sem diferenciar maiúscula, e o número depois da letra. A comparação SHALL ir só até a quantidade de pedaços da versão do pacote, e o pedaço que falta na versão instalada SHALL valer 0. Sem versão no inventário, o programa SHALL contar como abaixo da versão-alvo.

Frente a um pacote com versão, cada máquina SHALL estar:
- na versão-alvo, com a versão igual ou mais nova;
- desatualizada, abaixo dela;
- sem o programa.

O pacote sem versão SHALL NOT ter comparação: a máquina com o programa SHALL contar como instalada, nenhuma SHALL ficar desatualizada, e a situação na base SHALL ser "SEM VERSÃO-ALVO".

As contas SHALL valer para os ativos ativos com o agente ligado, nos locais em que a conta tem `software.distribuir`.

#### Scenario: Versão do Chrome
- **WHEN** o pacote Google Chrome tem a versão 131, e uma máquina tem "Google Chrome" 131.0.6778.86 e outra, 129.0.6668.101
- **THEN** a primeira está na versão-alvo, e a segunda está desatualizada

#### Scenario: Versão com letra e com pedaço a menos
- **WHEN** o pacote do Java tem a versão 8u411, e uma máquina tem a 8u401; e o pacote do 7-Zip tem a 24.08, e outra máquina tem a 24
- **THEN** as duas máquinas estão desatualizadas

#### Scenario: Pacote sem versão
- **WHEN** o pacote "Configuração do Office", sem versão, casa com o programa de 30 máquinas
- **THEN** a base diz "Instalado em 30" e "SEM VERSÃO-ALVO", e a distribuição dele não pula nenhuma máquina

#### Scenario: Nome parecido
- **WHEN** uma máquina tem só o "Google Chrome Beta"
- **THEN** ela conta como sem o Google Chrome

### Requirement: Tela da base

A base SHALL ter:
- as abas por categoria, com "Todos" e a quantidade de pacotes em cada uma;
- "Procurar na base", pelo nome;
- "Só os desatualizados";
- "Novo pacote" e "Categorias…", para quem tem `software.administrar`.

A tabela SHALL ter, para cada pacote:
- o monograma, o nome e, embaixo, o tipo curto e o tamanho ("MSI · 118 MB");
- a versão-alvo;
- a barra "Instalado em N de M", com a parte na versão-alvo, a desatualizada e a sem o programa;
- a situação em rótulo: "N DESATUALIZADAS" ou "TODAS EM DIA";
- a última distribuição.

A ordem SHALL ser a de mais desatualizadas primeiro. O pé SHALL dizer quantas instalações estão abaixo da versão-alvo, em quantos pacotes e entre quantas máquinas com o agente, com "Ver na matriz".

#### Scenario: Painel do que precisa de atenção
- **WHEN** a técnica abre a base com o Google Chrome, 17 desatualizadas, e o SumatraPDF, todas em dia
- **THEN** o Chrome vem antes, com "17 DESATUALIZADAS", e o SumatraPDF diz "TODAS EM DIA"

### Requirement: Ficha do pacote

A ficha do pacote SHALL ter, à esquerda:
- o monograma, o nome, os rótulos da versão ("VERSÃO 131") e da situação ("ATIVO" ou "INATIVO") e a descrição;
- o tipo, o arquivo, o tamanho com as partes ("118 MB, em 12 partes"), quem guardou e quando, a categoria e o nome no inventário;
- "Distribuir este pacote", "Editar" e "Inativar", os dois últimos para quem tem `software.administrar`.

No centro, ela SHALL ter:
- os quatro números: "Instalado em" (das M máquinas), "Na versão <versão>", "Desatualizadas" e "Sem o <nome>", com a legenda de cada um;
- "O que a instalação faz", com o comando em mono e a explicação ("O que a instalação faz", abaixo);
- as barras das versões encontradas, da mais nova para a mais velha, cada uma com o nome, a versão e o estado escrito ("Google Chrome 130 · abaixo do alvo"), e a quantidade;
- as distribuições do pacote, com o "Para quem", o momento, as máquinas e o resultado em rótulos.

#### Scenario: As contas fecham
- **WHEN** a técnica abre o Google Chrome 131, com 47 máquinas com o agente, 14 na 131, 17 em versões anteriores e 16 sem o Chrome
- **THEN** a ficha mostra "Instalado em 31 das 47", "Na versão 131" 14, "Desatualizadas" 17 e "Sem o Google Chrome" 16

### Requirement: O que a instalação faz

O comando SHALL ser explicado em português, com os pedaços reconhecidos destacados no mono:
- no `msiexec`: `/i` instala o arquivo, `/x` desinstala, `/qn` e `/quiet` sem abrir janela nem fazer pergunta, `/qb` e `/passive` mostrando só o progresso, `/norestart` e `REBOOT=ReallySuppress` sem reiniciar a máquina, `/forcerestart` reiniciando ao terminar, `ALLUSERS=1` para todos os usuários e `/l*v <arquivo>` gravando o log;
- nos instaladores EXE: `/S`, `/s`, `/SILENT`, `/VERYSILENT`, `--silent` e `/quiet` sem perguntar, `/SUPPRESSMSGBOXES` sem caixas de mensagem e `/NORESTART` sem reiniciar;
- no `powershell -File <roteiro>`: roda o roteiro do PowerShell.

O comando sem nenhum pedaço reconhecido SHALL aparecer só em mono. O resumo SHALL dizer se o pacote instala sem perguntar e sem reiniciar.

O código de saída SHALL ser explicado: 1602, cancelada na máquina; 1603, erro fatal, que costuma ser outra instalação em andamento; 1618, outra instalação em andamento; 1619, o pacote não abriu; 1633, plataforma sem suporte; 1638, outra versão já instalada; 1641 e 3010, pede reinício. O código sem explicação SHALL aparecer só com o número.

#### Scenario: Comando do MSI
- **WHEN** o comando é `msiexec /i chrome-131.msi /qn /norestart`
- **THEN** a ficha diz que ele instala o arquivo sem abrir janela nem fazer pergunta e não reinicia a máquina quando terminar, e o resumo é "sem perguntar e sem reiniciar"

### Requirement: Quando instalar

A distribuição SHALL seguir num destes momentos:
- **Agora:** o pedido segue já;
- **Na janela da noite:** o pedido só segue das 22:00 às 06:00, toda noite, até a máquina instalar ou sair da fila;
- **Escolher o dia:** o pedido só segue a partir do dia e da hora marcados, de amanhã até daqui a um ano, com 22:00 de fábrica.

As horas SHALL valer no fuso de quem envia, guardado na distribuição e escrito no resumo. O dia marcado SHALL chegar à API como o instante ISO 8601 com o fuso ("2026-11-19T22:00:00-03:00" ou com o "Z"); o texto sem o fuso SHALL ser recusado.

#### Scenario: Driver na janela da noite
- **WHEN** a técnica envia o Driver HP na janela da noite às 09:40
- **THEN** nenhuma máquina recebe o pedido antes das 22:00, e as ligadas às 22:00 instalam

#### Scenario: Máquina desligada a noite toda
- **WHEN** uma máquina da distribuição da janela da noite fica desligada das 22:00 às 06:00
- **THEN** ela continua em "Aguardando o agente" e recebe o pedido na noite seguinte, se ligada

#### Scenario: Dia depois de um ano
- **WHEN** a técnica marca o dia 20/11/2027 em 15/11/2026
- **THEN** a distribuição é recusada com "Escolha um dia até daqui a um ano."

### Requirement: Acordar os agentes

O Grafite SHALL chamar o agente de cada máquina que aguarda, com o pacote ativo e o pedido que pode seguir, o agente em contato e o IP, pelo endereço `http://<IP do agente>:62354/now`, com 5 segundos de prazo e até 20 chamados ao mesmo tempo:
- na hora, ao criar a distribuição para agora e ao "Tentar de novo" de um pedido que pode seguir;
- a cada 15 minutos, as máquinas que não foram chamadas nas últimas 2 horas, o que cobre as 22:00 da janela da noite e o dia marcado.

Cada chamado SHALL ficar na máquina, com o momento e se o agente respondeu, e no log ("Chamado às 22:00" ou "Chamado às 22:00, sem resposta"). O agente que não responde SHALL receber a tarefa no próximo contato em que ela pode seguir.

#### Scenario: Agentes acordados na janela
- **WHEN** chega 22:00 de uma distribuição da janela da noite com 12 máquinas aguardando e em contato
- **THEN** o Grafite chama os 12 agentes até as 22:15, e os que respondem pedem as tarefas na hora

#### Scenario: Porta do agente fechada
- **WHEN** a máquina está ligada o dia todo, o agente falou às 14:00 e a porta 62354 dela está fechada
- **THEN** o chamado das 22:00 fica "sem resposta", a distribuição diz até quando o agente volta, e o agente pede as tarefas entre 22:00 e 23:00, pelo `expiration` do CONTACT das 14:00

### Requirement: Assistente da distribuição

A distribuição SHALL ser criada num assistente de quatro passos, Pacote, Máquinas, Quando e Conferir, com o trilho dos passos à esquerda e, no pé dele, "Já enviado hoje", com as distribuições do dia: o pacote, o "Para quem", a hora e o progresso.

O passo Máquinas SHALL juntar as máquinas escolhidas em quatro abas:
- **Por local:** a árvore dos locais com as caixas de marcar e, em cada local, quantas máquinas têm o agente em dia e quantas estão sem contato;
- **Por visão:** as visões da tabela do Ativos, as da organização e as da conta, cada uma com as máquinas com o agente que ela filtra; a visão que deixou de valer, com a definição ou um filtro que a tabela não aceita mais, SHALL ficar fora da aba;
- **Por busca:** pelo nome, pelo patrimônio, pelo hostname ou pela pessoa;
- **Colar lista:** nomes, patrimônios ou hostnames, um por linha ou separados por vírgula, até 2.000 ("Cole até 2.000 máquinas de uma vez."), dizendo os que não foram achados.

O "Até agora", à direita, SHALL ter o cartão do pacote (o monograma, o nome, a versão e "<tipo> · <tamanho> · instala sem perguntar"), o total de máquinas escolhidas e a conta em rótulos: "VÃO INSTALAR", "JÁ TÊM A <versão> · PULADAS", "JÁ AGUARDAM ESTE PACOTE · PULADAS", só quando houver, e "NA FILA". Ele SHALL avisar a máquina sem contato, que entra na fila e instala quando voltar, e a máquina com outra instalação em andamento, que recebe esta em seguida.

O passo Quando SHALL ter os três momentos em cartões de rádio, com "INDICADO PARA DRIVERS" na janela da noite e o dia de amanhã até daqui a um ano; a faixa das próximas 24 horas, com "agora" e a janela ou o dia marcados; e o que acontece com a máquina ligada, desligada e sem contato. Na janela da noite, o resumo SHALL dizer "Repete nas noites seguintes, até instalar".

O passo Conferir SHALL ter três grupos, com o número grande e as máquinas em chips:
- as que vão instalar, divididas em "Atualizam da <versão> · N", uma por versão de hoje, e "Instalam pela primeira vez · N";
- as puladas, "Nada muda nelas", e, quando houver, as que já aguardam este pacote, "Seguem na outra distribuição";
- as da fila, "Instala quando voltar", que podem ser tiradas da lista ali.

Ao lado, o envio (para quem, quando e quem envia), "Depois de enviar", com o que acontece em seguida, e "Enviar".

Vindo da matriz, o assistente SHALL abrir no passo Quando, com o pacote e as máquinas escolhidos, a origem escrita ("Vindo da matriz do local Financeiro"), a trilha e "Voltar à matriz".

#### Scenario: A conta antes de enviar
- **WHEN** a técnica escolhe o Driver HP Universal 7.3 e marca o Financeiro, com 18 máquinas: 5 já na 7.3, 5 na 7.2, 7 sem o driver e a PC-FIN-18 sem contato
- **THEN** o "Até agora" diz 18 máquinas, "VÃO INSTALAR" 12, "JÁ TÊM A 7.3 · PULADAS" 5 e "NA FILA" 1, e o Conferir mostra "Atualizam da 7.2 · 5" e "Instalam pela primeira vez · 7"

#### Scenario: Visão como grupo
- **WHEN** a técnica marca a visão da organização "Notebooks do comercial"
- **THEN** entram as máquinas com o agente que os filtros dessa visão acham

#### Scenario: Visão que deixou de valer
- **WHEN** a conta tem a visão "Notebooks antigos", guardada com um filtro que a tabela do Ativos não aceita mais, e a técnica abre o passo Máquinas
- **THEN** a aba "Por visão" mostra as outras visões, e a prévia que manda a "Notebooks antigos" pelo id é recusada com "A visão Notebooks antigos deixou de valer. Refaça os filtros dela na tabela do Ativos."

### Requirement: Tentar de novo e tirar da fila

Quem tem `software.distribuir` no local da máquina SHALL:
- **Tentar de novo** a máquina que falhou, com o pacote ativo: ela volta a "Aguardando o agente", sem a etapa e sem o código, e o log ganha a linha "Tentar de novo, por <nome>"; com o pacote inativo, o pedido SHALL ser recusado com "O pacote está inativo.";
- **Tirar da fila** a máquina que aguarda, também a de um pacote inativo: ela passa a "Tirada da fila", com o momento, e SHALL NOT receber mais o pedido.

O progresso SHALL contar as tiradas à parte, como "14 de 18 concluídas, 1 tirada da fila".

#### Scenario: Máquina que falhou de novo na fila
- **WHEN** a técnica escolhe "Tentar de novo" na PC-FIN-17, que falhou com o 1603
- **THEN** ela volta a "Aguardando o agente", e o agente dela é acordado

### Requirement: Matriz do software

A matriz SHALL ter o controle "Por máquina | Por local", "Filtrar programas" e "Exportar", que grava no navegador um CSV do que ela mostra.

**Por máquina** SHALL mostrar um local escolhido: os pacotes ativos nas linhas e as máquinas com o agente nas colunas, com o nome girado. Cada célula SHALL trazer a versão do inventário: na versão-alvo, em sucesso; desatualizada, com "↓" e em atenção; e "Falta", com a borda tracejada. A dica da célula SHALL dizer a máquina, a pessoa ("Pessoa da máquina"), a versão e a distribuição em andamento ou a que falhou.

Marcar células de um pacote SHALL abrir a barra "N marcadas no <pacote>", com o que acontece com cada uma, "Limpar" e "Distribuir <pacote> <versão> a estas N", que abre o assistente no passo Quando. Marcar uma célula de outro pacote SHALL recomeçar a marcação.

**Por local** SHALL ter os pacotes nas linhas e os locais com máquinas com o agente nas colunas, cada máquina contada no próprio local. Cada célula SHALL trazer "N de M" na versão-alvo, com o fundo de todas na versão-alvo, de parte fora dela ou de nenhuma nela, com a borda contínua. O clique numa célula SHALL mostrar, à direita, o "N de M na versão-alvo", as máquinas fora da versão-alvo com a versão e a situação, as que estão nela, a última distribuição no local, "Distribuir <pacote> <versão> a estas N" e "Abrir a matriz do local <local>".

No pacote sem versão-alvo, a célula do "Por local" SHALL contar as máquinas com o programa, e a célula e o painel SHALL dizer "N de M com o programa" e as máquinas sem o programa, sem "na versão-alvo".

#### Scenario: Da matriz ao assistente
- **WHEN** a técnica marca as 4 células do Chrome fora da versão-alvo no Financeiro e escolhe "Distribuir Google Chrome 131 a estas 4"
- **THEN** o assistente abre no passo Quando, com as 4 máquinas e "Vindo da matriz do local Financeiro"

#### Scenario: Local sem nenhuma na versão-alvo
- **WHEN** as 6 máquinas da Diretoria têm o Chrome 130
- **THEN** a célula Diretoria × Chrome diz "0 de 6", no fundo neutro e com a borda contínua

#### Scenario: Pacote sem versão no Por local
- **WHEN** a técnica abre a célula Financeiro × "Configuração do Office", sem versão, com 15 das 18 máquinas com o programa
- **THEN** a célula diz "15 de 18", e o painel diz "15 de 18 com o programa" e mostra as 3 sem o programa

### Requirement: Pessoa da máquina

A pessoa responsável pela máquina SHALL aparecer na distribuição aberta, no CSV dela e na dica da matriz só para a conta com `pessoas.ver` no local da pessoa e com a pessoa não anonimizada, como na ficha do ativo. A busca das máquinas do assistente SHALL achar pela pessoa só as pessoas que a conta vê.

#### Scenario: Técnico sem acesso às pessoas
- **WHEN** um técnico com `software.distribuir` e sem `pessoas.ver` abre a distribuição em que está a PC-FIN-17, da Marina Teles, e busca "Marina" no passo Máquinas
- **THEN** a PC-FIN-17 aparece sem a pessoa, e a busca não a acha

#### Scenario: Pessoa anonimizada
- **WHEN** a pessoa responsável pela PC-FIN-17 foi anonimizada
- **THEN** a distribuição e a matriz mostram a PC-FIN-17 sem a pessoa, também para quem tem `pessoas.ver`

### Requirement: Pacote inativado na fila

As máquinas que aguardam um pacote inativado SHALL ficar em "Aguardando o agente", sem receber o pedido:
- o `getJobs` SHALL NOT trazê-lo;
- o `expiration` do CONTACT SHALL NOT contá-lo;
- o Grafite SHALL NOT chamar o agente por ele.

O "Tentar de novo" SHALL ser recusado com "O pacote está inativo.", e o "Tirar da fila" SHALL continuar. A distribuição aberta e a aba Software da ficha (spec inventario-pelo-agente, "Softwares na ficha do ativo") SHALL dizer "Pacote inativado" em cada máquina que aguarda.

Reativar o pacote SHALL retomar a entrega: o agente recebe o pedido no próximo contato em que ele pode seguir, e o chamado de cada 15 minutos o acorda ("Acordar os agentes").

#### Scenario: Pacote inativado com a fila da noite
- **WHEN** a TI inativa o Driver HP Universal 7.3 às 15:00, com 12 máquinas aguardando a janela da noite
- **THEN** às 22:00 nenhuma recebe o pedido nem é chamada, e cada uma diz "Pacote inativado" na distribuição

#### Scenario: Pacote reativado
- **WHEN** a TI reativa o Driver HP às 10:00 do dia seguinte
- **THEN** as 12 máquinas recebem o pedido na janela daquela noite
