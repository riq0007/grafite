## Context

O fornecedor do ativo é hoje o campo comum `ativo.fornecedor`, do tipo texto, guardado no JSONB `valores` do ativo pela chave, com a origem, o momento, o autor e a trava no JSONB `estado` (design do P1b). O motor de campos já tem três tipos de referência, pessoa, local e ativo: o valor é o identificador do registro, a API confere que ele existe e está ativo ao gravar, resolve o nome ao ler, ordena e filtra por ele na tabela, e a importação o lê pelo texto (P1e). A tabela dos ativos abre a partir de uma origem, como o local e a pessoa, com a faixa e "Limpar origem" (change relacoes-vivas).

A Administração reúne os cadastros da organização em seções, cada uma com a permissão dela. As visões guardam os filtros em JSONB, pela chave da coluna e pelo operador, e as mudanças da conta ainda não salvas ficam numa tabela à parte (change visoes-da-conta).

Depois desta proposta, de 14/10, entraram três changes que mudam onde o fornecedor aparece na web:
- **cadastro-em-abas:** o campo que aponta outro cadastro mostra o link embaixo, que abre o cadastro do outro módulo numa aba da janela, pelos `cadastros` do registro, e volta com o registro criado no campo (`CampoComCadastro`);
- **cadastro-em-etapas:** o cadastro do ativo é em etapas, e o rascunho na conta guarda as entradas e o nome de cada referência escolhida, para o rascunho retomado mostrar o nome;
- **ficha-em-cartoes:** a aba Dados da ficha é em cartões, e o resumo de cada cartão mostra os dois primeiros valores preenchidos, com o nome das referências.

O domínio, o banco e a API desta change foram feitos no branch dela e entraram no dev com as migrations renumeradas: a 0032 e a 0033 dela viraram a 0034 e a 0035, depois das do dev.

## Goals / Non-Goals

**Goals:**
- O fornecedor como um registro só, que o ativo e as próximas changes do P4 referenciam pelo identificador.
- A troca do texto pela referência sem perder a origem, a trava nem os filtros salvos.
- O tipo de campo fornecedor com as mesmas regras na API, nas telas e na importação, como os outros tipos de referência.

**Non-Goals:**
- Os contatos múltiplos, o endereço e os dados bancários do fornecedor.
- A junção de dois fornecedores cadastrados: a troca junta só as grafias do mesmo nome; dois cadastros diferentes do mesmo fornecedor se resolvem trocando os ativos de um pela importação de uma planilha com o patrimônio e o fornecedor, e inativando o outro.
- O contrato do ativo como cadastro (A2).

## Decisions

### 1. O fornecedor no domínio

O domínio confere o fornecedor campo a campo e devolve as mensagens da spec: o nome sem espaços nas pontas, o CNPJ pelos dígitos verificadores, aceito com ou sem a pontuação e guardado com os 14 algarismos, o e-mail pela mesma regra do e-mail da pessoa, e os limites de cada texto. O nome normalizado, sem acento, em minúsculas e com os espaços repetidos juntos, é a chave da unicidade, a mesma que a migração usa para juntar as grafias. O CNPJ escrito com a pontuação sai também do domínio, para a tela e a auditoria.

### 2. A tabela dos fornecedores

A tabela `fornecedores` é da organização, com RLS forçado, e guarda o nome, o nome normalizado, o CNPJ, o contato, o e-mail, o telefone, as observações, a situação e os momentos. A unicidade do nome normalizado e a do CNPJ ficam em índices únicos da organização, o do CNPJ só entre os preenchidos, e as checagens repetem os limites do domínio.

Alternativa descartada: o fornecedor como uma lista da organização, nas opções de um campo. A lista não tem CNPJ nem contato, e os consumíveis, o estoque e as ordens de serviço precisam apontar para o mesmo registro.

### 3. O tipo de campo fornecedor

O tipo `fornecedor` entra no motor de campos ao lado de `pessoa`, `local` e `ativo`, com o mesmo caminho em cada camada:
- **domínio:** o valor é o identificador, e a leitura da planilha pede a resolução pelo texto ao contexto da importação, que procura pelo CNPJ e, depois, pelo nome normalizado, entre os fornecedores ativos;
- **API:** a gravação confere que o fornecedor existe e está ativo, a leitura devolve o nome atual, com "(inativo)" no inativo, a ordenação usa o nome, e o filtro "é qualquer de" recebe os identificadores;
- **web:** a escolha procura entre os fornecedores ativos, pela lista que quem edita ativos lê, e a ficha mostra o nome como referência, que leva à ficha do fornecedor para quem tem `fornecedores.ver`. A escolha passa o nome junto com o identificador, como a da pessoa: o rascunho do cadastro em etapas o guarda, e o resumo do cartão Administrativo o mostra, pelas referências da ficha (`referencias.fornecedores`) quando o valor já está salvo. Embaixo do campo fica "Cadastrar novo fornecedor" (decisão 7).

O campo comum `ativo.fornecedor` só muda de tipo: a chave e o lugar no JSONB continuam os mesmos.

### 4. A troca do texto pela referência na migration

A migration que cria a tabela troca o texto pelos fornecedores, no próprio SQL, como a do Administrador (design do F2b, decisão 8): ela desliga o RLS forçado das tabelas que lê e escreve, cria os fornecedores e troca os valores, e o religa ao fim. Para cada organização:
1. agrupa os textos de `valores->'ativo.fornecedor'` pelo nome normalizado, escolhe o nome mais usado e, no empate, o do ativo mais antigo, e cria um fornecedor ativo para cada grupo;
2. troca, em cada ativo, o texto pelo identificador, sem tocar no `estado`, e tira o texto em branco;
3. registra na auditoria a criação de cada fornecedor pelo sistema;
4. troca o filtro "contém" do fornecedor nas visões e nas mudanças guardadas pelo "é qualquer de" com os fornecedores cujo nome contém o texto, ou o tira.

Cada passo procura só o que ainda é texto, então rodar de novo não muda nada. O teste de integração roda as migrations até a anterior, semeia os ativos com o texto e aplica esta.

Alternativa descartada: a troca por uma tarefa da fila depois da partida. A API passaria a ler o campo em dois formatos até a tarefa terminar, e a tabela e a importação teriam de tratar os dois.

### 5. A lista para escolher

`GET /fornecedores/escolha` devolve os fornecedores ativos, com o identificador, o nome e o CNPJ. Como a árvore de locais e os modelos, ela é uma referência: toda sessão ativa a lê, e quem edita os ativos escolhe o fornecedor sem ver a Administração. `GET /fornecedores/{id}/ativos` conta os ativos ativos do fornecedor no alcance de `ativos.ver`, pelo índice GIN de `valores`, e devolve nulo sem ver ativos ou com o módulo desligado. As rotas da seção, `GET /fornecedores`, com a busca, a situação e o cursor, `GET /fornecedores/{id}`, `POST /fornecedores`, `PATCH /fornecedores/{id}` e as de inativar e reativar, seguem as permissões da spec, com a auditoria e o evento `fornecedores.mudaram` para toda a organização, porque o nome aparece nas telas dos ativos.

### 6. A seção e a ficha

A seção Fornecedores da Administração segue a dos coletores: a tabela base, "Novo fornecedor" e a ficha com a edição, a inativação confirmada e a reativação. A ficha mostra "Ativos deste fornecedor" pela contagem da API no escopo de quem vê, e "Ver na tabela" abre a tabela dos ativos com a origem `fornecedor`, a quarta, ao lado do local, da pessoa, do modelo e do tipo.

### 7. O Novo fornecedor numa aba

A Administração registra nos `cadastros` do módulo o alvo `fornecedor`, que entra no `AlvoDoCadastro` ao lado de local, pessoa, tipo e modelo, com:
- o título "Novo fornecedor";
- o link "Cadastrar novo fornecedor";
- a permissão `fornecedores.editar`.

O corpo é o formulário da seção (decisão 6), o mesmo da tela, que na aba devolve o fornecedor criado, com o nome, em vez de abrir a ficha, como o Novo local. O campo do ativo do tipo fornecedor usa o `CampoComCadastro`, como os de local e de pessoa. Assim o link vale no cadastro em etapas, na ficha em cartões e nos campos de fornecedor da organização, e some sem a permissão ou com a Administração sem a seção.

## Risks / Trade-offs

- [Grafias diferentes que não são do mesmo fornecedor] → a troca junta só o que difere no acento, nas maiúsculas e nos espaços. "HP" e "HP Brasil" viram dois fornecedores, e quem administra troca os ativos de um pela importação, com o patrimônio e o fornecedor, e o inativa.
- [Muitos ativos numa organização grande] → a troca é um UPDATE por organização, com o índice GIN de `valores`; a atualização mostra a migration no log, como as outras.
- [O filtro salvo que não encontra fornecedor] → sai da visão, e a visão continua com os outros filtros.
- [A volta à versão anterior] → o campo do ativo guarda o identificador, que a versão anterior mostraria como texto. O runbook manda restaurar o backup feito antes da atualização, como em toda migration que muda dados.

## Migration Plan

1. As migrations 0034 e 0035 criam o tipo de campo e a tabela dos fornecedores, e trocam o texto dos ativos pela referência, com os filtros salvos.
2. Depois da atualização, quem administra confere a seção Fornecedores, informa os CNPJs e junta, pela importação, os fornecedores que eram o mesmo com nomes diferentes.
3. A volta pede a restauração do backup feito pela própria atualização.
