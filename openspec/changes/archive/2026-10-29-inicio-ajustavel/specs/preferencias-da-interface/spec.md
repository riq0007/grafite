## ADDED Requirements

### Requirement: Blocos do Início nas preferências

A ordem e a visibilidade dos blocos do Início SHALL ficar num campo da tela inicial, trocado inteiro: a lista dos blocos, cada um com o id e se está à vista. O padrão de fábrica SHALL ser a lista vazia, em que vale a ordem do registro, com todos à vista.

A lista SHALL ter até 20 blocos, sem repetir o id, e cada id SHALL ter só letras minúsculas, números, ponto e hífen, com até 40 caracteres. O bloco inválido SHALL sair da lista, e os válidos SHALL continuar. O id de um bloco que nenhum módulo registra SHALL ser ignorado na tela.

#### Scenario: Bloco repetido
- **WHEN** a lista salva traz "ativos.suprimentos" duas vezes
- **THEN** vale só a primeira, e os outros blocos continuam

#### Scenario: Bloco de um módulo que saiu
- **WHEN** a lista salva traz um bloco que nenhum módulo registra mais
- **THEN** o Início o ignora e mostra os outros na ordem salva
