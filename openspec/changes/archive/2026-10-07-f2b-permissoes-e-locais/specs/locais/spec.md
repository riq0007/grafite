## Purpose

Guardar os lugares da organização numa árvore única, a referência que pessoas, perfis e os módulos da fase 2 usam para dizer onde algo está e até onde vale uma permissão.

## ADDED Requirements

### Requirement: Árvore de locais

A organização SHALL guardar os seus locais numa árvore. Cada local SHALL ter:
- um nome, de 1 a 80 caracteres;
- um tipo: Unidade, Prédio, Andar, Setor, Sala ou Outro;
- o local que o contém, ou nenhum, para um local na raiz;
- a situação: ativo ou inativo.

Qualquer tipo SHALL poder ficar dentro de qualquer outro. A árvore SHALL ter no máximo 8 níveis.

#### Scenario: Local na raiz
- **WHEN** quem pode alterar os locais da organização inteira cadastra "Jundiaí", do tipo Unidade, sem local acima
- **THEN** "Jundiaí" aparece na raiz da árvore

#### Scenario: Local dentro de outro
- **WHEN** "Expedição", do tipo Setor, é cadastrado dentro de "Jundiaí"
- **THEN** "Expedição" aparece abaixo de "Jundiaí", com o caminho "Jundiaí › Expedição"

#### Scenario: Nível demais
- **WHEN** se tenta cadastrar um local dentro de um local que já está no 8º nível
- **THEN** o cadastro é recusado com "A árvore de locais tem no máximo 8 níveis."

### Requirement: Nome único entre irmãos

Dois locais dentro do mesmo local, ou dois locais na raiz, SHALL NOT ter o mesmo nome. A comparação SHALL ignorar maiúsculas, acentos e os espaços das pontas. Locais em lugares diferentes da árvore SHALL poder ter o mesmo nome.

#### Scenario: Nome repetido no mesmo lugar
- **WHEN** "Jundiaí" já tem "Expedição" e se tenta cadastrar "expedicao" dentro de "Jundiaí"
- **THEN** o cadastro é recusado com "Já existe um local com este nome aqui."

#### Scenario: O mesmo nome em lugares diferentes
- **WHEN** "Sala 12" é cadastrada no "1º andar" e no "2º andar"
- **THEN** as duas salas existem, cada uma com o próprio caminho

### Requirement: Mover sem ciclo

Mover um local SHALL levar junto tudo o que está dentro dele. Um local SHALL NOT ser movido para dentro de si mesmo nem para dentro de um local que ele contém. Mover SHALL respeitar os 8 níveis e o nome único entre irmãos.

#### Scenario: Mover com os filhos
- **WHEN** o "1º andar", com a "Sala 12" dentro, é movido do prédio "Administrativo" para o prédio "Fábrica"
- **THEN** o caminho da sala passa a ser "Jundiaí › Fábrica › 1º andar › Sala 12"

#### Scenario: Mover para dentro do próprio ramo
- **WHEN** se tenta mover "Jundiaí" para dentro de "Expedição", que fica dentro de "Jundiaí"
- **THEN** a mudança é recusada com "Um local não pode ficar dentro dele mesmo.", e a árvore não muda

### Requirement: Inativação e reativação de locais

Um local SHALL ser inativado só quando nada ativo depende dele: nenhum local ativo dentro dele, nenhuma pessoa ativa com o local de trabalho nele e nenhuma atribuição de perfil em vigor com escopo nele. A recusa SHALL dizer o que impede.

Um local inativo SHALL NOT ser oferecido para escolha nova. As referências que já existem SHALL continuar, com o local marcado como inativo. Reativar um local SHALL exigir que o local acima dele esteja ativo.

#### Scenario: Inativar com pessoas no local
- **WHEN** se tenta inativar "Expedição", local de trabalho de 3 pessoas ativas
- **THEN** a inativação é recusada com "Há 3 pessoas ativas com o local de trabalho aqui. Mude o local delas antes."

#### Scenario: Local inativo na escolha
- **WHEN** "Doca 3" está inativa e alguém escolhe o local de trabalho de uma pessoa
- **THEN** "Doca 3" não aparece entre as opções

#### Scenario: Reativar dentro de um local inativo
- **WHEN** se tenta reativar "Sala 12", que fica dentro do "1º andar" inativo
- **THEN** a reativação é recusada com "Reative antes o local onde este fica."

### Requirement: Quem lê e quem altera os locais

Toda sessão ativa SHALL poder ler a árvore inteira, com os locais inativos marcados, porque ela é a referência para escolher um local.

Cadastrar, renomear, mudar o tipo, mover, inativar e reativar SHALL exigir a permissão de alterar locais no ramo do local:
- cadastrar exige a permissão no local de cima;
- cadastrar na raiz exige a permissão para a organização inteira;
- mover exige a permissão no local e no destino.

#### Scenario: Alterar dentro do próprio ramo
- **WHEN** quem pode alterar os locais só em "Jundiaí" cadastra "Sala 14" dentro de "Jundiaí › Administrativo"
- **THEN** a sala é cadastrada

#### Scenario: Alterar fora do ramo
- **WHEN** a mesma conta tenta cadastrar um local na raiz ou mover um local de "Jundiaí" para outra unidade
- **THEN** a API recusa por falta de permissão, e a árvore não muda

#### Scenario: Ler sem permissão de alterar
- **WHEN** uma conta sem nenhuma permissão de locais escolhe um local num formulário
- **THEN** a árvore inteira está disponível para a escolha
