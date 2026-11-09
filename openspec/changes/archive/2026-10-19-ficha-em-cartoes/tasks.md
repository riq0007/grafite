## 1. As peças puras e o contrato

- [x] 1.1 Os cartões da ficha em função pura (`cartoes.ts`; design, decisão 2). Começar pelo teste. Verificar: os testes passam, cobrindo:
  - a ordem dos cartões da impressora, com a Visão geral primeiro;
  - a capacidade com o painel e sem campos, e a situação dela em texto;
  - o resumo com os dois primeiros valores e "Nada preenchido";
  - "Falta: IP" com "e mais N";
  - o restrito que a conta não vê e o arquivo, fora do resumo;
  - a contagem das alterações não salvas;
  - o primeiro cartão com uma recusa, com o modelo na Identificação.
- [x] 1.2 O resumo das relações dos módulos (decisão 3): o campo `resumo` na `RelacaoDoModulo`, o `useResumosDasRelacoes` pelo `useQueries`, e o resumo da relação dos alertas na mesma consulta do bloco, com "1 alerta aberto", "N alertas abertos" e "Alertas silenciados". Começar pelo teste. Verificar: os testes das relações e dos alertas passam, também com a permissão que muda com a ficha aberta.

## 2. A biblioteca

- [x] 2.1 A história capturada dos cartões de uma ficha, sem a numeração, com o resumo de cada cartão (spec componentes-base, "Cartões sem a numeração"). Verificar: as histórias passam pelo `vitest --project catalogo`, e a captura nova entra na regressão visual, com as referências geradas no contêiner do Playwright.

## 3. A ficha em cartões

- [x] 3.1 O cartão no endereço (decisão 4): `grupo` na busca da ficha, com a Visão geral fora dela e o grupo desconhecido abrindo a Visão geral. Começar pelo teste. Verificar: os testes da busca da ficha passam.
- [x] 3.2 O `FormularioDoAtivo` em cartões e a `FichaDoAtivo` com a Visão geral, os painéis e a imagem passados por cartão (decisões 1 e 5), com os outros testes da ficha pelos cartões, pelo ajudante `abrirCartao`, no mesmo commit, para a suíte não ficar vermelha entre os dois. Começar pelo teste. Verificar: a suíte da web passa, cobrindo:
  - os cartões da impressora, com a Visão geral aberta;
  - o resumo de cada cartão, também o das capacidades;
  - o painel com a imagem e "Trocar imagem", em todo cartão;
  - o painel da capacidade sem repetir o título do cartão;
  - o salvar de dois cartões numa gravação só, com a contagem;
  - a recusa que abre o cartão do campo, com o foco nele;
  - o cartão no endereço;
  - a ficha só para leitura;
  - os valores do servidor na ficha aberta, como hoje;
  - os arquivos dos campos, os segredos, a disponibilidade, os suprimentos, o Control iD e os alertas, pelos cartões.

## 4. Ponta a ponta

- [x] 4.1 A ponta a ponta da web. Verificar: o `pnpm test:e2e` passa no CI do PR.
  - As pontas a ponta que editam a ficha abrem o cartão do campo, com o ajudante comum.
  - A nova cobre os cartões da impressora, o resumo, o salvar de dois cartões e o cartão no endereço depois de recarregar.
- [x] 4.2 A ponta a ponta da pilha, com os passos que editam a ficha abrindo o cartão do campo. Verificar: o `pnpm test:e2e:pilha` passa no CI do PR.

## 5. Fechamento

- [x] 5.1 A documentação. Verificar: o teste-guarda do mapa e o da documentação passam.
  - O contrato de módulo (`docs/casca/modulos.md`) ganha o resumo da relação no cartão da Visão geral.
  - A seção 7.4 da spec mestre ganha a ficha em cartões.
  - O mapa traz a change em andamento.
- [x] 5.2 Conferir as verificações: `pnpm lint`, `pnpm typecheck`, `pnpm contrato:verificar` e `openspec validate ficha-em-cartoes --strict` sem erros, e o CI do PR verde. Verificar: os comandos passam, e o PR fica com todos os jobs verdes.
