## 1. As preferências

- [x] 1.1 Escrever primeiro os testes e depois o campo `inicio.blocos` no domínio, nos esquemas da API e no contrato (design, decisão 2). Verificar: os testes do domínio passam com "Bloco repetido", o teste de integração das preferências grava os blocos, e o `pnpm contrato:verificar` passa.

## 2. O Início

- [x] 2.1 Escrever primeiro os testes e depois o `BlocoDoInicio` no contrato de módulo, o Início em blocos, com "O que resolver agora" como o primeiro, e a busca no topo (decisões 1 e 4). Verificar: os testes passam com "Bloco de um módulo", "Bloco de um módulo que saiu" e "Busca no topo".
- [x] 2.2 Escrever primeiro os testes e depois o modo Personalizar (decisão 3). Verificar: os testes passam com "Subir um bloco", "Ocultar e mostrar" e "O que resolver agora sempre à vista".
- [x] 2.3 Escrever primeiro os testes e depois o bloco "Suprimentos que acabam primeiro" no Ativos (decisão 5). Verificar: o teste passa com "Toner quase no fim".
- [x] 2.4 Escrever primeiro os testes e depois o bloco "Backups do Control iD" na Gestão de ativos (decisão 6). Verificar: o teste passa com "Controle sem backup", e o `pnpm dev` mostra os dois blocos.

  Feito em 29/10: no `pnpm dev`, o Início mostra a busca no topo, "O que resolver agora" com 2 abertas, a prateleira com o cartucho K da Impressora de teste SNMP a 8% e o Controle da portaria com 1 rosto e "Sem backup há 1 dia", que bate com a faixa: backup bom em 28/10 e falha em 29/10.

## 3. Fechamento

- [x] 3.1 Atualizar o contrato de módulo (`docs/casca/modulos.md`), a spec mestre e o mapa. Verificar: os testes da documentação e do mapa passam.
- [x] 3.2 Conferir as verificações:
  - `pnpm lint`;
  - `pnpm typecheck`;
  - `pnpm test`;
  - `openspec validate inicio-ajustavel --strict`.

  Verificar: os comandos passam.

  Feito em 29/10: o lint, o typecheck, os testes dos dez pacotes e a validação passaram.
