## 1. As releases de hoje

- [x] 1.1 Subir para a v0.1.0 e para a `ensaio-v0.1.1-92` o `instalar.sh` de dentro do pacote de cada uma (design, decisão 5):
  - lido do tar baixado da própria release;
  - conferido igual ao `apps/operacao/lancadores/instalar.sh` do commit dela;
  - publicado pelo `gh release upload`, sem mudar o pacote nem o `.sha256`.

  Verificar: o `gh release view` mostra o `instalar.sh` nas duas, e o SHA-256 de cada um é igual ao do arquivo de dentro do tar.
  - Feito em 27/10: os dois tars conferem com o `.sha256` deles, e o `instalar.sh` de dentro de cada um é igual ao do commit da release. Nas duas, o `instalar.sh` publicado tem o SHA-256 `e5fa418e…a5da0a`, o mesmo de dentro dos tars.

## 2. O roteiro

- [x] 2.1 Escrever primeiro os testes e depois, no `instalar.sh`:
  - o pacote achado na pasta do roteiro, sem argumentos ou com o primeiro começando por `--` (decisão 2);
  - a parada, com a mensagem, quando a pasta não tem nenhum pacote ou tem mais de um;
  - as mensagens com `sudo bash instalar.sh` (decisão 3).

  Verificar: os testes do `lancadores.test.ts` passam com os cenários "Roteiro baixado da release", "Pasta com mais de um pacote" e "Pasta sem pacote", e os de hoje continuam passando, com as mensagens novas.

## 3. O pacote e a release

- [x] 3.1 Escrever primeiro o teste e depois a cópia do `instalar.sh` ao lado do tar, no `empacotar-linux.ts` (decisão 1). Verificar: o teste confere a cópia na pasta de saída, igual à de dentro do tar, e o teste do pacote continua passando. O modo 755 da cópia não é conferido, porque o Windows do executor não o guarda, e o roteiro roda pelo `bash` de qualquer jeito.
- [x] 3.2 Mudar o `versao.yml` (decisão 4):
  - a instalação de teste no Linux usa a cópia de fora, conferida com o `cmp` contra a de dentro do tar, sem tirar o roteiro do tar;
  - as notas da release citam o `instalar.sh` ao lado do tar.

  Verificar: o job do `versao.yml` no PR passa, com a instalação no Linux pela cópia de fora, e a pasta do pacote para Linux tem o `instalar.sh`.
  - Feito em 27/10: no #73, a versão (run 40607205030) passou, com a instalação no Linux pela cópia de fora, igual pelo `cmp` à de dentro do tar, e a pasta do pacote para Linux com o `instalar.sh`.

## 4. Fechamento

- [x] 4.1 Atualizar a documentação:
  - o runbook, na instalação no Linux: os três arquivos da release na mesma pasta, o `sudo bash instalar.sh` e, para quem preferir, o caminho de tirar o roteiro de dentro do pacote depois de conferir o hash;
  - a spec mestre, nas seções 3.1, 4.3 e 12.2;
  - o `CLAUDE.md`: as linhas do empacotamento e da instalação no Linux;
  - o `docs/mapa.md`: a change.

  Verificar: `pnpm test` passa, com o teste-guarda do mapa, e o cenário "Roteiro baixado da release" é atendido pela seção do runbook.
  - Conferido com os testes que leem a documentação: o do mapa, o do runbook, o do que o PR muda e os do Linux, com 94 testes. O `pnpm test` inteiro fica para a 4.2, depois do CI da `main` que roda agora no executor.
- [x] 4.2 Conferir as verificações: `pnpm lint`, `pnpm typecheck` e `pnpm test` verdes, e `openspec validate instalar-sh-na-release --strict` sem erros. Verificar: os comandos passam, e o CI do PR, com o job do `versao.yml`, fica verde.
  - Feito em 27/10: o lint, os tipos e os testes passaram no CI do #73 (run 40607205039), e o `openspec validate --strict` da change não tem erros. Os dois workflows do #73 ficaram verdes na segunda tentativa. Na primeira, três jobs caíram pelo executor, e não pelo PR: a integração com o PostgreSQL real, com o p95 das consultas pesadas acima de 300 ms sob carga; o catálogo, com a história das abas presa ao relógio; e a instalação no Windows, sem resolver o `community.chocolatey.org` por um instante.
