## Purpose

Guardar e aplicar as preferências de interface de cada usuário (aparência, dock e acessibilidade), partindo dos padrões de fábrica da spec mestre e mantendo-as no navegador até o F2 levá-las ao servidor.

## ADDED Requirements

### Requirement: Padrões de fábrica

Sem nenhuma preferência salva, a interface SHALL usar os padrões de fábrica da seção 7.2 da spec mestre:
- tema Grafite, destaque azul, densidade compacta e raio base de 12 px;
- dock embaixo, com itens de 48 px, ampliação ligada e ocultar automático desligado;
- movimento e transparência seguindo o sistema operacional, normais quando o sistema não pede redução.

#### Scenario: Primeiro acesso
- **WHEN** o usuário abre a aplicação num navegador sem preferências salvas
- **THEN** a casca aparece no tema Grafite, com destaque azul, densidade compacta e o dock embaixo, com itens de 48 px e ampliação ligada

### Requirement: Validação campo a campo

Cada preferência SHALL ser validada sozinha. Um valor ausente, desconhecido ou fora do intervalo SHALL voltar ao padrão de fábrica, sem descartar as preferências válidas. Os valores numéricos SHALL ficar no intervalo permitido: raio base de 0 a 24 px e itens do dock de 28 a 64 px.

#### Scenario: Tema desconhecido salvo
- **WHEN** as preferências salvas trazem um tema que não existe e o dock à esquerda
- **THEN** o tema volta ao Grafite, e o dock continua à esquerda

#### Scenario: Tamanho fora do intervalo
- **WHEN** o tamanho salvo dos itens do dock é 90 px
- **THEN** o dock usa itens de 64 px

### Requirement: Preferências guardadas no navegador

Até o F2, as preferências SHALL ser gravadas no navegador a cada mudança e lidas na abertura seguinte. Se o navegador recusar a gravação, a mudança SHALL valer até a página fechar, sem mensagem de erro.

#### Scenario: Reabertura com o dock à direita
- **WHEN** o usuário põe o dock à direita e reabre a aplicação
- **THEN** o dock aparece à direita

#### Scenario: Armazenamento bloqueado
- **WHEN** o navegador recusa a gravação das preferências
- **THEN** a mudança vale até a página fechar, e nenhuma mensagem de erro aparece

### Requirement: Dock certo desde a primeira pintura

A posição do dock, o tamanho dos itens e o ocultar automático SHALL valer antes da primeira pintura, como o tema. O dock SHALL NOT aparecer numa posição e pular para outra, nem a janela de conteúdo mudar de lugar depois de aparecer.

#### Scenario: Reabertura com o dock à esquerda
- **WHEN** o usuário reabre a aplicação com o dock salvo à esquerda
- **THEN** a primeira pintura já mostra o dock à esquerda, e a janela de conteúdo não muda de lugar depois
