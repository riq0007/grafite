# modulo-paineis Specification

## Purpose

Dar aos painéis da empresa um módulo na casca, com a grade que aproveita a janela, o expandir e o cadastro.

## Requirements

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

No celular, os painéis SHALL ficar um embaixo do outro, cada um com a altura da área da janela, e a área SHALL rolar até o último.

Cada bloco SHALL ter:
- o nome;
- a situação em texto, "No ar", "Fora do ar" ou "Sem verificação", com a hora da última verificação e, fora do ar, o motivo;
- "Expandir" e "Abrir em outra aba";
- o conteúdo do endereço.

No painel em `http://` com o Grafite em `https://`, o bloco SHALL mostrar o conteúdo pela ponte HTTPS do servidor, isolado da sessão e da página do Grafite. O link "Abrir em outra aba" SHALL continuar apontando para o endereço original. Sem painéis, a tela SHALL dizer "Nenhum painel cadastrado." e, para quem administra, oferecer o Cadastro.

O bloco SHALL seguir a exibição do painel (spec painel-de-dashboards, "Exibição do painel"):
- **"Recusa ser embutido":** no lugar do conteúdo, o bloco SHALL dizer "Este endereço recusa ser mostrado dentro de outra página.", o motivo da verificação e "Libere o endereço do Grafite na ferramenta, ou use “Abrir em outra aba”.", e SHALL NOT carregar o endereço;
- **"Pede a entrada":** o bloco SHALL mostrar o conteúdo e, acima dele, "Este painel pede a entrada. Se a tela de entrada voltar depois de entrar, use “Abrir em outra aba” ou libere a visualização sem entrada na ferramenta.";
- **"Aparece na grade" ou sem exibição:** o bloco SHALL mostrar o conteúdo, como antes.

#### Scenario: Três painéis
- **WHEN** a organização tem três painéis ativos, e a janela tem 1.440 px de largura
- **THEN** os três ficam lado a lado, cada um com um terço da largura e a altura toda da área

#### Scenario: Painel fora do ar
- **WHEN** um painel está fora do ar
- **THEN** o bloco mostra "Fora do ar" com o motivo, e a grade continua com os outros

#### Scenario: Três painéis no celular
- **WHEN** a organização tem três painéis ativos, e a tela abre no celular
- **THEN** os três ficam um embaixo do outro, cada um com a largura toda, e a área rola até o terceiro

#### Scenario: HTTP dentro de HTTPS
- **WHEN** o Grafite é aberto por HTTPS e há um painel HTTP ativo
- **THEN** a grade carrega o painel pela ponte HTTPS sem o aviso de conteúdo misto

#### Scenario: Painel que recusa ser embutido
- **WHEN** o painel "Linha 2" está no ar, com a exibição "Recusa ser embutido" e o motivo "A ferramenta manda X-Frame-Options: DENY."
- **THEN** o bloco mostra "No ar", "Este endereço recusa ser mostrado dentro de outra página.", o motivo, o que liberar e "Abrir em outra aba", sem o quadro em branco

#### Scenario: Painel que pede a entrada
- **WHEN** o painel "Chamados" está no ar, com a exibição "Pede a entrada"
- **THEN** o bloco mostra o aviso da entrada e, abaixo dele, o conteúdo do endereço

#### Scenario: Liberado com a grade aberta
- **WHEN** a exibição do painel "Linha 2" passa a "Aparece na grade" com a grade aberta
- **THEN** o bloco dele passa a carregar o endereço, sem recarregar os outros painéis

### Requirement: Expandir o painel

"Expandir" SHALL mostrar o painel na área inteira da janela, com o nome, a situação, "Abrir em outra aba" e "Voltar à grade", que Esc também aciona. O endereço da tela SHALL aceitar o painel expandido, que o mapa usa.

#### Scenario: Pelo mapa
- **WHEN** alguém escolhe "Ver o painel" no marcador do mapa
- **THEN** a tela dos painéis abre com aquele painel expandido

### Requirement: Cadastro dos painéis

O Cadastro SHALL listar os painéis, ativos e inativos, com o nome, o endereço, o local, a ordem, a situação da verificação, a exibição e a situação do cadastro, e as ações:
- "Novo painel" e a edição, numa gaveta;
- "Inativar" e "Reativar";
- "Verificar agora".

A exibição SHALL aparecer em texto: "Aparece na grade", "Recusa ser embutido" ou "Pede a entrada", com o motivo ao lado, e um travessão no painel sem exibição.

Os retornos SHALL ser "Painel cadastrado.", "Painel salvo.", "Painel inativado.", "Painel reativado." e "Painel verificado: <situação>.". No painel no ar com a exibição "Recusa ser embutido" ou "Pede a entrada", o retorno da verificação SHALL dizer as duas coisas: "Painel verificado: No ar, mas recusa ser embutido." ou "Painel verificado: No ar, mas pede a entrada.".

#### Scenario: Verificar agora
- **WHEN** quem administra os painéis escolhe "Verificar agora" num painel que voltou
- **THEN** o retorno diz "Painel verificado: No ar.", e a grade aberta se atualiza

#### Scenario: Verificar um painel que recusa ser embutido
- **WHEN** quem administra os painéis cadastra o Grafana de fábrica e escolhe "Verificar agora"
- **THEN** o retorno diz "Painel verificado: No ar, mas recusa ser embutido.", e a coluna Exibição mostra "Recusa ser embutido", com o motivo

### Requirement: Painéis atualizados pelos eventos

A grade e o Cadastro SHALL se atualizar sozinhos quando o evento `paineis.mudaram` chega, sem recarregar os painéis que não mudaram.

#### Scenario: Painel volta
- **WHEN** a verificação de um painel muda de "Fora do ar" para "No ar"
- **THEN** o bloco dele na grade aberta passa a dizer "No ar"
