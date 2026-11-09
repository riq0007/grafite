## ADDED Requirements

### Requirement: Tela de padrões

A tela de padrões SHALL mostrar os padrões da organização nas mesmas seções de preferências dos Ajustes: Aparência, Dock, Cursor, Notificações, Tabelas, Idioma e região e Acessibilidade. Cada seção SHALL ficar numa aba com endereço próprio. A tela SHALL dizer que os padrões valem para quem não mudou o ajuste nos próprios Ajustes.

As mudanças SHALL ficar pendentes até "Salvar padrões", que grava todas de uma vez:
- "Descartar" volta ao que está gravado;
- enquanto há mudança pendente, a tela diz quantos ajustes mudaram;
- sair da tela com mudanças pendentes pede confirmação;
- cada seção oferece "Restaurar padrões de fábrica", que também fica pendente até salvar.

As prévias das seções, como a tabela e o aviso de exemplo, SHALL mostrar os padrões em edição. A casca de quem edita SHALL NOT mudar antes de salvar.

#### Scenario: Salvar o tema padrão
- **WHEN** quem edita a organização escolhe o tema Névoa na aba Aparência e escolhe "Salvar padrões"
- **THEN** um aviso diz "Padrões salvos.", e as contas que nunca mudaram o tema passam ao Névoa em até 5 s

#### Scenario: Sair com mudanças pendentes
- **WHEN** quem edita a organização muda o dock para a esquerda e escolhe outra seção da Administração sem salvar
- **THEN** a tela pergunta se descarta as mudanças, e nada é gravado sem "Salvar padrões"

#### Scenario: Casca de quem edita
- **WHEN** quem edita a organização escolhe o destaque laranja e ainda não salvou
- **THEN** a prévia da aba mostra o laranja, e a casca de quem edita continua com o destaque dela

### Requirement: Tela de tarefas com falha

A tela de tarefas SHALL listar as tarefas com falha da organização, da mais recente para a mais antiga. Cada tarefa SHALL mostrar:
- o nome dela;
- quando falhou;
- o número de tentativas;
- a mensagem do erro;
- "Tentar de novo".

A lista SHALL ter "Carregar mais" ao fim e se atualizar sozinha quando uma tarefa entra ou sai dela. Sem tarefas com falha, a tela SHALL dizer "Nenhuma tarefa com falha.".

#### Scenario: Nenhuma tarefa com falha
- **WHEN** quem administra as tarefas abre a tela, e nenhuma tarefa da organização falhou
- **THEN** a tela diz "Nenhuma tarefa com falha."

#### Scenario: Tentar de novo pela tela
- **WHEN** quem administra as tarefas escolhe "Tentar de novo" na manutenção diária com falha
- **THEN** a tarefa sai da lista, e um aviso diz "Tarefa de volta na fila."

## MODIFIED Requirements

### Requirement: Administração no dock

A casca SHALL ter o módulo Administração, entre os módulos e Ajustes, visível só para quem tem ao menos uma destas permissões: `pessoas.ver`, `acessos.ver`, `locais.editar`, `organizacao.editar`, `auditoria.ver` ou `tarefas.administrar`. O menu em árvore do dock SHALL ter, nesta ordem, Pessoas, Perfis, Grupos, Locais, Padrões, Auditoria e Tarefas, cada um só para quem tem a permissão da tela:
- **Pessoas:** `pessoas.ver`;
- **Perfis e Grupos:** `acessos.ver`;
- **Locais:** `locais.editar`;
- **Padrões:** `organizacao.editar`;
- **Auditoria:** `auditoria.ver`;
- **Tarefas:** `tarefas.administrar`.

No celular, a Administração SHALL ficar em "Mais".

#### Scenario: Conta sem permissão de administração
- **WHEN** uma conta sem nenhuma dessas permissões abre a casca
- **THEN** o dock não mostra Administração, e a busca não oferece as telas dela

#### Scenario: Conta só com a auditoria
- **WHEN** uma conta só com `auditoria.ver` abre o menu de Administração
- **THEN** o menu mostra só Auditoria

#### Scenario: Conta só com os padrões
- **WHEN** uma conta só com `organizacao.editar` abre o menu de Administração
- **THEN** o menu mostra só Padrões

### Requirement: Tela de pessoas

A tela de pessoas SHALL ter:
- a busca e os filtros de situação, conta e local à vista;
- os filtros ativos à vista, com "Limpar filtros";
- uma tabela com Nome, Matrícula, Local de trabalho, Conta (o usuário e a situação) e Situação;
- no início de cada linha, a foto da pessoa ou as iniciais, como a miniatura das tabelas, que segue o ajuste Miniaturas;
- "Carregar mais" ao fim da lista e o número de pessoas encontradas.

"Nova pessoa" SHALL aparecer para quem edita pessoas. Clicar na linha ou Enter SHALL abrir a ficha, e a barra de espaço SHALL abrir a prévia.

A tela SHALL tratar os estados:
- carregando;
- vazio, com "Limpar filtros" quando há filtro ou "Nova pessoa" quando não há;
- erro, com "Tentar de novo";
- sem conexão.

#### Scenario: Nenhuma pessoa no filtro
- **WHEN** a busca não encontra ninguém
- **THEN** a tela diz "Nenhuma pessoa encontrada." e oferece "Limpar filtros"

#### Scenario: Foto na lista
- **WHEN** João tem foto e Maria não, e a lista mostra os dois
- **THEN** a linha de João começa pela foto dele, e a de Maria pelas iniciais "M"

### Requirement: Ficha da pessoa

A ficha SHALL ter, no título, a foto da pessoa ou as iniciais, o nome e a situação. Ela SHALL ter as abas:
- **Dados:** o formulário da pessoa, com a foto, e "Trocar foto" e "Remover foto" para quem edita a pessoa;
- **Acesso:** a conta, os perfis, os grupos e o que a conta pode fazer;
- **Histórico:** para quem tem `auditoria.ver`, os registros mais recentes da pessoa e "Ver na auditoria".

A ficha SHALL oferecer só as ações que a API permite para aquela pessoa. As ações destrutivas (remover a foto, inativar, encerrar sessões, redefinir, anonimizar) SHALL ficar separadas das outras e pedir confirmação. A anonimização SHALL pedir que se digite o nome da pessoa.

#### Scenario: Ficha sem permissão de editar
- **WHEN** uma conta só com `pessoas.ver` abre a ficha de João
- **THEN** os dados e a foto aparecem sem edição, e nenhuma ação de alteração é oferecida

#### Scenario: Trocar a foto pela ficha
- **WHEN** quem edita pessoas escolhe "Trocar foto" na ficha de João e envia uma imagem
- **THEN** o título e a aba Dados mostram a foto nova, e um aviso diz "Foto trocada."

#### Scenario: Confirmar a anonimização
- **WHEN** quem anonimiza escolhe "Anonimizar" na ficha de João, inativo
- **THEN** a confirmação explica o que é apagado e o que fica e só libera "Anonimizar" depois que o nome "João da Silva" é digitado
