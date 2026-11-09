## MODIFIED Requirements

### Requirement: Padrões de fábrica

Sem padrão da organização nem escolha da conta, a interface SHALL usar os padrões de fábrica da seção 7.2 da spec mestre:
- tema Grafite, destaque azul, densidade compacta e raio base de 12 px;
- dock embaixo, com itens de 48 px, ampliação ligada e ocultar automático desligado;
- cursor suavizado, com suavização de 95% e "Abraçar botões" ligado;
- movimento e transparência seguindo o sistema operacional, normais quando o sistema não pede redução;
- fuso horário seguindo o sistema operacional.

As preferências que a seção 7.2 não lista SHALL seguir o comportamento das seções 7.4 e 7.6:
- avisos na tela de Atenção e de Informação ligados, com 6 s de tempo;
- linhas alternadas, miniaturas e o resumo da linha ligados nas tabelas;
- em cada tabela com visões, a visão de fábrica, como "Todos os ativos";
- a tela inicial na ordem de fábrica: severidade e, dentro dela, a mais antiga primeiro.

#### Scenario: Primeiro acesso
- **WHEN** o usuário abre a aplicação numa organização sem padrões, com uma conta que nunca mudou um ajuste
- **THEN** a casca aparece no tema Grafite, com destaque azul, densidade compacta e o dock embaixo, com itens de 48 px e ampliação ligada

#### Scenario: Primeiro acesso com mouse
- **WHEN** o usuário abre a aplicação num computador, numa organização sem padrões, com uma conta que nunca mudou um ajuste, e move o mouse
- **THEN** aparece o cursor suavizado, com suavização de 95% e o abraço ligado

#### Scenario: Primeiro aviso
- **WHEN** chega uma notificação de Informação, numa organização sem padrões, para uma conta que nunca mudou um ajuste
- **THEN** ela vira aviso na tela e some em 6 s

#### Scenario: Primeiro relógio
- **WHEN** o usuário abre a aplicação numa organização sem padrões, com uma conta que nunca mudou um ajuste e o sistema no Horário de Brasília
- **THEN** o relógio da barra mostra a hora de Brasília

#### Scenario: Primeira tabela dos ativos
- **WHEN** uma conta que nunca escolheu uma visão abre os ativos, numa organização sem padrões
- **THEN** a tabela abre em "Todos os ativos", e o resumo da linha aparece ao parar o mouse

### Requirement: Validação campo a campo

Cada preferência SHALL ser validada sozinha, na conta, nos padrões da organização e na cópia do navegador. Um valor ausente ou desconhecido SHALL dar lugar ao da camada de baixo: o padrão da organização e, sem ele, o de fábrica. As preferências válidas SHALL continuar valendo. Um valor numérico fora do intervalo SHALL ser trazido para o limite mais próximo:
- raio base de 0 a 24 px;
- itens do dock de 28 a 64 px;
- suavização do cursor de 0 a 100%.

O tempo do aviso SHALL ser 6, 10 ou 20 s. Qualquer outro valor SHALL dar lugar ao da camada de baixo.

O fuso horário SHALL ser um que o navegador reconhece. Qualquer outro valor SHALL dar lugar ao da camada de baixo, e, se nenhuma tem um fuso reconhecido, a "Seguir o sistema".

A ordem da tela inicial SHALL ser uma das colunas ordenáveis, com a direção crescente ou decrescente. Qualquer outro valor SHALL dar lugar ao da camada de baixo.

A visão escolhida de uma tabela SHALL ser a visão de fábrica ou uma visão da tabela que a camada pode usar: na conta, uma visão da organização ou da própria conta; nos padrões da organização, só uma visão da organização. Uma visão que não existe mais, ou que a camada não pode usar, SHALL dar lugar à da camada de baixo.

A API SHALL recusar com 400 a gravação de um ajuste desconhecido ou de um valor fora do permitido, com a mensagem no campo, sem gravar nenhum ajuste daquele pedido. A visão que a camada não pode usar SHALL ser recusada com "Escolha uma visão que você pode usar.", na conta, e com "Escolha uma visão da organização.", nos padrões da organização.

#### Scenario: Tema desconhecido salvo
- **WHEN** as preferências salvas trazem um tema que não existe e o dock à esquerda, numa organização sem padrões
- **THEN** o tema volta ao Grafite, e o dock continua à esquerda

#### Scenario: Valor desconhecido com padrão da organização
- **WHEN** a cópia do navegador traz um tema que não existe, e o padrão da organização é o tema Névoa
- **THEN** a interface usa o tema Névoa

#### Scenario: Tamanho fora do intervalo
- **WHEN** o tamanho salvo dos itens do dock é 90 px
- **THEN** o dock usa itens de 64 px

#### Scenario: Suavização fora do intervalo
- **WHEN** a suavização salva é 130%
- **THEN** o cursor usa 100%, e as demais preferências continuam as salvas

#### Scenario: Tempo do aviso inválido
- **WHEN** o tempo do aviso salvo é 15 s, numa organização sem padrões
- **THEN** os avisos usam 6 s, e as demais preferências continuam as salvas

#### Scenario: Fuso desconhecido
- **WHEN** o fuso salvo é "Marte/Olympus", numa organização sem padrões
- **THEN** a interface segue o fuso do sistema, e as demais preferências continuam as salvas

#### Scenario: Ordem desconhecida
- **WHEN** a ordem salva da tela inicial é por uma coluna que não existe, numa organização sem padrões
- **THEN** a tela inicial usa a ordem de fábrica, e as demais preferências continuam as salvas

#### Scenario: Preferências do F1a
- **WHEN** a aplicação abre com preferências salvas antes do F1b, sem cursor, notificações nem tabelas
- **THEN** essas seções usam os padrões, e a aparência, o dock e a acessibilidade salvos continuam valendo

#### Scenario: Preferências do F1b
- **WHEN** a aplicação abre com preferências salvas antes do F1c, sem fuso nem ordem da tela inicial
- **THEN** o fuso e a ordem da tela inicial usam os padrões, e as demais preferências salvas continuam valendo

#### Scenario: Preferências do P1b
- **WHEN** a aplicação abre com preferências salvas antes do P1c, sem o resumo da linha nem a visão dos ativos
- **THEN** o resumo da linha fica ligado, a tabela dos ativos abre na visão que vale, e as demais preferências salvas continuam valendo

#### Scenario: Gravação de um valor fora do permitido
- **WHEN** um pedido à API grava o tamanho dos itens do dock em 90 px e o tema Papel
- **THEN** a API responde 400, com a mensagem no tamanho do dock, e nem o tamanho nem o tema mudam

#### Scenario: Visão de uma conta como padrão da organização
- **WHEN** um pedido grava nos padrões da organização, como a visão dos ativos, uma visão que é de uma conta
- **THEN** a API responde 400, com "Escolha uma visão da organização." na visão, e os padrões não mudam
