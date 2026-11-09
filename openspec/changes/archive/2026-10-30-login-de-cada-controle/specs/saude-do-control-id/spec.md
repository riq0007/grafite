## MODIFIED Requirements

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

## ADDED Requirements

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
