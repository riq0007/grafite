# saude-do-control-id Specification

## Purpose
Sondar, a cada 5 minutos, os controles de acesso Control iD dos tipos que ligam a capacidade de saúde, com o login guardado no cofre, e mostrar na ficha e na tabela se cada controle responde, se aceita o login, desde quando, o último contato e a versão do firmware, sempre com a idade do dado.

## Requirements

### Requirement: Saúde do Control iD

A capacidade `controlid.saude` (Saúde do Control iD) SHALL ter a descrição "Confere, a cada 5 minutos, se o controle de acesso responde e aceita o login.". Ela SHALL NOT trazer campos. Ao ligá-la num tipo, quem administra o catálogo SHALL escolher:
- o campo do tipo IP que a sondagem usa, entre os ativos que estão no tipo;
- a porta, de 1 a 65535, com a 80 já escolhida;
- o login, opcional: um segredo ativo do cofre do tipo Usuário e senha ou Conta administrativa, com o identificador preenchido, que é o usuário. Ele vale para os controles sem login próprio (requisito "Login de cada controle").

Ligar a capacidade sem o campo SHALL ser recusado com "Escolha o campo de IP que a sondagem usa.". Ligar sem o login SHALL ser aceito. Um segredo inativo, de outro tipo ou sem o identificador SHALL ser recusado com "Escolha um login ativo do cofre, do tipo Usuário e senha ou Conta administrativa, com o usuário preenchido.". Uma porta fora da faixa SHALL ser recusada com "Informe uma porta de 1 a 65535.". Um tipo sem nenhum campo do tipo IP SHALL ver a capacidade com "Inclua no tipo um campo do tipo IP para ligar a saúde do Control iD.", sem poder ligá-la. Mudar o campo, a porta ou o login SHALL valer na configuração seguinte do coletor.

#### Scenario: Controles com o login do cofre
- **WHEN** quem administra o catálogo liga a saúde do Control iD no tipo "Controle de acesso", com o campo "IP", a porta 80 e o segredo "Admin dos controles", do tipo Conta administrativa
- **THEN** o tipo é salvo, e os controles com o IP preenchido passam a ser sondados pelo coletor que alcança o IP deles, com esse login

#### Scenario: Sem o login
- **WHEN** quem administra o catálogo liga a saúde do Control iD no tipo "Face ID", com o campo "IP" e a porta 80, sem escolher o login
- **THEN** o tipo é salvo, e só os controles com login próprio são sondados

#### Scenario: Segredo sem o usuário
- **WHEN** alguém escolhe como login um segredo do tipo Usuário e senha sem o identificador
- **THEN** o pedido é recusado com "Escolha um login ativo do cofre, do tipo Usuário e senha ou Conta administrativa, com o usuário preenchido."

### Requirement: Login de cada controle

A sondagem de um controle SHALL usar:
- o segredo ligado ao próprio controle no cofre (spec cofre-de-segredos, "Vínculos com a pessoa e os ativos"), quando há um só ativo, do tipo Usuário e senha ou Conta administrativa, com o identificador preenchido;
- senão, o login escolhido no tipo.

Com mais de um segredo desses ligado ao controle, ele SHALL NOT ser sondado, e a situação SHALL ser "Não verificado", com "Há mais de um login ligado a este controle no cofre.". Com o login do tipo inativo e nenhum ligado ao controle, ele SHALL NOT ser sondado, e a situação SHALL ser "Não verificado", com "O login escolhido no tipo está inativo.", que a ficha do tipo também mostra. Com o tipo sem login e nenhum ligado ao controle, ele SHALL NOT ser sondado, e a situação SHALL ser "Não verificado", com "Sem login: escolha o login deste controle ou o do tipo.".

A ficha do controle SHALL dizer de onde vem o login, "Login do tipo" ou "Login próprio do controle", sem mostrar o usuário nem a senha.

#### Scenario: Controle com a senha própria
- **WHEN** o controle PAT-00778 tem uma senha diferente dos outros, e o segredo "Portaria norte" está ligado a ele no cofre
- **THEN** o coletor sonda a PAT-00778 com o "Portaria norte", e os outros controles com o login do tipo

#### Scenario: Dois logins no mesmo controle
- **WHEN** dois segredos do tipo Conta administrativa estão ligados à PAT-00778
- **THEN** a PAT-00778 não é sondada, e a situação dela é "Não verificado", com "Há mais de um login ligado a este controle no cofre."

#### Scenario: Login do tipo inativado
- **WHEN** quem administra o cofre inativa o "Admin dos controles", escolhido no tipo
- **THEN** a configuração seguinte não traz a sondagem dos controles sem login próprio, e eles ficam "Não verificado", com "O login escolhido no tipo está inativo."

#### Scenario: Controle sem nenhum login
- **WHEN** o tipo "Face ID" não tem login, e nenhum segredo está ligado à PAT-00780
- **THEN** a PAT-00780 não é sondada, e a situação dela é "Não verificado", com "Sem login: escolha o login deste controle ou o do tipo."

### Requirement: Sondagem dos controles

O coletor SHALL sondar cada controle a cada 5 minutos, pelo HTTP na porta do tipo, nesta ordem:
1. entra com o usuário e a senha (`login.fcgi`) e recebe a sessão;
2. lê as informações do sistema (`system_information.fcgi`) com a sessão;
3. sai da sessão (`logout.fcgi`), mesmo quando a leitura falha.

Cada pedido SHALL esperar até 10 segundos, com uma tentativa a mais. Um controle novo na configuração SHALL ser sondado logo, sem esperar o intervalo.

A sondagem SHALL resultar em:
- **respondendo**, quando o controle aceita o login e devolve as informações do sistema, com a versão do firmware, o produto e o número de série que ele informa;
- **login recusado**, quando o controle responde ao `login.fcgi` com a recusa do usuário e da senha, ou sem a sessão;
- **sem resposta**, quando o controle não responde no prazo, nem na tentativa a mais, ou recusa a conexão;
- **resposta inesperada**, quando o endereço responde, mas não como um Control iD, como um "não encontrado" no `login.fcgi` ou uma resposta que não é JSON;
- **sem dado**, quando a sondagem não pôde ser feita, como numa falha do próprio coletor.

A sondagem SHALL NOT entrar na auditoria. O usuário e a senha SHALL ir ao coletor só na configuração dos alvos dele e ficar só na memória: eles SHALL NOT ir à fila em disco, ao log nem à saúde do coletor.

#### Scenario: Controle que responde
- **WHEN** o coletor sonda a PAT-00777, e ela aceita o login e informa o firmware "6.12.2" e o produto "iDAccess Pro"
- **THEN** a leitura é respondendo, com o firmware e o produto, e o coletor sai da sessão

#### Scenario: Senha trocada no controle
- **WHEN** alguém troca a senha da PAT-00777 direto no controle, e o coletor a sonda com a senha do cofre
- **THEN** a leitura é login recusado, e não sem resposta

#### Scenario: Controle desligado
- **WHEN** a PAT-00777 não responde ao `login.fcgi` em 10 segundos, nem na tentativa a mais
- **THEN** a leitura é sem resposta

#### Scenario: IP de outro equipamento
- **WHEN** o IP da PAT-00777 aponta para uma impressora, que responde "não encontrado" ao `login.fcgi`
- **THEN** a leitura é resposta inesperada

#### Scenario: Login fora do disco
- **WHEN** a API fica fora do ar, e o coletor guarda os lotes na fila em disco
- **THEN** nenhum arquivo da fila nem linha do log do coletor contém o usuário ou a senha

### Requirement: Situação do Control iD

A saúde de um controle de um tipo com a capacidade SHALL ser uma destas situações, sempre em texto e com o ícone, nunca só pela cor:
- **Respondendo**, **Login recusado**, **Sem resposta**, **Resposta inesperada** ou **Sem dado**, pela última sondagem;
- **Não verificado**, quando o controle ainda não tem sondagem ou não pode ser sondado, com o motivo:
  - "Sem IP", com o campo de IP vazio;
  - "Nenhum coletor alcança o IP 10.9.0.5.", com o IP fora das faixas dos coletores ativos;
  - "O login escolhido no tipo está inativo.", "Há mais de um login ligado a este controle no cofre." e "Sem login: escolha o login deste controle ou o do tipo." (requisito "Login de cada controle");
  - "Aguardando a primeira sondagem.", com um coletor que alcança o IP.

O último contato SHALL ser o momento da última sondagem respondendo, e SHALL continuar o mesmo quando o controle deixa de responder. A versão do firmware e o produto SHALL ser os da última sondagem respondendo, com a idade dela. O controle inativo SHALL NOT mostrar a saúde. A última sondagem mais antiga que 15 minutos, 3 intervalos, SHALL mostrar "Desatualizado" ao lado da situação (spec leituras-e-estado).

#### Scenario: Controle que deixa de responder
- **WHEN** a PAT-00777 respondeu às 10:20 e não responde às 10:25
- **THEN** a ficha mostra "Sem resposta desde 10:25", com o último contato às 10:20 e o firmware da sondagem das 10:20

#### Scenario: Ainda sem sondagem
- **WHEN** um controle acabou de receber um IP numa faixa de um coletor
- **THEN** a saúde dele é "Não verificado", com "Aguardando a primeira sondagem."

#### Scenario: Situação sem depender da cor
- **WHEN** alguém que não distingue o verde do vermelho olha a coluna Control iD
- **THEN** cada controle diz "Respondendo", "Login recusado" ou "Sem resposta" em texto, com um ícone diferente para cada situação

### Requirement: Número de série pela sondagem

O número de série que o controle informa SHALL gravar o campo comum Número de série do ativo com a origem "coleta" e o coletor como autor, só quando ele muda, como o das impressoras (spec impressoras-por-snmp, "Número de série pela coleta"). A gravação SHALL respeitar a trava e a política de escrita do campo (spec cadastro-de-ativos) e SHALL entrar na auditoria, com o "antes → depois" e o coletor como quem fez.

#### Scenario: Série lida do controle
- **WHEN** a PAT-00777 está sem o número de série, e o controle informa "0M0400/123456"
- **THEN** a ficha mostra o Número de série "0M0400/123456", com "Coleta · Coletor de Jundiaí" e o momento

#### Scenario: Série travada no controle
- **WHEN** o Número de série da PAT-00777 está travado com "ABC123", e o controle informa outro
- **THEN** o campo continua "ABC123", e nada vai para a auditoria

### Requirement: Login escolhido na ficha do controle

No cartão Saúde do Control iD da ficha de um controle ativo, quem tem `cofre.administrar`, com o módulo Cofre ligado, SHALL ver "Escolher login". Ele abre o diálogo "Login do controle", com uma seleção:
- a primeira opção é "Login do tipo", quando o tipo tem um login, ou "Nenhum", quando não tem;
- as outras são os logins do cofre que servem de login (requisito "Saúde do Control iD"), pelo nome, sem o usuário nem a senha;
- a escolhida é o login próprio do controle, quando ele tem um só, e a primeira opção, quando não tem.

Salvar SHALL mudar os vínculos no cofre, sem mudar o ativo:
- o login escolhido passa a apontar o controle;
- os outros segredos do tipo Usuário e senha ou Conta administrativa ligados ao controle deixam de apontá-lo;
- com a primeira opção, nenhum desses segredos fica ligado ao controle.

Cada segredo que mudou SHALL entrar na auditoria como a edição do segredo, com os ativos antes e depois (spec cofre-de-segredos). O controle SHALL ser sondado com o login novo na configuração seguinte do coletor, e a ficha SHALL dizer de onde vem o login logo depois de salvar. Um login que deixou de servir, um controle inativo ou de um tipo sem a capacidade SHALL ser recusado. A conta sem a verificação em dois passos SHALL ouvir o caminho até o cadastro dela, como nas outras telas do cofre.

#### Scenario: Login próprio escolhido na ficha
- **WHEN** quem administra o cofre abre a PAT-00778, escolhe "Portaria norte" em "Escolher login" e salva
- **THEN** o "Portaria norte" passa a apontar a PAT-00778, a ficha diz "Login próprio do controle", e a configuração seguinte sonda a PAT-00778 com ele

#### Scenario: Volta ao login do tipo
- **WHEN** a PAT-00778 usa o "Portaria norte", e quem administra o cofre escolhe "Login do tipo" e salva
- **THEN** o "Portaria norte" deixa de apontar a PAT-00778, a ficha diz "Login do tipo", e a auditoria registra a edição do "Portaria norte"

#### Scenario: Dois logins resolvidos pela escolha
- **WHEN** a PAT-00778 tem dois logins ligados no cofre, e quem administra o cofre escolhe um deles
- **THEN** o outro deixa de apontá-la, e ela volta a ser sondada com o escolhido

#### Scenario: Sem administrar o cofre
- **WHEN** quem edita os ativos, sem `cofre.administrar`, abre a ficha da PAT-00778
- **THEN** o cartão Saúde do Control iD diz de onde vem o login, sem "Escolher login"
