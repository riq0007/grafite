## 1. Domínio

- [x] 1.1 Escrever primeiro os testes e depois o catálogo das condições (design, decisão 2), com os parâmetros, e a conferência da regra (`conferirRegra`), com cada mensagem da spec alertas. Verificar: os testes do domínio passam com os cenários de "Regras de alerta".
- [x] 1.2 Escrever primeiro os testes e depois as regras de fábrica (decisão 4), o texto do alerta (decisão 7) e a decisão do motor (`decidirAlerta`, decisões 5 e 6). Os casos da decisão:
  - criar o pendente ou o aberto;
  - abrir quando a duração passa;
  - atualizar o texto e a severidade;
  - manter com a leitura sem dado e com o valor dentro da folga;
  - resolver;
  - encerrar fora da regra;
  - descartar o pendente;
  - marcar o aberto no silêncio.

  Verificar: os testes do domínio passam com os cenários de "Avaliação a cada minuto", "Recuperação com folga" e "Texto do alerta".
- [x] 1.3 Escrever primeiro os testes e depois as permissões `alertas.ver`, `alertas.tratar` e `alertas.administrar`, o módulo opcional Alertas, o evento `alertas.mudaram` e as ações da auditoria, com o evento de cada uma (decisões 9 e 12). Verificar: os testes do domínio passam, inclusive os do catálogo de permissões e dos módulos.

## 2. Banco

- [x] 2.1 Escrever primeiro o teste de integração e depois as tabelas `regras_de_alerta`, `alertas` e `silencios_dos_ativos` com a migration (decisão 3): o RLS forçado, o índice único parcial dos alertas não resolvidos e as checagens. Verificar: os testes de integração do banco passam, com o teste-guarda do RLS e a recusa de dois alertas abertos iguais.

## 3. API

Cada tarefa entra com os esquemas das rotas dela e o cliente gerado de novo (`pnpm contrato:gerar`).

- [x] 3.1 Escrever primeiro o teste de integração e depois as rotas das regras (decisão 10): a lista, o cadastro, a edição, a inativação e a reativação, com a conferência, o escopo, a condição que não muda, a auditoria e o evento. Verificar: os testes de integração passam com os cenários de "Regras de alerta", e a conta sem `alertas.administrar` é recusada.
- [x] 3.2 Escrever primeiro o teste de integração e depois a garantia das regras de fábrica (decisão 4), no comando que cria a organização e na avaliação. Verificar: os testes de integração passam, com a organização que já existia, a regra de fábrica editada que não volta e a auditoria do sistema.
- [x] 3.3 Escrever primeiro o teste de integração e depois a avaliação de uma organização (decisões 5 a 7) para o Ativo offline, o Nível do toner, a Condição da impressora e a Saúde do Control iD, com o escopo, a duração, a folga, a leitura sem dado, o encerramento fora da regra, o silêncio, o trinco da organização e o evento só com mudança. Verificar: os testes de integração passam com os cenários de "Avaliação a cada minuto", "Recuperação com folga" e "Encerramento quando a regra deixa de valer".
- [x] 3.4 Escrever primeiro o teste de integração e depois a Coleta atrasada e o Coletor sem contato na avaliação, e a tarefa agendada a cada minuto, que põe uma avaliação por organização com o módulo ligado, e a avaliação posta na fila pela mudança de uma regra. Verificar: os testes de integração passam com os cenários das duas condições, e a organização com o módulo desligado não é avaliada.
- [x] 3.5 Escrever primeiro o teste de integração e depois a lista dos alertas, com os filtros, o "para resolver", a ordem e o cursor, e quem vê pelo escopo (decisão 8). Verificar: os testes de integração passam com os cenários de "Quem vê os alertas", inclusive o desempenho da lista e da avaliação com 10 mil ativos.
- [x] 3.6 Escrever primeiro o teste de integração e depois o reconhecimento, o adiamento e o silêncio do ativo, com a permissão de tratar no escopo, as recusas, a auditoria, o evento e o adiamento e o silêncio vencidos tirados pela avaliação. Verificar: os testes de integração passam com os cenários de "Reconhecer o alerta", "Adiar o alerta" e "Silenciar os alertas de um ativo".

## 4. Web

- [x] 4.1 Escrever primeiro os testes e depois o módulo Alertas no registro: o dock, o menu, a busca, a barra de abas do celular, as rotas e a atualização pelo evento. Verificar: os testes da web passam com os cenários de "Alertas no dock".
- [x] 4.2 Escrever primeiro os testes e depois a lista dos abertos e a dos resolvidos, com as colunas, a ordem, os filtros, o reconhecer, o adiar e os estados vazios e de falha. Verificar: os testes da web passam, e nenhum estado é comunicado só pela cor.
- [x] 4.3 Escrever primeiro os testes e depois a tela das regras: a lista, a nova regra e a ficha, com os campos de cada condição, as mensagens no campo, a inativação e a reativação. Verificar: os testes da web passam com os cenários de "Regras na tela".
- [x] 4.4 Escrever primeiro os testes e depois o bloco Alertas na ficha do ativo, pela relação com o alvo `ativo` no contrato de módulo, com os alertas abertos, as ações e o silêncio. Verificar: os testes da web passam com os cenários de "Alertas na ficha do ativo".
- [x] 4.5 Escrever primeiro os testes e depois a fonte de ocorrências da tela inicial, sem os adiados e sem os dos ativos silenciados, atualizada pelo evento. Verificar: os testes da web passam com os cenários de "Ocorrências em 'O que resolver agora'".

## 5. Ponta a ponta

- [x] 5.1 A ponta a ponta com a API simulada: a lista dos abertos com o reconhecer, a regra nova do toner e o alerta na tela inicial. Verificar: `pnpm test:e2e` passa.
- [x] 5.2 A ponta a ponta da pilha: com o simulador SNMP, o toner gravado em 8% fica abaixo do limite da regra de fábrica "Toner em 10% ou menos"; quem administra sobe o limite para 15%, a mudança pede a avaliação na hora, e o alerta do toner aparece na tela inicial, pelo evento, e na ficha; o reconhecimento mostra quem reconheceu. A auditoria do comando que cria a organização passa a ter as regras de fábrica. Verificar: `pnpm test:e2e:pilha` passa.

## 6. Fechamento

- [x] 6.1 A spec mestre (seção 5.4, os alertas das capacidades), o mapa (`docs/mapa.md`), o contrato de módulo (`docs/casca/modulos.md`), com a fonte de ocorrências de verdade e a relação na ficha do ativo, e o runbook, com as regras de fábrica e o silêncio. Verificar: `pnpm test` passa, com o teste-guarda do mapa.
- [x] 6.2 Conferir as verificações: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:stories`, `pnpm test:e2e`, `pnpm test:e2e:pilha` e `pnpm test:visual` verdes; `contrato:verificar` em dia; `openspec validate p3a-regras-e-alertas --strict` sem erros. Verificar: os comandos passam, e o CI do PR fica verde.
