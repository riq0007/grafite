## Purpose

Garantir que o Grafite tenha um nome verificado e uma marca própria (símbolo, logotipo e derivados), aplicada de forma consistente e legível em todos os temas.

## ADDED Requirements

### Requirement: Nome verificado antes de ser adotado

O nome do produto SHALL passar por uma busca de conflito antes de ser adotado como definitivo. A busca cobre marcas registradas ou pedidas no INPI nas classes de software e serviços de tecnologia e a disponibilidade de domínios. O resultado SHALL ser registrado num relatório no repositório, com os achados, o nível de risco e a decisão do usuário.

#### Scenario: Busca sem conflito relevante
- **WHEN** a busca não encontra marca igual ou semelhante nas classes de software e serviços de tecnologia
- **THEN** o relatório registra as fontes consultadas, a data e a decisão do usuário de adotar o nome

#### Scenario: Busca com conflito
- **WHEN** a busca encontra marca igual ou semelhante registrada ou pedida nessas classes
- **THEN** o relatório descreve o conflito e o risco, e o nome não é tratado como definitivo até o usuário decidir

### Requirement: Logo escolhido pelo usuário

O logo SHALL ser escolhido pelo usuário entre pelo menos três conceitos distintos apresentados visualmente, e SHALL ser refinado a partir do conceito escolhido.

#### Scenario: Apresentação dos conceitos
- **WHEN** a etapa de identidade começa
- **THEN** o usuário vê pelo menos três conceitos de símbolo e logotipo lado a lado, nos temas claro e escuro

#### Scenario: Escolha registrada
- **WHEN** o usuário escolhe um conceito
- **THEN** a escolha fica registrada e só o conceito escolhido segue para o refinamento

### Requirement: Derivados da marca a partir de uma fonte vetorial única

A marca SHALL ter uma fonte vetorial única. Dela SHALL ser gerados:
- o símbolo;
- o logotipo (o nome em curvas) e a marca completa (símbolo + logotipo);
- as versões monocromáticas clara e escura;
- o favicon;
- os ícones da PWA (192 e 512 px, incluindo a versão com área segura para recorte).

Nenhum derivado SHALL ser editado à mão fora dessa fonte.

#### Scenario: Atualização da marca
- **WHEN** a fonte vetorial da marca é alterada
- **THEN** todos os derivados são regenerados a partir dela, sem ajuste manual em cada arquivo

#### Scenario: Ícone da PWA com recorte
- **WHEN** um sistema operacional aplica máscara circular ou arredondada ao ícone da PWA
- **THEN** o símbolo continua inteiro dentro da área visível

### Requirement: Legibilidade da marca em todos os temas

A marca SHALL ser legível nos seis temas e nas quatro cores de destaque, com contraste mínimo de 3:1 contra o fundo em que é aplicada.

#### Scenario: Marca sobre tema claro e escuro
- **WHEN** a marca é exibida sobre o fundo de qualquer um dos seis temas
- **THEN** a versão aplicada atinge contraste de pelo menos 3:1 com o fundo

### Requirement: Regras de aplicação da marca

O repositório SHALL documentar as regras de aplicação da marca:
- área de proteção;
- tamanho mínimo;
- versões permitidas por fundo;
- usos proibidos: distorcer, rotacionar, aplicar gradiente, sombra ou brilho, e recolorir fora dos tokens.

#### Scenario: Consulta às regras
- **WHEN** alguém precisa aplicar a marca numa tela nova
- **THEN** encontra no repositório a área de proteção, o tamanho mínimo e a versão correta para o fundo

### Requirement: Marca aplicada na aplicação

A aplicação web SHALL exibir a marca no título da aba, no favicon e na casca, e SHALL declarar os ícones da PWA no manifesto.

#### Scenario: Abertura da aplicação
- **WHEN** o usuário abre a aplicação no navegador
- **THEN** a aba mostra o favicon e o nome do produto, e a casca mostra a marca
