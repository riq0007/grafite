## ADDED Requirements

### Requirement: Módulos do dock nas preferências

A ordem dos módulos do dock e os módulos tirados dele SHALL ficar num campo do dock, trocado inteiro: a lista dos módulos, cada um com o id e se está no dock. O padrão de fábrica SHALL ser a lista vazia, em que vale a ordem de fábrica, com todos no dock. A organização SHALL poder definir a lista nos padrões dela, e a conta, a própria.

A lista SHALL ter até 40 módulos, sem repetir o id, e cada id SHALL ter só letras minúsculas, números, ponto e hífen, com até 40 caracteres. O item inválido e o item dos Ajustes SHALL sair da lista, e os válidos SHALL continuar. O id de um módulo que não existe, que a conta não vê ou que a organização desligou SHALL ser ignorado na tela, sem sair da lista guardada.

#### Scenario: Módulo repetido na lista
- **WHEN** a lista salva traz "operacao" duas vezes
- **THEN** vale só a primeira, e os outros módulos continuam na ordem salva

#### Scenario: Ajustes na lista
- **WHEN** um pedido grava a lista com os Ajustes em primeiro, fora do dock
- **THEN** o item dos Ajustes sai da lista, e os Ajustes continuam no fim do dock

#### Scenario: Preferências de antes desta lista
- **WHEN** a aplicação abre com preferências salvas sem a lista dos módulos
- **THEN** o dock usa a ordem de fábrica, com todos os módulos nele, e a posição e o tamanho salvos continuam valendo
