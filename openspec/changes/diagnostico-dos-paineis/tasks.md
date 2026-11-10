## 1. O domínio e o banco

- [x] 1.1 Escrever primeiro os testes e depois o `exibicaoDaResposta` (design, decisão 1). Verificar: os testes passam com "Grafana de fábrica", "frame-ancestors com o endereço do Grafite", "frame-ancestors sem o Grafite", "Os dois cabeçalhos", "Ferramenta no endereço do Grafite", "Página de entrada", "Painel em HTTP com o cabeçalho" e a recusa vencendo a entrada.
- [x] 1.2 Acrescentar as colunas `exibicao` e `motivo_da_exibicao` à tabela `paineis`, com a migration (decisão 2). Verificar: a migration aplica num banco com painéis cadastrados, o teste-guarda do RLS passa, e a conferência dos valores recusa um valor fora dos três.

## 2. A API

- [x] 2.1 Escrever primeiro os testes de integração e depois a verificação com os cabeçalhos e o endereço final (decisão 3). Verificar: os testes passam, contra um servidor HTTP local, com "Grafana de fábrica", "Ferramenta liberada depois" (o evento sai) e "Painel fora do ar" (sem exibição), e a verificação que não muda nada não grava evento.
- [x] 2.2 Devolver a exibição na lista, no cadastro e no "Verificar agora", e gerar o contrato. Verificar: o `pnpm contrato:verificar` passa.

## 3. A tela

- [ ] 3.1 Escrever primeiro os testes e depois o bloco pela exibição (decisão 4). Verificar: os testes passam com "Painel que recusa ser embutido" (sem `iframe`), "Painel que pede a entrada" e "Liberado com a grade aberta".
- [ ] 3.2 Escrever primeiro os testes e depois a coluna "Exibição" e o retorno do "Verificar agora" no Cadastro. Verificar: os testes passam com "Verificar um painel que recusa ser embutido".

## 4. Fechamento

- [ ] 4.1 Conferir no `pnpm dev`, com dois servidores locais de teste: um que manda `X-Frame-Options: DENY` e um que redireciona para `/login`. Verificar: o primeiro mostra o motivo no bloco, o segundo mostra o aviso e a página, e um painel comum continua aparecendo.
- [ ] 4.2 Escrever o guia do que liberar no Grafana e no Zabbix em `docs/operacao/integracoes-da-rede.md`, conferindo o nome de cada ajuste na documentação da ferramenta, e atualizar o mapa (decisão 5). Verificar: os testes da documentação e do mapa passam.
- [ ] 4.3 Conferir as verificações:
  - `pnpm lint`;
  - `pnpm typecheck`;
  - `pnpm test`;
  - `pnpm test:integration`;
  - `pnpm contrato:verificar`;
  - `openspec validate diagnostico-dos-paineis --strict`.

  Verificar: os comandos passam.
