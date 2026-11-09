# mapa-da-planta Specification

## Purpose

Mostrar onde as coisas estão: a planta da empresa, convertida do desenho DXF ou importada do PMG, vista de cima e navegável, com os ativos posicionados e o estado deles, e as camadas que os outros módulos acrescentam, como as salas, os dashboards e o acesso remoto.

## Requirements

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

### Requirement: Mapa navegável

Quem tem `mapa.ver` SHALL abrir o mapa de uma planta ativa, visto de cima. O mapa SHALL ter:
- o arrastar e o zoom, pela roda e pelos botões, e o "Ver a planta inteira";
- a lista das camadas do desenho, cada uma podendo ser ligada e desligada;
- os textos do desenho, que aparecem conforme o zoom, para não se sobreporem;
- a busca pelos marcadores e pelos textos, que leva a vista até o achado.

O mapa SHALL dizer que paredes e volumes são aproximações do desenho, e não medidas. As cores SHALL vir dos tokens do tema.

#### Scenario: Busca pelo texto do desenho
- **WHEN** a técnica procura "WC" no mapa de Jundiaí e escolhe o resultado
- **THEN** a vista vai até o texto achado, com o zoom em que ele aparece

### Requirement: Posição dos ativos na planta

Quem tem `mapa.editar` e vê o ativo SHALL:
- posicioná-lo numa planta, escolhendo o ativo e clicando no ponto;
- movê-lo;
- tirá-lo do mapa.

Um ativo SHALL ter só uma posição por planta. A posição SHALL guardar o ponto em metros, quem mudou e quando, e SHALL entrar na auditoria. Tirar do mapa SHALL apagar só a posição.

#### Scenario: Impressora posicionada
- **WHEN** o técnico escolhe a impressora PAT-00412, clica no ponto da expedição e salva
- **THEN** a impressora aparece no mapa naquele ponto, e a auditoria registra a posição

#### Scenario: Quem só vê o mapa
- **WHEN** uma conta com `mapa.ver` e sem `mapa.editar` abre o mapa
- **THEN** ela vê a planta e os marcadores, sem "Posicionar no mapa", mover ou tirar

### Requirement: Estado dos ativos no mapa

Cada ativo posicionado que a conta vê SHALL aparecer como um marcador com o nome e a pior situação dele, por extenso e com o tom:
- um alerta crítico aberto: "Alerta crítico";
- a disponibilidade offline: "Offline";
- um alerta de atenção aberto: "Atenção";
- a disponibilidade online: "Online";
- senão: "Sem coleta".

O clique no marcador SHALL abrir o resumo, com a situação e o "Abrir ficha". Os marcadores SHALL se reler pelo evento dos ativos, da disponibilidade e dos alertas. O ativo que a conta não vê SHALL NOT aparecer.

#### Scenario: Impressora offline no mapa
- **WHEN** a impressora posicionada fica offline
- **THEN** o marcador dela passa a mostrar "Offline" no tom crítico, sem recarregar a página

### Requirement: Camadas dos módulos no mapa

Os marcadores SHALL vir de fornecedores registrados na API, um por tipo de alvo, cada um com:
- a camada, como "Ativos";
- o rótulo e a situação;
- o ponto;
- as ações, como "Abrir ficha".

O mapa SHALL mostrar cada camada de marcadores na lista das camadas, que se liga e desliga como as do desenho. Um módulo novo, como as salas, os dashboards ou o acesso remoto, SHALL acrescentar a camada dele registrando um fornecedor, sem mudar o mapa.

#### Scenario: Camada desligada
- **WHEN** a técnica desliga a camada "Ativos"
- **THEN** os marcadores dos ativos somem do mapa, e o desenho continua

### Requirement: Permissões do mapa

O catálogo de permissões SHALL ter, na área Mapa:
- `mapa.ver`, "Ver as plantas e o mapa", na organização;
- `mapa.editar`, "Cadastrar as plantas e posicionar no mapa", na organização, que inclui ver.

O perfil Administrador SHALL ter as duas. A API SHALL repetir as verificações. As mudanças das plantas e das posições SHALL gravar o evento `mapa.mudou`, entregue a quem vê o mapa.

#### Scenario: Sem permissão
- **WHEN** uma conta sem `mapa.ver` chama a API dos marcadores
- **THEN** a API responde 403, e o Mapa não aparece no dock dela
