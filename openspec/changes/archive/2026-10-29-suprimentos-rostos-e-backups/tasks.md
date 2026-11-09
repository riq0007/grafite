## 1. O domínio

- [x] 1.1 Escrever primeiro os testes e depois a `tintaDoSuprimento` e a `estimarFimDoSuprimento` (design, decisões 1 e 3). Verificar: os testes passam com "Toner colorido", "Toner trocado", "Nível parado" e "Quando o toner acaba".
- [x] 1.2 Escrever primeiro os testes e depois a `diasDosBackups` e a `contagensDoBackup` (decisão 6): os dias de São Paulo, a melhor situação do dia e as categorias com erro. Verificar: os testes passam com "Dia com falha e sucesso" e "Fotos com erro".

## 2. A API

- [x] 2.1 Escrever primeiro os testes de integração e depois o `GET /ativos/{id}/suprimentos/serie`, com o esquema e o contrato regenerado. Verificar: o teste de integração passa com "Série de 30 dias", o 403 fora do alcance e o 404 do que não existe, e o `pnpm contrato:verificar` passa.
- [x] 2.2 Escrever primeiro os testes de integração e depois o `GET /controlid/backups/resumo`, com o filtro `ativo`, os dias de 7 a 90 e o contrato. Verificar: o teste de integração passa com os dias, o último, o anterior e a série dos rostos.

## 3. A web

- [x] 3.1 Escrever primeiro os testes e depois o painel Suprimentos com os cartuchos e a estimativa, e o medidor na célula da lista. Verificar: os testes da ficha e da lista passam com "Painel da impressora", "Toner colorido" e "Menor nível na lista".
- [x] 3.2 Escrever primeiro os testes e depois o resumo na seção Backups da ficha do controle: os rostos, os usuários, a tendência e a faixa. Verificar: os testes passam com "Rostos na ficha".
- [x] 3.3 Escrever primeiro os testes e depois a tabela "Últimos 30 dias" na tela "Backups do Control iD", com a ordem de quem tem mais dias sem backup. Verificar: os testes passam com "Controle sem backup".

## 4. Fechamento

- [x] 4.1 Ajustar os ponta a ponta que leem o painel Suprimentos e a tela de backups. Verificar: os specs mudados do `pnpm test:e2e` passam.
- [x] 4.2 Conferir as verificações:
  - `pnpm lint`;
  - `pnpm typecheck`;
  - `pnpm test`;
  - `pnpm test:integration` das rotas novas;
  - `openspec validate suprimentos-rostos-e-backups --strict`;
  - no `pnpm dev`, a ficha de uma impressora e a de um controle.

  Verificar: os comandos passam, e as telas mostram os cartuchos, os rostos e a faixa.

  Feito em 29/10: o lint, o typecheck, os testes dos dez pacotes, os testes de integração das duas rotas e a validação passaram. No `pnpm dev`, a ficha da Impressora de teste SNMP mostra o cartucho do Preto (K) a 8% e o do Cilindro a 60%, com a idade e o "Desatualizado", e a do Controle da portaria mostra 1 rosto, 3 usuários, a tendência e a faixa dos 30 dias.
