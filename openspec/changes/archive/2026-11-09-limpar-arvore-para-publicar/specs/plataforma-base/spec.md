## ADDED Requirements

### Requirement: Árvore sem termos privados

Os arquivos versionados SHALL NOT conter os termos da lista privada de quem mantém o repositório, como o domínio da empresa, os nomes das máquinas e o nome de quem desenvolve. A lista SHALL ficar fora do repositório: no CI, num secret; na máquina de quem desenvolve, numa pasta que o Git ignora.

A conferência SHALL rodar no CI e antes de cada commit, nos arquivos de texto e nos binários, sem diferença de caixa nem de acento. Ela SHALL dizer só o arquivo e o número do termo na lista, e SHALL NOT escrever o termo nem a linha.

Sem a lista, a conferência SHALL dizer que não conferiu. No push da branch principal, a falta da lista SHALL reprovar o CI.

#### Scenario: Commit com um termo da lista
- **WHEN** quem desenvolve tenta fazer commit de um teste que tem um termo da lista
- **THEN** o commit é recusado, e a mensagem diz o arquivo e o número do termo, sem o termo

#### Scenario: Termo achado no CI
- **WHEN** o CI acha um termo da lista num PR
- **THEN** o job reprova, e o log mostra o arquivo e o número do termo, nunca o termo

#### Scenario: PR de um fork
- **WHEN** um PR de um fork roda o CI sem acesso ao secret
- **THEN** o passo diz que não conferiu, e a conferência roda de novo no push da branch principal

#### Scenario: Termo com outra caixa e sem acento
- **WHEN** um arquivo traz um termo da lista em maiúsculas e sem o acento
- **THEN** a conferência acha o termo do mesmo jeito
