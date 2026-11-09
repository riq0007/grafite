## Purpose

Reunir num módulo da casca as telas de quem administra a organização: pessoas e contas, perfis, grupos, locais e auditoria, cada uma visível só a quem pode usá-la.

## ADDED Requirements

### Requirement: Administração no dock

A casca SHALL ter o módulo Administração, entre os módulos e Ajustes, visível só para quem tem ao menos uma destas permissões: `pessoas.ver`, `acessos.ver`, `locais.editar` ou `auditoria.ver`. O menu em árvore do dock SHALL ter, nesta ordem, Pessoas, Perfis, Grupos, Locais e Auditoria, cada um só para quem tem a permissão da tela:
- **Pessoas:** `pessoas.ver`;
- **Perfis e Grupos:** `acessos.ver`;
- **Locais:** `locais.editar`;
- **Auditoria:** `auditoria.ver`.

No celular, a Administração SHALL ficar em "Mais".

#### Scenario: Conta sem permissão de administração
- **WHEN** uma conta sem nenhuma dessas permissões abre a casca
- **THEN** o dock não mostra Administração, e a busca não oferece as telas dela

#### Scenario: Conta só com a auditoria
- **WHEN** uma conta só com `auditoria.ver` abre o menu de Administração
- **THEN** o menu mostra só Auditoria

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

### Requirement: Ficha da pessoa

A ficha SHALL ter o nome e a situação da pessoa no título e as abas:
- **Dados:** o formulário da pessoa;
- **Acesso:** a conta, os perfis, os grupos e o que a conta pode fazer;
- **Histórico:** para quem tem `auditoria.ver`, os registros mais recentes da pessoa e "Ver na auditoria".

A ficha SHALL oferecer só as ações que a API permite para aquela pessoa. As ações destrutivas (inativar, encerrar sessões, redefinir, anonimizar) SHALL ficar separadas das outras e pedir confirmação. A anonimização SHALL pedir que se digite o nome da pessoa.

#### Scenario: Ficha sem permissão de editar
- **WHEN** uma conta só com `pessoas.ver` abre a ficha de João
- **THEN** os dados aparecem sem edição, e nenhuma ação de alteração é oferecida

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
