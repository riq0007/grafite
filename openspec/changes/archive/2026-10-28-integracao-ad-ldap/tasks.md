## 1. Domínio

- [x] 1.1 As regras do diretório: a conferência da configuração, o filtro escapado, o DN normalizado, o `userAccountControl`, a senha no formato do AD e os grupos do Grafite pelos mapeamentos; a permissão `diretorio.administrar`, as ações da auditoria e o evento, com os testes

## 2. Banco

- [x] 2.1 As tabelas `diretorios` e `mapeamentos_do_diretorio`, com o RLS, e a coluna `contas.origem`

## 3. API

- [x] 3.1 O adaptador do `ldapts` atrás do `ClienteDoDiretorio`, com os testes de unidade, e o AD em memória dos testes de integração
- [x] 3.2 A configuração, o teste da conexão e os mapeamentos em `/diretorio`, com os testes de integração e o contrato
- [x] 3.3 A entrada pelo diretório em `POST /sessao`, com a conta criada e sincronizada, com os testes de integração
- [x] 3.4 A gerência dos usuários e dos grupos do AD, com os testes de integração e o contrato

## 4. Web

- [x] 4.1 A seção Diretório na Administração: a Configuração, com o teste e os mapeamentos, com os testes
- [x] 4.2 As abas Usuários e Grupos, com as ações, com os testes

## 5. Fechamento

- [x] 5.1 A verificação, a spec mestre, o mapa, o runbook e o arquivamento
