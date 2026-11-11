# administracao-de-pessoas Specification

## Purpose

Cadastrar pessoas e criar as contas delas pela administração, com a lista, a inativação e a reativação, os cuidados com a conta, o acesso de cada conta e a anonimização, sem depender do comando no servidor.

## Requirements

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
- os grupos, numa tabela com todos os grupos ativos da organização: o nome, os perfis que cada um dá, com o escopo, e a situação da conta nele, "Participa desde 03/10/2026" ou "Não participa";
- o que a conta pode fazer: cada permissão efetiva, com o escopo e de onde ela vem.

Para quem administra os acessos, cada linha da tabela dos grupos SHALL oferecer "Incluir" ou "Retirar". Antes de confirmar, a tela SHALL dizer em texto o efeito: os perfis que a conta passa a ter ou deixa de ter, e os que ela já tem por outro caminho. Retirar SHALL pedir confirmação. Com mais de 10 grupos, a tabela SHALL ter um filtro pelo nome, que diz quantos de quantos ela mostra.

#### Scenario: Por que a conta pode
- **WHEN** quem vê os acessos abre o acesso de Bruno, que tem o "Técnico" pelo grupo "Suporte"
- **THEN** a tela mostra "Ver pessoas e contas — Jundiaí", vindo do "Técnico", pelo grupo "Suporte"

#### Scenario: Grupos à vista
- **WHEN** quem administra os acessos abre o acesso de Bruno, que participa do "Suporte"
- **THEN** a tabela mostra o "Suporte" com "Participa desde" e "Retirar", e os outros grupos ativos com "Não participa" e "Incluir", cada um com os perfis que dá

#### Scenario: Efeito antes de incluir
- **WHEN** quem administra os acessos escolhe "Incluir" no grupo "Almoxarifado", que dá o "Operador" em "Jundiaí › Almoxarifado"
- **THEN** a tela diz "Bruno passa a ter Operador em Jundiaí › Almoxarifado." antes de confirmar

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

### Requirement: Nomes das pessoas para a escolha

Toda sessão ativa da organização SHALL poder buscar as pessoas ativas pelo nome, para escolher o responsável de um ativo, o valor de um campo de pessoa ou quem pediu uma solicitação (spec solicitacoes). A resposta SHALL trazer só o identificador e o nome de até 20 pessoas, em ordem alfabética, sem o e-mail, a matrícula, o telefone, o local, a foto nem a conta, e o total das pessoas que casam.

Sem o texto da busca, a resposta SHALL trazer as primeiras pessoas em ordem alfabética. Com um local pedido, as pessoas que trabalham nele ou dentro dele SHALL vir primeiro, marcadas como do mesmo local, sem dizer qual é o local de cada uma.

#### Scenario: Responsável escolhido por quem não vê a Administração
- **WHEN** Bruno, com `ativos.editar` e sem `pessoas.ver`, digita "joao" na escolha do responsável
- **THEN** a escolha mostra "João da Silva", sem os outros dados dele

#### Scenario: Escolha sem digitar
- **WHEN** alguém abre a escolha do responsável de um ativo de "Jundiaí › Expedição" sem digitar
- **THEN** a escolha mostra primeiro as pessoas que trabalham em "Jundiaí › Expedição", marcadas como do mesmo local, e depois as outras, com o total

#### Scenario: Quem pediu escolhido por quem atende
- **WHEN** Carla, com `solicitacoes.atender` e sem `pessoas.ver`, digita "joana" em Pedida por
- **THEN** a escolha mostra "Joana Prado", sem os outros dados dela

### Requirement: Nova pessoa numa aba

A Nova pessoa SHALL abrir numa aba da janela quando um campo a pede (spec estrutura-da-casca), com o mesmo formulário, as mesmas validações e o mesmo retorno da tela das pessoas, "Pessoa cadastrada.". Na aba, salvar SHALL devolver a pessoa criada ao campo que a pediu, em vez de abrir a ficha dela. A Nova pessoa SHALL exigir `pessoas.editar`.

A tela das pessoas SHALL continuar como antes: a Nova pessoa aberta pela lista SHALL abrir a ficha da pessoa criada.

No formulário da pessoa, quando o campo pode ser editado, o Local de trabalho SHALL mostrar embaixo "Cadastrar novo local" (spec componentes-base) para quem tem `locais.editar`, e o local criado SHALL vir escolhido nele.

#### Scenario: Pessoa criada pelo campo
- **WHEN** quem edita pessoas abre a Nova pessoa pelo campo Responsável e salva "Ana Souza"
- **THEN** a aba fecha, e o campo Responsável vem com "Ana Souza"

#### Scenario: Local de trabalho criado pela pessoa
- **WHEN** quem edita pessoas e locais cadastra uma pessoa, escolhe "Cadastrar novo local" embaixo do Local de trabalho e salva "Portaria"
- **THEN** a aba "Novo local" fecha, e a pessoa volta com "Portaria" no Local de trabalho

#### Scenario: Matrícula repetida na aba
- **WHEN** alguém tenta salvar, na aba "Nova pessoa", uma pessoa com a matrícula de outra
- **THEN** a aba continua aberta, com a recusa no campo da matrícula

### Requirement: Aparelhos confiáveis pela administração

Quem administra contas SHALL poder, na conta de outra pessoa:
- **ver os aparelhos confiáveis:** com o dispositivo, o IP, desde quando é confiável, o último uso e até quando vale;
- **esquecer todos os aparelhos:** as entradas seguintes da conta pedem o código em qualquer navegador, e as sessões abertas continuam;
- **mudar o prazo da confiança da conta:** "Seguir o perfil ou a organização", o de fábrica, um número de 1 a 90 dias, ou "Pedir o código em toda entrada" (spec verificacao-em-dois-passos, "Prazo da confiança").

A tela SHALL dizer o prazo que vale para a conta e de onde ele vem, como "30 dias, pela organização" ou "Em toda entrada, pelo perfil Administrador". Os retornos SHALL ser "Aparelhos esquecidos." e "Prazo da confiança alterado.". A própria conta SHALL ser cuidada na seção Conta dos Ajustes: a administração SHALL recusar a mudança do prazo da própria conta com "Use outra conta para mudar o seu prazo.".

#### Scenario: Notebook roubado
- **WHEN** quem administra contas escolhe "Esquecer todos os aparelhos" na conta de João, que tinha o notebook marcado
- **THEN** a entrada seguinte de João, em qualquer navegador, pede o código, e a auditoria registra quem esqueceu os aparelhos

#### Scenario: Prazo de uma conta
- **WHEN** quem administra contas dá à conta de Carla o prazo "Pedir o código em toda entrada"
- **THEN** a tela mostra "Em toda entrada, pela conta", com o retorno "Prazo da confiança alterado.", e a entrada seguinte de Carla pede o código

#### Scenario: De onde vem o prazo
- **WHEN** João não tem prazo próprio, tem o perfil Técnico, sem prazo, e a organização usa 30 dias
- **THEN** a tela da conta de João mostra "30 dias, pela organização"

#### Scenario: Prazo da própria conta
- **WHEN** quem administra contas tenta mudar o prazo da própria conta pela administração
- **THEN** a mudança é recusada com "Use outra conta para mudar o seu prazo."
