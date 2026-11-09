## ADDED Requirements

### Requirement: Cabeçalho da página

O catálogo SHALL ter o cabeçalho da página:
- **à esquerda:** a marca opcional, como o ícone do tipo ou a foto da pessoa, o título da janela, os selos ao lado do título e o detalhe opcional embaixo, no texto secundário;
- **à direita:** as ações da tela, lado a lado, na ordem dada, que quebram para baixo quando a largura não comporta.

O título SHALL continuar o título da janela, de nível 1, que recebe o foco ao abrir a tela. Toda tela do app com título e ações SHALL usar esse cabeçalho.

#### Scenario: Ações à direita
- **WHEN** a ficha da OS 3 mostra o título, o selo "Aberta" e as ações "Mudar a situação", "Lançar peça" e "Resolver"
- **THEN** o título e o selo ficam à esquerda, e as três ações ficam juntas, à direita, na mesma linha

#### Scenario: Detalhe embaixo do título
- **WHEN** a ficha da OS 3 dá o detalhe "PAT-00139 · Impressora 139"
- **THEN** o detalhe aparece embaixo do título, no texto secundário, e o leitor de tela lê o título como nível 1

### Requirement: Lista de dados

O catálogo SHALL ter a lista de dados, para o rótulo e o valor de uma ficha: uma lista de definições, com o rótulo no texto secundário, numa coluna de largura fixa, e o valor ao lado. Na largura estreita, o rótulo SHALL ficar em cima do valor. As fichas que mostram dados só para leitura SHALL usá-la.

#### Scenario: Dados da ordem de serviço
- **WHEN** a ficha da OS 3 mostra o ativo, o local, o problema e quando foi aberta
- **THEN** cada rótulo fica numa coluna, no texto secundário, e o valor ao lado, e o leitor de tela lê cada par como termo e definição
