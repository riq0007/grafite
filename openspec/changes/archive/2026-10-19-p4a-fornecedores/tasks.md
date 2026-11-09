## 1. Domínio

- [x] 1.1 Escrever primeiro os testes e depois o fornecedor no domínio (design, decisão 1): a conferência campo a campo com as mensagens da spec, o nome normalizado, o CNPJ pelos dígitos verificadores, guardado com os 14 algarismos e escrito com a pontuação, o e-mail e os limites dos textos. Verificar: os testes do domínio passam com os cenários "Nome repetido", "CNPJ com a pontuação" e "CNPJ com o dígito errado".
- [x] 1.2 Escrever primeiro os testes e depois o tipo de campo fornecedor (decisão 3): o tipo na lista do motor de campos e na do banco, com a checagem na migration, a leitura do identificador, a coluna da tabela com o filtro de escolha, a resolução pelo texto na importação, pelo CNPJ e pelo nome normalizado, e a recusa "Fornecedor não encontrado: <texto>.". Verificar: os testes do domínio passam com os cenários "Fornecedor pelo CNPJ" e "Fornecedor que não existe".
- [x] 1.3 Escrever primeiro os testes e depois `fornecedores.ver` e `fornecedores.editar` no catálogo de permissões, as ações dos fornecedores na auditoria, com os rótulos, e o evento `fornecedores.mudaram`, para toda a organização. Verificar: os testes do domínio passam com o cenário "Permissão nova no Administrador", com as dezesseis.

## 2. Banco

- [x] 2.1 Escrever primeiro o teste de integração e depois a tabela dos fornecedores na migration (decisão 2): o RLS forçado, o nome normalizado e o CNPJ únicos na organização, o CNPJ só entre os preenchidos, e as checagens. Verificar: os testes de integração do banco passam, com o teste-guarda do RLS.
- [x] 2.2 Escrever primeiro o teste de integração e depois a troca do texto pela referência na mesma migration (decisão 4): as grafias juntas pelo nome mais usado, a origem e a trava de cada valor, o texto em branco, a auditoria pelo sistema, os filtros salvos nas visões e nas mudanças da conta e o RLS forçado de volta. Verificar: os testes de integração passam com os cenários "Grafias do mesmo fornecedor", "Fornecedor travado" e "Visão com o filtro do fornecedor", e rodar a troca de novo não muda nada.

## 3. API

Cada tarefa entra com os esquemas das rotas dela e o cliente gerado de novo (`pnpm contrato:gerar`).

- [x] 3.1 Escrever primeiro o teste de integração e depois as rotas dos fornecedores (decisão 5): a lista com a busca pelo nome e pelo CNPJ, a situação e o cursor, a ficha, o cadastro, a edição, a inativação e a reativação, com as recusas no campo, a auditoria, o evento e o 403. Verificar: os testes de integração passam com os cenários "Nome repetido", "Edição sem a permissão", "Fornecedor inativado com ativos" e "CNPJ informado depois".
- [x] 3.2 Escrever primeiro o teste de integração e depois a lista para escolher e os ativos do fornecedor (decisões 5 e 6): `GET /fornecedores/escolha` para quem edita ativos, vê os fornecedores ou administra o catálogo, e a contagem dos ativos ativos do fornecedor no escopo de quem vê. Verificar: os testes de integração passam com os cenários "Escolher sem ver a Administração" e "Ativos da HP Brasil".
- [x] 3.3 Escrever primeiro o teste de integração e depois o fornecedor no ativo (decisão 3): a gravação com o fornecedor ativo, a recusa do inativo, a leitura com o nome atual e "(inativo)", a ordenação pelo nome, o filtro "é qualquer de", a origem `fornecedor` da tabela e a importação pelo CNPJ e pelo nome. Verificar: os testes de integração passam com os cenários "Fornecedor renomeado", "Fornecedor pelo CNPJ" e "Fornecedor que não existe".

## 4. Web

- [x] 4.1 Escrever primeiro os testes e depois a seção Fornecedores da Administração (decisões 6 e 7): o item no menu, a lista com a busca e o filtro da situação, "Novo fornecedor", a ficha com a edição, a inativação confirmada e a reativação, os retornos, quem só vê, "Ativos deste fornecedor" com "Ver na tabela", que abre a tabela com a origem do fornecedor e a faixa dela, e o Novo fornecedor numa aba, pelo alvo `fornecedor` nos cadastros do registro, que devolve o fornecedor criado ao campo. Verificar: os testes da web passam com os cenários "Primeiro fornecedor", "Busca pelo CNPJ", "Quem só vê", "Conta só com os fornecedores" e "CNPJ recusado na aba".
- [x] 4.2 Escrever primeiro os testes e depois o fornecedor no ativo na web (decisões 3 e 7):
  - a escolha entre os ativos na etapa Administrativo do cadastro e no cartão Administrativo da ficha, com o nome levado ao rascunho;
  - "Cadastrar novo fornecedor" embaixo do campo, pelo `CampoComCadastro`;
  - o nome no resumo do cartão, pelas referências da ficha;
  - o nome como referência que leva à ficha do fornecedor;
  - a coluna e o filtro "é qualquer de";
  - o tipo fornecedor nos campos da organização.

  Verificar: os testes da web passam com os cenários "Fornecedor renomeado", "Escolher sem ver a Administração", "Campo da organização do tipo fornecedor", "Fornecedor criado pelo campo" e "Fornecedor criado pelo campo do ativo".

## 5. Ponta a ponta

- [x] 5.1 A ponta a ponta com a API simulada: a seção Fornecedores com o cadastro, a recusa do CNPJ errado e a inativação; o ativo com o fornecedor escolhido no cartão Administrativo, pelos ajudantes das etapas e dos cartões, filtrado na tabela e aberto pela origem; e o Novo fornecedor pedido pelo campo, numa aba, de volta com o fornecedor escolhido. Verificar: `pnpm test:e2e` passa.
- [x] 5.2 A ponta a ponta da pilha: a administradora cadastra a "HP Brasil" com o CNPJ, escolhe-a como fornecedor da PAT-00412 no cartão Administrativo e a vê na ficha do fornecedor, em "Ativos deste fornecedor". Verificar: `pnpm test:e2e:pilha` passa.

## 6. Fechamento

- [x] 6.1 Atualizar a documentação:
  - a spec mestre: a divisão do P4 (seção 3.2), os fornecedores no mapa do domínio (seção 5.1) e o fornecedor do ativo como cadastro (seção 5.4);
  - o runbook, com a troca do fornecedor na atualização e o que conferir depois;
  - o contrato de módulo (`docs/casca/modulos.md`), com o tipo de campo fornecedor, a origem da tabela e o alvo `fornecedor` no trecho do `AlvoDoCadastro`;
  - o mapa (`docs/mapa.md`), com a change e o glossário.

  Verificar: `pnpm test` passa, com o teste-guarda do mapa e o dos trechos do contrato.
- [x] 6.2 Conferir as verificações: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:stories`, `pnpm test:e2e`, `pnpm test:e2e:pilha` e `pnpm test:visual` verdes; `contrato:verificar` em dia; `openspec validate p4a-fornecedores --strict` sem erros. Verificar: os comandos passam, e o CI do PR fica verde.
