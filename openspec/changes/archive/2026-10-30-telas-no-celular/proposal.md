## Why

Depois das auditorias automáticas, as 76 telas do `pnpm dev` foram inspecionadas uma a uma, a 1.440 px e a 390 px. No celular, três telas funcionam, mas ficam ruins de ler:
- **o bloco "Backups do Control iD" do Início:** o nome, os rostos, os dias sem backup e a faixa dos dias se espremem em duas colunas, e "Sem backup há 1 dia" quebra em três linhas ao lado da faixa;
- **a tabela dos ativos:** o nome do ativo é cortado antes do tipo, como "I… Impressora", porque o tipo nunca encolhe;
- **os Painéis:** três painéis lado a lado em 300 px, cada um com cerca de 90 px de largura, sem dar para ler o conteúdo.

Esta change segue o subprojeto D1 · Linguagem visual v3 da spec mestre, nas telas. Fica fora dela o desenho do computador, que não muda.

## What Changes

- **O bloco dos backups no Início:** na largura estreita, o nome e a faixa dos dias ocupam a linha inteira, e os rostos e os dias sem backup ficam entre eles, lado a lado.
- **O nome antes do tipo:** na coluna principal da tabela dos ativos, o tipo encolhe e termina em reticências antes do nome.
- **Os Painéis no celular:** um embaixo do outro, cada um com a altura da área da janela, que rola.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `modulo-paineis`: a grade adaptativa no celular.

## Impact

- `apps/web/src/modulos`: o bloco dos backups do Início, a célula do nome dos ativos e a grade dos Painéis.
- Nenhuma mudança no `packages/ui`, na API nem no domínio.
