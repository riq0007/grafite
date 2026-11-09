## 1. Spec mestre e UI

- [x] 1.1 Atualizar a spec mestre: na seção 3.2, o P1f com o conteúdo da etiqueta, os dois formatos e a impressão pelo navegador. Verificar: o teste do mapa passa, com as seções citadas ainda com título.
- [x] 1.2 As cores fixas da etiqueta, com o teste antes: `--cor-etiqueta-fundo` e `--cor-etiqueta-texto` na raiz, fora dos temas, como as do QR code, e os tokens gerados de novo. Verificar: os testes dos tokens passam, e `pnpm tokens:verificar` fica em dia.
- [x] 1.3 `EtiquetaDoAtivo` e `FORMATOS_DE_ETIQUETA`, com as histórias antes: os dois formatos, o ativo sem patrimônio e o nome longo, cortado em duas linhas, em preto sobre branco em qualquer tema. Verificar: `pnpm test:stories` passa, e as capturas novas entram na regressão visual.

## 2. API

- [x] 2.1 A rota das etiquetas, com o teste de integração antes: `GET /ativos/etiquetas?ids=…`, na ordem pedida e sem repetir, só os ativos que a conta vê, com quantos ficaram de fora, e a recusa de mais de 200; o contrato e o cliente gerados de novo. Verificar: os testes de integração.

## 3. Web

- [x] 3.1 A tela das etiquetas, com o teste antes: os ativos, o formato e a etiqueta onde começar no endereço; a contagem, os que ficaram de fora e a recusa de mais de 200; a prévia das folhas; "Imprimir", com o portal da impressão e o `@page` do formato. Verificar: os testes da tela.
- [x] 3.2 De onde se imprime, com o teste antes: "Imprimir etiquetas" junto da contagem da seleção e no menu de contexto, na ordem da tabela, e "Imprimir etiqueta" na ficha. Verificar: os testes da tabela, do menu e da ficha.

## 4. Ponta a ponta

- [x] 4.1 Estender a ponta a ponta com a API simulada: a simulação ganha a rota das etiquetas; os cenários: selecionar duas linhas e abrir as etiquetas, trocar o formato, começar numa etiqueta da folha e imprimir, com o diálogo simulado. Verificar: `pnpm test:e2e` passa.
- [x] 4.2 Estender a ponta a ponta da pilha: a administradora abre a etiqueta pela ficha, e o endereço do QR, aberto num navegador sem sessão, pede a entrada e, depois dela, abre a ficha. Verificar: `pnpm test:e2e:pilha` passa.

## 5. Fechamento

- [x] 5.1 Documentação: os termos novos e a change no mapa (a capacidade `etiquetas-de-ativos` entra no mapa no arquivamento, junto com a sincronização das specs). Verificar: o teste do mapa passa.
- [x] 5.2 Conferir `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:stories`, `pnpm test:e2e`, `pnpm test:e2e:pilha` e `pnpm test:visual` verdes; `tokens:verificar`, `marca:verificar`, `contrato:verificar` e `fila:verificar` em dia; `openspec validate p1f-etiqueta --strict` sem erros. Verificar: os comandos passam, e o CI fica verde no PR para a `main`.
