## MODIFIED Requirements

### Requirement: Cadastro e ficha do ativo

O cadastro SHALL começar pelo tipo, entre os tipos ativos, e mostrar em seguida os campos dele. Sem nenhum tipo ativo, o cadastro SHALL dizer "Nenhum tipo de ativo ainda." e oferecer a quem cuida do catálogo "Cadastrar novo tipo", que abre o Novo tipo numa aba da janela (spec estrutura-da-casca); o tipo criado SHALL vir escolhido no cadastro do ativo. Os campos de arquivo e de imagem SHALL aparecer no cadastro com "Envie depois de cadastrar o ativo.", sem o envio.

O cabeçalho da ficha SHALL mostrar a imagem do ativo, ou a do modelo, ou o ícone do tipo, o nome do ativo, a situação e o patrimônio, e oferecer "Imprimir etiqueta", que abre a tela das etiquetas com o ativo (spec etiquetas-de-ativos). A ficha SHALL ter as abas Dados, Ligados (spec ligacoes-de-ativos) e Histórico, e a aba aberta SHALL ficar no endereço.

A aba Dados SHALL mostrar os campos nestes grupos, nesta ordem:
1. Identificação, com o tipo, só para leitura, e o modelo;
2. Uso;
3. os grupos dos campos da organização, na ordem do tipo, e os campos sem grupo em "Outros";
4. um grupo por capacidade ligada;
5. Administrativo.

No ativo de um tipo com a disponibilidade na rede, o grupo dela SHALL mostrar a situação (spec disponibilidade-de-rede), desde quando ela vale, a idade da última leitura, a latência e o coletor que a fez, ou "Não verificado" com o motivo. No ativo de um tipo com os suprimentos e contadores, o grupo dela SHALL mostrar o painel Suprimentos (spec impressoras-por-snmp). No ativo de um tipo com a saúde do Control iD, o grupo dela SHALL mostrar a situação, desde quando ela vale, a idade da última sondagem, o último contato, a versão do firmware, o produto, de onde vem o login e o coletor, ou "Não verificado" com o motivo (spec saude-do-control-id).

Cada campo SHALL mostrar o estado dele e a trava. As recusas da API SHALL aparecer no próprio campo, e o formulário SHALL continuar preenchido. Quem não pode editar o ativo SHALL ver a ficha só para leitura.

Os retornos SHALL ser "Ativo cadastrado.", "Ativo salvo.", "Ativo inativado." e "Ativo reativado.".

#### Scenario: Primeiro ativo
- **WHEN** quem edita ativos escolhe o tipo "Impressora" no cadastro
- **THEN** o formulário mostra o modelo, os campos comuns, os campos do tipo e os da capacidade ligada, nos grupos da ficha

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
- **WHEN** alguém abre a ficha da impressora PAT-00412, offline desde as 10:32 e lida há 1 minuto pelo "Coletor de Jundiaí"
- **THEN** o grupo "Disponibilidade na rede" mostra "Offline", desde 10:32, "há 1 min" e o "Coletor de Jundiaí"

#### Scenario: Suprimentos na ficha
- **WHEN** alguém abre a ficha da impressora PAT-00412, de um tipo com os suprimentos e contadores
- **THEN** o grupo "Suprimentos e contadores" mostra o painel Suprimentos

#### Scenario: Control iD na ficha
- **WHEN** alguém abre a ficha do controle de acesso PAT-00777, que responde desde 08:00
- **THEN** o grupo "Saúde do Control iD" mostra "Respondendo", desde 08:00, o último contato e a versão do firmware

## ADDED Requirements

### Requirement: Cadastro pedido por um campo do ativo

No cadastro e na ficha do ativo, quando o campo pode ser editado, cada campo que aponta outro cadastro SHALL mostrar embaixo o link de cadastro (spec componentes-base), que abre o cadastro numa aba da janela (spec estrutura-da-casca):

| Campo | Link | Exige |
|---|---|---|
| Tipo | Cadastrar novo tipo | `catalogo.administrar` |
| Modelo | Cadastrar novo modelo | `modelos.editar` |
| Local e os campos de local do tipo | Cadastrar novo local | `locais.editar` |
| Responsável e os campos de pessoa do tipo | Cadastrar nova pessoa | `pessoas.editar` |

O link SHALL aparecer só para a conta com a permissão, e só com o módulo do cadastro ligado. O Novo modelo pedido pelo campo Modelo SHALL abrir com o tipo do ativo, só para leitura, porque o modelo do ativo é do tipo dele. Ao salvar, o campo que pediu SHALL vir com o registro criado; nos campos de escolha, o registro criado SHALL aparecer entre as opções.

#### Scenario: Responsável criado pelo campo
- **WHEN** quem tem `ativos.editar` e `pessoas.editar` escolhe "Cadastrar nova pessoa" embaixo do Responsável e salva "Ana Souza"
- **THEN** o cadastro do ativo volta com "Ana Souza" no Responsável

#### Scenario: Modelo do tipo do ativo
- **WHEN** alguém cadastra uma impressora e escolhe "Cadastrar novo modelo"
- **THEN** a aba "Novo modelo" abre com o tipo "Impressora", que não muda

#### Scenario: Sem permissão para criar
- **WHEN** uma conta com `ativos.editar` e sem `locais.editar` cadastra um ativo
- **THEN** o campo Local não mostra "Cadastrar novo local", e o resto do cadastro funciona como antes
