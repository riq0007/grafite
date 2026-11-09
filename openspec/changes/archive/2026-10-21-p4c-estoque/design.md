## Context

O módulo Operação (change p4b-consumiveis) tem a lista, o cadastro e a ficha dos consumíveis, numa tabela `consumiveis` com o código normalizado único. As rotas dele ficam num escopo com a guarda `exigirModuloLigado`, e a web o tira do registro da conta que não vê nenhuma das permissões dele.

O que esta change usa e já existe:
- **Permissões com escopo de local:** `podeEm` confere um local com os ancestrais, e `alcance` dá os locais do ramo para filtrar uma consulta (`packages/domain/src/acesso/acesso.ts`), como nos ativos e nos alertas.
- **Eventos:** o evento de saída leva a permissão e os locais do público, e a API filtra cada conexão por eles, como `ativos.mudaram`.
- **Auditoria:** a auditoria é só de inclusão porque o papel da aplicação não tem `UPDATE` nem `DELETE` nela (migration 0006).
- **Início:** a tela inicial junta as fontes de ocorrências dos módulos. Os alertas do coletor já entram nela com o coletor no lugar do ativo e a imagem genérica.
- **Leituras:** o estado atual das leituras fica em `estado_dos_ativos`. O contador de menor item da métrica `impressora.contador` é o "Total de páginas" (`contadoresDaImpressora`, no domínio da coleta).
- **Cadastros e relações:** os campos abrem os cadastros dos outros módulos numa aba pelo alvo do registro, como o `fornecedor`. A ficha do fornecedor já mostra os ativos dele por uma relação do Ativos.

## Goals / Non-Goals

**Goals:**
- O livro-razão como a única fonte do saldo: cada lançamento muda o saldo na mesma transação, e nenhum lançamento muda depois.
- O saldo que nunca fica negativo, também com dois lançamentos ao mesmo tempo, sem trava longa.
- As telas e as fichas no padrão do Operação e do Ativos, sem componente novo na biblioteca.

**Non-Goals:**
- O custo, o valor do estoque, a validade e o lote de cada unidade.
- O estorno: o ajuste corrige o saldo, e o lançamento errado fica no livro-razão com a correção ao lado.
- A notificação, o e-mail e o push do estoque abaixo do mínimo.
- O estoque de um item que não é consumível.

## Decisions

### 1. O estoque no domínio

O domínio (`packages/domain/src/estoque/`) traz:
- **listas e limites:** os tipos da movimentação e os motivos do ajuste, com os rótulos, e os limites da quantidade, da nota, da observação e do mínimo;
- **conferência:** a de cada tipo, campo a campo, com as mensagens da spec;
- **efeito:** o efeito de uma movimentação nos saldos, como uma lista de pares de local e diferença;
- **situação:** a situação pelo saldo e pelo mínimo, e se o consumível está abaixo do mínimo;
- **textos:** o da ocorrência do Início e o do contador de páginas.

A web confere antes de enviar com as mesmas regras, e a API confere de novo, com o saldo e as referências do banco.

O domínio também ganha:
- `estoque.ver` e `estoque.movimentar` no catálogo, com escopo de local, e a segunda inclui a primeira;
- as ações da auditoria `estoque.entrada`, `estoque.saida`, `estoque.transferencia`, `estoque.ajuste` e `estoque.minimo`, com os rótulos;
- o evento `estoque.mudou`, que todas elas gravam.

### 2. As tabelas

A migration 0037 cria duas tabelas da organização, com `orgScoped()` e o RLS forçado.

**`movimentos_do_estoque`, o livro-razão:**
- as colunas: o tipo, o consumível, a quantidade, o local de origem e o de destino, o fornecedor e a nota fiscal, o ativo e o contador (as páginas e o momento da leitura), o motivo, a observação, a conta que lançou e o momento;
- as checagens repetem os limites do domínio e dizem, para cada tipo, o que é preenchido e o que fica vazio. O ajuste tem só a origem, quando retira, ou só o destino, quando acrescenta, e o motivo Outro exige a observação;
- as chaves estrangeiras com a organização apontam o consumível, os locais, o fornecedor, o ativo e a conta;
- os índices vão pelo consumível e o momento, pela origem, pelo destino, pelo fornecedor, pelo ativo e pelo momento;
- `REVOKE UPDATE, DELETE ... FROM grafite_app`, como na auditoria. O livro-razão é só de inclusão no banco, e não só na API.

**`saldos_do_estoque`, o saldo de cada consumível em cada local:**
- as colunas: o saldo, o mínimo, o momento em que ficou abaixo do mínimo e o da última mudança;
- o par consumível e local é único, e a checagem impede o saldo negativo;
- o índice parcial dos que estão abaixo do mínimo serve à fonte do Início.

A linha nasce no primeiro lançamento ou no primeiro mínimo do par, e é ela que a tela do estoque mostra.

Alternativa descartada: calcular o saldo somando o livro-razão a cada leitura. A soma fica cara com os anos de lançamentos, e a recusa do saldo insuficiente precisaria de uma trava sobre todas as linhas do par.

### 3. O lançamento numa transação

Cada lançamento, na mesma transação:
1. confere os campos pelo domínio;
2. confere as permissões, com `podeEm`, em cada local;
3. confere as referências: o ativo que a conta vê, os ativos e os inativos que o tipo aceita (spec estoque);
4. aplica o efeito nos saldos;
5. grava a movimentação, a auditoria e o evento.

A diferença negativa é um `UPDATE ... SET saldo = saldo - :q WHERE ... AND saldo >= :q RETURNING`:
- quando nenhuma linha volta, o saldo não basta, e a recusa diz o saldo lido na hora;
- o `UPDATE` trava a linha do par. O segundo lançamento ao mesmo tempo espera o primeiro terminar e confere a condição com o saldo novo, sem trava explícita nem nível de isolamento mais alto.

A transferência aplica as duas diferenças na ordem dos identificadores dos locais. Assim, duas transferências em sentidos opostos não se travam uma à outra.

O momento em que o consumível ficou abaixo do mínimo é atualizado no mesmo `UPDATE`:
- ele passa a valer quando o par entra abaixo do mínimo;
- ele fica nulo quando o par sai;
- ele não muda enquanto o par continua abaixo.

A mudança do mínimo segue a mesma regra.

### 4. O contador de páginas na saída

A saída para um ativo lê, na mesma transação, a leitura válida de `impressora.contador` de menor item em `estado_dos_ativos`, que é o "Total de páginas", e grava o valor e o momento dela. Sem leitura válida, os dois ficam nulos.

A P4f calcula as páginas por toner pela diferença entre as saídas seguidas de uma impressora.

### 5. As rotas do estoque

As rotas ficam no escopo do Operação:
- **saldos:** `GET /estoque/saldos`, com `estoque.ver`, filtra pela busca do consumível, pelo local com o ramo, pelo tipo e pela situação, sempre dentro do `alcance` da conta. O cursor vai pelo código normalizado do consumível, pelo caminho do local e pelo identificador. Cada linha diz se a conta movimenta naquele local;
- **movimentações:** `GET /estoque/movimentos`, com `estoque.ver`, traz as que têm a origem ou o destino no alcance. Os filtros são o período, o tipo, o local com o ramo, o consumível, o fornecedor e o ativo, e o cursor vai pelo momento e pelo identificador, da mais nova para a mais antiga;
- **lançamentos:** `POST /estoque/entradas`, `/estoque/saidas`, `/estoque/transferencias` e `/estoque/ajustes`, com `estoque.movimentar` nos locais. Eles devolvem a movimentação e os saldos que mudaram, e as recusas vêm no campo, no corpo de problema de sempre;
- **mínimo:** `PUT /estoque/minimos/{consumivelId}/{localId}`, com `estoque.movimentar` no local;
- **Início:** `GET /estoque/abaixo-do-minimo`, com `estoque.ver`, traz até 200 pares, os mais antigos primeiro, para a fonte do Início;
- **ativos para a saída:** `GET /estoque/ativos-para-saida?consumivel=`, com `estoque.movimentar`, traz os ativos ativos que a conta vê pela busca e marca os de modelo compatível com o consumível, que a web traz primeiro.

O evento `estoque.mudou` leva o consumível como alvo. O público é `estoque.ver` nos locais da movimentação, a origem e o destino, ou no local do mínimo.

### 6. As referências para quem não tem a permissão do outro cadastro

As leituras do estoque trazem os nomes do consumível, do local, do fornecedor e do ativo, e se a conta pode abrir cada ficha. Elas fazem isso como os compatíveis da P4b, que aparecem na ficha do modelo sem `consumiveis.ver`.

Outras rotas leem o estoque:
- **escolha do consumível:** `GET /consumiveis/escolha`, para toda sessão, como `GET /fornecedores/escolha`, traz os consumíveis ativos pela busca, com o código, o nome, o tipo e a cor; com o `id`, traz só aquele consumível, mesmo inativo, para o lançamento aberto pelo endereço mostrar o código dele;
- **ficha do consumível:** `GET /consumiveis/{id}/estoque`, com `estoque.ver`, traz os saldos do consumível nos locais do alcance, a soma e as 10 movimentações mais novas;
- **ficha do ativo:** cada item de `consumiveisCompativeis` ganha `saldo`, que é a soma no alcance de `estoque.ver`, ou nulo sem a permissão;
- **ficha do fornecedor:** `GET /fornecedores/{id}/consumiveis`, com `consumiveis.ver`, e `GET /fornecedores/{id}/entradas`, com `estoque.ver`, que traz quantas entradas houve e a data da última, no escopo do Operação.

### 7. A web

O registro do Operação ganha:
- **permissões e menu:** `estoque.ver` e `estoque.movimentar`, e os itens "Estoque" e "Movimentações", cada um com a permissão dele;
- **endereço:** o módulo passa a `/operacao`, e o índice leva aos Consumíveis ou, para quem só vê o estoque, ao Estoque;
- **busca:** as telas, as ações de lançar, que abrem o Estoque com a gaveta da ação, e o provedor dos consumíveis, que lê `GET /consumiveis` com a busca;
- **cadastro numa aba:** o alvo `consumivel`, com o Novo consumível, que exige `consumiveis.editar`;
- **Início:** a fonte de ocorrências do estoque, com a permissão `estoque.ver`, que relê pelo `estoque.mudou`;
- **ficha do fornecedor:** a relação no alvo `fornecedor`, com as permissões `consumiveis.ver` e `estoque.ver`, que mostra cada linha só a quem tem a permissão dela.

As telas seguem a lista dos consumíveis:
- **Estoque:** a tabela base com a busca, os filtros e o "carregar mais". As ações de lançar abrem a gaveta do formulário, e o lançamento aberto fica no endereço (`?lancar=saida&consumivel=…&ativo=…`), para a busca e o cartão da ficha do ativo o abrirem;
- **Movimentações:** a tabela base com os filtros no endereço;
- **formulários:** o campo do consumível usa a escolha, com o "Cadastrar novo consumível" do alvo `consumivel` embaixo, e o do fornecedor, com o "Cadastrar novo fornecedor" do alvo `fornecedor`. Os locais são escolhidos na árvore, só entre os do alcance de `estoque.movimentar`. A escolha do ativo da saída mostra os compatíveis como sugeridos, como as pessoas do local do ativo.

O cadastro pedido por um campo da gaveta abre numa aba da janela, que a gaveta, modal, cobriria. Por isso o que foi preenchido fica num componente fora da gaveta, que pede o cadastro pelo `useCadastro`: a gaveta sai da frente enquanto a aba está aberta e volta com o registro criado no campo e o resto como estava. O `CampoComCadastro`, que fica dentro da gaveta, sairia da tela com ela e não receberia o registro.

A auditoria de cada movimentação e de cada mínimo fica no consumível, o alvo `consumivel`, como a do cadastro dele: "Ver na auditoria" da ficha do consumível mostra também o estoque. O evento leva o mesmo alvo.

No Ativos, o painel dos compatíveis mostra o saldo de cada um e, para quem movimenta, "Registrar saída", que leva ao Estoque com o lançamento no endereço. O registro do Ativos relê a ficha aberta com `estoque.mudou`, como já faz com `consumiveis.mudaram`.

Alternativa descartada: o formulário da saída dentro da ficha do ativo. Ele duplicaria o da gaveta do Estoque, e o Ativos dependeria do código do Operação.

## Risks / Trade-offs

- **Lançamento errado no livro-razão:** o ajuste com o motivo e a observação o corrige, e a auditoria e o livro-razão mostram os dois. O estorno fica para quando o uso pedir.
- **Muitos lançamentos ao mesmo tempo no mesmo par:** o `UPDATE` condicional serializa só aquele par, e cada lançamento dura poucos milissegundos.
- **Local inativado com saldo:** a saída, a origem da transferência e o ajuste de retirar aceitam o local e o consumível inativos, para o saldo sair. A entrada e o destino os recusam.
- **Ativo que a conta não vê:** a saída exige que a conta veja o ativo. Quem movimenta o estoque sem ver os ativos não lança a saída, e a tela diz "Escolha o ativo.".
- **A migration 0037 ocupada:** se outra change chegar antes com a 0037, a desta é renumerada, como a P4a fez com a 0034 e a 0035.
- **A volta à versão anterior:** a anterior ignora as tabelas novas. O runbook manda restaurar o backup feito antes da atualização, e os lançamentos feitos depois dele se perdem.

## Migration Plan

1. A migration 0037 cria o livro-razão e os saldos, sem mudar dados.
2. Depois da atualização, quem administra:
   - dá `estoque.ver` ou `estoque.movimentar` aos perfis que precisam, no ramo de cada local (o Administrador já as tem);
   - lança o inventário inicial de cada local pelo ajuste de acrescentar, com o motivo Inventário;
   - define os mínimos.
3. A volta pede a restauração do backup feito pela própria atualização.
