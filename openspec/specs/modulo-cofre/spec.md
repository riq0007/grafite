# modulo-cofre Specification

## Purpose
Reunir na casca o módulo Cofre: a lista dos segredos que a conta alcança, a ficha com o revelar e o copiar confirmados pelo código do app e, para quem administra o cofre, o cadastro, a edição e o acesso de cada segredo.

## Requirements

### Requirement: Cofre no dock

A casca SHALL ter o módulo Cofre, depois do Ativos e antes da Administração. Ele SHALL ficar visível só para quem tem `cofre.usar`, inclusive por `cofre.administrar`, e só com o módulo ligado na organização (spec modulos-da-organizacao). O item do dock SHALL levar à lista dos segredos. No celular, o módulo SHALL ficar em "Mais".

Sem a permissão, o endereço do Cofre SHALL dizer "Você não tem acesso ao Cofre.", com a quem pedir acesso.

#### Scenario: Conta sem o cofre
- **WHEN** uma conta sem `cofre.usar` e sem `cofre.administrar` entra
- **THEN** o dock não mostra o Cofre, e o endereço dele diz "Você não tem acesso ao Cofre."

### Requirement: Lista dos segredos

A lista SHALL mostrar os segredos que a conta vê (spec cofre-de-segredos), pelo nome, com:
- o tipo e a classificação;
- o identificador;
- a pessoa ligada;
- a validade e a rotação, com "Vencido" e "Rotação atrasada" em texto e com o ícone;
- a situação, para quem administra o cofre.

A lista SHALL buscar pelo nome, pelo identificador e pelo endereço, e filtrar pelo tipo, pela classificação e, para quem administra, pela situação, com os ativos por padrão. A linha SHALL abrir a ficha. A lista SHALL NOT mostrar nenhum valor secreto.

Sem nenhum segredo, a lista SHALL dizer "Nenhum segredo ainda." e oferecer "Novo segredo" a quem administra o cofre. A quem só usa o cofre, sem nenhum segredo liberado, ela SHALL dizer "Nenhum segredo liberado para você ainda.".

#### Scenario: Lista de quem usa o cofre
- **WHEN** Bruno, com `cofre.usar`, abre o Cofre com dois segredos liberados a ele e outros dez na organização
- **THEN** a lista mostra só os dois, sem o valor de nenhum

#### Scenario: Busca na lista
- **WHEN** quem vê o cofre digita "cpd" na busca da lista
- **THEN** a lista mostra o "Switch do CPD" e os outros segredos com "cpd" no nome, no identificador ou no endereço

### Requirement: Cadastro e ficha do segredo

Quem administra o cofre SHALL cadastrar um segredo pelo "Novo segredo", com os campos do segredo. O campo do valor SHALL esconder o que é digitado, com a opção de mostrar.

A ficha SHALL mostrar o nome e a situação no título, os dados do segredo, a pessoa e os ativos ligados, com o caminho até cada um, e as ações:
- **Revelar** e **Copiar**, para quem alcança o segredo ativo;
- a edição dos dados e "Trocar o valor", para quem administra o cofre;
- "Inativar", com confirmação, e "Reativar", para quem administra o cofre.

O valor atual SHALL NOT aparecer no formulário de edição: "Trocar o valor" pede o valor novo. Para quem só usa o cofre, a ficha SHALL ser só de leitura.

Os retornos SHALL ser "Segredo cadastrado.", "Segredo salvo.", "Valor trocado.", "Segredo inativado." e "Segredo reativado.".

#### Scenario: Valor trocado
- **WHEN** quem administra o cofre troca a senha do "Switch do CPD" pela ficha
- **THEN** a ficha diz "Valor trocado.", o valor antigo não aparece em nenhum momento, e a próxima revelação mostra a senha nova

#### Scenario: Inativação confirmada
- **WHEN** quem administra o cofre inativa o "Switch do CPD"
- **THEN** a confirmação diz "O segredo sai da lista de quem o usa e não pode mais ser revelado. Ele pode ser reativado.", e, confirmada, a ficha diz "Segredo inativado."

### Requirement: Acesso na ficha

A ficha SHALL mostrar a quem o segredo está liberado: as contas, os grupos e os perfis, pelo nome. Quem administra o cofre SHALL incluir e retirar cada um, com o retorno "Acesso salvo.". A quem só usa o cofre, a ficha SHALL NOT mostrar o acesso.

#### Scenario: Grupo incluído
- **WHEN** quem administra o cofre inclui o grupo "Suporte" no acesso do "Switch do CPD"
- **THEN** a ficha mostra o "Suporte" no acesso, e quem é do grupo passa a ver o segredo

### Requirement: Revelar e copiar na tela

"Revelar" e "Copiar", com o cofre ainda não liberado na sessão, SHALL abrir o pedido do código do app, que diz "Revelar e copiar ficam liberados por 5 minutos nesta sessão.". Com o código certo, a ação pedida SHALL continuar sozinha.

Com o cofre liberado, a tela SHALL dizer até quando, como "Cofre liberado até 14:32", e revelar e copiar SHALL acontecer sem pedir o código. Terminada a liberação, a tela SHALL voltar a pedir o código na ação seguinte.

O valor revelado SHALL aparecer em fonte mono, com "Copiar" ao lado, e SHALL sumir da tela ao fechar a ficha ou depois de 30 segundos. "Copiar" SHALL dizer "Copiado" sem mostrar o valor.

#### Scenario: Primeira revelação
- **WHEN** Bruno escolhe "Revelar" no "Switch do CPD", com o cofre fechado, e digita o código do app
- **THEN** a senha aparece, e a tela diz "Cofre liberado até 14:32"

#### Scenario: Valor escondido de novo
- **WHEN** a senha revelada fica 30 segundos na tela
- **THEN** ela some, e "Revelar" volta a mostrá-la sem o código, enquanto o cofre estiver liberado

### Requirement: Cofre na busca

A busca (Ctrl+K) SHALL oferecer:
- a ação "Novo segredo", a quem administra o cofre;
- os segredos que a conta vê, pelo nome e pelo identificador, cada um com o tipo e levando à ficha, sem nenhum valor secreto.

#### Scenario: Segredo pela busca
- **WHEN** Bruno digita "switch" na busca
- **THEN** a busca mostra o "Switch do CPD", com o tipo "Conta administrativa", e Enter abre a ficha dele

### Requirement: Cofre atualizado pelos eventos

A lista e a ficha abertas SHALL se atualizar sozinhas quando o evento `cofre.mudou` chega, sem uma ação do usuário. Um formulário em edição SHALL manter o que foi digitado. O evento SHALL NOT levar o valor secreto, e a tela SHALL NOT revelar nada sozinha.

#### Scenario: Acesso dado com a lista aberta
- **WHEN** Ana libera um segredo a Bruno enquanto ele está com a lista do Cofre aberta
- **THEN** a lista de Bruno mostra o segredo, sem recarregar
