## Purpose

Guardar os segredos da organização, como as senhas das contas administrativas, dos equipamentos e dos serviços, cifrados em duas camadas, com o acesso dado segredo a segredo e cada revelação e cópia confirmada pelo código do app e registrada na auditoria.

## ADDED Requirements

### Requirement: Segredo

Cada organização SHALL guardar os segredos dela. Cada segredo SHALL ter:
- o nome, de 1 a 120 caracteres;
- o tipo;
- a classificação;
- o identificador, como o usuário da conta, de até 200 caracteres, opcional;
- o endereço onde ele é usado, como a URL de um painel, de até 500 caracteres, opcional;
- as notas, de até 2.000 caracteres, opcionais;
- a validade e a próxima rotação, datas opcionais;
- a pessoa e os ativos ligados (requisito "Vínculos com a pessoa e os ativos");
- o valor secreto, de 1 a 10.000 caracteres;
- a situação, ativo ou inativo.

Os tipos SHALL ser os do PMG: Usuário e senha, Conta administrativa, Banco de dados, Conta de serviço, Chave de API, Token, Chave SSH, Certificado, PIN, Wi-Fi e Outro, mais Chave de licença. As classificações SHALL ser as do PMG: Pessoal, Compartilhado, Administrativo, Privilegiado, Aplicação e Equipamento.

Só o valor secreto SHALL ser cifrado; o resto são dados do segredo, que a lista mostra a quem pode vê-lo. O segredo SHALL NOT ser excluído, só inativado. O segredo inativo SHALL NOT ser revelado nem copiado, e ele pode ser reativado.

#### Scenario: Segredo cadastrado
- **WHEN** quem administra o cofre cadastra "Switch do CPD", do tipo Conta administrativa, com o identificador `admin`, o endereço `https://10.0.5.2` e a senha
- **THEN** o segredo aparece na lista com o nome, o tipo e o identificador, e a senha só aparece ao ser revelada

#### Scenario: Valor vazio
- **WHEN** alguém grava um segredo sem o valor secreto
- **THEN** a gravação é recusada no campo do valor com "Informe o valor do segredo."

#### Scenario: Segredo inativo
- **WHEN** quem tem acesso a um segredo inativo pede para revelá-lo
- **THEN** o pedido é recusado com "O segredo está inativo.", e a recusa fica na auditoria

### Requirement: Valor cifrado em duas camadas

O valor de cada segredo SHALL ser cifrado com AES-256-GCM, com uma chave própria do segredo, gerada ao cadastrá-lo. Essa chave SHALL ser cifrada pela chave mestra do cofre, que vem da configuração do servidor e SHALL NOT ir ao banco, ao log nem ao backup.

O valor cifrado SHALL ficar preso ao segredo e à organização: copiado para outro segredo, ele SHALL NOT decifrar. Trocar o valor SHALL cifrá-lo de novo, com uma chave nova.

Sem a chave mestra na configuração, ou com ela fora do formato, a API SHALL recusar iniciar, dizendo o motivo, sem mostrar a chave (spec plataforma-base). O segredo cuja chave não decifra com a chave mestra configurada SHALL ter a revelação e a cópia recusadas com "O cofre não abre este segredo: confira a chave mestra na configuração do servidor.", e o caso SHALL ficar no log, sem nenhuma chave.

#### Scenario: Banco sem a chave
- **WHEN** alguém tem uma cópia do banco, sem a configuração do servidor
- **THEN** ele vê os nomes e os dados dos segredos, mas nenhum valor secreto

#### Scenario: Valor copiado entre segredos
- **WHEN** o valor cifrado de um segredo é copiado, no banco, para a linha de outro segredo
- **THEN** revelar o outro segredo falha, e o valor copiado não aparece

### Requirement: Acesso ao segredo

O acesso SHALL ser dado segredo a segredo, a contas, a grupos e a perfis. Uma conta SHALL alcançar um segredo quando:
- o segredo está liberado a ela;
- ou ela é membro de um grupo ativo ao qual o segredo está liberado;
- ou ela tem, numa atribuição ativa, direta ou pelo grupo, um perfil ativo ao qual o segredo está liberado, em qualquer escopo.

Quem tem `cofre.usar` SHALL ver só os segredos ativos que alcança. Quem tem `cofre.administrar` SHALL ver todos os segredos, ativos e inativos, e SHALL mudar os dados, o valor e o acesso de qualquer um; para revelar e copiar, ele SHALL alcançar o segredo como os outros. Quem cadastra um segredo SHALL ganhar o acesso a ele.

Mudar o acesso SHALL valer na hora: a conta que deixa de alcançar o segredo SHALL ter a revelação seguinte recusada, mesmo com o cofre liberado.

#### Scenario: Acesso por grupo
- **WHEN** o segredo "Switch do CPD" está liberado ao grupo "Suporte", e Bruno entra no grupo
- **THEN** Bruno passa a ver o segredo na lista e pode revelá-lo

#### Scenario: Acesso por perfil
- **WHEN** o segredo está liberado ao perfil "Técnico", e Carla recebe o "Técnico" em Jundiaí
- **THEN** Carla alcança o segredo, embora o perfil valha só em Jundiaí

#### Scenario: Quem administra sem a liberação
- **WHEN** Ana administra o cofre, e o segredo "Banco do ERP" não está liberado a ela
- **THEN** Ana vê o segredo na lista e muda o acesso dele, mas o pedido de revelá-lo é recusado com "O segredo não está liberado para você."

#### Scenario: Acesso tirado
- **WHEN** o grupo "Suporte" sai do acesso do segredo enquanto Bruno está com o cofre liberado
- **THEN** a revelação seguinte de Bruno é recusada, e o segredo some da lista dele

### Requirement: Verificação para usar o cofre

O cofre SHALL abrir só para a conta com a verificação em dois passos ativa. Sem ela, as rotas do cofre SHALL recusar o pedido com "Cadastre a verificação em dois passos em Ajustes › Conta para usar o cofre.", e a tela SHALL mostrar a mesma frase, com o caminho até o cadastro.

#### Scenario: Conta sem a verificação
- **WHEN** Bruno, com `cofre.usar` e sem a verificação em dois passos, abre o Cofre
- **THEN** a tela diz "Cadastre a verificação em dois passos em Ajustes › Conta para usar o cofre.", sem mostrar nenhum segredo

### Requirement: Liberação do cofre por 5 minutos

Revelar e copiar um segredo SHALL pedir, antes, a confirmação pelo código atual do app autenticador da conta, mesmo com a sessão aberta. O código certo SHALL liberar o cofre naquela sessão por 5 minutos, para revelar e copiar os segredos que a conta alcança. Os códigos de recuperação SHALL NOT liberar o cofre.

O código SHALL seguir as regras da verificação em dois passos: ele vale no intervalo atual e nos dois vizinhos, e nunca duas vezes. O código errado SHALL ser recusado com "Código incorreto. Confira se o relógio do celular está certo e tente de novo.", e a recusa SHALL entrar na auditoria. A liberação SHALL terminar depois dos 5 minutos, com a sessão encerrada ou com a verificação em dois passos desativada.

#### Scenario: Cofre liberado
- **WHEN** Bruno confirma o código do app às 14:27
- **THEN** ele revela e copia os segredos que alcança, sem um código novo, até as 14:32

#### Scenario: Liberação terminada
- **WHEN** Bruno pede para revelar um segredo às 14:33, depois da liberação das 14:27
- **THEN** o pedido é recusado com "A liberação do cofre terminou. Confirme o código do app de novo."

#### Scenario: Código de recuperação
- **WHEN** Bruno digita um código de recuperação para liberar o cofre
- **THEN** a liberação é recusada, e o código de recuperação continua sem uso

### Requirement: Revelar e copiar

Revelar SHALL mostrar o valor secreto na tela; copiar SHALL pô-lo na área de transferência sem mostrá-lo. Os dois SHALL exigir:
- o cofre liberado na sessão;
- o segredo ativo;
- a conta alcançando o segredo.

Cada revelação e cada cópia SHALL entrar na auditoria, com a conta, o segredo e a origem, sem o valor. A recusa, por qualquer desses motivos, SHALL entrar na auditoria também. A resposta com o valor SHALL NOT ficar guardada no navegador nem em proxies, e o valor SHALL NOT aparecer no log nem nas mensagens de erro.

#### Scenario: Revelação registrada
- **WHEN** Bruno revela a senha do "Switch do CPD"
- **THEN** a auditoria registra a revelação, com Bruno, o segredo e o IP, sem a senha

#### Scenario: Cópia sem mostrar
- **WHEN** Bruno copia a senha do "Switch do CPD"
- **THEN** a senha vai para a área de transferência sem aparecer na tela, e a auditoria registra a cópia

### Requirement: Vínculos com a pessoa e os ativos

O segredo SHALL poder apontar uma pessoa da organização, como a dona da conta, e os ativos em que ele é usado, como o switch de uma senha de administração. Os vínculos SHALL ser dados do segredo: eles SHALL NOT dar acesso a ele a ninguém.

Um vínculo novo SHALL apontar uma pessoa ativa e ativos ativos; o vínculo que já existe SHALL continuar com a pessoa ou o ativo inativado.

#### Scenario: Senha de administração do switch
- **WHEN** o segredo "Switch do CPD" aponta o switch PAT-00610
- **THEN** a ficha do PAT-00610 mostra o segredo a quem o alcança, e só o nome, o tipo e o identificador dele

#### Scenario: Vínculo não dá acesso
- **WHEN** Carla é a pessoa ligada ao segredo "E-mail da Carla", sem acesso a ele
- **THEN** Carla não vê o segredo no cofre

### Requirement: Validade e rotação

A lista e a ficha SHALL mostrar, em texto:
- "Vencido", quando a validade passou;
- "Rotação atrasada", quando a data da próxima rotação passou.

Trocar o valor do segredo SHALL NOT mudar as datas sozinho: quem troca o valor muda a próxima rotação, se quiser.

#### Scenario: Senha vencida
- **WHEN** a validade da "Senha do Wi-Fi visitantes" é 30/09/2026, e hoje é 12/10/2026
- **THEN** a lista mostra o segredo com "Vencido", em texto e com o ícone de atenção

### Requirement: Troca da chave mestra

A chave mestra SHALL poder ser trocada sem refazer os valores dos segredos. Durante a troca, a configuração SHALL ter a chave nova e a anterior, e a API SHALL ler o segredo com qualquer das duas, conforme a que cifrou a chave dele, e cifrar o que grava só com a nova.

O comando no servidor SHALL cifrar de novo, com a chave nova, as chaves dos segredos de todas as organizações que ainda estão na anterior. Ele SHALL:
- recusar começar sem a chave nova ou sem a anterior;
- dizer quantos segredos passaram para a chave nova em cada organização;
- dizer quais segredos não decifram com nenhuma das duas chaves, sem mudá-los;
- terminar sem mudar nada quando todos já estão na nova.

A troca SHALL entrar na auditoria de cada organização, com quantos segredos ela cifrou de novo, sem as chaves. Os valores dos segredos SHALL ficar os mesmos.

#### Scenario: Troca da chave
- **WHEN** quem opera o servidor troca a chave mestra, e a organização tem 40 segredos
- **THEN** o comando diz que os 40 passaram para a chave nova, e cada segredo revela o mesmo valor de antes

#### Scenario: Comando repetido
- **WHEN** o comando roda de novo, com todos os segredos já na chave nova
- **THEN** ele diz que não havia segredo na chave anterior e termina sem mudar nada
