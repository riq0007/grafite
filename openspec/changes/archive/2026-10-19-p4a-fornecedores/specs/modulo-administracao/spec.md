## ADDED Requirements

### Requirement: Tela de fornecedores

A seção Fornecedores SHALL aparecer para quem tem `fornecedores.ver`. Ela SHALL listar os fornecedores ativos pelo nome, com o CNPJ, o contato, o e-mail e o telefone, na tabela base, com a busca pelo nome e pelo CNPJ e o filtro da situação, que mostra os inativos. A lista SHALL ser paginada no servidor, sem limite fixo.

Para quem tem `fornecedores.editar`, a seção SHALL oferecer "Novo fornecedor" e, na ficha, a edição, "Inativar fornecedor", com a confirmação "O fornecedor continua nos registros que já apontam para ele, mas não pode mais ser escolhido.", e "Reativar fornecedor". Quem só vê SHALL ver a ficha sem as ações.

Sem nenhum fornecedor, a seção SHALL dizer "Nenhum fornecedor ainda." e oferecer "Novo fornecedor" a quem pode cadastrar. Os retornos SHALL ser "Fornecedor cadastrado.", "Fornecedor salvo.", "Fornecedor inativado." e "Fornecedor reativado.".

#### Scenario: Primeiro fornecedor
- **WHEN** quem edita os fornecedores abre a seção numa organização sem fornecedores
- **THEN** a seção diz "Nenhum fornecedor ainda." e oferece "Novo fornecedor"

#### Scenario: Busca pelo CNPJ
- **WHEN** alguém busca "12.345.678" na seção
- **THEN** a lista mostra o fornecedor com o CNPJ que começa por esses algarismos

#### Scenario: Quem só vê
- **WHEN** uma conta com só `fornecedores.ver` abre a ficha da "HP Brasil"
- **THEN** a ficha mostra os dados, sem "Salvar", "Inativar fornecedor" nem "Novo fornecedor"

## MODIFIED Requirements

### Requirement: Administração no dock

A casca SHALL ter o módulo Administração, entre os módulos e Ajustes, visível só para quem tem ao menos uma destas permissões: `pessoas.ver`, `acessos.ver`, `locais.editar`, `fornecedores.ver`, `organizacao.editar`, `coletores.administrar`, `auditoria.ver`, `tarefas.administrar` ou, na organização que opera o servidor, `backup.administrar`. O menu em árvore do dock SHALL ter, nesta ordem, Pessoas, Perfis, Grupos, Locais, Fornecedores, Padrões, Módulos, Coletores, Auditoria, Tarefas e Backup, cada um só para quem tem a permissão da tela:
- **Pessoas:** `pessoas.ver`;
- **Perfis e Grupos:** `acessos.ver`;
- **Locais:** `locais.editar`;
- **Fornecedores:** `fornecedores.ver`;
- **Padrões e Módulos:** `organizacao.editar`;
- **Coletores:** `coletores.administrar`;
- **Auditoria:** `auditoria.ver`;
- **Tarefas:** `tarefas.administrar`;
- **Backup:** `backup.administrar`, e só na organização que opera o servidor.

No celular, a Administração SHALL ficar em "Mais".

#### Scenario: Conta sem permissão de administração
- **WHEN** uma conta sem nenhuma dessas permissões abre a casca
- **THEN** o dock não mostra Administração, e a busca não oferece as telas dela

#### Scenario: Conta só com a auditoria
- **WHEN** uma conta só com `auditoria.ver` abre o menu de Administração
- **THEN** o menu mostra só Auditoria

#### Scenario: Conta só com os padrões
- **WHEN** uma conta só com `organizacao.editar` abre o menu de Administração
- **THEN** o menu mostra só Padrões e Módulos

#### Scenario: Organização que não opera o servidor
- **WHEN** a administradora de uma organização cliente, com o perfil Administrador, abre o menu de Administração
- **THEN** o menu não mostra Backup, mesmo com `backup.administrar` no perfil

#### Scenario: Conta só com os fornecedores
- **WHEN** uma conta só com `fornecedores.ver` abre o menu de Administração
- **THEN** o menu mostra só Fornecedores
