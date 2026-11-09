# distribuicao-de-software Specification

## Purpose

Instalar programas nas máquinas pelo agente do GLPI que já está nelas: a base dos utilitários de software, a distribuição a uma ou a várias máquinas como uma tarefa, e a situação, o log e o histórico de cada máquina.

## Requirements

### Requirement: Base de software

A organização SHALL ter os pacotes de software. Cada pacote tem:
- o nome, de até 120 caracteres, único sem diferenciar acento;
- a versão;
- a descrição;
- o comando, de até 2.000 caracteres;
- os códigos de saída de sucesso, de fábrica 0 e 3010;
- o arquivo, opcional, de até 512 MB;
- a situação: ativo ou inativo.

A gravação SHALL recusar:
- o nome vazio, com "Informe o nome do pacote.";
- o nome repetido, com "Já existe um pacote com este nome.";
- o comando vazio, com "Informe o comando que o agente roda.";
- o código fora de -2147483648 a 4294967295, com "Informe os códigos de sucesso como números, separados por vírgula.".

O arquivo SHALL ser guardado em partes de até 8 MB, cada uma comprimida pelo gzip, com o SHA-512 de cada parte e o do arquivo inteiro. Trocar o arquivo SHALL trocar as partes. Quem vê a base SHALL baixar o arquivo inteiro, montado das partes, com o nome original.

O pacote inativo SHALL NOT ser escolhido numa distribuição nova, e as distribuições dele SHALL continuar no histórico.

#### Scenario: Pacote cadastrado
- **WHEN** quem administra o software cadastra o "7-Zip 23.01" com o arquivo `7z2301-x64.msi` e o comando `msiexec /i "7z2301-x64.msi" /qn /norestart`
- **THEN** o pacote fica na base com o tamanho do arquivo, e as partes ficam prontas para o agente

### Requirement: Distribuição às máquinas

Quem tem `software.distribuir` SHALL criar uma distribuição de um pacote ativo para uma ou mais máquinas: os ativos ativos com um agente ligado, nos locais em que a conta pode distribuir. Cada máquina SHALL começar em "Aguardando o agente".

A distribuição SHALL recusar:
- sem máquinas, com "Escolha pelo menos uma máquina.";
- o ativo sem agente ligado, com "O ativo PAT-00321 não tem o agente do GLPI ligado.";
- o local sem a permissão, com 403.

A criação SHALL ir para a auditoria, com o pacote e as máquinas.

#### Scenario: Distribuição para três máquinas
- **WHEN** a técnica distribui o 7-Zip para três computadores com o agente ligado
- **THEN** a distribuição fica com as três máquinas em "Aguardando o agente", e o progresso diz "0 de 3 concluídas"

### Requirement: Deploy pelo agente do GLPI

O endereço dos agentes SHALL atender a tarefa Deploy do agente do GLPI, por GET, pelo token:
- **O `getConfig`** SHALL responder com o `schedule` da tarefa Deploy e o `remote` no mesmo endereço.
- **O `getJobs`** SHALL responder com as tarefas das máquinas aguardando daquele `machineid` e com os arquivos delas:
  - o nome do arquivo;
  - as partes pelo SHA-512;
  - o espelho no endereço dos agentes;
  - o comando, com os códigos de sucesso em `okCode`.
  As máquinas respondidas SHALL passar a "Em andamento".
- **As partes do arquivo** SHALL ser servidas no espelho, pelo caminho `<a>/<ab>/<sha512>`, só as dos pacotes da organização.
- **O `setStatus`** SHALL guardar, em cada máquina:
  - a etapa ("Conferindo", "Baixando", "Preparando" ou "Executando");
  - a mensagem no log;
  - "Falhou", no `status` "ko";
  - "Concluída", na mensagem final de sucesso.

O log SHALL guardar as últimas 200 linhas. O CONTACT SHALL anunciar a tarefa Deploy e desligar as tarefas que o Grafite não atende.

#### Scenario: Instalação concluída
- **WHEN** o agente de um computador pede as tarefas, baixa o arquivo, roda o comando com o código 0 e manda "job successfully completed"
- **THEN** a máquina fica em "Concluída", com o log das mensagens e o momento do fim

#### Scenario: Instalação que falhou
- **WHEN** o comando sai com o código 1603 e o agente manda o `status` "ko"
- **THEN** a máquina fica em "Falhou", com a etapa "Executando" e a mensagem do agente no log

### Requirement: Pedir agora

"Pedir agora" SHALL acordar o agente de cada máquina aguardando da distribuição, pelo endereço `http://<IP do agente>:62354/now`, com 5 segundos de prazo. A resposta SHALL dizer quantos agentes responderam. O agente que não responde SHALL receber a tarefa no próximo contato.

#### Scenario: Agente acordado
- **WHEN** a técnica pede agora numa distribuição com duas máquinas aguardando, e só um agente responde
- **THEN** a tela diz "1 de 2 agentes acordados; os outros recebem a tarefa no próximo contato."

### Requirement: Histórico das distribuições

A lista das distribuições SHALL vir da mais nova para a mais antiga, com:
- o pacote e a versão;
- quem criou e quando;
- o progresso em texto, como "2 de 3 concluídas, 1 falhou".

A ficha da distribuição SHALL ter cada máquina com o ativo, a situação em texto, a etapa, o último passo e o log. A ficha do ativo com o agente ligado SHALL mostrar as distribuições dele, com o pacote, a situação e o momento.

#### Scenario: Log da máquina
- **WHEN** a técnica abre a máquina que falhou na ficha da distribuição
- **THEN** a tela mostra o log com as mensagens do agente, na ordem em que chegaram

### Requirement: Permissões da distribuição

O catálogo SHALL ter:
- `software.distribuir`, "Distribuir software às máquinas", na área "Software", por local, para ver a base e as distribuições e distribuir às máquinas dos locais;
- `software.administrar`, "Administrar a base de software", na área "Software", na organização, que inclui `software.distribuir`.

O perfil Administrador SHALL ter as duas. A auditoria SHALL registrar:
- o pacote cadastrado, alterado, inativado e reativado;
- o arquivo do pacote trocado;
- a distribuição criada;
- o pedir agora.

As mudanças dos pacotes e das distribuições SHALL publicar o evento `software.mudou` a quem tem `software.distribuir`.

#### Scenario: Técnico sem a administração
- **WHEN** um técnico com `software.distribuir` abre a base
- **THEN** ele vê os pacotes e distribui, mas não tem "Novo pacote"
