## Why

Depois da `cabecalhos-e-fichas` e da `rolagem-das-tabelas`, uma auditoria das 76 telas do `pnpm dev`, de todos os módulos, mediu oito critérios em cada uma: o título no cabeçalho, as ações à direita, as seções no carimbo, os dados na lista de dados, a tabela larga esmaecida, a janela sem rolagem lateral, o console sem erro e o cabeçalho antigo de módulo. Ela achou o que ainda destoa:
- **o título solto em 83 lugares, de 45 arquivos:** os estados de carregamento, de erro, vazio e sem acesso mostram o título sem a linha do cabeçalho, que só aparece depois de carregar. As Etiquetas sem ativo escolhido, por exemplo, abrem assim;
- **a Conta, nos Ajustes:** as partes ficam em subtítulos em negrito e os dados em listas feitas à mão, ao contrário das partes e dos dados da Administração;
- **o título da etapa do cadastro em etapas:** fica em negrito, enquanto os blocos da ficha do mesmo ativo usam o carimbo;
- **nenhuma verificação automática:** uma tela nova pode voltar com o título solto.

Esta change segue o subprojeto D1 · Linguagem visual v3 da spec mestre, nas telas. Ficam fora dela:
- o Início, feito de blocos que a conta ordena, em que o título da janela é o do bloco "O que resolver agora";
- os títulos dos cartões, como os dos indicadores e os dos painéis, que nomeiam o cartão e não uma seção da tela.

## What Changes

- **O cabeçalho em todos os estados:** os estados de carregamento, de erro, vazio e sem acesso também mostram o título no `CabecalhoDaPagina`, e a linha embaixo dele fica no lugar desde o primeiro quadro.
- **O teste-guarda:** um teste reprova o título da janela solto nas telas da web, fora do Início.
- **A Conta nos Ajustes:** as partes passam ao desenho do carimbo, e os dados, à lista de dados.
- **O título da etapa:** passa ao desenho do carimbo, sem trocar o elemento, que continua recebendo o foco ao mudar de etapa.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `componentes-base`: o cabeçalho da página vale em todos os estados da tela, com o teste-guarda.

## Impact

- `apps/web/src`: as telas com o título solto, a Conta dos Ajustes, o cadastro em etapas e o teste-guarda novo.
- Nenhuma mudança na API nem no `packages/ui`.
