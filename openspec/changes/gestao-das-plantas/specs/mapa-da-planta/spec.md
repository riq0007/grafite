## MODIFIED Requirements

### Requirement: Plantas da organização

Quem tem `mapa.editar` SHALL cadastrar uma planta pelo envio de um arquivo de até 300 MB:
- o DXF do desenho, convertido para o modelo navegável no servidor;
- ou o modelo convertido do PMG, em JSON.

Outro formato SHALL ser recusado com "Envie o desenho em DXF ou o modelo da planta em JSON.". A conversão do DXF SHALL:
- ler as linhas, as polilinhas, os arcos, os círculos, os textos e as inserções de blocos, com a posição, a escala e a rotação;
- guardar as linhas por camada e os textos com a posição;
- converter a unidade do desenho para metros e pôr a origem no canto da planta.

A planta SHALL ter o nome, o local opcional, a largura, a profundidade e a contagem das linhas e dos textos. Ela SHALL poder ser renomeada, ligada a um local, inativada e reativada. A inativada SHALL sair da lista do mapa, com as posições guardadas. A planta SHALL poder também ter o desenho substituído (requisito "Substituição do desenho") e ser excluída (requisito "Exclusão da planta").

#### Scenario: Planta do PMG importada
- **WHEN** a administradora envia o modelo do PMG (`planta-exemplo.json`) com o nome "Jundiaí"
- **THEN** a planta é cadastrada com a largura e a profundidade do modelo, as camadas, os textos e as máquinas dele

#### Scenario: DXF convertido
- **WHEN** a administradora envia um DXF em milímetros com linhas, uma polilinha, um texto e um bloco inserido duas vezes
- **THEN** a planta guarda as linhas por camada, em metros, com o bloco repetido nas duas posições, e o texto pesquisável

#### Scenario: Formato recusado
- **WHEN** alguém envia um PDF da planta
- **THEN** o envio é recusado com "Envie o desenho em DXF ou o modelo da planta em JSON."

#### Scenario: Planta reativada
- **WHEN** quem edita o mapa reativa a planta "Galpão antigo", inativa, que tinha 4 ativos posicionados
- **THEN** a planta volta à lista do mapa, com os 4 ativos nos mesmos pontos

## ADDED Requirements

### Requirement: Ações da planta na tela

A tela das plantas SHALL mostrar, a quem tem `mapa.editar`, todas as plantas, com a situação de cada uma em texto: as ativas primeiro e, depois, as inativas e as que falharam. Cada planta SHALL oferecer, em "Ações":
- "Renomear…", com o nome atual no campo; o nome vazio SHALL ser recusado com "Dê um nome à planta.", no campo;
- "Ligar a um local…", com a escolha de local em árvore (spec componentes-base) e a opção de deixar sem local;
- "Inativar", na planta ativa, e "Reativar", na inativa;
- "Substituir o desenho…";
- "Excluir…".

A planta que falhou SHALL oferecer só "Renomear…", "Substituir o desenho…" e "Excluir…". Quem tem só `mapa.ver` SHALL ver só as plantas ativas, sem "Ações".

Os retornos SHALL ser "Planta renomeada.", "Local da planta alterado.", "Planta inativada." e "Planta reativada.". A tela SHALL se atualizar, sem uma ação do usuário, quando outra sessão muda uma planta.

#### Scenario: Renomear pela tela
- **WHEN** quem edita o mapa escolhe "Renomear…" na planta "Jundiai" e salva "Jundiaí · Térreo"
- **THEN** a lista mostra "Jundiaí · Térreo", com o retorno "Planta renomeada.", e a auditoria registra o nome de antes e o de depois

#### Scenario: Inativar pela tela
- **WHEN** quem edita o mapa escolhe "Inativar" na planta "Galpão antigo"
- **THEN** a planta passa a "Inativa" na tela de quem edita e some da tela de quem só vê o mapa

#### Scenario: Planta que falhou
- **WHEN** quem edita o mapa abre as "Ações" de uma planta com a situação "Falhou"
- **THEN** o menu oferece "Renomear…", "Substituir o desenho…" e "Excluir…", sem "Inativar"

#### Scenario: Quem só vê o mapa
- **WHEN** uma conta com `mapa.ver` e sem `mapa.editar` abre a tela das plantas
- **THEN** ela vê só as plantas ativas, sem "Nova planta" e sem "Ações"

### Requirement: Exclusão da planta

Quem tem `mapa.editar` SHALL poder excluir uma planta, em qualquer situação. A lista das plantas SHALL dizer, a quem edita o mapa, quantas posições cada planta tem. A confirmação SHALL dizer quantas posições serão apagadas e que a exclusão não se desfaz, e SHALL pedir o nome da planta digitado: "Excluir a planta" SHALL ficar desabilitado enquanto o nome digitado não for o da planta.

A exclusão SHALL:
- apagar a planta, o desenho guardado e as posições de todos os alvos nela;
- manter os ativos, as salas e os painéis que estavam posicionados, só sem a posição naquela planta;
- registrar na auditoria a planta excluída, com o nome, as medidas e a quantidade de posições apagadas;
- avisar as telas abertas pelo evento `mapa.mudou`.

O retorno SHALL ser "Planta <nome> excluída.". O mapa aberto de uma planta que saiu da lista, em qualquer sessão, SHALL dar lugar a um estado vazio, com o caminho para a tela das plantas:
- "Esta planta foi excluída.", para quem edita o mapa, que vê todas as plantas;
- "Esta planta não está mais no mapa.", para quem só vê o mapa, porque a planta pode ter sido inativada.
 A API SHALL responder 404 à exclusão de uma planta que não existe e 403 a quem não tem `mapa.editar`.

#### Scenario: Planta enviada por engano
- **WHEN** quem edita o mapa exclui a planta "Teste", com 12 ativos posicionados, digitando "Teste" na confirmação
- **THEN** a planta sai da tela, com o retorno "Planta Teste excluída.", os 12 ativos continuam cadastrados e sem posição nela, e a auditoria registra a exclusão com "12 posições apagadas"

#### Scenario: Nome que não confere
- **WHEN** a confirmação da exclusão da planta "Jundiaí" está aberta, e o campo tem "Jundiai"
- **THEN** "Excluir a planta" continua desabilitado, e nada é apagado

#### Scenario: Mapa aberto em outra sessão
- **WHEN** Ana exclui a planta "Teste" enquanto Bruno, que também edita o mapa, está com o mapa dela aberto
- **THEN** em até 5 s a tela de Bruno mostra "Esta planta foi excluída.", com o caminho para as plantas

#### Scenario: Mapa aberto de quem só vê
- **WHEN** a planta "Galpão antigo" é inativada ou excluída enquanto uma conta que só vê o mapa está com o mapa dela aberto
- **THEN** a tela dela mostra "Esta planta não está mais no mapa.", com o caminho para as plantas

#### Scenario: Exclusão sem a permissão
- **WHEN** uma conta sem `mapa.editar` pede à API a exclusão de uma planta
- **THEN** a API responde 403, e a planta continua

### Requirement: Substituição do desenho

Quem tem `mapa.editar` SHALL poder enviar outro arquivo para uma planta, nos formatos e no limite do cadastro. A substituição SHALL:
- converter o arquivo como no cadastro;
- trocar o desenho, a largura, a profundidade e as contagens;
- manter o nome, o local e as posições;
- passar a ativa a planta que tinha falhado, e manter inativa a que estava inativa;
- registrar na auditoria as medidas e as contagens de antes e de depois.

Depois da troca, a tela SHALL dizer quantas posições ficaram fora da área do desenho novo, como "3 posições ficaram fora do desenho novo. Reposicione-as no mapa.", e SHALL NOT apagá-las. O arquivo recusado ou que falha na conversão SHALL deixar a planta como estava. O retorno SHALL ser "Desenho da planta <nome> substituído.". O mapa aberto dessa planta SHALL passar ao desenho novo sem recarregar a página.

#### Scenario: Desenho corrigido
- **WHEN** quem edita o mapa substitui o desenho da planta "Jundiaí", com 12 ativos posicionados, por um DXF novo com as mesmas medidas
- **THEN** o mapa mostra o desenho novo com os 12 ativos nos mesmos pontos, e a auditoria registra as contagens de antes e de depois

#### Scenario: Arquivo recusado na substituição
- **WHEN** alguém envia um PDF para substituir o desenho
- **THEN** o envio é recusado com "Envie o desenho em DXF ou o modelo da planta em JSON.", e a planta continua com o desenho de antes

#### Scenario: Planta que falhou, corrigida
- **WHEN** quem edita o mapa envia um DXF válido para a planta "Anexo", que estava com a situação "Falhou"
- **THEN** a planta passa a "Ativa" e abre no mapa

#### Scenario: Posições fora do desenho novo
- **WHEN** o desenho novo é menor que o de antes, e 3 ativos estavam posicionados além da área nova
- **THEN** a tela avisa "3 posições ficaram fora do desenho novo. Reposicione-as no mapa.", e os 3 continuam posicionados
