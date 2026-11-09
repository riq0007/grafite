## ADDED Requirements

### Requirement: Foto da pessoa

Uma pessoa SHALL poder ter uma foto, que segue as regras de envio de imagens. Podem trocar e remover a foto:
- quem edita pessoas, no escopo do local de trabalho da pessoa, ativa ou inativa;
- a própria conta, na foto da própria pessoa, sem permissão, pela seção Conta dos Ajustes.

A foto SHALL ser vista por quem vê a pessoa e pela conta da própria pessoa. A foto de uma pessoa anonimizada SHALL NOT ser trocada, e a recusa diz "Esta pessoa foi anonimizada e não muda mais.".

#### Scenario: Trocar a foto na ficha
- **WHEN** quem edita pessoas envia uma foto para João
- **THEN** a ficha e a lista de pessoas passam a mostrar a foto de João, e a foto anterior, se havia, deixa de ser entregue

#### Scenario: Foto fora do escopo
- **WHEN** quem edita pessoas só em "Jundiaí" tenta trocar a foto de uma pessoa de outra unidade
- **THEN** a API recusa por falta de permissão, e a foto não muda

#### Scenario: A própria foto sem permissão
- **WHEN** uma conta sem nenhuma permissão troca a foto nos Ajustes
- **THEN** a foto da pessoa dela muda, e o menu do usuário mostra a foto nova

#### Scenario: Remover a foto
- **WHEN** quem edita pessoas remove a foto de João
- **THEN** a ficha e a lista mostram as iniciais de João, e a foto deixa de ser entregue

## MODIFIED Requirements

### Requirement: Anonimização da pessoa

Quem anonimiza pessoas SHALL poder anonimizar uma pessoa inativa, sem volta. A anonimização SHALL:
- trocar o nome por "Pessoa anonimizada" e um código de 4 caracteres, e apagar o e-mail, a matrícula, o local de trabalho e o telefone;
- apagar a foto, que deixa de ser entregue na hora e sai do armazenamento na manutenção diária seguinte;
- deixar a conta, se houver, sem usuário e sem senha, com o usuário livre para outra pessoa;
- apagar a verificação em dois passos e os códigos de recuperação;
- apagar o IP e o dispositivo das sessões, e as tentativas de entrada do usuário;
- encerrar as atribuições e as participações em grupos.

A referência à pessoa SHALL continuar nos registros que a citam, com o nome anonimizado. Uma pessoa ativa, a própria pessoa e o último administrador SHALL NOT ser anonimizados. A pessoa anonimizada SHALL NOT ser editada nem reativada.

#### Scenario: Anonimizar
- **WHEN** João, inativo e com foto, é anonimizado
- **THEN** o cadastro dele mostra só "Pessoa anonimizada 7F3K", sem foto, e a situação "Anonimizada", e o usuário "joao.silva" pode ser dado a outra pessoa

#### Scenario: Foto depois da anonimização
- **WHEN** a manutenção diária roda depois da anonimização de João
- **THEN** a foto que João tinha não existe mais no armazenamento

#### Scenario: Pessoa ativa
- **WHEN** se tenta anonimizar uma pessoa ativa
- **THEN** a anonimização é recusada com "Inative a pessoa antes de anonimizá-la."
