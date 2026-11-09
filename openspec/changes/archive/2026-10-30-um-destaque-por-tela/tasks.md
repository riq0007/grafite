## 1. As telas

- [x] 1.1 Escrever primeiro os testes da lista vazia dos Modelos e do "Ativar" da Conta, e depois passar ao nível secundário a ação dos 13 estados vazios que repetem o cabeçalho e o "Ativar" (design, decisões 1, 2 e 3). Verificar: os testes passam com "Lista vazia", e os testes da web continuam passando.

- [x] 1.2 Inspecionar as 76 telas uma a uma, nas capturas do `pnpm dev`, e corrigir o que destoa: o controle segmentado que quebra no computador e a ação do estado vazio como link (decisões 4 e 5), escrevendo primeiro o teste dos estados vazios das Salas e dos Painéis. Verificar: os testes passam, e o segmentado dos Consumíveis fica numa linha a 1.440 px e quebra no Backup a 390 px, sem rolagem lateral.

## 2. A auditoria

- [x] 2.1 Rodar a auditoria anti-slop das 76 telas no `pnpm dev`, a 1.440 px e a 390 px. Verificar: os nove itens passam em todas as telas.

## 3. Fechamento

- [x] 3.1 Conferir as verificações:
  - `pnpm lint`;
  - `pnpm typecheck`;
  - `pnpm test`;
  - `pnpm test:e2e`;
  - `openspec validate um-destaque-por-tela --strict`.

  Verificar: os comandos passam.
