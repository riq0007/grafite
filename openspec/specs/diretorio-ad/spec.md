# diretorio-ad Specification

## Purpose

Ligar o Grafite ao Active Directory da organização: entrar com o usuário e a senha do AD, liberar o acesso pelos grupos do AD e gerenciar os usuários e os grupos do AD pelo Grafite, sem abrir o console do AD, num servidor Linux ou Windows.

## Requirements

### Requirement: Configuração do diretório

A organização SHALL ter no máximo um diretório. Ele SHALL guardar:
- o servidor, um endereço `ldap://` ou `ldaps://`;
- a base DN;
- a conta de serviço, um login ativo do Cofre do tipo Usuário e senha, Conta administrativa ou Conta de serviço, com o usuário preenchido (o DN ou o UPN da conta);
- o atributo do usuário, `sAMAccountName` de fábrica;
- o filtro das pessoas, `(&(objectCategory=person)(objectClass=user))` de fábrica;
- se o certificado do servidor é conferido, sim de fábrica;
- o certificado da AC do servidor, opcional, em PEM: a AC da empresa que emite o certificado do LDAPS;
- se ele está ligado.

A gravação SHALL recusar:
- o servidor fora do formato, com "Informe o servidor como ldap://servidor ou ldaps://servidor.";
- a base DN vazia, com "Informe a base DN, como DC=empresa,DC=local.";
- a conta de serviço fora do Cofre, com "Escolha a conta de serviço no Cofre: um login ativo, com o usuário.";
- o certificado da AC que não é um certificado em PEM, com "Cole o certificado da AC em PEM, que começa com -----BEGIN CERTIFICATE-----.";
- o certificado da AC com mais de 20.000 caracteres, com "Use até 20.000 caracteres no certificado da AC.".

Com o módulo Cofre desligado, a conta escolhida SHALL continuar valendo, e a escolha de outra SHALL esperar o módulo. A senha da conta de serviço SHALL ficar só no Cofre. Ela SHALL NOT aparecer na resposta, na auditoria nem no log. O certificado da AC não é segredo. A auditoria SHALL registrar só se ele foi informado.

#### Scenario: Diretório configurado
- **WHEN** quem administra grava o servidor `ldaps://dc01.empresa.local`, a base `DC=empresa,DC=local` e o login "Conta do Grafite no AD" do Cofre
- **THEN** o diretório fica gravado, e a auditoria registra a configuração sem a senha

#### Scenario: Conta de serviço do Cofre
- **WHEN** a TI cadastra a conta do AD no Cofre com o tipo "Conta de serviço" e o usuário preenchido
- **THEN** ela aparece na escolha da conta de serviço do diretório, e um segredo de outro tipo, como uma chave de API, não aparece

#### Scenario: Certificado que não é da AC
- **WHEN** quem administra cola no certificado da AC um texto que não é um certificado em PEM
- **THEN** a gravação é recusada com "Cole o certificado da AC em PEM, que começa com -----BEGIN CERTIFICATE-----.", e nada muda

### Requirement: Teste da conexão

"Testar a conexão" SHALL entrar no servidor com a conta de serviço e contar os usuários da base pelo filtro das pessoas, até 1.000. O resultado SHALL vir em texto:
- "Conectado: 238 usuários na base.", ou "Conectado: mais de 1.000 usuários na base.";
- ou o motivo da falha: "O servidor não respondeu.", "A conta de serviço foi recusada." ou "O certificado do servidor não é confiável.".

O teste SHALL usar a configuração da tela, mesmo antes de gravada. Com o certificado da AC informado, o teste, a entrada e a gerência SHALL confiar nessa AC, além das públicas.

#### Scenario: Conta de serviço recusada
- **WHEN** a senha da conta de serviço no Cofre está errada e quem administra testa a conexão
- **THEN** a tela mostra "A conta de serviço foi recusada."

#### Scenario: Certificado emitido pela AC da empresa
- **WHEN** o LDAPS do controlador de domínio usa um certificado da AC da empresa, a conferência do certificado está ligada, e quem administra cola a raiz dessa AC no certificado da AC e testa a conexão
- **THEN** a tela mostra "Conectado: 238 usuários na base.", e, sem o certificado da AC, a mesma configuração mostra "O certificado do servidor não é confiável."

### Requirement: Mapeamento de grupos

Cada mapeamento SHALL ligar um grupo do AD, pelo DN, a um grupo ativo do Grafite. Um grupo do AD SHALL ter no máximo um mapeamento. A comparação dos DNs SHALL ignorar maiúsculas e minúsculas.

O mapeamento SHALL NOT dar perfis por conta própria: quem é dos grupos mapeados entra no grupo do Grafite, e o grupo dá os perfis nos locais das atribuições dele.

#### Scenario: Grupo mapeado
- **WHEN** quem administra liga o grupo do AD "TI-Suporte" ao grupo "Técnicos" do Grafite
- **THEN** quem é do TI-Suporte passa a entrar no grupo Técnicos na próxima entrada, com os perfis dele

### Requirement: Entrada pelo diretório

Com o diretório ligado, a entrada SHALL seguir estas regras:
- A conta local SHALL continuar entrando com a senha do Grafite.
- A conta do diretório, e o usuário que não tem conta, SHALL entrar pelo AD. A API busca a pessoa pelo atributo do usuário com a conta de serviço e confere a senha entrando no AD com o DN dela.
- A senha SHALL ir só para o AD e SHALL NOT ser guardada.
- A pessoa SHALL ser de pelo menos um grupo mapeado. Fora disso, a entrada SHALL ser recusada com "Seu usuário do AD não tem acesso ao Grafite. Peça a liberação a quem administra os acessos.".
- A conta desativada no AD SHALL ser recusada como credencial inválida.

A primeira entrada SHALL criar a pessoa e a conta do diretório, sem a troca de senha. Cada entrada SHALL atualizar:
- o nome e o e-mail da pessoa, pelo `displayName` e pelo `mail`;
- a participação nos grupos do Grafite que são alvo de mapeamento: a conta entra nos que o AD dá e sai dos que o AD tirou. A participação nos outros grupos SHALL ficar como está.

A recusa SHALL contar para o bloqueio por tentativas, como a da entrada local. A verificação em dois passos SHALL valer igual.

Com o diretório desligado, a conta do diretório SHALL NOT entrar. Com o AD fora do ar, a entrada pelo diretório SHALL ser recusada com "O AD não respondeu. Tente de novo ou use uma conta local.", sem contar para o bloqueio. Nos dois casos, a conta local SHALL entrar.

#### Scenario: Primeira entrada pelo AD
- **WHEN** a técnica "mariana.alves", do grupo TI-Suporte, entra pela primeira vez com a senha do AD
- **THEN** a conta dela é criada, ela entra no grupo Técnicos e a sessão começa

#### Scenario: Usuário sem grupo mapeado
- **WHEN** um usuário do AD que não é de nenhum grupo mapeado entra com a senha certa
- **THEN** a entrada é recusada com o motivo, e nenhuma conta é criada

#### Scenario: Saiu do grupo no AD
- **WHEN** o TI tira a técnica do grupo TI-Suporte no AD e ela entra de novo, ainda num outro grupo mapeado
- **THEN** a conta dela sai do grupo Técnicos, e os outros grupos dela ficam

### Requirement: Gerência dos usuários do AD

Quem administra o diretório SHALL buscar os usuários do AD pelo nome ou pelo usuário, até 50. Cada usuário SHALL vir com:
- o nome, o usuário e o e-mail;
- a situação no AD em texto: "Ativa" ou "Desativada";
- os grupos do AD, com o grupo do Grafite de cada mapeado.

Sobre cada usuário, quem administra SHALL poder:
- liberar o acesso, incluindo o usuário num grupo mapeado;
- incluí-lo e tirá-lo de um grupo;
- ativar e desativar a conta no AD, pelo `userAccountControl`;
- redefinir a senha.

A redefinição da senha SHALL exigir o `ldaps://`. Pelo `ldap://`, a API SHALL recusar antes de pedir ao AD, com "A redefinição da senha exige o ldaps://.". A senha nova SHALL NOT ser guardada nem ir para a auditoria.

#### Scenario: Acesso liberado pelo Grafite
- **WHEN** quem administra escolhe "Liberar acesso" no usuário "joao.lima" e o grupo TI-Suporte
- **THEN** o AD inclui o João no grupo, a auditoria registra a inclusão, e o João pode entrar no Grafite

#### Scenario: Conta desativada no AD
- **WHEN** quem administra desativa a conta do "joao.lima"
- **THEN** a situação dele passa a "Desativada", e a próxima entrada dele é recusada

### Requirement: Gerência dos grupos do AD

Quem administra o diretório SHALL buscar os grupos do AD pelo nome, até 50. Cada grupo SHALL vir com o número de membros e, mapeado, com o grupo do Grafite. Os membros de um grupo SHALL aparecer com o nome, o usuário e a situação. A tela SHALL incluir e tirar membros pelo grupo também.

#### Scenario: Membro incluído pelo grupo
- **WHEN** quem administra inclui "ana.souza" no grupo TI-Suporte, pela lista dos membros
- **THEN** a lista mostra a Ana, e a auditoria registra a inclusão

### Requirement: Permissão e auditoria do diretório

O catálogo SHALL ter `diretorio.administrar`, "Administrar o diretório (AD)", na área "Acessos", na organização. O perfil Administrador SHALL ter a permissão.

A auditoria SHALL registrar:
- a configuração do diretório;
- o mapeamento criado e o removido;
- a conta criada pelo diretório;
- o membro incluído e o retirado no AD;
- a conta ativada e a desativada no AD;
- a senha redefinida no AD.

Cada registro SHALL trazer o DN que mudou e SHALL NOT trazer senha. A configuração e os mapeamentos SHALL publicar o evento `diretorio.mudou` a quem tem `diretorio.administrar`.

#### Scenario: Inclusão auditada
- **WHEN** quem administra inclui um usuário num grupo do AD
- **THEN** a auditoria registra "Membro incluído no AD", com o DN do usuário e o do grupo

### Requirement: Tela do diretório

A Administração SHALL ter a seção "Diretório", com a permissão `diretorio.administrar` e três abas.

**Configuração.** A aba SHALL ter:
- o guia da primeira configuração;
- o formulário do diretório;
- "Testar a conexão", com o resultado em texto;
- os mapeamentos, com o grupo do AD escolhido pela busca, o grupo do Grafite e o "Remover".

O guia SHALL ter sete passos. Cada passo SHALL dizer o que preencher e onde achar o valor no AD, com os comandos do Windows para copiar:
1. a conta de serviço no AD e as permissões delegadas para gerenciar pelo Grafite;
2. a conta de serviço no Cofre;
3. o servidor, pelos controladores de domínio e pela porta do LDAPS;
4. a base DN, pelo nome do domínio;
5. o certificado da AC, exportado da raiz da AC da empresa;
6. o atributo do usuário e o filtro das pessoas;
7. o teste da conexão, os mapeamentos e a entrada pelo AD.

O guia SHALL aparecer aberto enquanto o diretório não foi gravado. Depois disso, ele SHALL ficar fechado, e "Mostrar o guia" SHALL abri-lo.

**Usuários.** A aba SHALL ter a busca e a tabela dos usuários na largura toda, com a situação em texto e as ações de cada um.

**Grupos.** A aba SHALL ter a busca dos grupos e os membros do grupo escolhido, com "Incluir membro" e "Tirar".

Sem o diretório gravado, as abas Usuários e Grupos SHALL dizer que o diretório ainda não foi configurado, com o caminho até a Configuração. Uma falha do AD SHALL aparecer na tela com o motivo em texto.

#### Scenario: Diretório não configurado
- **WHEN** quem administra abre a aba Usuários antes de gravar o diretório
- **THEN** a tela diz "O diretório ainda não foi configurado." e oferece "Configurar o diretório"

#### Scenario: Primeira configuração guiada
- **WHEN** quem administra abre a aba Configuração de uma organização sem o diretório
- **THEN** o guia aparece aberto, com os sete passos, cada um com o que preencher e onde achar no AD, como o `nltest /dclist:` para os controladores de domínio e o `(Get-ADDomain).DistinguishedName` para a base DN

#### Scenario: Guia depois da configuração
- **WHEN** quem administra abre a aba Configuração com o diretório já gravado
- **THEN** o guia aparece fechado, e "Mostrar o guia" o abre
