## 1. As preferências

- [x] 1.1 Escrever primeiro os testes e depois a largura e as opções no item de `inicio.blocos`, no domínio, nos esquemas da API e no contrato (design, decisão 2). Verificar: os testes do domínio passam com "Opção fora da forma" e "Preferências de antes das opções", o teste de integração das preferências grava um bloco com opções e recusa o 13º com 400, e o `pnpm contrato:verificar` passa.
- [x] 1.2 Escrever primeiro os testes e depois o `moverItem` e o `ocultarItem`, da lista ordenada das preferências, preservando a largura e as opções. Verificar: os testes da lista passam com o item movido e o item mostrado de novo com as opções dele.

## 2. O Início

- [ ] 2.1 Escrever primeiro os testes e depois as opções no `BlocoDoInicio` e a resolução delas no Início (decisão 1). Verificar: os testes passam com "Opção gravada", "Local inativado nas opções" e "Bloco sem opções".
- [ ] 2.2 Escrever primeiro os testes e depois a gaveta "Opções…", com as três formas e o "Restaurar as opções" (decisão 3). Verificar: os testes passam com "Restaurar as opções" e com a última caixa marcada desabilitada, sem violação de acessibilidade.
- [ ] 2.3 Escrever primeiro os testes e depois a largura e a grade (decisão 4). Verificar: os testes passam com "Dois blocos lado a lado" e "Metade no celular", e a ordem do teclado segue a lista.

## 3. Os suprimentos

- [ ] 3.1 Escrever primeiro os testes de integração e depois o `GET /ativos/suprimentos/menores` (decisão 5). Verificar: os testes passam com "Só o toner", "Só o fusor", "Até 30%", o escopo pelo local de quem pede e o 403 sem `ativos.ver`, e o `pnpm contrato:verificar` passa.
- [ ] 3.2 Escrever primeiro os testes e depois as opções do bloco e o recorte em texto (decisões 5 e 6). Verificar: os testes passam com "Toner quase no fim", "Só o toner", "Recorte em texto" e "Nenhuma impressora neste recorte.".

## 4. Fechamento

- [ ] 4.1 Conferir no `pnpm dev`: escolher só Toner, depois só Fusor, limitar a 30%, escolher um local e pôr os dois blocos de módulo lado a lado. Verificar: o bloco muda na hora, o recorte aparece em texto, e a escolha continua depois de recarregar.
- [ ] 4.2 Atualizar o contrato de módulo (`docs/casca/modulos.md`, "Blocos no Início"), a spec mestre (seção 7.6) e o mapa. Verificar: os testes da documentação e do mapa passam.
- [ ] 4.3 Conferir as verificações:
  - `pnpm lint`;
  - `pnpm typecheck`;
  - `pnpm test`;
  - `pnpm test:integration`;
  - `pnpm test:e2e`;
  - `pnpm contrato:verificar`;
  - `openspec validate opcoes-dos-blocos-do-inicio --strict`.

  Verificar: os comandos passam.
