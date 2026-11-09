## MODIFIED Requirements

### Requirement: Cabeçalho da página

O catálogo SHALL ter o cabeçalho da página:
- **à esquerda:** a marca opcional, como o ícone do tipo ou a foto da pessoa, o título da janela, os selos ao lado do título e o detalhe opcional embaixo, no texto secundário;
- **à direita:** as ações da tela, lado a lado, na ordem dada, que quebram para baixo quando a largura não comporta.

O título SHALL continuar o título da janela, de nível 1, que recebe o foco ao abrir a tela. Toda tela do app SHALL mostrar o título nesse cabeçalho, também nos estados de carregamento, de erro, vazio e sem acesso. O Início, feito de blocos que a conta ordena, fica de fora. Um teste-guarda SHALL reprovar o título da janela solto nas telas da web.

#### Scenario: Ações à direita
- **WHEN** a ficha da OS 3 mostra o título, o selo "Aberta" e as ações "Mudar a situação", "Lançar peça" e "Resolver"
- **THEN** o título e o selo ficam à esquerda, e as três ações ficam juntas, à direita, na mesma linha

#### Scenario: Detalhe embaixo do título
- **WHEN** a ficha da OS 3 dá o detalhe "PAT-00139 · Impressora 139"
- **THEN** o detalhe aparece embaixo do título, no texto secundário, e o leitor de tela lê o título como nível 1

#### Scenario: Tela carregando
- **WHEN** a ficha da OS 3 ainda está carregando
- **THEN** o título "OS 3" já aparece no cabeçalho da página, com a linha embaixo, e ela continua no mesmo lugar quando a ficha chega

#### Scenario: Espaço depois do cabeçalho
- **WHEN** a ficha da OS 3 carregando mostra o cabeçalho e o aviso "Carregando a ordem de serviço…"
- **THEN** o aviso começa a 4 passos da linha do cabeçalho, como o conteúdo da ficha carregada

#### Scenario: Título oculto com a barra das abas
- **WHEN** o cadastro do ativo, cujo cabeçalho só tem o título que a primeira aba repete, fica atrás da barra das abas
- **THEN** o cabeçalho não deixa faixa nem linha em cima do conteúdo, e o título continua para o leitor de tela e para o foco

#### Scenario: Título solto numa tela nova
- **WHEN** uma tela da web mostra o título da janela fora do cabeçalho da página, fora do Início
- **THEN** o teste-guarda reprova, com o arquivo e a linha do título
