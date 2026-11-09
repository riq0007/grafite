## 1. Biblioteca

- [x] 1.1 Escrever primeiro as histórias com os testes de interação e depois a busca com sugestões aberta pelo clique, pelo botão e pelas setas, com as seções "Sugeridos" e o rodapé "Digite para buscar entre N" (design, decisões 1 e 2). Verificar: `pnpm test:stories` passa, com o Esc que fecha sem mudar o valor e a acessibilidade do catálogo.
- [x] 1.2 Escrever primeiro as histórias com os testes de interação e depois a `EscolhaEmArvore`, com o filtro pelo caminho, a sugestão com a origem e o teclado da árvore (decisão 3). Verificar: `pnpm test:stories` passa.

## 2. API

Cada tarefa entra com os esquemas das rotas e o cliente gerado de novo (`pnpm contrato:gerar`).

- [x] 2.1 Escrever primeiro os testes de integração e depois as rotas sem o texto (decisão 4): os nomes das pessoas com o total e o mesmo local primeiro, as contas da auditoria e os fabricantes, os do tipo primeiro. Verificar: os testes de integração passam, e os nomes não trazem o local de ninguém.
- [x] 2.2 Escrever primeiro o teste de integração e depois a lista dos grupos com os perfis em vigor de cada um, com o escopo (decisão 5). Verificar: os testes de integração passam.

## 3. Web

- [x] 3.1 Escrever primeiro os testes e depois os seletores: o de local pela `EscolhaEmArvore`, com a sugestão vinda da tela, e o de conta e o de pessoa com as sugestões sem o texto. Verificar: os testes da web passam.
- [x] 3.2 Escrever primeiro os testes e depois as outras escolhas pela busca nova: o fuso horário com os do Brasil sugeridos, a ação e "Quem fez" na auditoria, o grupo do campo e o fabricante do modelo. Verificar: os testes da web passam.
- [x] 3.3 Escrever primeiro os testes e depois os grupos da conta como tabela, com a situação, "Incluir" e "Retirar" na linha, o efeito em texto na confirmação e o filtro com mais de 10 grupos (decisão 5). Verificar: os testes da web passam com os cenários da spec administracao-de-pessoas.
- [x] 3.4 Escrever primeiro os testes e depois a gaveta de atribuir perfil, na ficha da pessoa e na do grupo, com os perfis em rádios, o escopo, o local sugerido e o "Resultado" (decisão 6). Verificar: os testes da web passam com os cenários da spec modulo-administracao.

## 4. Ponta a ponta e regressão visual

- [x] 4.1 A ponta a ponta simulada e a da pilha abrem as escolhas pelo clique, e a da pilha atribui um perfil pela gaveta, com o "Resultado". As referências visuais dos campos com o botão de abrir são regravadas. Verificar: `pnpm test:e2e`, `pnpm test:e2e:pilha` e `pnpm test:visual` passam.

## 5. Fechamento

- [x] 5.1 A seção "Escolhas" do contrato de módulo (decisão 7) e o mapa. Verificar: `pnpm test` passa, com o teste-guarda do mapa.
- [x] 5.2 Conferir as verificações: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:stories`, `pnpm test:e2e`, `pnpm test:e2e:pilha` e `pnpm test:visual` verdes, `contrato:verificar` em dia, e `openspec validate escolhas-a-vista --strict` sem erros. Verificar: os comandos passam, e o CI do PR fica verde.
