## 1. O rascunho no servidor

- [x] 1.1 A chave estável de cada grupo do ativo no domínio (`GrupoDoAtivo.chave`; design, decisão 2): `identificacao`, `uso`, `organizacao:<nome>`, `outros`, `capacidade:<chave>` e `administrativo`, sem repetir entre um grupo da organização e uma capacidade com o mesmo nome. Começar pelo teste. Verificar: os testes do domínio passam (`pnpm --filter @grafite/domain test`).
- [x] 1.2 A tabela `rascunhos_de_cadastro` e a migration (decisão 6): `orgScoped`, a conta da organização, o `cadastro` só `ativo`, o conteúdo objeto até 256 KB, um por conta e cadastro, e o índice da manutenção. Começar pelo teste. Verificar: o teste da tabela passa, com a recusa do segundo rascunho da conta e do conteúdo grande demais, e o teste-guarda do RLS continua verde (`pnpm test:integration` no pacote do banco).
- [x] 1.3 As rotas `GET`, `PUT` e `DELETE /ativos/rascunho`, e o `POST /ativos` apagando o rascunho da conta na mesma transação (decisão 7). Começar pelo teste. Verificar: os testes de integração das rotas passam, cobrindo:
  - o `null` sem rascunho, e o que foi guardado de volta com o `atualizadoEm`;
  - outra conta da mesma organização sem ver nem mudar o rascunho;
  - a recusa sem `ativos.editar` e o 413 acima de 256 KB;
  - o cadastro que apaga o rascunho, e o cadastro recusado que o mantém;
  - a anonimização da pessoa, que apaga o rascunho da conta dela;
  - nenhum registro na auditoria e nenhum evento.
- [x] 1.4 A manutenção diária apagando os rascunhos parados há mais de 30 dias (decisão 10). Começar pelo teste. Verificar: o teste da manutenção passa, também rodando duas vezes, e o rascunho de 29 dias continua.
- [x] 1.5 O contrato com as rotas do rascunho. Verificar: `pnpm contrato:gerar` gera o OpenAPI e o cliente, e `pnpm contrato:verificar` passa.

## 2. A lista das etapas na biblioteca

- [x] 2.1 A `EtapasDoFormulario` (decisão 3), com as cores, as bordas e os espaços só dos tokens. A atual é marcada pela forma e tem `aria-current="step"`, e a situação e o motivo descrevem cada etapa. Ela tem um só ponto de Tab, e as setas andam nas duas direções. A etapa sem a escolha é focável, apagada e não abre. O toque tem 44 px, e o contêiner estreito vira a faixa que rola, com a atual à vista. Começar pelas histórias de interação. Verificar: as histórias passam pelo `vitest --project catalogo`, sem violação do axe, e a captura nova entra na regressão visual, com as referências geradas no contêiner do Playwright (`pnpm test:visual --atualizar`).

## 3. O cadastro em etapas na web

- [x] 3.1 As etapas do cadastro em função pura (`etapasDoCadastro`; decisão 2). Começar pelo teste. Verificar: os testes passam, cobrindo:
  - a ordem da impressora;
  - "Falta: IP" e "e mais N";
  - "Preenchida", "Opcional" e os nomes no Tipo e no Modelo;
  - as etapas sem a escolha antes do tipo, com "Escolha o tipo antes";
  - os restritos fora para quem não os vê;
  - os campos de arquivo, que não contam.
- [x] 3.2 O envio do ativo fora do formulário (`pedidoDoAtivo`; decisão 1): a conferência, o pedido só com o que mudou e as recusas da API pela chave do campo, usados pelo `FormularioDoAtivo`. Começar pelo teste da função. Verificar: os testes da função passam, e os da ficha e do Novo ativo passam sem mudar.
- [x] 3.3 A retomada do rascunho em função pura (`retomarRascunho`; decisão 9): o tipo inativado, as chaves que o tipo não usa, os restritos e os campos de arquivo de fora, a forma de cada valor, as travas e os nomes que ficam, a etapa que não existe mais e a decisão pela origem. Começar pelo teste. Verificar: os testes passam.
- [x] 3.4 O `useRascunhoDoAtivo` (decisão 8). Começar pelo teste, com o relógio simulado. Verificar: os testes do hook passam, cobrindo:
  - a espera de 1 s e um envio de cada vez, sem o `PUT` antigo depois do novo;
  - nada antes do tipo;
  - os textos da situação, de "agora" a "às 14:32" depois de 1 min;
  - a falha com "Tentar de novo";
  - o envio na desmontagem;
  - a espera cancelada antes de cadastrar e de descartar.
- [x] 3.5 O `CadastroEmEtapas` (decisões 4 e 5). Começar pelo teste. Verificar: os testes do cadastro passam, cobrindo:
  - a lista e o painel, com a imagem do modelo ou o ícone do tipo;
  - a busca do modelo, com o fabricante e o tipo;
  - "Voltar", "Continuar para …" e o Enter que continua, com o foco no nome da etapa;
  - "Cadastrar" com o campo vazio e com a recusa da API, que abre a etapa com o foco no campo;
  - a confirmação "Trocar o tipo?";
  - os links que abrem o cadastro numa aba, no Tipo, no Modelo, no Local e no Responsável.
- [x] 3.6 O `AtivoNovo` com o rascunho (decisão 9), e o `FormularioDoAtivo` só com a ficha, sem o modo de cadastro, que o Novo ativo deixa de usar. Começar pelo teste. Verificar: os testes do Novo ativo passam, cobrindo:
  - a falha ao ler o rascunho, com "Tentar de novo";
  - a retomada, também com a mesma origem;
  - a pergunta "Continuar o cadastro começado?", com "Continuar o começado" e "Começar um novo";
  - "Descartar o rascunho", com a confirmação;
  - o cadastro, que leva à ficha;
  - a tela sem tipos e sem permissão, como hoje.

## 4. Ponta a ponta

- [x] 4.1 A ponta a ponta da web. Verificar: o `pnpm test:e2e` passa no CI do PR.
  - A simulação da API ganha o rascunho em memória, por página.
  - As pontas a ponta que cadastram ativos passam pelas etapas, com um ajudante comum: as de ativos, catálogo, coleta, Control iD, etiquetas e abas.
  - A nova cobre o caminho pelas etapas com "Continuar" e "Voltar", o "Cadastrar" com um obrigatório vazio, a volta depois de recarregar e o descarte.
- [x] 4.2 A ponta a ponta da pilha. Verificar: o `pnpm test:e2e:pilha` passa no CI do PR.
  - Ana começa o cadastro, vê "Rascunho guardado agora", e outro navegador dela retoma o mesmo cadastro e o termina.
  - Cadastrar apaga o rascunho: o Novo ativo seguinte começa vazio.
  - O rascunho de outra conta fica com o teste de integração da tarefa 1.3, com o PostgreSQL de verdade: a conta nova da pilha não edita os ativos.
  - As pontas a ponta da pilha que cadastram ativos passam pelas etapas.

## 5. Fechamento

- [x] 5.1 A spec mestre e o mapa. Verificar: o teste-guarda do mapa e o da documentação passam.
  - Na spec mestre, a seção 7.4 ganha o cadastro em etapas e o rascunho na conta.
  - No `docs/mapa.md`, a change aparece em andamento.
- [x] 5.2 Conferir as verificações: `pnpm lint`, `pnpm typecheck`, `pnpm contrato:verificar` e `openspec validate cadastro-em-etapas --strict` sem erros, e o CI do PR verde. Verificar: os comandos passam, e o PR fica com todos os jobs verdes.
