## MODIFIED Requirements

### Requirement: Padrões de fábrica

Sem padrão da organização nem escolha da conta, a interface SHALL usar os padrões de fábrica da seção 7.2 da spec mestre:
- tema Grafite, destaque azul, densidade compacta e raio base de 12 px;
- dock embaixo, com itens de 48 px, ampliação ligada e ocultar automático desligado;
- cursor suavizado, com suavização de 95% e "Abraçar botões" ligado;
- movimento e transparência seguindo o sistema operacional, normais quando o sistema não pede redução;
- fuso horário seguindo o sistema operacional.

As preferências que a seção 7.2 não lista SHALL seguir o comportamento das seções 7.4 e 7.6:
- avisos na tela de Atenção e de Informação ligados, com 6 s de tempo, e o modo Foco desligado;
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
