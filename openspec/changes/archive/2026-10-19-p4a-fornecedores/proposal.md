## Why

O P4 · Operação (spec mestre, seção 3.2) traz os fornecedores, os consumíveis, o estoque, as solicitações e as ordens de serviço. Tudo isso fala de fornecedores: quem vende o toner, quem faz a assistência, quem aluga a impressora. Hoje o fornecedor do ativo é um texto livre, o que a spec mestre previa só até o P4 (seção 5.4), e o mesmo erro que a seção 13.2 manda não repetir com o solicitante e o local: "HP", "H.P. Brasil" e "hp" viram três fornecedores, e nenhuma lista os junta.

O P4a · Fornecedores é a primeira change do P4. Ele cria o cadastro dos fornecedores da organização e faz do fornecedor do ativo uma referência a ele, para os consumíveis (P4b), o estoque (P4c) e as ordens de serviço (P4e) já nascerem com o fornecedor cadastrado.

O P4 é entregue em seis changes, nesta ordem: o P4a · Fornecedores, o P4b · Consumíveis, o P4c · Estoque, o P4d · Solicitações, o P4e · Ordens de serviço e o P4f · Indicadores da operação. A divisão entra na seção 3.2 da spec mestre.

Ficam fora desta change:
- o contrato do ativo, que continua texto até o A2 (spec mestre, seção 5.4);
- os contatos múltiplos por fornecedor e o endereço completo: um contato principal, o e-mail e o telefone bastam para a operação;
- o fornecedor nos consumíveis, no estoque e nas ordens de serviço, que entram nas changes deles;
- a consulta do CNPJ num serviço de fora: o CNPJ é conferido pelos dígitos.

## What Changes

- **O cadastro dos fornecedores,** na Administração, com o nome, único na organização, o CNPJ opcional, conferido pelos dígitos e único, o contato, o e-mail, o telefone e as observações; a inativação e a reativação, sem excluir; a auditoria e o evento que atualiza as telas.
- **A seção Fornecedores da Administração,** com a lista, a busca pelo nome e pelo CNPJ, o filtro da situação, "Novo fornecedor" e a ficha, que mostra quantos ativos têm aquele fornecedor e leva à tabela dos ativos filtrada por ele.
- **O tipo de campo fornecedor,** como os de pessoa, local e ativo: guarda o identificador do fornecedor, escolhe entre os ativos, mostra o nome atual e é lido da planilha pelo nome ou pelo CNPJ. Os campos da organização também podem usá-lo. Embaixo do campo, quem edita os fornecedores tem "Cadastrar novo fornecedor", que abre o Novo fornecedor numa aba da janela e volta com ele escolhido, como o local e a pessoa (change cadastro-em-abas).
- **O fornecedor no cadastro em etapas e na ficha em cartões:** fica na etapa e no cartão Administrativo, pelo nome, que o rascunho do cadastro guarda e o resumo do cartão mostra.
- **O fornecedor do ativo como cadastro:**
  - o campo comum Fornecedor passa a ser do tipo fornecedor;
  - a migration cria um fornecedor para cada nome que os ativos já têm, sem diferenciar acento, maiúsculas e espaços, e troca o texto pela referência, guardando a origem, o momento, o autor e a trava de cada valor;
  - a tabela dos ativos mostra e filtra o fornecedor pelo cadastro.
- **As permissões:** `fornecedores.ver` e `fornecedores.editar`, na organização inteira; quem edita os ativos escolhe entre os fornecedores ativos sem precisar de `fornecedores.ver`, como faz com o responsável.

## Capabilities

### New Capabilities

- `fornecedores`: o cadastro dos fornecedores da organização, com o nome e o CNPJ únicos, o contato, a inativação e a reativação, quem vê e quem edita, a escolha do fornecedor por quem edita os ativos e o Novo fornecedor numa aba.

### Modified Capabilities

- `campos-personalizados`: o tipo de campo fornecedor.
- `cadastro-de-ativos`: o campo comum Fornecedor do tipo fornecedor, a referência ao fornecedor ativo, a migração do texto e "Cadastrar novo fornecedor" embaixo do campo.
- `importacao-de-ativos`: o fornecedor lido da planilha pelo nome ou pelo CNPJ.
- `modulo-administracao`: a seção Fornecedores, no menu e na tela.
- `permissoes`: `fornecedores.ver` e `fornecedores.editar` no catálogo.
- `auditoria`: os eventos dos fornecedores.
- `eventos-em-tempo-real`: o evento dos fornecedores.

## Impact

- **`packages/domain`:** o fornecedor, com o nome, o CNPJ e o e-mail conferidos; o tipo de campo fornecedor no motor de campos e na importação; as permissões; as ações da auditoria; o evento.
- **`packages/db`:** a tabela dos fornecedores, com RLS, e a migration que cria os fornecedores dos nomes dos ativos e troca o texto pela referência (a 0034 e a 0035).
- **`apps/api`:** as rotas dos fornecedores e a lista para escolher; o fornecedor nas referências do ativo, na tabela, nos filtros e na importação; o contrato e o cliente gerados de novo.
- **`apps/web`:** a seção Fornecedores da Administração e o Novo fornecedor nos cadastros do registro; a escolha, com o link de cadastro, a exibição, o resumo do cartão e o filtro do fornecedor no ativo.
- **Documentação:** a spec mestre (seções 3.2, 5.1 e 5.4), o contrato de módulo, com o alvo `fornecedor` nos cadastros, e o mapa.
- **Dependências:** nenhuma nova.
