## MODIFIED Requirements

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
