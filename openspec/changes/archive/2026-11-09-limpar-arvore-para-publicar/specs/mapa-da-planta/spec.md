## MODIFIED Requirements

### Requirement: Plantas da organização

Quem tem `mapa.editar` SHALL cadastrar uma planta pelo envio de um arquivo de até 300 MB:
- o DXF do desenho, convertido para o modelo navegável no servidor;
- ou o modelo convertido do PMG, em JSON.

Outro formato SHALL ser recusado com "Envie o desenho em DXF ou o modelo da planta em JSON.". A conversão do DXF SHALL:
- ler as linhas, as polilinhas, os arcos, os círculos, os textos e as inserções de blocos, com a posição, a escala e a rotação;
- guardar as linhas por camada e os textos com a posição;
- converter a unidade do desenho para metros e pôr a origem no canto da planta.

A planta SHALL ter o nome, o local opcional, a largura, a profundidade e a contagem das linhas e dos textos. Ela SHALL poder ser renomeada, ligada a um local e inativada. A inativada SHALL sair da lista do mapa, com as posições guardadas.

#### Scenario: Planta do PMG importada
- **WHEN** a administradora envia o modelo do PMG (`planta-exemplo.json`) com o nome "Jundiaí"
- **THEN** a planta é cadastrada com a largura e a profundidade do modelo, as camadas, os textos e as máquinas dele

#### Scenario: DXF convertido
- **WHEN** a administradora envia um DXF em milímetros com linhas, uma polilinha, um texto e um bloco inserido duas vezes
- **THEN** a planta guarda as linhas por camada, em metros, com o bloco repetido nas duas posições, e o texto pesquisável

#### Scenario: Formato recusado
- **WHEN** alguém envia um PDF da planta
- **THEN** o envio é recusado com "Envie o desenho em DXF ou o modelo da planta em JSON."
