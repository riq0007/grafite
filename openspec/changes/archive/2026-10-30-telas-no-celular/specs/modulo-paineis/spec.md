## MODIFIED Requirements

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

No painel em `http://` com o Grafite em `https://`, o bloco SHALL dizer "O navegador não mostra um painel em http dentro do Grafite em https." no lugar do conteúdo, com "Abrir em outra aba". Sem painéis, a tela SHALL dizer "Nenhum painel cadastrado." e, para quem administra, oferecer o Cadastro.

#### Scenario: Três painéis
- **WHEN** a organização tem três painéis ativos, e a janela tem 1.440 px de largura
- **THEN** os três ficam lado a lado, cada um com um terço da largura e a altura toda da área

#### Scenario: Painel fora do ar
- **WHEN** um painel está fora do ar
- **THEN** o bloco mostra "Fora do ar" com o motivo, e a grade continua com os outros

#### Scenario: Três painéis no celular
- **WHEN** a organização tem três painéis ativos, e a tela abre no celular
- **THEN** os três ficam um embaixo do outro, cada um com a largura toda, e a área rola até o terceiro
