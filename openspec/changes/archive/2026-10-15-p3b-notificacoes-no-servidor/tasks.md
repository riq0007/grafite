## 1. Domínio

- [x] 1.1 Escrever primeiro os testes e depois quem recebe a notificação de um alerta e o agrupamento (design, decisões 3 e 4): a conta com `alertas.ver` ou uma permissão que a inclui no local do ativo, o coletor e o ativo sem local só pela organização inteira, e a troca das notificações de uma conta que passam de 5 por "N alertas abertos", com a severidade mais alta. Verificar: os testes do domínio passam com os cenários de "Notificações dos alertas".
- [x] 1.2 Escrever primeiro os testes e depois o Foco nas preferências (`notificacoes.foco`, decisão 10), desligado de fábrica e validado como as outras, e o tipo de evento `notificacoes.mudaram`, com o público das contas. Verificar: os testes do domínio passam, inclusive os das preferências e do catálogo de eventos.

## 2. Banco

- [x] 2.1 Escrever primeiro o teste de integração e depois a tabela `notificacoes` com a migration (decisão 2): o RLS forçado, as checagens, a conta e o alerta pelas chaves estrangeiras, e os índices da conta, das não lidas e do momento. Verificar: os testes de integração do banco passam, com o teste-guarda do RLS.

## 3. API

Cada tarefa entra com os esquemas das rotas dela e o cliente gerado de novo (`pnpm contrato:gerar`).

- [x] 3.1 Escrever primeiro o teste de integração e depois o `notificar` (decisão 6) e as rotas das notificações (decisões 5 e 7): a lista com a severidade, "só não lidas", o cursor e a contagem; o alerta atual de cada uma, com o que a conta pode tratar; a leitura de uma e de todas, com o evento; a notificação de outra conta, que responde 404. Verificar: os testes de integração passam com os cenários de "Notificações gravadas no servidor" e "Ações do alerta na notificação".
- [x] 3.2 Escrever primeiro o teste de integração e depois as notificações na avaliação dos alertas (decisões 3 e 4): quem vê pelo escopo, a conta inativa, o aberto no silêncio, o pendente que abre, o alerta que muda sem notificar de novo, o agrupamento acima de 5 e o evento só para as contas notificadas. Verificar: os testes de integração passam com os cenários de "Notificações dos alertas", e o teste de desempenho do P3a continua dentro das metas com a notificação.
- [x] 3.3 Escrever primeiro o teste de integração e depois a notificação do último código de recuperação, gravada pela API na entrada. Verificar: os testes de integração passam com o cenário "Último código".
- [x] 3.4 Escrever primeiro o teste de integração e depois a retenção das notificações na manutenção diária (decisão 12). Verificar: os testes de integração passam com os cenários "Notificação antiga" e "Notificações com mais de 90 dias", e rodar a manutenção duas vezes não muda nada.

## 4. Biblioteca de componentes

- [x] 4.1 Escrever primeiro os testes e depois a central com os filtros de quem a usa, a página seguinte ao fim da lista, o estado de erro com "Tentar de novo", o interruptor do Foco e o texto da situação do alerta; o sino com o Foco; e o rótulo do adiar no aviso (decisão 13), com as histórias do catálogo. Verificar: os testes da biblioteca e o `pnpm test:stories` passam; as referências do `pnpm test:visual` não mudam, porque os estados novos só aparecem com as props novas e ficam nas histórias de interação.

## 5. Web

- [x] 5.1 Escrever primeiro os testes e depois o `useNotificacoes()` lido da API (decisão 8): as recentes e a da central, os eventos que as invalidam, abrir, marcar como lida e marcar todas, e o reconhecer e o adiar pelas rotas do alerta; a casca com a central e o sino de verdade; e o fim do `notificar` local, com a entrada que mantém o aviso do último código. Verificar: os testes da web passam com os cenários de "Central de notificações", "Sino e não lidas" e "Notificar".
- [x] 5.2 Escrever primeiro os testes e depois os avisos na aba da vez (decisão 9): só as novas viram aviso, conforme as preferências e o Foco; a aba da vez pelo `BroadcastChannel`; e o aviso que sai quando a notificação é lida ou o alerta é reconhecido, adiado ou resolvido. Verificar: os testes da web passam com os cenários de "Aviso na tela conforme as preferências", "Aviso numa aba só" e "Modo Foco".
- [x] 5.3 Escrever primeiro os testes e depois o Foco na seção Notificações dos Ajustes e a etapa "Conectando alertas" da chegada, dentro dos 5 s (decisão 11). Verificar: os testes da web passam com os cenários "Foco pelos Ajustes", "Etapas na ordem", "Sem sessão" e "Servidor fora do ar".

## 6. Ponta a ponta

- [x] 6.1 A ponta a ponta com a API simulada: a notificação que chega pelo evento vira aviso com "Reconhecer"; a central lê as notificações da API, com o filtro e "Marcar todas como lidas"; e o Foco deixa só o Crítico na tela. Verificar: `pnpm test:e2e` passa.
- [x] 6.2 A ponta a ponta da pilha: quando a regra do toner muda, o alerta abre e a administradora vê o aviso Crítico na tela e o sino com uma não lida; ela reconhece pelo aviso, e a central mostra a notificação lida, com "Reconhecido por Ana Souza". Verificar: `pnpm test:e2e:pilha` passa.

## 7. Fechamento

- [x] 7.1 Atualizar a documentação:
  - a spec mestre: os canais (seção 6.5) e a retenção (6.7), já com a divisão do P3 na seção 3.2 desde a proposta;
  - o mapa (`docs/mapa.md`);
  - o contrato de módulo (`docs/casca/modulos.md`), com a notificação pela API, o Foco e o que sai de "Fora do contrato".

  Verificar: `pnpm test` passa, com o teste-guarda do mapa e o dos trechos do contrato.
- [x] 7.2 Conferir as verificações: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:stories`, `pnpm test:e2e`, `pnpm test:e2e:pilha` e `pnpm test:visual` verdes; `contrato:verificar` em dia; `openspec validate p3b-notificacoes-no-servidor --strict` sem erros. Verificar: os comandos passam, e o CI do PR fica verde.
