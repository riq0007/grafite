## Why

Com o catálogo do P1a, a organização já diz que tipos de ativo tem, que campos cada tipo usa e que modelos existem. Falta o próprio ativo: o PMG guardava os computadores e as impressoras em tabelas fixas, sem dizer de onde veio cada valor, e um valor digitado à mão podia ser apagado pela planilha seguinte.

O P1b · Cadastro de ativos é a segunda das seis changes do P1 (spec mestre, seção 3.2). Ela traz o ativo com os dados comuns a todo ativo e os campos do tipo, cada valor com a origem, o momento, o autor e a trava, a lista simples, a ficha básica e as permissões pelo local do ativo. Traz também o que a spec mestre pede junto do primeiro módulo opcional: ligar e desligar os módulos por organização.

## What Changes

- **Spec mestre:** as decisões do cadastro: os campos comuns com chave fixa, a situação de uso, o nome que o ativo mostra, o escopo pelo local do ativo, os campos restritos e os módulos por organização.
- **O ativo:**
  - o tipo, que não muda depois do cadastro, e o modelo, do mesmo tipo;
  - os **campos comuns a todo ativo**, com uma chave fixa no código:
    - **identificação:** nome, patrimônio (único na organização), número de série e hostname;
    - **uso:** a situação de uso (em uso, em estoque ou em manutenção), o local e o responsável;
    - **administrativo:** fornecedor, nota fiscal, data e valor de compra, garantia, propriedade, contrato, custo mensal, centro de custo e vida útil;
  - os campos da organização que o tipo usa e os das capacidades ligadas, com os obrigatórios do tipo;
  - inativação e reativação: nada se exclui.
- **Origem, momento, autor e trava de cada valor:**
  - cada valor guarda de onde veio (manual, planilha, coleta ou API), quando e por quem;
  - quem edita trava e destrava um campo, e o campo travado só muda pela edição manual, o que a importação (P1e) e a coleta (P2) vão respeitar.
- **Permissões pelo local do ativo:** `ativos.ver`, `ativos.editar` e `ativos.restritos`, este para ver os campos restritos. O ativo sem local só é alcançado por quem tem a permissão na organização inteira.
- **A lista simples:** o nome do ativo com o tipo, o patrimônio, o local e a situação, com a busca, os filtros de tipo, de local e de situação no endereço e "Carregar mais". As colunas e as visões ficam no P1c.
- **O cadastro e a ficha básica:** os campos agrupados (identificação, uso, os grupos do tipo, as capacidades e o administrativo), cada um com o estado dele, a trava, as recusas no próprio campo e a inativação. A ficha completa, com o histórico e os ativos ligados, fica no P1d.
- **Nomes das pessoas:** a escolha do responsável e dos campos de pessoa lê os nomes das pessoas ativas, para quem edita ativos e não vê a Administração.
- **Campos da organização:** os rótulos dos campos comuns e das capacidades ficam reservados.
- **Auditoria e eventos:** cada mudança no ativo vai para a auditoria, com o antes → depois e as travas, e grava o evento `ativos.mudaram`, para quem vê ativos no local de antes e no de depois.
- **Módulos por organização:**
  - o Ativos é o primeiro módulo opcional, ligado por padrão;
  - quem define os padrões da organização liga e desliga o módulo na Administração, na seção Módulos;
  - desligado, o módulo some do dock, da barra de abas e da busca de todas as sessões, sem recarregar, e a API recusa as rotas dele. Os dados ficam guardados e voltam quando o módulo é ligado de novo.
- **Módulo Ativos na casca:**
  - o menu ganha a lista dos ativos, ao lado do Catálogo, e o endereço do módulo leva à lista;
  - na busca, a ação "Novo ativo" e os ativos pelo nome, pelo patrimônio, pela série, pelo hostname e pelo modelo.

## Capabilities

### New Capabilities

- `cadastro-de-ativos`: o ativo, os campos comuns, os valores com o estado de cada um, as travas, a inativação, o escopo pelo local, a lista simples, o cadastro e a ficha básica.
- `modulos-da-organizacao`: os módulos opcionais, ligar e desligar por organização, e o efeito na casca, na busca e na API.

### Modified Capabilities

- `permissoes`: o catálogo ganha `ativos.ver`, `ativos.editar` e `ativos.restritos`, e `organizacao.editar` passa a definir também os módulos.
- `auditoria`: os eventos registrados ganham os do ativo e os dos módulos.
- `eventos-em-tempo-real`: a tabela dos tipos de evento ganha `ativos.mudaram` e `modulos.mudaram`.
- `modulo-ativos`: o módulo aparece também para quem vê ativos, com a lista no menu e no endereço, a busca dos ativos e o módulo opcional.
- `catalogo-de-ativos`: os rótulos dos campos comuns e das capacidades ficam reservados.
- `administracao-de-pessoas`: os nomes das pessoas ativas, para escolher o responsável de um ativo.
- `modulo-administracao`: a seção Módulos.
- `plataforma-base`: com a web compilada, o pedido de página fora do `/api` é sempre da web, mesmo no endereço de uma rota da API, como `/ativos`.

## Impact

- **`packages/domain`:** os campos comuns do ativo, a situação de uso, o nome que o ativo mostra, a conferência dos valores do ativo, o estado e as travas, os módulos opcionais, e as permissões, as ações da auditoria e os eventos novos.
- **`packages/db`:** a migration com a tabela `ativos`, isolada pela organização, e os módulos desligados na organização.
- **`apps/api`:**
  - as rotas dos ativos, dos nomes das pessoas e dos módulos;
  - o estado da sessão diz os módulos desligados, e as rotas de um módulo desligado são recusadas;
  - o contrato da API e o cliente gerado.
- **`packages/ui`:** o estado de um campo (origem, autor, momento e trava), com as histórias no catálogo.
- **`apps/web`:**
  - a lista, o cadastro e a ficha dos ativos, com um campo de entrada para cada tipo de campo;
  - a escolha da pessoa e a do ativo;
  - a seção Módulos da Administração e o registro filtrado pelos módulos ligados.
- **Documentação:** a spec mestre e o contrato de módulo (o módulo opcional).
- A importação (P1e) e a coleta (P2) chegam depois, sobre as travas e a política de escrita desta change.
