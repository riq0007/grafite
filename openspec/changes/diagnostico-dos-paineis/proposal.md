## Why

O usuário relatou, em 09/11/2026, que os "painéis não mostram o conteúdo da página". O bloco do painel é uma página embutida, e o navegador não a mostra quando a ferramenta de origem recusa ser embutida, pelo cabeçalho `X-Frame-Options` ou pela diretiva `frame-ancestors`, como o Grafana e o Zabbix fazem de fábrica. O bloco fica em branco, sem dizer nada. E a situação "No ar" vem de um pedido feito pelo servidor, que só olha o código da resposta: ela continua verde com a tela vazia.

Esta change segue o subprojeto S2 · Painéis da spec mestre. Ficam fora dela:
- mostrar a página que recusa ser embutida, por uma captura feita no servidor ou por um endereço próprio do Grafite para cada painel, que é outra change;
- repassar pela ponte os cookies, o envio de formulários e o WebSocket das páginas em HTTP.

## What Changes

- **A verificação lê a resposta inteira:** além do código, ela olha os cabeçalhos que barram a exibição e se a página pede a entrada, e guarda a "exibição" do painel: "Aparece na grade", "Recusa ser embutido" ou "Pede a entrada".
- **O bloco diz o motivo:** o painel que recusa ser embutido mostra, no lugar do quadro em branco, o motivo em texto, o que liberar na ferramenta e o "Abrir em outra aba". O que pede a entrada mostra o aviso e continua com o conteúdo.
- **O Cadastro mostra a exibição:** a lista ganha a coluna "Exibição", e o "Verificar agora" diz as duas coisas, como "No ar, mas recusa ser embutido.".
- **O guia:** `docs/operacao/integracoes-da-rede.md` ganha o que liberar no Grafana e no Zabbix.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `painel-de-dashboards`: a verificação passa a guardar a exibição do painel, com o motivo.
- `modulo-paineis`: o bloco e o Cadastro mostram a exibição em texto.

## Impact

- `packages/domain/src/paineis`: a leitura da exibição pela resposta.
- `packages/db`: duas colunas em `paineis` e a migration delas.
- `apps/api/src/paineis/paineis.ts`: o pedido da verificação, que passa a devolver os cabeçalhos e o endereço final; o contrato gerado.
- `apps/web/src/modulos/paineis`: a grade e o Cadastro.
- `docs/operacao/integracoes-da-rede.md` e o mapa.
