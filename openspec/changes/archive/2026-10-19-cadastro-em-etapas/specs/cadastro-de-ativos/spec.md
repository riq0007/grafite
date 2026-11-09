## ADDED Requirements

### Requirement: Cadastro do ativo em etapas

O cadastro do ativo SHALL ser feito em etapas. À esquerda, a lista das etapas (spec componentes-base, "Etapas de um formulário") SHALL seguir a ordem dos grupos da ficha:
1. Tipo, entre os tipos ativos;
2. Modelo, entre os modelos ativos do tipo;
3. Identificação, com os outros campos dela;
4. Uso;
5. uma etapa para cada grupo dos campos da organização, na ordem do tipo, e "Outros" para os campos sem grupo;
6. uma etapa para cada capacidade ligada que tem campos a preencher;
7. Administrativo.

Antes de o tipo ser escolhido, as outras etapas SHALL aparecer sem a escolha, com "Escolha o tipo antes".

Cada etapa SHALL dizer em texto como está:
- o Tipo e o Modelo, o nome escolhido; sem ele, o Tipo diz "Falta escolher", e o Modelo, que não é obrigatório, "Opcional";
- as outras, "Falta: <campo>" com o primeiro campo obrigatório vazio, e "e mais N" quando há outros; "Preenchida" com os obrigatórios preenchidos; e "Opcional" quando a etapa não tem campo obrigatório e nada foi preenchido nela.

À direita, o painel da etapa escolhida SHALL mostrar o nome dela, a imagem do modelo escolhido, ou, sem ela, o ícone do tipo, e, ao lado da imagem, os campos da etapa, com o estado e a trava de cada um (requisito "Origem, momento, autor e trava"). Na etapa Modelo, o modelo SHALL ser procurado pelo nome ou pelo fabricante, entre os modelos ativos do tipo, e o painel SHALL mostrar o fabricante do escolhido e o tipo.

"Voltar" SHALL abrir a etapa anterior, e "Continuar para <nome da próxima etapa>", a seguinte, sem recusar campos vazios; o Enter num campo SHALL continuar, como o botão. A pessoa SHALL poder abrir qualquer etapa pela lista. Ao trocar de etapa, o foco SHALL ir para o nome dela no painel.

Na última etapa, o botão SHALL ser "Cadastrar". Com um campo obrigatório vazio, ou um campo recusado pela API, o cadastro SHALL abrir a primeira etapa com o problema, com a recusa no campo e o foco no primeiro campo recusado, e o resto do que foi preenchido SHALL continuar.

Trocar o tipo com outra etapa já preenchida SHALL pedir confirmação ("Trocar o tipo?"), porque o que foi preenchido nas outras etapas sai.

#### Scenario: Etapas de uma impressora
- **WHEN** quem edita ativos escolhe o tipo "Impressora", que tem os campos do grupo "Rede"
- **THEN** a lista mostra Tipo, Modelo, Identificação, Uso, Rede e Administrativo, nessa ordem

#### Scenario: O que falta em cada etapa
- **WHEN** a impressora exige o IP, no grupo Rede, e ele está vazio, e nada foi preenchido em Administrativo
- **THEN** a etapa Rede diz "Falta: IP", e a etapa Administrativo diz "Opcional"

#### Scenario: Continuar
- **WHEN** a pessoa está na etapa Modelo e escolhe "Continuar para Identificação"
- **THEN** o painel mostra a etapa Identificação, e o foco vai para o nome dela

#### Scenario: Cadastrar com um campo vazio
- **WHEN** a pessoa escolhe "Cadastrar" na etapa Administrativo com o IP vazio
- **THEN** o painel abre a etapa Rede, com a recusa no IP e o foco nele, e o que foi preenchido nas outras etapas continua

#### Scenario: Procurar o modelo
- **WHEN** a pessoa digita "laserjet" na etapa Modelo de uma impressora
- **THEN** a lista traz os modelos ativos de impressora com "LaserJet" no nome, e, escolhido um, o painel mostra o fabricante dele

#### Scenario: Imagem do modelo no painel
- **WHEN** a pessoa escolhe o modelo "HP LaserJet M404", que tem imagem
- **THEN** o painel de cada etapa mostra a imagem do modelo ao lado dos campos; sem modelo, ele mostra o ícone do tipo

#### Scenario: Trocar o tipo
- **WHEN** a pessoa já preencheu o patrimônio e escolhe outro tipo
- **THEN** o cadastro pergunta "Trocar o tipo?", e só troca, limpando as outras etapas, se ela confirmar

### Requirement: Rascunho do cadastro do ativo

O cadastro do ativo SHALL guardar o que foi preenchido num rascunho da conta, no servidor, até 2 s depois da última mudança: o tipo, o modelo, os valores, as travas, a etapa aberta e a origem de onde o cadastro foi aberto. O rascunho SHALL começar quando o tipo é escolhido. Cada conta SHALL ter no máximo um rascunho do cadastro em cada organização. O cadastro SHALL mostrar em texto como está o rascunho: "Guardando o rascunho…", "Rascunho guardado agora", "Rascunho guardado às 14:32" e, quando o servidor não o guarda, "O rascunho não foi guardado.", com "Tentar de novo".

Abrir o Novo ativo com um rascunho guardado SHALL retomar o cadastro de onde ele parou: depois de sair da tela, depois de recarregar a página, depois de sair e entrar de novo e em outro aparelho da mesma conta. Ao retomar, os valores dos campos que o tipo não usa mais, e os dos campos que a conta não pode mais editar, como os restritos sem `ativos.restritos`, SHALL ficar de fora; com o tipo ou o modelo inativado, o cadastro SHALL voltar sem ele, e, sem o tipo, sem os valores. Sem o rascunho lido, por uma falha da API, o cadastro SHALL NOT começar vazio, para não sobrescrever o guardado: ele SHALL mostrar a falha com "Tentar de novo", como sem o catálogo.

"Descartar o rascunho" SHALL pedir confirmação, apagar o rascunho e recomeçar o cadastro vazio. Cadastrar o ativo SHALL apagar o rascunho, na mesma gravação do ativo. Abrir o Novo ativo por uma origem (requisito "Tabela a partir de uma origem") com um rascunho guardado de outra origem, ou de nenhuma, SHALL perguntar "Continuar o cadastro começado?", com "Continuar o começado" e "Começar um novo"; começar um novo SHALL descartar o rascunho, e recarregar a página com a mesma origem SHALL retomar o rascunho dela sem perguntar.

O rascunho SHALL ser só da conta que o guardou: outra conta, mesmo da mesma organização, SHALL NOT lê-lo nem mudá-lo. Ler, guardar e apagar o rascunho SHALL exigir `ativos.editar` em algum escopo. O servidor SHALL recusar o rascunho com mais de 256 KB. O rascunho SHALL NOT entrar na auditoria nem gerar eventos: ele não é um registro do ativo. A anonimização de uma pessoa SHALL apagar o rascunho da conta dela, como apaga as visões da conta.

#### Scenario: Recarregar a página
- **WHEN** a pessoa escolhe o tipo, o modelo e o patrimônio, vê "Rascunho guardado agora" e recarrega a página
- **THEN** o cadastro volta com o tipo, o modelo e o patrimônio, na etapa em que ela estava

#### Scenario: Outro aparelho
- **WHEN** Ana começa o cadastro de um ativo no computador e abre o Novo ativo no celular
- **THEN** o celular retoma o cadastro que Ana começou

#### Scenario: Rascunho de outra conta
- **WHEN** Ana tem um rascunho guardado, e Bruno, da mesma organização, abre o Novo ativo
- **THEN** o cadastro de Bruno começa vazio, sem o rascunho de Ana

#### Scenario: Pessoa anonimizada
- **WHEN** Bruno tinha um rascunho guardado, e a pessoa dele, inativa, é anonimizada
- **THEN** o rascunho de Bruno não existe mais

#### Scenario: Descartar o rascunho
- **WHEN** a pessoa escolhe "Descartar o rascunho" e confirma
- **THEN** o cadastro recomeça vazio, e recarregar a página não traz o rascunho de volta

#### Scenario: Cadastrar apaga o rascunho
- **WHEN** a pessoa cadastra o ativo e depois abre o Novo ativo de novo
- **THEN** o cadastro começa vazio

#### Scenario: Origem com um rascunho guardado
- **WHEN** a pessoa tem um rascunho guardado e escolhe "Novo ativo" na ficha do local "Expedição"
- **THEN** o cadastro pergunta "Continuar o cadastro começado?", e "Começar um novo" abre o cadastro com o local "Expedição" e descarta o rascunho

#### Scenario: Recarregar com a mesma origem
- **WHEN** a pessoa começou um novo cadastro pela ficha do local "Expedição", escolheu o tipo e recarrega a página
- **THEN** o cadastro volta com o local "Expedição" e o tipo, sem perguntar

#### Scenario: Rascunho não guardado
- **WHEN** o servidor não responde enquanto a pessoa preenche
- **THEN** o cadastro mostra "O rascunho não foi guardado." com "Tentar de novo", e o que foi preenchido continua na tela

#### Scenario: Rascunho não lido
- **WHEN** a API falha ao ler o rascunho ao abrir o Novo ativo
- **THEN** o cadastro mostra a falha com "Tentar de novo", e não começa vazio
