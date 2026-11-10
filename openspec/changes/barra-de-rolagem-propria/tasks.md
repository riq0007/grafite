## 1. A preferência

- [x] 1.1 Escrever primeiro os testes e depois o campo `aparencia.barraDeRolagem` no domínio, nos esquemas da API e no contrato (design, decisão 5). Verificar: os testes do domínio passam com "Valor desconhecido da barra", o teste de integração das preferências grava "sempre" e recusa outro valor com 400, e o `pnpm contrato:verificar` passa.
- [x] 1.2 Escrever primeiro os testes e depois o atributo `data-rolagem` em `atributosDaInterface` e na lista da primeira pintura do `index.html` (decisão 5). Verificar: os testes das preferências da web e o `antiFlash.test.ts` passam com "Sempre visível antes da primeira pintura".

## 2. A barra

- [x] 2.1 Escrever primeiro os testes e depois o `acompanharRolagem` (decisão 4). Verificar: os testes passam, com o relógio simulado, com "marca a área que rola", "tira a marca 1 s depois da última rolagem" e "o documento marca a raiz".
- [x] 2.2 Escrever primeiro os testes e depois o `barraDoSistemaSobreposta` (decisão 6). Verificar: os testes passam com "barra de largura zero" e "barra que ocupa espaço".
- [x] 2.3 Escrever primeiro a história "Barra de rolagem" do catálogo, com uma área que rola nas duas preferências, e depois as regras da `base.css`, tirando o `scrollbar-width: thin` das etapas do formulário (decisões 1 a 4). Verificar: a história passa com "Ponteiro sobre a área", "Rolagem pelo teclado" e "Sempre visível", sem violação de acessibilidade, e o `pnpm lint` passa, sem cor literal.
- [x] 2.4 Chamar o `acompanharRolagem` e a medida da barra do sistema na partida da web, do painel da operação e do catálogo. Verificar: o teste da partida da web passa com a raiz marcada num aparelho de barra sobreposta, e o `pnpm test:stories` continua passando.

## 3. Os Ajustes

- [x] 3.1 Escrever primeiro os testes e depois a escolha "Barra de rolagem" na seção Aparência, com as explicações, o aviso da barra do sistema, o endereço do ajuste e a entrada na busca. Verificar: os testes passam com "Escolher Sempre visível", "Barra de rolagem no celular", "Barra de rolagem pela busca" e "Restaurar padrões" voltando a "Ao rolar".

## 4. Fechamento

- [x] 4.1 Conferir no `pnpm dev`, nos temas Grafite e Papel: a janela de uma ficha longa, a tabela dos ativos, um menu longo do dock, uma gaveta e o Quick Look. Verificar: a mesma barra em todos, o polegar aparece com o ponteiro e ao rolar pelo teclado, nada muda de lugar, e "Sempre visível" vale na hora.
- [ ] 4.2 Regravar as referências da regressão visual em que a barra aparece, apagando antes as afetadas. Verificar: o `pnpm test:visual` passa, e a diferença de cada captura regravada é só a barra.
- [ ] 4.3 Atualizar a spec mestre (o padrão de fábrica na seção 7.2 e o tempo de 1 s no Apêndice B) e o mapa. Verificar: os testes da documentação e do mapa passam.
- [ ] 4.4 Conferir as verificações:
  - `pnpm lint`;
  - `pnpm typecheck`;
  - `pnpm test`;
  - `pnpm test:integration`;
  - `pnpm test:stories`;
  - `pnpm test:e2e`;
  - `pnpm contrato:verificar`;
  - `openspec validate barra-de-rolagem-propria --strict`.

  Verificar: os comandos passam.
