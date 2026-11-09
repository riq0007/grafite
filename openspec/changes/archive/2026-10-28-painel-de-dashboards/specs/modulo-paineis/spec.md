## Purpose

Dar aos painéis da empresa um módulo na casca, com a grade que aproveita a janela, o expandir e o cadastro.

## ADDED Requirements

### Requirement: Painéis no dock

A casca SHALL ter o módulo Painéis, depois do Salas e antes do Cofre, visível para quem tem `paineis.ver`, também pela `paineis.administrar`, e só com o módulo ligado na organização. O menu SHALL ter "Painéis", para quem os vê, e "Cadastro", para quem os administra. O item do dock SHALL levar à grade. Sem a permissão, o endereço do módulo SHALL dizer "Você não tem acesso aos painéis.", com a quem pedir acesso.

#### Scenario: Quem só vê os painéis
- **WHEN** uma conta com só `paineis.ver` abre o Painéis
- **THEN** o menu mostra só "Painéis"

### Requirement: Grade adaptativa

A tela Painéis SHALL mostrar os painéis ativos, na ordem, numa grade que ocupa a área da janela:
- um painel ocupa a área inteira;
- dois e três ficam lado a lado, numa linha só;
- de quatro em diante, a grade tem as colunas da raiz quadrada da quantidade, arredondada para cima, e as linhas que precisar, como 2 × 2 com quatro e 3 × 2 com cinco ou seis.

Cada bloco SHALL ter:
- o nome;
- a situação em texto, "No ar", "Fora do ar" ou "Sem verificação", com a hora da última verificação e, fora do ar, o motivo;
- "Expandir" e "Abrir em outra aba";
- o conteúdo do endereço.

No painel em `http://` com o Grafite em `https://`, o bloco SHALL dizer "O navegador não mostra um painel em http dentro do Grafite em https." no lugar do conteúdo, com "Abrir em outra aba". Sem painéis, a tela SHALL dizer "Nenhum painel cadastrado." e, para quem administra, oferecer o Cadastro.

#### Scenario: Três painéis
- **WHEN** a organização tem três painéis ativos, e a janela tem 1.440 px de largura
- **THEN** os três ficam lado a lado, cada um com um terço da largura e a altura toda da área

#### Scenario: Painel fora do ar
- **WHEN** um painel está fora do ar
- **THEN** o bloco mostra "Fora do ar" com o motivo, e a grade continua com os outros

### Requirement: Expandir o painel

"Expandir" SHALL mostrar o painel na área inteira da janela, com o nome, a situação, "Abrir em outra aba" e "Voltar à grade", que Esc também aciona. O endereço da tela SHALL aceitar o painel expandido, que o mapa usa.

#### Scenario: Pelo mapa
- **WHEN** alguém escolhe "Ver o painel" no marcador do mapa
- **THEN** a tela dos painéis abre com aquele painel expandido

### Requirement: Cadastro dos painéis

O Cadastro SHALL listar os painéis, ativos e inativos, com o nome, o endereço, o local, a ordem, a situação da verificação e a do cadastro, e as ações:
- "Novo painel" e a edição, numa gaveta;
- "Inativar" e "Reativar";
- "Verificar agora".

Os retornos SHALL ser "Painel cadastrado.", "Painel salvo.", "Painel inativado.", "Painel reativado." e "Painel verificado: <situação>.".

#### Scenario: Verificar agora
- **WHEN** quem administra os painéis escolhe "Verificar agora" num painel que voltou
- **THEN** o retorno diz "Painel verificado: No ar.", e a grade aberta se atualiza

### Requirement: Painéis atualizados pelos eventos

A grade e o Cadastro SHALL se atualizar sozinhos quando o evento `paineis.mudaram` chega, sem recarregar os painéis que não mudaram.

#### Scenario: Painel volta
- **WHEN** a verificação de um painel muda de "Fora do ar" para "No ar"
- **THEN** o bloco dele na grade aberta passa a dizer "No ar"
