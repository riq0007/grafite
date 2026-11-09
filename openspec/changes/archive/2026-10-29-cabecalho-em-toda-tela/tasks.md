## 1. As telas

- [x] 1.1 Escrever primeiro o teste-guarda e depois passar ao `CabecalhoDaPagina` os títulos soltos de todos os estados, nos módulos, no módulo desligado e na página não encontrada (design, decisões 1 e 2). Verificar: o teste-guarda reprova antes, com os arquivos e as linhas, e passa depois; os testes da web passam com "Tela carregando".
- [x] 1.2 Escrever primeiro o teste da Conta dos Ajustes e depois passar as partes ao carimbo e os dados à lista de dados (decisão 3). Verificar: o teste passa com os termos e as definições na lista de dados.
- [x] 1.3 Passar o título da etapa do cadastro em etapas ao desenho do carimbo (decisão 4). Verificar: os testes do cadastro em etapas passam, com o foco no título ao mudar de etapa.
- [x] 1.4 Escrever primeiro as histórias "Espaço depois do cabeçalho" e "Título oculto com a barra das abas" e depois o espaço no painel da aba e na seção da janela com seções, e o cabeçalho que some com a barra (decisões 5 e 6). Verificar: as histórias passam, e as outras histórias da casca continuam passando.

## 2. A auditoria

- [x] 2.1 Rodar a auditoria das 76 telas no `pnpm dev`, na largura do computador (1.440 px) e na do celular (390 px), e corrigir o que ela achar (decisão 7). Verificar: os oito critérios passam em todas as telas, nas duas larguras, fora do que os "Non-Goals" deixam de fora.

## 3. Fechamento

- [x] 3.1 Conferir as verificações:
  - `pnpm lint`;
  - `pnpm typecheck`;
  - `pnpm test`;
  - `pnpm test:stories`;
  - `pnpm test:visual`;
  - `pnpm test:e2e`;
  - `pnpm test:e2e:pilha`;
  - `openspec validate cabecalho-em-toda-tela --strict`.

  Verificar: os comandos passam.
