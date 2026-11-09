## 1. Domínio e banco

- [x] 1.1 Escrever primeiro os testes e depois o conversor do DXF, a leitura do modelo do PMG, a situação no mapa, as permissões, a auditoria e o evento (design, decisões 1, 2 e 4). Verificar: os testes do domínio passam com os cenários "Planta do PMG importada", "DXF convertido" e "Impressora offline no mapa".
- [x] 1.2 Escrever primeiro o teste de integração e depois a migration 0043 (decisão 3). Verificar: os testes do banco passam, com o teste-guarda do RLS.

## 2. API

- [x] 2.1 Escrever primeiro o teste de integração e depois o envio e a conversão, as plantas, o modelo, os marcadores pelos fornecedores e as posições (decisões 1 a 4), com o contrato gerado de novo. Verificar: os testes de integração passam com os cenários "Planta do PMG importada", "Formato recusado", "Impressora posicionada", "Quem só vê o mapa", "Impressora offline no mapa" e "Sem permissão".

## 3. Web

- [x] 3.1 Escrever primeiro os testes e depois o módulo Mapa: as plantas, o mapa em canvas, as camadas, a busca, o painel do marcador e o posicionamento (decisões 5 e 6). Verificar: os testes da web passam com os cenários "Quem só vê o mapa", "Camada desligada" e "Busca pelo texto do desenho".

## 4. Fechamento

- [x] 4.1 Atualizar a spec mestre, o mapa e o contrato de módulo (as camadas no mapa), e conferir `pnpm lint`, `pnpm typecheck`, os testes que a change toca e `openspec validate p7-mapa-da-planta --strict`. O CI fica de lado até o fim de outubro.
  - Feito em 28/10: o P7 na spec mestre, a capacidade e a change no mapa, a camada no mapa no contrato de módulo; o `pnpm lint` e o `pnpm typecheck` verdes; os testes do domínio (1.195), da API (339 unitários e 4 de integração do mapa), do banco (6) e da web do mapa (9), do registro e do contrato; o modelo real do PMG lido por inteiro; a change valida sem erros.
