## Context

A entrada de hoje (F2a) confere a senha da conta local, com o bloqueio por tentativas e os dois passos. As permissões vêm dos perfis, dados a contas e grupos com o local (F2b). O Cofre (P6) já guarda os logins que o Grafite usa como sistema, como o login do Control iD, e os decifra mesmo com o módulo desligado.

O AD fala LDAP. O servidor de produção é Linux com Docker, então o cliente LDAP tem de ser JavaScript puro, sem depender do Windows nem de bibliotecas nativas.

## Goals / Non-Goals

**Goals:**
- configurar o diretório e os mapeamentos pela tela e testar a conexão antes de gravar;
- entrar com o usuário do AD, com a conta criada e sincronizada na entrada;
- liberar o acesso e gerenciar os usuários e os grupos do AD pelo Grafite;
- testes sem um AD de verdade.

**Non-Goals:**
- A sincronização agendada de todos os usuários. A conta é sincronizada na entrada; quem saiu do AD deixa de entrar.
- Criar e apagar usuários no AD.
- O SSO pelo Kerberos ou pelo SAML.
- Mais de um diretório por organização.

## Decisions

1. **O cliente é o `ldapts` 9.2.0, atrás da interface `ClienteDoDiretorio`.**
   - O adaptador do `ldapts` abre a conexão a cada operação, com 5 s para conectar e 10 s por pedido, e fecha no fim.
   - A API recebe a fábrica (`conectarDiretorio`). Os testes de integração trocam a fábrica por um AD em memória, com usuários, grupos, o `memberOf`, o `userAccountControl` e as senhas.
   - O adaptador tem os testes de unidade dele, com o `ldapts` simulado: os filtros, as mudanças e a leitura das entradas.
2. **A configuração fica na tabela `diretorios`, uma linha por organização.**
   - A conta de serviço é um `segredoId` do Cofre, com o mesmo filtro dos logins do Control iD.
   - A senha é decifrada só na hora da conexão, como na coleta, e nunca sai da API.
   - Os mapeamentos ficam em `mapeamentos_do_diretorio`, com o DN guardado como veio e o DN normalizado (minúsculo e sem os espaços depois das vírgulas) único por organização.
3. **A entrada pelo diretório em `POST /sessao`.**
   - A API lê a conta pelo usuário. A conta local segue o caminho de hoje.
   - Para a conta do diretório, ou sem conta, e com o diretório ligado, a API faz isto antes da transação:
     - busca a pessoa com a conta de serviço, pelo filtro das pessoas e pelo atributo do usuário com o valor escapado;
     - confere a senha entrando com o DN dela;
     - lê o `displayName`, o `mail`, o `userAccountControl` e o `memberOf`.
   - Na transação, a recusa conta para o bloqueio. A primeira entrada cria a pessoa e a conta:
     - a `origem` é `diretorio`;
     - a senha local é um hash de bytes aleatórios, que nunca confere;
     - não há senha temporária.
   - Depois disso, a API sincroniza o nome, o e-mail e os grupos mapeados.
   - A conta do diretório nunca entra pela senha local, nem com o diretório desligado.
4. **A gerência.**
   - As buscas usam o filtro das pessoas, ou `(objectClass=group)`, com o termo escapado, e trazem até 50 resultados.
   - Incluir e tirar mudam o `member` do grupo.
   - Ativar e desativar trocam o bit 2 (`0x2`) do `userAccountControl` lido antes.
   - A senha vai no `unicodePwd`, entre aspas e em UTF-16LE, só pelo `ldaps://`.
   - Cada ação grava a auditoria com os DNs, sem a senha, e a resposta traz o usuário ou o grupo como ficou.
5. **A tela fica na Administração, na seção Diretório, com três abas.**
   - A Configuração tem o formulário, o teste e os mapeamentos.
   - Os Usuários têm a busca, a tabela e as ações num menu por linha.
   - Os Grupos têm a busca, os membros, o "Incluir membro" e o "Tirar".
   - A busca do grupo do AD, no mapeamento e no "Liberar acesso", usa a mesma rota de grupos.
6. **A permissão é `diretorio.administrar`, da área Acessos, na organização.** O evento `diretorio.mudou` sai da configuração e dos mapeamentos. As ações no AD não gravam evento: o dado é do AD, e a tela relê a busca depois de cada ação.

## Risks / Trade-offs

- **[O AD fora do ar impede a entrada das contas do diretório]**
  - A conta local continua entrando, e o runbook manda manter uma de emergência.
  - A recusa diz "O AD não respondeu. Tente de novo ou use uma conta local."
- **[A conta de serviço com permissão de mudar o AD]**
  - O Grafite só muda o `member`, o `userAccountControl` e o `unicodePwd`, e cada mudança fica na auditoria.
  - A conta de serviço pode ter só a delegação dessas partes.
- **[O LDAP sem TLS expõe as senhas na rede]**
  - A tela recomenda o `ldaps://`.
  - A redefinição da senha exige o `ldaps://`.
  - A conferência do certificado vem ligada.
