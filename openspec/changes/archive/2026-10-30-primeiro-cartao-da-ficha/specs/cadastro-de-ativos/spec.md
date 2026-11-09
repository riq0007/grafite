## MODIFIED Requirements

### Requirement: Aba Dados em cartões

À esquerda da aba Dados, a lista dos cartões (spec componentes-base, "Etapas de um formulário", sem a numeração) SHALL mostrar, em cada cartão, o nome do grupo e o resumo dele em texto:
- **Visão geral:** os resumos dos blocos dos módulos, como "1 alerta aberto", separados por " · "; sem nenhum, "Nada pede atenção";
- **capacidade com painel:** a situação do painel, nos textos das colunas da tabela: "Offline" na disponibilidade, o suprimento mais baixo, como "18% · Black Toner Cartridge", nos suprimentos, e "Respondendo" no Control iD; sem leitura, "Não verificado". Nos consumíveis compatíveis, os códigos dos dois primeiros, como "CF258A · CF258X", com "e mais N" quando há outros; "Nenhum compatível", sem nenhum, e "Sem modelo", no ativo sem modelo;
- **outros cartões:** os valores dos dois primeiros campos preenchidos, separados por " · ", como "Em uso · Jundiaí › Expedição", ou "Nada preenchido". O valor restrito que a conta não vê SHALL NOT entrar no resumo.

Com um campo obrigatório vazio, como num ativo importado, o cartão SHALL dizer "Falta: <campo>", com "e mais N" quando há outros, no lugar do resumo.

O primeiro cartão SHALL ser, entre os que a ficha mostra:
- o que o tipo escolheu (spec catalogo-de-ativos, "Primeiro cartão da ficha");
- sem a escolha, ou com o escolhido fora da ficha, o da capacidade principal do tipo, nesta ordem: Suprimentos e contadores, Saúde do Control iD, Inventário de hardware e Disponibilidade na rede;
- sem nenhum deles, a Visão geral.

O primeiro cartão SHALL ficar no alto da lista, e a Visão geral logo depois dele, quando não é ela. Os outros SHALL seguir na ordem da ficha. A ficha SHALL abrir no primeiro cartão. O cartão aberto SHALL ficar no endereço, como a aba, menos o primeiro, e recarregar a página SHALL voltar nele.

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
- **WHEN** alguém abre a ficha da impressora PAT-00412, de um tipo com o grupo "Rede" e os suprimentos e contadores, sem escolha do primeiro cartão
- **THEN** a lista mostra Suprimentos e contadores, Visão geral, Identificação, Uso, Rede e Administrativo, nessa ordem, com os suprimentos abertos

#### Scenario: Primeiro cartão escolhido no tipo
- **WHEN** o tipo "Impressora" escolhe a Visão geral como primeiro cartão, e alguém abre a PAT-00412
- **THEN** a lista mostra Visão geral, Identificação, Uso, Rede, Suprimentos e contadores e Administrativo, com a Visão geral aberta

#### Scenario: Tipo sem capacidade com cartão
- **WHEN** alguém abre a ficha de um monitor, de um tipo sem capacidade
- **THEN** a ficha abre na Visão geral, como antes

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

#### Scenario: Visão geral no endereço
- **WHEN** alguém abre a Visão geral da PAT-00412, que abre nos suprimentos, e recarrega a página
- **THEN** a ficha volta com a Visão geral aberta

#### Scenario: Imagem no painel
- **WHEN** quem edita o ativo abre o cartão Uso da PAT-00412, sem imagem própria e com a imagem do modelo
- **THEN** o painel mostra a imagem do modelo ao lado dos campos, com "Trocar imagem"

#### Scenario: Campos do cartão lado a lado
- **WHEN** quem edita o ativo abre o cartão Administrativo da PAT-00412 numa janela de 1366 px, com o dock embaixo
- **THEN** os campos ficam lado a lado, em mais de uma coluna, como na etapa Administrativo do cadastro
