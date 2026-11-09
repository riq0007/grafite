## ADDED Requirements

### Requirement: Consumíveis compatíveis na ficha do ativo

O ativo de um tipo que liga a capacidade `consumiveis.compatibilidade` SHALL ter, na ficha, o cartão "Consumíveis compatíveis", com o painel dos consumíveis compatíveis do modelo dele (spec consumiveis): o código, o nome, o tipo, a cor e o rendimento de cada um, levando à ficha do consumível para quem tem `consumiveis.ver`. O painel SHALL dizer:
- "Escolha o modelo do ativo para ver os consumíveis compatíveis.", no ativo sem modelo;
- "Nenhum consumível compatível com o modelo.", no modelo sem nenhum.

O cartão SHALL aparecer para quem vê o ativo, só com o módulo Operação ligado. O cadastro do ativo em etapas SHALL NOT ter a etapa da capacidade, que não tem campos.

#### Scenario: Toner da impressora
- **WHEN** alguém abre o cartão "Consumíveis compatíveis" da PAT-00412, uma "HP LaserJet M404" com o CF258A compatível
- **THEN** o painel mostra o CF258A, Toner, Preto, com 3.000 páginas

#### Scenario: Impressora sem modelo
- **WHEN** alguém abre a ficha da impressora PAT-00900, sem modelo
- **THEN** o cartão "Consumíveis compatíveis" diz "Sem modelo", e o painel diz "Escolha o modelo do ativo para ver os consumíveis compatíveis."

#### Scenario: Operação desligado
- **WHEN** o módulo Operação está desligado na organização
- **THEN** a ficha da PAT-00412 não mostra o cartão "Consumíveis compatíveis"

## MODIFIED Requirements

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
