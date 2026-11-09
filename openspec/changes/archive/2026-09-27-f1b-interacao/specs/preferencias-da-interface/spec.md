## MODIFIED Requirements

### Requirement: Padrões de fábrica

Sem nenhuma preferência salva, a interface SHALL usar os padrões de fábrica da seção 7.2 da spec mestre:
- tema Grafite, destaque azul, densidade compacta e raio base de 12 px;
- dock embaixo, com itens de 48 px, ampliação ligada e ocultar automático desligado;
- cursor suavizado, com suavização de 95% e "Abraçar botões" ligado;
- movimento e transparência seguindo o sistema operacional, normais quando o sistema não pede redução.

As preferências que a seção 7.2 não lista SHALL seguir o comportamento da seção 7.4:
- avisos na tela de Atenção e de Informação ligados, com 6 s de tempo;
- linhas alternadas e miniaturas ligadas nas tabelas.

#### Scenario: Primeiro acesso
- **WHEN** o usuário abre a aplicação num navegador sem preferências salvas
- **THEN** a casca aparece no tema Grafite, com destaque azul, densidade compacta e o dock embaixo, com itens de 48 px e ampliação ligada

#### Scenario: Primeiro acesso com mouse
- **WHEN** o usuário abre a aplicação num computador sem preferências salvas e move o mouse
- **THEN** aparece o cursor suavizado, com suavização de 95% e o abraço ligado

#### Scenario: Primeiro aviso
- **WHEN** chega uma notificação de Informação num navegador sem preferências salvas
- **THEN** ela vira aviso na tela e some em 6 s

### Requirement: Validação campo a campo

Cada preferência SHALL ser validada sozinha. Um valor ausente, desconhecido ou fora do intervalo SHALL voltar ao padrão de fábrica, sem descartar as preferências válidas. Os valores numéricos SHALL ficar no intervalo permitido:
- raio base de 0 a 24 px;
- itens do dock de 28 a 64 px;
- suavização do cursor de 0 a 100%.

O tempo do aviso SHALL ser 6, 10 ou 20 s. Qualquer outro valor SHALL voltar aos 6 s de fábrica.

#### Scenario: Tema desconhecido salvo
- **WHEN** as preferências salvas trazem um tema que não existe e o dock à esquerda
- **THEN** o tema volta ao Grafite, e o dock continua à esquerda

#### Scenario: Tamanho fora do intervalo
- **WHEN** o tamanho salvo dos itens do dock é 90 px
- **THEN** o dock usa itens de 64 px

#### Scenario: Suavização fora do intervalo
- **WHEN** a suavização salva é 130%
- **THEN** o cursor usa 100%, e as demais preferências continuam as salvas

#### Scenario: Tempo do aviso inválido
- **WHEN** o tempo do aviso salvo é 15 s
- **THEN** os avisos usam 6 s, e as demais preferências continuam as salvas

#### Scenario: Preferências do F1a
- **WHEN** a aplicação abre com preferências salvas antes do F1b, sem cursor, notificações nem tabelas
- **THEN** essas seções usam os padrões de fábrica, e a aparência, o dock e a acessibilidade salvos continuam valendo
