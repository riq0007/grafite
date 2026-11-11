## Context

A grade (`apps/web/src/modulos/paineis/Grade.tsx`) põe cada painel num `iframe`. O painel em `https://` usa o endereço direto; o painel em `http://` usa a ponte da API (`/api/paineis/{id}/exibicao`), num `sandbox` sem a mesma origem, porque o navegador recusaria o conteúdo misto.

A verificação (`apps/api/src/paineis/paineis.ts`) pede o endereço com `fetch`, segue os redirecionamentos, descarta o corpo e entrega ao domínio só o código da resposta. O `situacaoDaResposta` devolve a situação e o motivo, gravados nas colunas `verificacao` e `motivo` da tabela `paineis`.

O navegador barra a página embutida em dois casos que só os cabeçalhos da resposta mostram: `X-Frame-Options` com `DENY` ou `SAMEORIGIN`, e `Content-Security-Policy` com `frame-ancestors` sem a origem de quem embute. A página do Grafite não consegue saber, de dentro, por que um `iframe` de outra origem ficou em branco.

A organização tem os endereços de acesso dela na tabela `enderecos_de_acesso`.

## Goals / Non-Goals

**Goals:**
- Dizer o motivo no lugar do quadro em branco, com o que a TI precisa liberar.
- Aproveitar o pedido que a verificação já faz, sem um segundo pedido.
- Não chamar de conferido o que só foi lido da resposta.

**Non-Goals:**
- Fazer aparecer a página que recusa ser embutida.
- Detectar a falta de cookies, de envio e de WebSocket das páginas em HTTP pela ponte.
- Entrar na ferramenta para conferir o painel.

## Decisions

### 1. A exibição no domínio

`exibicaoDaResposta` recebe o código, os cabeçalhos `x-frame-options` e `content-security-policy`, o endereço final depois dos redirecionamentos, o endereço cadastrado e os endereços de acesso da organização, e devolve `{ exibicao, motivo }`, com `exibicao` em `'aparece' | 'recusa' | 'pede-entrada'`. É uma função pura, com os casos da spec nos testes.

- **`X-Frame-Options`:** `DENY` e `SAMEORIGIN` recusam, sem diferenciar maiúsculas. O `ALLOW-FROM`, que os navegadores atuais ignoram, não conta. O cabeçalho repetido vale uma vez; com valores diferentes entre `DENY`, `SAMEORIGIN` e `ALLOWALL`, o navegador barra, e a leitura recusa.
- **`frame-ancestors`:** a diretiva é lida de todos os cabeçalhos `Content-Security-Policy` da resposta. `'none'` e `'self'` recusam; `*` e uma fonte que casa com um endereço de acesso da organização liberam, pelo esquema e pelo host, com o curinga de subdomínio (`*.empresa.local`). Uma política sem a diretiva não recusa, e, com várias políticas, todas as que trazem a diretiva têm de liberar.
  - O endereço de acesso guarda só o host. Por isso o esquema da fonte, quando vem, só tem de ser `http` ou `https`, as fontes `http:` e `https:` liberam, e a porta e o caminho da fonte não são comparados.
- **Os dois juntos:** com o `frame-ancestors` na resposta, o `X-Frame-Options` não conta. É o que o navegador faz: a diretiva torna o cabeçalho obsoleto.
- **A mesma origem:** quando o host do endereço final é um endereço de acesso da organização, a ferramenta está atrás do mesmo endereço do Grafite, e `SAMEORIGIN` e `'self'` não recusam. A porta não é comparada, pelo mesmo motivo: com a porta diferente, o painel fica "Aparece na grade", com o quadro em branco de hoje. O erro para esse lado não esconde um painel que funciona.
- **A entrada:** 401, 403 ou o endereço final diferente do cadastrado, com um trecho do caminho igual a `login`, `signin`, `sign-in`, `auth`, `sso` ou `entrar`.
- **O painel em `http://`:** só a entrada conta, porque a ponte entrega o documento pela origem do Grafite.

A recusa vence a entrada: sem a liberação, a tela de entrada também não apareceria.

### 2. As colunas

A tabela `paineis` ganha `exibicao`, texto com os três valores, e `motivo_da_exibicao`, texto, as duas nulas no painel fora do ar e no ainda não verificado. A migration só acrescenta as colunas, com a conferência dos valores; os painéis de hoje ficam nulos até a verificação seguinte, que roda a cada minuto.

### 3. A verificação

O `verificarEndereco` passa a devolver, com o código, os dois cabeçalhos e o endereço final. Para saber onde a resposta terminou, ele segue os redirecionamentos por conta própria, até 3, como a spec já pedia: o `fetch` seguia os 20 do padrão dele. A resposta depois do terceiro vale como a do painel, mesmo que redirecione de novo, e o prazo de 5 s é um só, do pedido com os redirecionamentos. O `verificarPaineis` lê os endereços de acesso da organização uma vez por rodada, calcula a exibição do painel no ar e grava as duas colunas. O evento `paineis.mudaram` sai quando muda a situação, o motivo ou a exibição.

O "Verificar agora" devolve a exibição com a situação, e o Cadastro monta o retorno da spec.

### 4. O bloco

Com `recusa`, o bloco não monta o `iframe`: mostra um estado com o título, o motivo que veio da API e a orientação, e o "Abrir em outra aba" do cabeçalho continua. Com `pede-entrada`, uma faixa de aviso fica entre o cabeçalho e o `iframe`. A situação de cada bloco continua em texto, e o tom do aviso é o de atenção.

Quando a exibição muda pelo evento, só o bloco daquele painel muda, porque a chave do bloco é o id do painel.

### 5. O guia

`docs/operacao/integracoes-da-rede.md` ganha, na parte dos painéis, o que liberar em cada ferramenta, com o nome de cada ajuste conferido na documentação dela na hora de escrever:
- o Grafana: permitir a incorporação e, para a TV, o acesso de leitura sem entrada;
- o Zabbix: o cabeçalho `X-Frame-Options` da interface;
- qualquer outra: mandar `Content-Security-Policy: frame-ancestors` com o endereço do Grafite.

## Risks / Trade-offs

- **[A ferramenta responde ao servidor de um jeito e ao navegador de outro]** → a exibição é chamada de leitura da resposta, e o bloco "Aparece na grade" continua sem nenhuma promessa.
- **[A página de entrada fora da lista de caminhos]** → o painel fica "Aparece na grade" e mostra a tela de entrada, como hoje; a lista cresce com os casos reais.
- **[Um caminho legítimo com `auth` no nome]** → vira "Pede a entrada", que só acrescenta um aviso e não esconde o conteúdo.
- **[A liberação na ferramenta demora a aparecer]** → a verificação roda a cada minuto, e o "Verificar agora" confere na hora.

## Migration Plan

A migration acrescenta as duas colunas, nulas. A versão anterior da API ignora as colunas novas, e a volta da versão não precisa desfazer nada.

## Open Questions

Nenhuma.
