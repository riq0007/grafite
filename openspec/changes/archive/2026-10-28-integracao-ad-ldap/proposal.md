## Why

As contas do Grafite são locais: cada técnico tem um usuário e uma senha próprios, e o TI cria e encerra as contas à mão. A empresa já tem o Active Directory, onde as pessoas e os grupos existem. O TI quer três coisas:
- que as pessoas entrem com o usuário e a senha do AD;
- liberar o acesso ao Grafite pelos grupos do AD;
- gerenciar os usuários e os grupos do AD pelo próprio Grafite, sem abrir o console do AD.

O servidor de produção é Linux com Docker, então a integração não pode depender do Windows. A change é o subprojeto S4 da spec mestre e se apoia no F2a (contas e acesso) e no F2b (permissões e grupos).

## What Changes

- **Diretório da organização, configurado na Administração**, com:
  - o servidor (`ldap://` ou `ldaps://`) e a base DN;
  - a conta de serviço, escolhida no Cofre como um login;
  - o atributo do usuário e o filtro das pessoas;
  - a conferência do certificado;
  - ligar e desligar;
  - "Testar a conexão", que diz quantos usuários a base tem ou o motivo da falha.
- **Mapeamentos:** cada grupo do AD aponta para um grupo do Grafite, que já dá os perfis nos locais dele.
- **Entrada pelo diretório.** Com o diretório ligado:
  - quem não tem conta local entra com o usuário e a senha do AD;
  - a primeira entrada cria a pessoa e a conta;
  - cada entrada atualiza o nome, o e-mail e a participação nos grupos mapeados;
  - sem nenhum grupo mapeado, a entrada é recusada com o motivo;
  - a conta local continua entrando como hoje, e serve de acesso de emergência.
- **Gerência do AD pela tela.** Quem administra pode:
  - buscar usuários e grupos;
  - liberar o acesso, isto é, incluir o usuário num grupo mapeado;
  - incluir e tirar usuários dos grupos;
  - ativar e desativar a conta no AD;
  - redefinir a senha, só pelo `ldaps://`.
- **Permissão e auditoria:**
  - a permissão nova `diretorio.administrar`;
  - cada mudança vai para a auditoria, sem nenhuma senha;
  - o evento `diretorio.mudou` avisa a tela.
- **Biblioteca:** o cliente LDAP é o `ldapts` 9.2.0, em JavaScript puro, que roda igual no Linux e no Windows.

## Capabilities

### New Capabilities

- `diretorio-ad`: o diretório da organização, com:
  - a configuração com a conta de serviço do Cofre e o teste da conexão;
  - os mapeamentos de grupos;
  - a entrada pelo AD, com a conta criada e sincronizada;
  - a gerência dos usuários e dos grupos do AD;
  - a permissão, a auditoria e a tela na Administração.

### Modified Capabilities

Nenhuma. A entrada pelo diretório é um requisito da capacidade nova. A entrada local e as regras dela (bloqueio, dois passos, sessão) ficam como estão.

## Impact

- **Domínio:**
  - as regras do diretório: o filtro escapado, a configuração, os mapeamentos, o `userAccountControl` e a senha no formato do AD;
  - a permissão, as ações da auditoria e o evento.
- **Banco:**
  - as tabelas `diretorios` e `mapeamentos_do_diretorio`, com o RLS;
  - a coluna `contas.origem` (`local` ou `diretorio`).
- **API:**
  - o adaptador do `ldapts`, atrás de uma interface que os testes trocam por um AD em memória;
  - as rotas de `/diretorio`;
  - a entrada em `POST /sessao`.
- **Web:** a seção Diretório na Administração, com as abas Configuração, Usuários e Grupos.
- **Dependência nova:** `ldapts` 9.2.0, na API.
