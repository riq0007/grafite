## MODIFIED Requirements

### Requirement: Padrões de fábrica

Sem padrão da organização nem escolha da conta, a interface SHALL usar os padrões de fábrica da seção 7.2 da spec mestre:
- tema Grafite, destaque Grafite, densidade normal e raio base de 10 px;
- dock embaixo, com itens de 48 px, ampliação ligada e ocultar automático desligado;
- cursor suavizado, com suavização de 95% e "Abraçar botões" ligado;
- movimento e transparência seguindo o sistema operacional, normais quando o sistema não pede redução;
- fuso horário seguindo o sistema operacional.

As preferências que a seção 7.2 não lista SHALL seguir o comportamento das seções 7.4, 6.5 e 7.6:
- avisos na tela de Atenção e de Informação ligados, com 6 s de tempo, e o modo Foco desligado;
- o e-mail do crítico na hora ligado, o resumo diário por e-mail ligado e o push só do Crítico;
- linhas alternadas, miniaturas e o resumo da linha ligados nas tabelas;
- em cada tabela com visões, a visão de fábrica, como "Todos os ativos";
- a tela inicial na ordem de fábrica: severidade e, dentro dela, a mais antiga primeiro.

#### Scenario: Primeiro acesso
- **WHEN** o usuário abre a aplicação numa organização sem padrões, com uma conta que nunca mudou um ajuste
- **THEN** a casca aparece no tema Grafite, com o destaque Grafite, densidade normal, o raio base de 10 px e o dock embaixo, com itens de 48 px e ampliação ligada

#### Scenario: Primeiro acesso com mouse
- **WHEN** o usuário abre a aplicação num computador, numa organização sem padrões, com uma conta que nunca mudou um ajuste, e move o mouse
- **THEN** aparece o cursor suavizado, com suavização de 95% e o abraço ligado

#### Scenario: Primeiro aviso
- **WHEN** chega uma notificação de Informação, numa organização sem padrões, para uma conta que nunca mudou um ajuste
- **THEN** ela vira aviso na tela e some em 6 s

#### Scenario: Primeiro e-mail
- **WHEN** abre um alerta crítico, numa organização sem padrões, para uma conta que nunca mudou um ajuste e cuja pessoa tem e-mail
- **THEN** o e-mail do crítico sai na hora, e o aparelho inscrito recebe o push

#### Scenario: Primeiro relógio
- **WHEN** o usuário abre a aplicação numa organização sem padrões, com uma conta que nunca mudou um ajuste e o sistema no Horário de Brasília
- **THEN** o relógio da barra mostra a hora de Brasília

#### Scenario: Primeira tabela dos ativos
- **WHEN** uma conta que nunca escolheu uma visão abre os ativos, numa organização sem padrões
- **THEN** a tabela abre em "Todos os ativos", e o resumo da linha aparece ao parar o mouse

#### Scenario: Quem já escolheu o azul
- **WHEN** uma conta que escolheu o destaque azul abre a aplicação depois da mudança do padrão de fábrica
- **THEN** a interface continua com o destaque azul
