# modulo-administracao Specification

## Purpose

Reunir na casca o módulo Administração, com as telas de pessoas, perfis, grupos, locais e auditoria, cada uma para quem tem a permissão dela, a busca de pessoas e o retorno de cada operação.

## Requirements

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

### Requirement: Seções da Administração

A Administração SHALL mostrar a lista das seções que a conta pode usar, ao lado do conteúdo da seção escolhida, como os Ajustes. Cada seção SHALL ter endereço próprio. Abrir a Administração SHALL levar à primeira seção que a conta pode usar.

Abrir o endereço de uma seção sem a permissão dela SHALL mostrar "Você não tem acesso a <seção>.", com a quem pedir acesso. No celular, a lista e a seção SHALL aparecer uma de cada vez.

#### Scenario: Endereço sem permissão
- **WHEN** uma conta sem `acessos.ver` abre o endereço de Perfis
- **THEN** a tela diz "Você não tem acesso a Perfis." e "Peça acesso a Ana Souza.", sem dado nenhum dos perfis

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

### Requirement: Telas de perfis e grupos

As telas de perfis e de grupos SHALL listar os registros com a situação, abrir a ficha de cada um e oferecer "Novo perfil" e "Novo grupo" a quem administra os acessos.
- **Ficha do perfil:**
  - as permissões, agrupadas por área, cada uma com a descrição;
  - as que valem só para a organização inteira marcadas, e as incluídas por outra indicadas;
  - "Exige verificação em dois passos";
  - quem tem o perfil.
- **Ficha do grupo:** os membros e os perfis do grupo, com o escopo.
- **Administrador:** a ficha dele SHALL dizer que o perfil é protegido e não oferecer alteração.

#### Scenario: Ficha do Administrador
- **WHEN** quem administra os acessos abre o perfil Administrador
- **THEN** a ficha diz "Perfil protegido: tem todas as permissões e não muda." e não oferece alteração das permissões

### Requirement: Tela de locais

A tela de locais SHALL mostrar a árvore, com o ícone do tipo, o nome e o tipo de cada local, e os inativos marcados por texto. Ela SHALL:
- expandir e recolher pelo mouse e pelo teclado;
- oferecer, a quem pode alterar o local escolhido, "Novo local" (na raiz ou dentro do escolhido), "Renomear", "Mover para…", "Inativar" e "Reativar";
- esconder os locais inativos até que se ligue "Mostrar inativos".

#### Scenario: Mover pelo teclado
- **WHEN** o usuário escolhe "Sala 12" com as setas, abre "Mover para…" e escolhe "2º andar"
- **THEN** a sala aparece dentro do "2º andar", e o foco continua nela

### Requirement: Tela da auditoria

A tela da auditoria SHALL mostrar:
- os filtros: período, quem fez, ação e código de rastreio, com o alvo quando vem de uma ficha;
- os filtros ativos à vista;
- o total;
- a tabela da lista, com "Carregar mais";
- o detalhe de cada registro na prévia, pela barra de espaço ou pelo clique na linha.

O período SHALL oferecer "Últimas 24 horas", "Últimos 7 dias", "Últimos 30 dias", "Tudo" e "Personalizado", com as duas datas.

#### Scenario: Detalhe na prévia
- **WHEN** o usuário escolhe uma linha e pressiona a barra de espaço
- **THEN** a prévia mostra o detalhe do registro, e as setas trocam de registro

### Requirement: Pessoas na busca

Para quem tem `pessoas.ver`, a busca global SHALL ter o grupo "Pessoas", com as pessoas que a conta pode ver, pelo nome, pela matrícula ou pelo usuário. Escolher uma SHALL abrir a ficha dela. As ações "Nova pessoa", "Novo perfil", "Novo grupo" e "Novo local" SHALL entrar na busca para quem pode fazê-las.

#### Scenario: Buscar uma pessoa
- **WHEN** quem vê pessoas digita "004512" na busca
- **THEN** o grupo "Pessoas" mostra "João da Silva", e Enter abre a ficha dele

### Requirement: Retorno das operações

Cada operação da Administração SHALL confirmar o resultado com um aviso, como "Pessoa cadastrada." ou "Perfil atribuído.". Uma recusa SHALL mostrar o motivo da API junto ao campo ou à ação, e a tela SHALL voltar ao estado anterior.

#### Scenario: Recusa junto ao campo
- **WHEN** o cadastro de uma pessoa é recusado pela matrícula repetida
- **THEN** o formulário continua preenchido, e o campo da matrícula mostra "Esta matrícula já é de outra pessoa."

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

A tela de tarefas SHALL mostrar primeiro as rotinas: o que o sistema faz sozinho, num horário. Cada rotina SHALL mostrar:
- o nome dela, como "Manutenção diária", e uma frase do que ela faz;
- quando roda, como "Todo dia às 03:30" ou "A cada 5 minutos";
- a última execução, com o momento e a situação em texto, "Concluída", "Em andamento" ou "Falhou", ou "Ainda não rodou";
- a próxima execução.

Na organização que opera o servidor, as rotinas SHALL trazer também as do servidor que estão agendadas, como o backup.

Embaixo, a tela SHALL listar as tarefas com falha da organização, da mais recente para a mais antiga. Na organização que opera o servidor, a lista SHALL trazer também as tarefas do servidor com falha, como o backup, o teste de restauração e a vigilância do certificado. Cada tarefa SHALL mostrar:
- o nome dela;
- quando falhou;
- o número de tentativas;
- a mensagem do erro;
- "Tentar de novo".

A lista SHALL ter "Carregar mais" ao fim e se atualizar sozinha quando uma tarefa entra ou sai dela. Sem tarefas com falha, a tela SHALL dizer "Nenhuma tarefa com falha." e explicar que a rotina ou a tarefa que falha em todas as tentativas aparece ali, com o erro e "Tentar de novo".

#### Scenario: Nenhuma tarefa com falha
- **WHEN** quem administra as tarefas abre a tela, e nenhuma tarefa da organização falhou
- **THEN** a tela diz "Nenhuma tarefa com falha." e explica o que aparece ali

#### Scenario: Tentar de novo pela tela
- **WHEN** quem administra as tarefas escolhe "Tentar de novo" na manutenção diária com falha
- **THEN** a tarefa sai da lista, e um aviso diz "Tarefa de volta na fila."

#### Scenario: Tarefa do servidor
- **WHEN** o backup falha em todas as tentativas
- **THEN** a falha aparece nas tarefas da organização que opera o servidor, e não nas das outras organizações

#### Scenario: Rotinas
- **WHEN** quem administra as tarefas abre a tela
- **THEN** ela vê a "Manutenção diária", com "Todo dia às 03:30", a última execução e a próxima

### Requirement: Tela de backup

A tela de backup SHALL mostrar:
- os backups guardados, do mais novo para o mais antigo, cada um com quando foi feito, o tamanho, os destinos e o resultado;
- o horário do próximo backup;
- o último teste de restauração, com quando rodou, o backup testado e o resultado.

Ela SHALL oferecer:
- "Fazer backup agora", que põe um backup na fila e o mostra na lista quando termina;
- a mudança do horário do backup e do dia do teste de restauração, dentro dos limites da configuração do servidor (spec backup).

A tela SHALL se atualizar sozinha quando um backup ou um teste de restauração termina. Ela SHALL NOT mostrar os destinos que a configuração não tem, nem oferecer a restauração, que é só pelo comando de operação.

Numa organização que não opera o servidor, a tela SHALL NOT existir: o endereço dela leva à primeira seção da Administração.

#### Scenario: Backup pedido pela tela
- **WHEN** quem administra o backup escolhe "Fazer backup agora"
- **THEN** um aviso diz "Backup na fila.", e o backup aparece na lista ao terminar, com o tamanho e os destinos

#### Scenario: Horário mudado
- **WHEN** quem administra o backup muda o horário de 02:00 para 03:30, dentro da janela da configuração
- **THEN** a tela mostra o próximo backup às 03:30, e um aviso diz "Horário do backup salvo."

#### Scenario: Teste de restauração com falha
- **WHEN** o último teste de restauração falhou
- **THEN** a tela mostra a falha em texto, com o motivo e o backup testado

### Requirement: Tela de módulos

A tela de módulos SHALL listar os módulos opcionais (spec modulos-da-organizacao), cada um com o nome, a descrição e um interruptor que diz, em texto, se ele está ligado ou desligado.

Desligar SHALL pedir confirmação: "Desligar o módulo Ativos?", dizendo que ele some do dock e da busca de todos e que os dados ficam guardados. A recusa da API SHALL aparecer junto do módulo, e o interruptor SHALL voltar ao que estava.

#### Scenario: Confirmação ao desligar
- **WHEN** quem edita a organização desliga o Ativos e escolhe "Cancelar" na confirmação
- **THEN** o Ativos continua ligado, e nada é gravado

### Requirement: Tela de coletores

A seção Coletores SHALL aparecer para quem tem `coletores.administrar`. Ela SHALL listar os coletores ativos pelo nome, com:
- as faixas de rede;
- a situação, em texto;
- o último contato com a idade, ou "Sem contato ainda";
- a versão informada no último contato.

Um coletor ativo sem contato há mais de 10 minutos SHALL aparecer com "Sem contato há 25 min", na situação de atenção, com o ícone e o texto. Os inativos SHALL aparecer pelo filtro de situação. A idade do último contato SHALL ficar no máximo 1 minuto atrás.

A seção SHALL oferecer:
- "Novo coletor", com o nome e as faixas, uma por linha;
- na ficha do coletor, a edição do nome e das faixas, "Trocar o token", a inativação e a reativação.

O token, no cadastro e na troca, SHALL aparecer num diálogo com "Copiar" e o aviso "Copie o token agora: ele não aparece de novo.", e SHALL NOT voltar a aparecer depois que o diálogo fecha. A troca do token SHALL pedir confirmação, com "O token atual para de valer na hora, e o coletor que o usa para de coletar até receber o novo.". A inativação SHALL pedir confirmação, com "O coletor para de coletar, e os ativos dele passam ao coletor que alcançar o IP deles.".

Sem nenhum coletor, a seção SHALL dizer "Nenhum coletor ainda." e oferecer "Novo coletor".

Os retornos SHALL ser "Coletor cadastrado.", "Coletor salvo.", "Token trocado.", "Coletor inativado." e "Coletor reativado.".

#### Scenario: Primeiro coletor
- **WHEN** quem administra os coletores abre a seção numa organização sem coletores
- **THEN** a seção diz "Nenhum coletor ainda." e oferece "Novo coletor"

#### Scenario: Token mostrado uma vez
- **WHEN** quem administra os coletores cadastra o "Coletor de Jundiaí" e fecha o diálogo do token
- **THEN** a ficha do coletor não mostra mais o token, só "Trocar o token"

#### Scenario: Coletor parado
- **WHEN** o "Coletor de Jundiaí" não fala com a API há 25 minutos
- **THEN** a lista mostra "Sem contato há 25 min", com o ícone de atenção

#### Scenario: Sem a permissão
- **WHEN** uma conta sem `coletores.administrar` abre o endereço da seção Coletores
- **THEN** a tela diz "Você não tem acesso a Coletores.", com a quem pedir acesso

### Requirement: Atribuição de perfil pela tela

"Atribuir perfil", na ficha da pessoa e na do grupo, SHALL abrir uma gaveta, com a ficha ainda à vista, contendo:
- os perfis ativos que quem atribui pode dar, em rádios, cada um com a descrição e quantas permissões tem;
- o escopo, "Organização inteira" ou "Num local", num controle segmentado, com "Organização inteira" já escolhido;
- com "Num local", a escolha do local em árvore, com o local de trabalho da pessoa sugerido no topo, quando ela tem um;
- o bloco "Resultado", recalculado a cada mudança, antes de confirmar.

O "Resultado" SHALL dizer em texto:
- o perfil e o escopo que a conta ou o grupo passa a ter;
- as permissões do perfil que não valem num local, quando o escopo é um local;
- a atribuição igual que já está em vigor, direta ou por grupo, e então "Atribuir perfil" fica desabilitado com o motivo.

Trocar o perfil SHALL manter o escopo e o local escolhidos.

#### Scenario: Resultado num local
- **WHEN** quem administra os acessos escolhe o "Técnico" para Bruno, com o escopo "Num local" e o local "Jundiaí"
- **THEN** o "Resultado" diz "Bruno passa a ter Técnico em Jundiaí e no que está dentro." e lista as permissões do "Técnico" que não valem num local

#### Scenario: Atribuição que já existe
- **WHEN** Bruno já tem o "Técnico" em "Jundiaí", e alguém escolhe de novo o "Técnico" em "Jundiaí"
- **THEN** o "Resultado" diz "Bruno já tem Técnico em Jundiaí.", e "Atribuir perfil" fica desabilitado

#### Scenario: Trocar o perfil sem perder o local
- **WHEN** alguém escolhe "Num local", o local "Jundiaí" e depois troca o perfil
- **THEN** o escopo e o local continuam escolhidos, e o "Resultado" passa ao perfil novo

### Requirement: Ativos da pessoa na ficha

A aba Dados da ficha da pessoa SHALL mostrar "Ativos sob responsabilidade", com quantos ativos ativos ela tem, no escopo de quem vê, e "Ver na tabela", que abre a tabela dos ativos com a origem da pessoa (spec cadastro-de-ativos). A linha SHALL aparecer só com o módulo Ativos ligado e para quem vê ativos em algum ramo, e SHALL sumir sem recarregar quando o módulo for desligado.

#### Scenario: Ativos de Ana
- **WHEN** quem vê pessoas e ativos abre a ficha de Ana Souza, responsável por 3 ativos
- **THEN** a aba Dados mostra "Ativos sob responsabilidade: 3" e "Ver na tabela"

#### Scenario: Ativos desligado
- **WHEN** o módulo Ativos é desligado com a ficha de Ana aberta
- **THEN** a linha dos ativos sob responsabilidade some da ficha

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
