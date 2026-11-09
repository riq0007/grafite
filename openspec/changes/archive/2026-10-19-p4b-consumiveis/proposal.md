## Why

O P4 · Operação (spec mestre, seção 3.2) traz o estoque, as solicitações e as ordens de serviço, e todos eles falam de consumíveis: o toner que se pede, o que entra e sai do estoque, o cilindro trocado numa OS. Hoje o Grafite não sabe o que é um consumível. O PMG também não sabia: cada item da solicitação de toner era só uma cor (spec `solicitacoes-toner` do PMG), sem o código, o rendimento nem os modelos em que o toner serve.

O P4b · Consumíveis é a segunda change do P4, depois do P4a · Fornecedores. Ele cria o catálogo dos consumíveis da organização e a compatibilidade deles com os modelos. Assim, o estoque (P4c), as solicitações (P4d) e as OS (P4e) já nascem apontando para o mesmo consumível. Ele também abre o módulo opcional Operação, onde o resto do P4 vai morar.

Ficam fora desta change:
- o estoque, o saldo e o mínimo, que são do P4c;
- o pedido de toner e as outras solicitações, que são do P4d;
- as peças da OS, que são do P4e;
- as páginas por toner, que são do P4f e vão usar o rendimento cadastrado aqui;
- o preço e o código do consumível em cada fornecedor;
- a importação dos consumíveis por planilha e a migração dos toners do PMG, que é do P8;
- a busca dos consumíveis pelo código no Ctrl+K e o Novo consumível numa aba, pedido pelo campo de outro módulo, que entram com o estoque;
- os consumíveis na ficha do fornecedor.

## What Changes

- **O catálogo dos consumíveis,** na organização:
  - o código do fabricante, como CF258A, obrigatório e único na organização sem diferenciar maiúsculas, espaços e hífens;
  - o nome, opcional, como "HP 58A";
  - o tipo, de uma lista fixa: toner, cilindro, tinta, fita, kit de manutenção ou outro;
  - a cor, opcional, de uma lista fixa: preto, ciano, magenta, amarelo ou colorido;
  - o rendimento em páginas, opcional;
  - os fornecedores que o vendem, entre os do P4a, com "Cadastrar novo fornecedor" no cadastro;
  - a inativação e a reativação, sem excluir;
  - a auditoria e o evento que atualiza as telas.
- **A compatibilidade com os modelos:**
  - a capacidade `consumiveis.compatibilidade` passa a ter código;
  - os modelos dos tipos que a ligam podem ter consumíveis compatíveis, escolhidos na ficha do consumível;
  - a ficha do modelo mostra os consumíveis compatíveis;
  - a ficha do ativo mostra os do modelo dele, no cartão da capacidade, com os códigos no resumo;
  - quem vê o modelo ou o ativo vê os compatíveis, como referência, sem a permissão dos consumíveis.
- **O módulo opcional Operação,** no dock, depois do Alertas e antes do Cofre:
  - a seção Consumíveis, com a lista, a busca pelo código e pelo nome, os filtros do tipo, da cor e da situação, "Novo consumível" e a ficha;
  - "Novo consumível" também na busca (Ctrl+K).
  - Ele começa ligado, como os outros opcionais.
- **As permissões:** `consumiveis.ver` e `consumiveis.editar`, na organização inteira.

## Capabilities

### New Capabilities

- `consumiveis`: o consumível da organização, com o código único, o tipo, a cor, o rendimento e os fornecedores; a inativação e a reativação; quem vê e quem edita; a compatibilidade com os modelos.
- `modulo-operacao`: o módulo Operação na casca, com a seção Consumíveis, a lista, o cadastro e a ficha, os consumíveis compatíveis na ficha do modelo e a atualização pelos eventos.

### Modified Capabilities

- `catalogo-de-ativos`: a capacidade `consumiveis.compatibilidade`, sem campos, na lista das capacidades com código.
- `cadastro-de-ativos`: os consumíveis compatíveis na ficha do ativo, no cartão da capacidade.
- `modulos-da-organizacao`: o Operação entre os módulos opcionais.
- `permissoes`: `consumiveis.ver` e `consumiveis.editar` no catálogo.
- `auditoria`: os eventos dos consumíveis.
- `eventos-em-tempo-real`: o evento dos consumíveis.

## Impact

- **`packages/domain`:**
  - o consumível, com o código normalizado e os limites;
  - o tipo e a cor;
  - a capacidade nova;
  - o módulo opcional;
  - as permissões, as ações da auditoria e o evento.
- **`packages/db`:** a tabela dos consumíveis e a dos fornecedores e a dos modelos de cada um, com RLS, numa migration nova.
- **`apps/api`:**
  - as rotas dos consumíveis, com a compatibilidade e os fornecedores;
  - os consumíveis compatíveis na ficha do modelo e na do ativo;
  - o contrato e o cliente gerados de novo.
- **`apps/web`:**
  - o módulo Operação, com a seção Consumíveis;
  - a relação na ficha do modelo;
  - o cartão da capacidade na ficha do ativo.
- **Documentação:** a spec mestre (seções 3.2, 5.1 e 5.4), o contrato de módulo e o mapa.
- **Dependências:** nenhuma nova.
