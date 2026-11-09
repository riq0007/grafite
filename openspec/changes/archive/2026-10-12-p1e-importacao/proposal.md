## Why

Com o P1a ao P1d, a organização cadastra e cuida dos ativos um a um, pela ficha e pela tabela. Quem chega com o inventário numa planilha, como os computadores do PMG ou a lista que o fornecedor manda, precisa de horas de digitação, e os valores conferidos à mão podem ser sobrescritos por uma carga sem cuidado.

O P1e · Importação é a quinta das seis changes do P1 (spec mestre, seção 3.2): a planilha com a prévia linha a linha ("de → para", os campos travados e os erros), casando cada linha com o ativo pelo patrimônio, pela série e pelo hostname, aplicada na fila de tarefas. Ela usa o que o P1b deixou pronto para isso: a origem "planilha" do valor, a trava e a política de escrita só manual (spec mestre, seção 5.2, decisão 4).

Ficam fora desta change: a etiqueta com QR code (P1f); a importação dos dados do PMG na virada (P8), que vai usar esta mesma regra; outros formatos além de XLSX e CSV, como ODS e XLS; importar arquivos, imagens e ligações livres; uma planilha com vários tipos de ativo de uma vez; e desfazer uma importação aplicada, que se corrige como qualquer edição, com o histórico de cada ativo.

## What Changes

- **Spec mestre:** a seção 3.2 detalha o P1e, com os formatos, os limites, as colunas, o casamento, as referências por texto, a prévia e a aplicação na fila.
- **A importação de ativos por planilha,** de um tipo de ativo por vez:
  - a planilha em XLSX (a primeira aba) ou CSV, até 10 MB e 5.000 linhas, com os títulos na primeira linha;
  - as colunas ligadas aos campos do tipo pelo rótulo, sem diferenciar acento e maiúsculas, com o modelo pelo fabricante e pelo nome, e a ligação ajustável na tela;
  - cada linha casada com o ativo pelo patrimônio, depois pela série e depois pelo hostname; sem casamento, um ativo novo;
  - o local pelo caminho ou pelo nome, a pessoa pela matrícula, pelo e-mail ou pelo nome, e o ativo de um campo do tipo ativo pelo patrimônio;
  - a prévia linha a linha: o que vira ativo novo, o que muda, com o "de → para" de cada campo, o que fica igual, o que a trava e o só manual não deixam mudar, e os erros, com o motivo, no campo;
  - "Importar" põe a importação na fila de tarefas: cada linha sem erro grava com a origem "planilha", em nome de quem importou, com o escopo e os restritos de quem importou; a linha com erro não grava nada;
  - o acompanhamento, com as linhas processadas, e o resultado, com os totais e os erros de cada linha;
  - a lista das importações de quem importou.
- **Módulo Ativos:** o item Importações no menu e a ação "Importar planilha" na busca, para quem edita ativos.
- **Auditoria e eventos:** a importação aplicada e a concluída, com os totais; cada ativo gravado pela importação, com a origem; o evento `importacoes.mudaram`, só para quem importou, e o `ativos.mudaram` de cada ativo; as telas releem cada consulta uma vez por vez, para a rajada de eventos de uma importação não deixar a lista aberta relendo sem parar.
- **Fila:** a manutenção diária descarta o rascunho esquecido há mais de 7 dias.

## Capabilities

### New Capabilities

- `importacao-de-ativos`: a importação de ativos de um tipo por planilha XLSX ou CSV: as colunas, o casamento pelo patrimônio, pela série e pelo hostname, as referências por texto, a prévia linha a linha, a aplicação na fila, que respeita a trava, o só manual, o escopo e os restritos, o acompanhamento, o resultado e a lista das importações.

### Modified Capabilities

- `cadastro-de-ativos`: o valor gravado pela importação aparece na ficha com a origem "Planilha" e o autor.
- `modulo-ativos`: o item Importações no menu do módulo e a ação "Importar planilha" na busca, para quem tem `ativos.editar`.
- `auditoria`: os registros da importação aplicada e da concluída, e os ativos cadastrados e alterados por ela, com a importação.
- `eventos-em-tempo-real`: o tipo `importacoes.mudaram`, que vai às sessões da conta que importou, e as telas que releem cada consulta uma vez por vez numa rajada de eventos, como a de uma importação.
- `fila-de-tarefas`: a manutenção diária descarta as importações em rascunho com mais de 7 dias.

## Impact

- **`packages/domain`:** as colunas sugeridas, o casamento da linha, a leitura das referências por texto, a prévia de cada linha, as ações novas da auditoria e o evento novo.
- **`packages/db`:** a tabela `importacoes`, isolada pela organização.
- **`apps/api`:**
  - a leitura da planilha, XLSX e CSV, sem dependência nova;
  - a gravação do ativo fora da requisição, com a origem e o acesso de quem grava;
  - as rotas da importação (envio da planilha, colunas, prévia e descarte) e a tarefa da fila que a aplica;
  - o contrato da API e o cliente gerado.
- **`packages/ui`:** a escolha de arquivo com os formatos e o limite dados e a lista das linhas da prévia, com as histórias no catálogo.
- **`apps/web`:** a lista das importações, a importação nova, com as colunas e a prévia, o acompanhamento e o resultado, o menu e a busca; as releituras dos eventos, uma vez por vez.
- **Dependências:** nenhuma nova.
- **Documentação:** a spec mestre e o mapa (`docs/mapa.md`), com a capacidade nova e os termos novos.
