## MODIFIED Requirements

### Requirement: Blocos do Início nas preferências

A ordem e a visibilidade dos blocos do Início SHALL ficar num campo da tela inicial, trocado inteiro: a lista dos blocos, cada um com o id e se está à vista. O padrão de fábrica SHALL ser a lista vazia, em que vale a ordem do registro, com todos à vista.

A lista SHALL ter até 20 blocos, sem repetir o id, e cada id SHALL ter só letras minúsculas, números, ponto e hífen, com até 40 caracteres. O bloco inválido SHALL sair da lista, e os válidos SHALL continuar. O id de um bloco que nenhum módulo registra SHALL ser ignorado na tela.

Cada bloco da lista SHALL poder trazer também:
- a largura, inteira ou metade; sem ela, ou com outro valor, SHALL valer a inteira;
- as opções do bloco: até 12 opções, cada uma com a chave, de letras minúsculas, números e hífen, com até 30 caracteres, e o valor, que é verdadeiro ou falso, um número, um texto de até 80 caracteres ou uma lista de até 50 textos de até 80 caracteres.

A opção fora dessa forma SHALL sair, uma a uma, e o bloco e as outras opções SHALL continuar. O significado de cada opção é do bloco: a opção que o bloco não conhece SHALL ser ignorada na tela. A API SHALL recusar com 400 a gravação de uma lista com mais de 20 blocos ou de um bloco com mais de 12 opções.

#### Scenario: Bloco repetido
- **WHEN** a lista salva traz "ativos.suprimentos" duas vezes
- **THEN** vale só a primeira, e os outros blocos continuam

#### Scenario: Bloco de um módulo que saiu
- **WHEN** a lista salva traz um bloco que nenhum módulo registra mais
- **THEN** o Início o ignora e mostra os outros na ordem salva

#### Scenario: Opção fora da forma
- **WHEN** o bloco salvo traz a opção "tipos" com a lista de textos e a opção "extra" com um objeto dentro
- **THEN** a opção "extra" sai, e o bloco continua com a opção "tipos"

#### Scenario: Preferências de antes das opções
- **WHEN** a aplicação abre com a lista dos blocos salva só com o id e a visibilidade
- **THEN** os blocos aparecem na ordem salva, com a largura inteira e as opções de fábrica
