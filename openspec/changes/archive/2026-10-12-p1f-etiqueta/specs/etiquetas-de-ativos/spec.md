## Purpose

Identificar cada ativo pela etiqueta impressa, com o QR code que abre a ficha dele, uma ou várias de uma vez, para quem vê os ativos; o link do QR continua exigindo a entrada.

## ADDED Requirements

### Requirement: Etiqueta do ativo

A etiqueta de um ativo SHALL trazer:
- o QR code com o endereço da ficha do ativo na organização, como `https://empresa.exemplo/ativos/<id>`, pelo id do ativo, que não permite adivinhar o de outro;
- o patrimônio, em destaque, ou "Sem patrimônio";
- o nome do ativo, em até duas linhas, cortado no fim com reticências;
- o nome da organização.

A etiqueta SHALL ter texto preto sobre fundo branco em qualquer tema, na prévia e no papel, e o QR code SHALL ter a margem branca em volta (spec componentes-base).

#### Scenario: Etiqueta da impressora
- **WHEN** alguém imprime a etiqueta da impressora PAT-00412, uma HP LaserJet M404 da organização "Empresa"
- **THEN** a etiqueta traz o QR code do endereço da ficha da PAT-00412, "PAT-00412", "HP LaserJet M404" e "Empresa"

#### Scenario: Ativo sem patrimônio
- **WHEN** alguém imprime a etiqueta de um ativo sem patrimônio
- **THEN** a etiqueta diz "Sem patrimônio" no lugar do patrimônio

#### Scenario: Tema escuro
- **WHEN** a conta usa o tema OLED e abre a prévia das etiquetas
- **THEN** as etiquetas aparecem em preto sobre branco, como saem no papel

### Requirement: Link da etiqueta

Ler o QR code SHALL abrir a ficha do ativo. Sem uma sessão que valha, SHALL aparecer a tela de entrada (spec tela-de-entrada), e, depois da entrada, a ficha do ativo, no mesmo endereço. A ficha SHALL seguir o acesso da conta que entrou (spec cadastro-de-ativos).

#### Scenario: QR lido sem sessão
- **WHEN** alguém lê o QR code da PAT-00412 num celular sem sessão
- **THEN** a tela de entrada aparece e, depois da entrada, a ficha da PAT-00412 abre

### Requirement: Tela das etiquetas

Quem tem `ativos.ver` SHALL poder abrir a tela das etiquetas com até 200 ativos escolhidos. A tela SHALL mostrar:
- quantas etiquetas vão ser impressas;
- o formato, entre:
  - "Folha A4", com 21 etiquetas de 63,5 × 38,1 mm, em 3 colunas e 7 linhas;
  - "Impressora de etiquetas", com uma etiqueta de 50 × 30 mm por página;
- na folha A4, "Começar na etiqueta", de 1 a 21, para a folha já usada em parte: as posições antes dela ficam em branco na primeira folha;
- a prévia das folhas, na ordem em que os ativos foram escolhidos;
- "Imprimir", que abre o diálogo de impressão do navegador.

A impressão SHALL levar só as etiquetas, sem a casca, no tamanho do formato, com uma folha A4, ou uma etiqueta, por página.

Um ativo que a conta não vê, ou que não existe, SHALL ficar de fora, com "1 ativo fora do seu acesso ficou de fora." ou "3 ativos fora do seu acesso ficaram de fora.". Mais de 200 ativos SHALL ser recusados, com "Escolha até 200 ativos por vez.". A tela das etiquetas não grava nada, nem na auditoria.

#### Scenario: Várias etiquetas na folha A4
- **WHEN** quem vê ativos escolhe 25 ativos e o formato "Folha A4"
- **THEN** a prévia mostra duas folhas, a primeira com 21 etiquetas e a segunda com 4

#### Scenario: Folha usada em parte
- **WHEN** a folha A4 já perdeu as 4 primeiras etiquetas, e quem imprime escolhe "Começar na etiqueta" 5 com 3 ativos
- **THEN** as etiquetas ocupam as posições 5, 6 e 7 da folha, e as 4 primeiras ficam em branco

#### Scenario: Impressora de etiquetas
- **WHEN** quem vê ativos escolhe 3 ativos e o formato "Impressora de etiquetas"
- **THEN** cada etiqueta sai numa página de 50 × 30 mm

#### Scenario: Ativo de fora do acesso
- **WHEN** a lista escolhida tem um ativo de Campinas, e a conta vê ativos só em Jundiaí
- **THEN** a tela mostra as etiquetas dos outros e diz "1 ativo fora do seu acesso ficou de fora."
