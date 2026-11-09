## MODIFIED Requirements

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

O título da tela, como "Novo ativo" ou "Novo ativo em Expedição", SHALL aparecer acima das etapas só quando a janela não tem a barra de abas. Com a barra, a primeira aba já mostra esse título: ele SHALL sair da vista e continuar como o título da tela para o leitor de tela e para o foco depois da navegação. Quando a barra some, o título SHALL voltar.

Cada etapa SHALL dizer em texto como está:
- o Tipo e o Modelo, o nome escolhido; sem ele, o Tipo diz "Falta escolher", e o Modelo, que não é obrigatório, "Opcional";
- as outras, "Falta: <campo>" com o primeiro campo obrigatório vazio, e "e mais N" quando há outros; "Preenchida" com os obrigatórios preenchidos; e "Opcional" quando a etapa não tem campo obrigatório e nada foi preenchido nela.

À direita, o painel da etapa escolhida SHALL mostrar o nome dela, a imagem do modelo escolhido, ou, sem ela, o ícone do tipo, e, ao lado da imagem, os campos da etapa, com o estado e a trava de cada um (requisito "Origem, momento, autor e trava"). Na etapa Modelo, o modelo SHALL ser procurado pelo nome ou pelo fabricante, entre os modelos ativos do tipo, e o painel SHALL mostrar o fabricante do escolhido e o tipo.

Os campos do painel SHALL ficar lado a lado enquanto couberem, cada um com pelo menos 240 px de largura, e um embaixo do outro quando não cabem dois. O texto longo, a lista múltipla, o arquivo e a imagem SHALL ocupar a linha inteira. A ordem do Tab e do leitor de tela SHALL seguir a ordem dos campos, linha por linha.

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

#### Scenario: Título sem a barra de abas
- **WHEN** a pessoa abre o Novo ativo, sem nenhuma outra aba aberta na janela
- **THEN** o título "Novo ativo" aparece acima das etapas

#### Scenario: Título com a barra de abas
- **WHEN** a pessoa escolhe "Cadastrar novo modelo" na etapa Modelo
- **THEN** a barra mostra as abas "Novo ativo" e "Novo modelo", o título sai de cima das etapas, e o leitor de tela continua achando o título "Novo ativo"; fechada a aba "Novo modelo", o título volta acima das etapas

#### Scenario: Campos lado a lado
- **WHEN** a pessoa abre a etapa Administrativo numa janela de 1366 px, com o dock embaixo
- **THEN** os campos ficam lado a lado, em mais de uma coluna, na ordem da etapa, linha por linha

#### Scenario: Campos no celular
- **WHEN** a pessoa abre a etapa Administrativo numa janela de 390 px
- **THEN** os campos ficam um embaixo do outro

#### Scenario: Texto longo na linha inteira
- **WHEN** o tipo tem, no grupo "Detalhes", o campo "Observações", de texto longo, e mais dois campos de texto, e a pessoa abre a etapa Detalhes numa janela de 1366 px
- **THEN** as Observações ocupam a linha inteira, e os outros dois campos ficam lado a lado

### Requirement: Aba Dados em cartões

À esquerda da aba Dados, a lista dos cartões (spec componentes-base, "Etapas de um formulário", sem a numeração) SHALL mostrar, em cada cartão, o nome do grupo e o resumo dele em texto:
- **Visão geral:** os resumos dos blocos dos módulos, como "1 alerta aberto", separados por " · "; sem nenhum, "Nada pede atenção";
- **capacidade com painel:** a situação do painel, nos textos das colunas da tabela: "Offline" na disponibilidade, o suprimento mais baixo, como "18% · Black Toner Cartridge", nos suprimentos, e "Respondendo" no Control iD; sem leitura, "Não verificado". Nos consumíveis compatíveis, os códigos dos dois primeiros, como "CF258A · CF258X", com "e mais N" quando há outros; "Nenhum compatível", sem nenhum, e "Sem modelo", no ativo sem modelo;
- **outros cartões:** os valores dos dois primeiros campos preenchidos, separados por " · ", como "Em uso · Jundiaí › Expedição", ou "Nada preenchido". O valor restrito que a conta não vê SHALL NOT entrar no resumo.

Com um campo obrigatório vazio, como num ativo importado, o cartão SHALL dizer "Falta: <campo>", com "e mais N" quando há outros, no lugar do resumo.

A Visão geral SHALL abrir primeiro. O cartão aberto SHALL ficar no endereço, como a aba, e recarregar a página SHALL voltar nele.

À direita, o painel do cartão aberto SHALL mostrar:
- o nome do grupo;
- a imagem do ativo, ou a do modelo, ou o ícone do tipo, com "Trocar imagem" para quem edita o ativo (requisito "Imagem do ativo");
- ao lado da imagem, o conteúdo do cartão: os blocos e os segredos na Visão geral, o painel na capacidade e os campos, cada um com o estado e a trava.

Os campos do cartão SHALL ficar lado a lado com a mesma regra do cadastro (requisito "Cadastro do ativo em etapas"): enquanto couberem, cada um com pelo menos 240 px de largura, e com o texto longo, a lista múltipla, o arquivo e a imagem na linha inteira.

O salvar SHALL seguir estas regras:
- "Salvar alterações" grava o que mudou em qualquer cartão, numa gravação só;
- embaixo da lista, a ficha diz "Nenhuma alteração", "1 alteração não salva" ou "N alterações não salvas";
- uma recusa da API abre o cartão do primeiro campo recusado, com a recusa nele e o foco nele;
- trocar de cartão SHALL NOT descartar o que foi digitado.

Quem só vê o ativo SHALL ver os cartões e os painéis só para leitura, sem "Salvar alterações" e sem a contagem.

#### Scenario: Cartões de uma impressora
- **WHEN** alguém abre a ficha da impressora PAT-00412, de um tipo com o grupo "Rede" e os suprimentos e contadores
- **THEN** a lista mostra Visão geral, Identificação, Uso, Rede, Suprimentos e contadores e Administrativo, nessa ordem, com a Visão geral aberta

#### Scenario: Resumo dos cartões
- **WHEN** a PAT-00412 está em uso na Expedição, com o Black Toner Cartridge em 18% e um alerta aberto
- **THEN** o Uso diz "Em uso · Jundiaí › Expedição", os suprimentos dizem "18% · Black Toner Cartridge", e a Visão geral diz "1 alerta aberto"

#### Scenario: Resumo dos consumíveis compatíveis
- **WHEN** a PAT-00412 é de um modelo com os toners CF258A e CF258X e o cilindro CF232A compatíveis
- **THEN** o cartão "Consumíveis compatíveis" diz "CF258A · CF258X e mais 1"

#### Scenario: Obrigatório vazio
- **WHEN** a impressora importada PAT-00900 está sem o IP, que o tipo exige
- **THEN** o cartão Rede diz "Falta: IP"

#### Scenario: Salvar o que mudou em dois cartões
- **WHEN** quem edita o ativo muda o hostname em Identificação e o local em Uso
- **THEN** a lista diz "2 alterações não salvas", e "Salvar alterações" grava os dois numa gravação só, com "Ativo salvo."

#### Scenario: Recusa abre o cartão do campo
- **WHEN** a API recusa o patrimônio repetido ao salvar, com o cartão Uso aberto
- **THEN** o cartão Identificação abre, com a recusa no Patrimônio e o foco nele

#### Scenario: Cartão no endereço
- **WHEN** alguém abre o cartão Rede da ficha da PAT-00412 e recarrega a página
- **THEN** a ficha volta com o cartão Rede aberto

#### Scenario: Imagem no painel
- **WHEN** quem edita o ativo abre o cartão Uso da PAT-00412, sem imagem própria e com a imagem do modelo
- **THEN** o painel mostra a imagem do modelo ao lado dos campos, com "Trocar imagem"

#### Scenario: Campos do cartão lado a lado
- **WHEN** quem edita o ativo abre o cartão Administrativo da PAT-00412 numa janela de 1366 px, com o dock embaixo
- **THEN** os campos ficam lado a lado, em mais de uma coluna, como na etapa Administrativo do cadastro
