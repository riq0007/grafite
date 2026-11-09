## MODIFIED Requirements

### Requirement: Cadastro e ficha do ativo

O cadastro SHALL começar pelo tipo, entre os tipos ativos, e mostrar em seguida os campos dele. Sem nenhum tipo ativo, o cadastro SHALL dizer "Nenhum tipo de ativo ainda." e oferecer o catálogo a quem cuida dele. Os campos de arquivo e de imagem SHALL aparecer no cadastro com "Envie depois de cadastrar o ativo.", sem o envio.

O cabeçalho da ficha SHALL mostrar a imagem do ativo, ou a do modelo, ou o ícone do tipo, o nome do ativo, a situação e o patrimônio, e oferecer "Imprimir etiqueta", que abre a tela das etiquetas com o ativo (spec etiquetas-de-ativos). A ficha SHALL ter as abas Dados, Ligados (spec ligacoes-de-ativos) e Histórico, e a aba aberta SHALL ficar no endereço.

A aba Dados SHALL mostrar os campos nestes grupos, nesta ordem:
1. Identificação, com o tipo, só para leitura, e o modelo;
2. Uso;
3. os grupos dos campos da organização, na ordem do tipo, e os campos sem grupo em "Outros";
4. um grupo por capacidade ligada;
5. Administrativo.

Cada campo SHALL mostrar o estado dele e a trava. As recusas da API SHALL aparecer no próprio campo, e o formulário SHALL continuar preenchido. Quem não pode editar o ativo SHALL ver a ficha só para leitura.

Os retornos SHALL ser "Ativo cadastrado.", "Ativo salvo.", "Ativo inativado." e "Ativo reativado.".

#### Scenario: Primeiro ativo
- **WHEN** quem edita ativos escolhe o tipo "Impressora" no cadastro
- **THEN** o formulário mostra o modelo, os campos comuns, os campos do tipo e os da capacidade ligada, nos grupos da ficha

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

### Requirement: Ações nas linhas dos ativos

O menu de contexto da tabela dos ativos SHALL oferecer:
- "Abrir", com uma linha;
- "Prévia";
- "Copiar linhas";
- "Copiar patrimônio", com uma linha que tem patrimônio, e o retorno "Patrimônio copiado.";
- "Copiar link", com uma linha, que copia o endereço da ficha, com o retorno "Link copiado.";
- "Imprimir etiqueta", com uma linha, ou "Imprimir etiquetas", com várias, que abre a tela das etiquetas com elas (spec etiquetas-de-ativos).

Com linhas selecionadas, a tabela SHALL oferecer também "Imprimir etiquetas", junto da contagem da seleção, com as selecionadas, até 200.

#### Scenario: Copiar o link
- **WHEN** o usuário dá clique direito na linha da PAT-00412 e escolhe "Copiar link"
- **THEN** o endereço da ficha da PAT-00412 fica copiado, e a tela diz "Link copiado."

#### Scenario: Várias linhas
- **WHEN** o usuário abre o menu de contexto sobre três linhas selecionadas
- **THEN** o menu oferece "Prévia", "Copiar linhas" e "Imprimir etiquetas", e não "Abrir", "Copiar patrimônio" nem "Copiar link"

#### Scenario: Etiquetas da seleção
- **WHEN** o usuário seleciona 25 linhas e escolhe "Imprimir etiquetas" junto da contagem da seleção
- **THEN** a tela das etiquetas abre com os 25 ativos, na ordem da tabela

