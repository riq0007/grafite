## Purpose

Permitir que quem administra cadastre as pessoas da organização e cuide das contas delas pela tela, da criação à anonimização, sem depender do comando no servidor.

## ADDED Requirements

### Requirement: Cadastro de pessoas

Quem edita pessoas SHALL poder cadastrar e editar uma pessoa com:
- **nome:** obrigatório, até 120 caracteres;
- **e-mail:** opcional, num formato válido;
- **matrícula:** opcional, até 32 caracteres e única na organização;
- **local de trabalho:** opcional, um local ativo;
- **telefone ou ramal:** opcional, até 32 caracteres, só com números, espaços, parênteses, "+" e hífen.

A permissão SHALL valer no local de trabalho da pessoa. Ao mudar esse local, ela SHALL valer no antigo e no novo.

#### Scenario: Cadastrar uma pessoa
- **WHEN** quem edita pessoas cadastra "João da Silva", com a matrícula "004512" e o local "Jundiaí › Expedição"
- **THEN** a pessoa passa a existir, ativa e sem conta

#### Scenario: Matrícula repetida
- **WHEN** se tenta cadastrar outra pessoa com a matrícula "004512"
- **THEN** o cadastro é recusado com "Esta matrícula já é de outra pessoa.", no campo da matrícula

#### Scenario: Levar a pessoa para fora do escopo
- **WHEN** quem edita pessoas só em "Jundiaí" tenta mudar o local de trabalho de João para outra unidade
- **THEN** a API recusa por falta de permissão, e João continua em "Jundiaí › Expedição"

### Requirement: Lista de pessoas

A lista de pessoas SHALL mostrar só as pessoas que a conta pode ver, em ordem alfabética e paginada sem limite fixo. A busca SHALL procurar no nome, na matrícula, no e-mail e no usuário, sem acento e com as palavras em qualquer ordem. Os filtros SHALL ser:
- situação: ativas (o padrão), inativas ou todas;
- conta: com conta ou sem conta;
- local de trabalho: o local escolhido e tudo dentro dele.

#### Scenario: Busca sem acento
- **WHEN** a busca é "silva joao"
- **THEN** a lista mostra "João da Silva"

#### Scenario: Filtro por local
- **WHEN** o filtro de local é "Jundiaí"
- **THEN** a lista mostra as pessoas com o local de trabalho em "Jundiaí" ou dentro dele

### Requirement: Inativação e reativação da pessoa

Quem edita pessoas SHALL poder inativar e reativar uma pessoa. Inativar a pessoa SHALL inativar também a conta dela e encerrar todas as sessões. Reativar a pessoa SHALL NOT reativar a conta. A conta SHALL NOT inativar a própria pessoa.

#### Scenario: Inativar quem tem conta
- **WHEN** João, com uma sessão aberta, é inativado
- **THEN** a conta dele fica inativa, a sessão termina, e a entrada dele é recusada

#### Scenario: Reativar
- **WHEN** João é reativado
- **THEN** ele volta a aparecer entre as pessoas ativas, e a conta dele continua inativa até ser reativada

### Requirement: Conta criada pela administração

Quem administra contas SHALL poder criar a conta de uma pessoa ativa que ainda não tem conta, informando o usuário, pela regra do usuário, e se a conta exige a verificação em dois passos. A senha SHALL ser temporária, gerada ao acaso e mostrada uma vez só, na tela de quem criou, com a troca obrigatória na primeira entrada.

#### Scenario: Criar a conta
- **WHEN** quem administra contas cria a conta "joao.silva" para João
- **THEN** a tela mostra a senha temporária uma vez, com "Copiar", e avisa que ela não aparece de novo

#### Scenario: Primeira entrada
- **WHEN** João entra com a senha temporária
- **THEN** a tela pede uma senha nova antes de abrir a casca

### Requirement: Cuidados com a conta pela administração

Quem administra contas SHALL poder, na conta de outra pessoa:
- **redefinir a senha:** uma senha temporária nova, mostrada uma vez, com todas as sessões encerradas, a contagem de tentativas zerada e, se pedido, a verificação em dois passos removida;
- **remover a verificação em dois passos:** quando a pessoa perde o aparelho, com todas as sessões encerradas;
- **desbloquear a entrada:** zerar a contagem de tentativas do usuário;
- **inativar a conta:** todas as sessões terminam, e as atribuições continuam registradas;
- **reativar a conta:** só com a pessoa ativa;
- **ver as sessões abertas:** com o dispositivo, o IP e os horários;
- **encerrar todas as sessões;**
- **mudar o usuário e a exigência dos dois passos.**

A própria conta SHALL ser cuidada na seção Conta dos Ajustes, e não por aqui.

#### Scenario: Redefinir a senha
- **WHEN** quem administra contas redefine a senha de João, que tem duas sessões abertas
- **THEN** as duas sessões terminam, a tela mostra a senha temporária nova uma vez, e a senha antiga para de funcionar

#### Scenario: Inativar a própria conta
- **WHEN** quem administra contas tenta inativar a própria conta pela administração
- **THEN** a ação é recusada com "Use outra conta para inativar a sua."

#### Scenario: Entrada bloqueada
- **WHEN** a entrada de João está bloqueada e quem administra contas escolhe "Desbloquear a entrada"
- **THEN** João pode tentar entrar de novo na hora

### Requirement: Acesso de uma conta

A ficha da pessoa SHALL mostrar, para quem vê os acessos:
- os perfis da conta, diretos e por grupo, com o escopo de cada um;
- os grupos de que ela participa;
- o que a conta pode fazer: cada permissão efetiva, com o escopo e de onde ela vem.

#### Scenario: Por que a conta pode
- **WHEN** quem vê os acessos abre o acesso de Bruno, que tem o "Técnico" pelo grupo "Suporte"
- **THEN** a tela mostra "Ver pessoas e contas — Jundiaí", vindo do "Técnico", pelo grupo "Suporte"

### Requirement: Anonimização da pessoa

Quem anonimiza pessoas SHALL poder anonimizar uma pessoa inativa, sem volta. A anonimização SHALL:
- trocar o nome por "Pessoa anonimizada" e um código de 4 caracteres, e apagar o e-mail, a matrícula, o local de trabalho e o telefone;
- deixar a conta, se houver, sem usuário e sem senha, com o usuário livre para outra pessoa;
- apagar a verificação em dois passos e os códigos de recuperação;
- apagar o IP e o dispositivo das sessões, e as tentativas de entrada do usuário;
- encerrar as atribuições e as participações em grupos.

A referência à pessoa SHALL continuar nos registros que a citam, com o nome anonimizado. Uma pessoa ativa, a própria pessoa e o último administrador SHALL NOT ser anonimizados. A pessoa anonimizada SHALL NOT ser editada nem reativada.

#### Scenario: Anonimizar
- **WHEN** João, inativo, é anonimizado
- **THEN** o cadastro dele mostra só "Pessoa anonimizada 7F3K" e a situação "Anonimizada", e o usuário "joao.silva" pode ser dado a outra pessoa

#### Scenario: Pessoa ativa
- **WHEN** se tenta anonimizar uma pessoa ativa
- **THEN** a anonimização é recusada com "Inative a pessoa antes de anonimizá-la."
