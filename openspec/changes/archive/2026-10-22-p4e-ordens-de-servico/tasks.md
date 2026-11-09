## 1. Domínio

- [x] 1.1 Escrever primeiro os testes e depois a OS no domínio (design, decisão 1). Verificar: os testes do domínio passam com os cenários "OS sem o problema", "Encerrada não muda", "Resolvida reaberta" e "OS aberta por engano", nas mudanças e nas recusas, e "Uma em aberto no encerramento em lote", no texto do retorno. O domínio cobre:
  - as situações, as em aberto e os limites;
  - as mudanças da situação, com a reabertura e o encerramento sem resolver, e as recusas;
  - a conferência da abertura, da correção, da situação com o fornecedor, da peça, da resolução, da reabertura e do encerramento;
  - os textos: "OS 12", o nome do alvo na auditoria e o retorno do lote.
- [x] 1.2 Escrever primeiro os testes e depois `ordens.ver` e `ordens.atender` no catálogo, as ações da auditoria, com os rótulos, o evento `ordens.mudaram`, com o público pelos locais, a recusa `segue-a-ordem` da solicitação e a descrição do Operação, com as solicitações e as ordens de serviço (decisão 1). A descrição da P4d não tinha chegado ao domínio, e esta a corrige junto. Verificar: os testes do domínio passam com os cenários:
  - "Permissão nova no Administrador", com as vinte e quatro, e "Atender as OS de um local";
  - "Conserto com a OS no lote", no texto do retorno;
  - "Operação numa organização que já existia", na descrição.

## 2. Banco

- [x] 2.1 Escrever primeiro o teste de integração e depois a migration 0039 (decisão 2), com o tipo Peça no domínio, com o rótulo, e no banco, e o contrato gerado de novo por ele (`pnpm contrato:gerar`). O tipo vem nesta tarefa, e não na 1.1: a web passa o tipo do domínio à API, e os dois mudam juntos. Verificar: os testes de integração do banco passam, com o teste-guarda do RLS e "Peça no catálogo", na checagem do tipo, e o papel da aplicação não apaga uma OS nem muda o histórico e as peças. A migration cria:
  - as ordens de serviço, com as checagens de cada situação, a solicitação única e o `REVOKE DELETE` do papel da aplicação;
  - o histórico das situações e as peças, com a movimentação única, só de inclusão;
  - a numeração por organização;
  - o RLS forçado nas quatro, e a checagem do tipo dos consumíveis com a Peça.

## 3. API

Cada tarefa entra com os esquemas das rotas dela e o cliente gerado de novo (`pnpm contrato:gerar`).

- [x] 3.1 Escrever primeiro o teste de integração e depois a abertura e a correção do problema (decisões 3 e 7): a numeração, o ativo, a permissão no local do ativo, o histórico, a auditoria e o evento. Verificar: os testes de integração passam com os cenários:
  - "Manutenção achada pela TI", com duas aberturas ao mesmo tempo sem número repetido;
  - "OS sem o problema", "Problema corrigido" e "Quem só vê", com o 403 na abertura;
  - "OS aberta", na auditoria, e "OS aberta com a lista aberta", no público do evento.
- [x] 3.2 Escrever primeiro o teste de integração e depois a situação, o fornecedor na correção, a resolução, a reabertura, o encerramento e o lote (decisões 4 e 6). Verificar: os testes de integração passam com os cenários:
  - "Aguardando a peça", "Resolvida reaberta", "Encerrada não muda" e "OS aberta por engano";
  - "Notebook na assistência" e "Número da assistência informado depois";
  - "Resolvidas encerradas em lote" e "Uma em aberto no encerramento em lote".
- [x] 3.3 Escrever primeiro o teste de integração e depois a OS pela solicitação de conserto (decisões 3 e 4): a abertura, a solicitação que segue a OS na resolução e no encerramento sem resolver e a recusa `segue-a-ordem` em `solicitacaoParaMudar` e no lote. Verificar: os testes de integração passam com os cenários "Conserto vira OS", "OS resolvida conclui o conserto", "OS encerrada sem resolver cancela o conserto", "Conserto já com a OS", "Conserto que segue a OS", "Conserto com a OS no lote", "Conserto sem a OS" e "OS pela solicitação na auditoria", e os testes das solicitações continuam verdes.
- [x] 3.4 Escrever primeiro o teste de integração e depois as peças (decisão 5): o `lancar` da P4c na transação da OS, com a observação "OS <número>", e a recusa no campo da peça. Verificar: os testes de integração passam com os cenários "Fonte trocada", "Peça sem saldo" e "Peça na OS resolvida", e os testes do estoque continuam verdes.
- [x] 3.5 Escrever primeiro o teste de integração e depois as leituras (decisão 7): a lista com os filtros, a busca e o cursor, a ficha com o histórico e as peças, a OS na lista e na ficha da solicitação, as OS na ficha do ativo e o nome do alvo na auditoria. Verificar: os testes de integração passam com os cenários "Atendente de Jundiaí", "Quem só vê", na ficha, "Em aberto por padrão", "Busca pelo patrimônio", "Ativo sem OS", "Problema que voltou" e "OS aberta", no nome do alvo.

## 4. Web

- [x] 4.1 Escrever primeiro os testes e depois o registro do Operação com as OS (decisão 8): as permissões, o menu, o endereço pela primeira tela que a conta vê, a busca com a tela e a ação "Nova ordem de serviço", e o evento. Verificar: os testes da web passam com os cenários "Conta sem a permissão", "Técnico só das OS" e "Nova OS pela busca".
- [x] 4.2 Escrever primeiro os testes e depois a tela das ordens de serviço (decisão 8): a tabela, os filtros e a busca no endereço, o "Carregar mais", as telas vazias, a seleção e o lote na barra. Verificar: os testes da web passam com os cenários "Em aberto por padrão", "Busca pelo patrimônio", "Primeira ordem de serviço", "Resolvidas encerradas em lote" e "Uma em aberto no encerramento em lote", no retorno.
- [x] 4.3 Escrever primeiro os testes e depois a nova OS e a correção na gaveta (decisão 8), abertas pela tela, pela busca e pelo endereço com o ativo, com as recusas no campo e os retornos. Verificar: os testes da web passam com os cenários "OS sem o problema", na recusa do campo, "Problema corrigido" e "Número da assistência informado depois", com "OS corrigida.", e a OS aberta volta com "OS 12 aberta.".
- [x] 4.4 Escrever primeiro os testes e depois a mudança da situação, a peça, a resolução, a reabertura e os encerramentos na gaveta, abertos pelas ações de cada linha da lista (decisão 8), com "Cadastrar novo fornecedor" numa aba e os retornos. Verificar: os testes da web passam com os cenários "Aguardando a peça", "Notebook na assistência", "Peça pela gaveta", "Peça sem saldo", na recusa da quantidade, "Resolvida reaberta" e "OS aberta por engano".
- [x] 4.5 Escrever primeiro os testes e depois a ficha da OS, com as ações da situação, que abrem as gavetas das tarefas 4.3 e 4.4, relida pelo evento (decisão 8). Verificar: os testes da web passam com os cenários "OS resolvida na ficha", "Ações da Resolvida", "OS que não existe", "Quem só vê" e "OS resolvida com a ficha aberta".
- [x] 4.6 Escrever primeiro os testes e depois a OS na solicitação de conserto (decisão 8): "Abrir OS" na linha e na ficha, que leva à ficha da OS nova, a OS na ficha, com o caminho para quem vê as OS, e na lista, ao lado da situação, e nenhuma ação da solicitação que segue a OS. Verificar: os testes da web passam com os cenários "Conserto aberto como OS", "Ações do conserto" e "Conserto com a OS", e a lista mostra "Em atendimento · OS 12".
- [x] 4.7 Escrever primeiro os testes e depois as OS fora das telas do Operação (decisão 8): a seção da ficha do ativo, com "Nova ordem de serviço", relida pelo evento das OS, o alvo da OS na tela da auditoria, com o nome dela pela API, e a Peça no cadastro e no filtro dos consumíveis. Verificar: os testes da web passam com os cenários "OS pela ficha do notebook", "Nova OS pela ficha do ativo", "Ativo sem OS", "Problema que voltou" e "Peça no catálogo".

## 5. Ponta a ponta

- [x] 5.1 A ponta a ponta com a API simulada. Verificar: `pnpm test:e2e` passa. Ela cobre:
  - a OS aberta pela ficha do ativo, a espera pelo fornecedor, a peça do estoque e a resolução, até a ficha;
  - "Abrir OS" na solicitação de conserto e a OS na ficha da solicitação;
  - a lista com o filtro, a busca e o encerramento em lote.
- [x] 5.2 A ponta a ponta da pilha: a administradora cadastra a Peça e lança a entrada dela no Almoxarifado, abre a OS de um conserto da PAT-00412, a impressora que a pilha já tem, lança 1 Peça do Almoxarifado, resolve a OS e vê a solicitação concluída e a saída nas movimentações, com "OS <número>". Verificar: `pnpm test:e2e:pilha` passa.

## 6. Fechamento

- [x] 6.1 Atualizar a documentação. Verificar: `pnpm test` passa, com o teste-guarda do mapa e o dos trechos do contrato.
  - A spec mestre: a P4e na divisão do P4 (seção 3.2).
  - O runbook ("A versão com as ordens de serviço"): as permissões dos perfis da TI, com o `estoque.movimentar` de quem lança as peças.
  - O contrato de módulo (`docs/casca/modulos.md`): o evento de uma capacidade que relê a tela de outra, como `ordens.mudaram` na ficha da solicitação.
  - O mapa (`docs/mapa.md`): a change e o glossário.
- [x] 6.2 Conferir as verificações. Verificar: os comandos passam, e o CI do PR fica verde.
  - `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:stories`, `pnpm test:e2e`, `pnpm test:e2e:pilha` e `pnpm test:visual` verdes no PC-DEV;
  - `contrato:verificar` em dia e `openspec validate p4e-ordens-de-servico --strict` sem erros;
  - o #66 mergeado com os sete jobs verdes, depois de reexecutar o dos unitários, em que um teste do cadastro de ativo, fora da P4e, estourou os 15 s com a máquina carregada.
  - `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:stories`, `pnpm test:e2e`, `pnpm test:e2e:pilha` e `pnpm test:visual` verdes;
  - `contrato:verificar` em dia;
  - `openspec validate p4e-ordens-de-servico --strict` sem erros.
