## MODIFIED Requirements

### Requirement: Cadastro e ficha do ativo

O cadastro SHALL começar pelo tipo, entre os tipos ativos, e mostrar em seguida os campos dele, nas etapas do cadastro (requisito "Cadastro do ativo em etapas"). Sem nenhum tipo ativo, o cadastro SHALL dizer "Nenhum tipo de ativo ainda." e oferecer a quem cuida do catálogo "Cadastrar novo tipo", que abre o Novo tipo numa aba da janela (spec estrutura-da-casca); o tipo criado SHALL vir escolhido no cadastro do ativo. Os campos de arquivo e de imagem SHALL aparecer no cadastro com "Envie depois de cadastrar o ativo.", sem o envio.

O cabeçalho da ficha SHALL mostrar a imagem do ativo, ou a do modelo, ou o ícone do tipo, o nome do ativo, a situação e o patrimônio, e oferecer "Imprimir etiqueta", que abre a tela das etiquetas com o ativo (spec etiquetas-de-ativos). A ficha SHALL ter as abas Dados, Ligados (spec ligacoes-de-ativos) e Histórico, e a aba aberta SHALL ficar no endereço.

A aba Dados SHALL mostrar os grupos em cartões (requisito "Aba Dados em cartões"), nesta ordem:
1. Visão geral, com os blocos que os outros módulos mostram na ficha do ativo, como o dos alertas (spec modulo-alertas), e os segredos (requisito "Segredos na ficha do ativo");
2. Identificação, com o tipo, só para leitura, e o modelo;
3. Uso;
4. os grupos dos campos da organização, na ordem do tipo, e os campos sem grupo em "Outros";
5. um cartão por capacidade ligada;
6. Administrativo.

No ativo de um tipo com a disponibilidade na rede, o cartão dela SHALL mostrar a situação (spec disponibilidade-de-rede), desde quando ela vale, a idade da última leitura, a latência e o coletor que a fez, ou "Não verificado" com o motivo. No ativo de um tipo com os suprimentos e contadores, o cartão dela SHALL mostrar o painel Suprimentos (spec impressoras-por-snmp). No ativo de um tipo com a saúde do Control iD, o cartão dela SHALL mostrar a situação, desde quando ela vale, a idade da última sondagem, o último contato, a versão do firmware, o produto, de onde vem o login e o coletor, ou "Não verificado" com o motivo (spec saude-do-control-id).

Cada campo SHALL mostrar o estado dele e a trava. As recusas da API SHALL aparecer no próprio campo, e o formulário SHALL continuar preenchido. Quem não pode editar o ativo SHALL ver a ficha só para leitura.

Os retornos SHALL ser "Ativo cadastrado.", "Ativo salvo.", "Ativo inativado." e "Ativo reativado.".

#### Scenario: Primeiro ativo
- **WHEN** quem edita ativos escolhe o tipo "Impressora" no cadastro
- **THEN** o cadastro mostra o modelo, os campos comuns, os campos do tipo e os da capacidade ligada, nas etapas do cadastro

#### Scenario: Sem nenhum tipo
- **WHEN** quem edita ativos e administra o catálogo abre o cadastro sem nenhum tipo ativo e escolhe "Cadastrar novo tipo"
- **THEN** o Novo tipo abre numa aba, e, ao salvar o tipo "Notebook", o cadastro do ativo volta com "Notebook" escolhido e os campos dele

#### Scenario: Ficha só para leitura
- **WHEN** uma conta só com `ativos.ver` abre a ficha de um ativo
- **THEN** ela vê os valores e o estado de cada campo, sem as ações de salvar, travar e inativar

#### Scenario: Aba no endereço
- **WHEN** alguém abre a aba Histórico da ficha da PAT-00412 e recarrega a página
- **THEN** a ficha volta na aba Histórico

#### Scenario: Etiqueta pela ficha
- **WHEN** quem vê ativos escolhe "Imprimir etiqueta" na ficha da PAT-00412
- **THEN** a tela das etiquetas abre com a etiqueta da PAT-00412

#### Scenario: Arquivo no cadastro
- **WHEN** o tipo "Notebook" usa o campo de arquivo "PDF da nota fiscal" e alguém cadastra um notebook
- **THEN** o cadastro mostra o "PDF da nota fiscal" com "Envie depois de cadastrar o ativo.", e a ficha do notebook cadastrado oferece o envio

#### Scenario: Disponibilidade na ficha
- **WHEN** alguém abre a ficha da impressora PAT-00412, offline desde as 10:32 e lida há 1 minuto pelo "Coletor de Jundiaí", e escolhe o cartão "Disponibilidade na rede"
- **THEN** o cartão mostra "Offline", desde 10:32, "há 1 min" e o "Coletor de Jundiaí"

#### Scenario: Suprimentos na ficha
- **WHEN** alguém abre a ficha da impressora PAT-00412, de um tipo com os suprimentos e contadores, e escolhe o cartão "Suprimentos e contadores"
- **THEN** o cartão mostra o painel Suprimentos

#### Scenario: Control iD na ficha
- **WHEN** alguém abre a ficha do controle de acesso PAT-00777, que responde desde 08:00, e escolhe o cartão "Saúde do Control iD"
- **THEN** o cartão mostra "Respondendo", desde 08:00, o último contato e a versão do firmware

## ADDED Requirements

### Requirement: Aba Dados em cartões

À esquerda da aba Dados, a lista dos cartões (spec componentes-base, "Etapas de um formulário", sem a numeração) SHALL mostrar, em cada cartão, o nome do grupo e o resumo dele em texto:
- **Visão geral:** os resumos dos blocos dos módulos, como "1 alerta aberto", separados por " · "; sem nenhum, "Nada pede atenção";
- **capacidade com painel:** a situação do painel, nos textos das colunas da tabela: "Offline" na disponibilidade, o suprimento mais baixo, como "18% · Black Toner Cartridge", nos suprimentos, e "Respondendo" no Control iD; sem leitura, "Não verificado";
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
