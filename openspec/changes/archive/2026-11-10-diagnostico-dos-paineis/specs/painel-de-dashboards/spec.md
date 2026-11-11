## MODIFIED Requirements

### Requirement: Verificação dos painéis

A cada minuto, o servidor SHALL pedir o endereço de cada painel ativo das organizações com o módulo ligado, com 5 segundos de prazo, seguindo até 3 redirecionamentos. O painel SHALL ficar:
- "No ar", com a resposta de 100 a 499;
- "Fora do ar", sem resposta no prazo, com a falha da conexão ou com a resposta de 500 em diante, guardando o motivo em texto, como "Sem resposta em 5 s" ou "Respondeu 502";
- "Sem verificação", até a primeira verificação.

A verificação SHALL guardar o momento e o tempo da resposta. A mudança de situação SHALL gravar o evento `paineis.mudaram`, e a verificação que não muda a situação SHALL NOT gravar evento. Quem administra os painéis SHALL pedir a verificação de um painel na hora, com "Verificar agora".

A verificação SHALL guardar também a exibição do painel (requisito "Exibição do painel"), e a mudança dela SHALL gravar o evento `paineis.mudaram`, como a mudança de situação.

#### Scenario: Painel que caiu
- **WHEN** a VM do painel "Produção da linha 2" desliga, e o endereço não responde em 5 s
- **THEN** na verificação seguinte o painel fica "Fora do ar", com o motivo "Sem resposta em 5 s", e a grade aberta se atualiza

#### Scenario: Painel com erro do servidor
- **WHEN** o endereço do painel responde 502
- **THEN** o painel fica "Fora do ar", com o motivo "Respondeu 502"

#### Scenario: Ferramenta liberada depois
- **WHEN** a TI libera o endereço do Grafite na ferramenta de um painel que recusava ser embutido
- **THEN** na verificação seguinte a exibição passa a "Aparece na grade", e a grade aberta se atualiza

## ADDED Requirements

### Requirement: Exibição do painel

A verificação do painel no ar SHALL dizer se o navegador consegue mostrá-lo dentro do Grafite, pela resposta do endereço, e guardar a exibição com o motivo em texto:
- **"Recusa ser embutido":** a resposta de um painel em `https://` traz o cabeçalho `X-Frame-Options` com `DENY` ou `SAMEORIGIN`, ou a diretiva `frame-ancestors` do `Content-Security-Policy` sem nenhum endereço de acesso da organização. O motivo SHALL nomear o cabeçalho, como "A ferramenta manda X-Frame-Options: SAMEORIGIN.";
- **"Pede a entrada":** a resposta é 401 ou 403, ou os redirecionamentos terminam numa página de entrada. O motivo SHALL dizer qual dos dois, como "Respondeu 401." ou "Levou à página de entrada.";
- **"Aparece na grade":** nenhuma das duas.

A leitura SHALL seguir o navegador em dois pontos:
- com a diretiva `frame-ancestors` na resposta, o `X-Frame-Options` SHALL NOT contar;
- quando o endereço da resposta é de um endereço de acesso da organização, a ferramenta e o Grafite estão no mesmo endereço, e `SAMEORIGIN` e `'self'` SHALL NOT recusar.

Quando a resposta recusa ser embutida e também pede a entrada, SHALL valer "Recusa ser embutido". No painel em `http://`, que o Grafite mostra pela ponte (requisito "Conteúdo HTTP pela conexão do Grafite"), os cabeçalhos que barram a exibição SHALL NOT contar: ele só pode ficar "Pede a entrada" ou "Aparece na grade". O painel fora do ar e o que ainda não foi verificado SHALL ficar sem exibição.

A exibição é uma leitura da resposta, e não uma prova: o painel "Aparece na grade" SHALL NOT ser anunciado como conferido na tela de alguém.

#### Scenario: Grafana de fábrica
- **WHEN** o painel "Linha 2", em `https://grafana.empresa.local`, responde 200 com `X-Frame-Options: deny`
- **THEN** o painel fica "No ar", com a exibição "Recusa ser embutido" e o motivo "A ferramenta manda X-Frame-Options: DENY."

#### Scenario: frame-ancestors com o endereço do Grafite
- **WHEN** a resposta traz `Content-Security-Policy: frame-ancestors https://grafite.empresa.local`, e esse é um endereço de acesso da organização
- **THEN** a exibição fica "Aparece na grade"

#### Scenario: frame-ancestors sem o Grafite
- **WHEN** a resposta traz `Content-Security-Policy: frame-ancestors 'self'`
- **THEN** a exibição fica "Recusa ser embutido", com o motivo "A ferramenta manda frame-ancestors sem o endereço do Grafite."

#### Scenario: Os dois cabeçalhos
- **WHEN** a resposta traz `X-Frame-Options: SAMEORIGIN` e `Content-Security-Policy: frame-ancestors https://grafite.empresa.local`, e esse é um endereço de acesso da organização
- **THEN** a exibição fica "Aparece na grade"

#### Scenario: Ferramenta no endereço do Grafite
- **WHEN** o painel em `https://grafite.empresa.local/grafana`, com `grafite.empresa.local` entre os endereços de acesso da organização, responde com `X-Frame-Options: SAMEORIGIN`
- **THEN** a exibição fica "Aparece na grade"

#### Scenario: Página de entrada
- **WHEN** o endereço do painel redireciona para `/login` e responde 200
- **THEN** o painel fica "No ar", com a exibição "Pede a entrada" e o motivo "Levou à página de entrada."

#### Scenario: Painel em HTTP com o cabeçalho
- **WHEN** o painel em `http://10.0.5.21:3000` responde com `X-Frame-Options: SAMEORIGIN`
- **THEN** a exibição fica "Aparece na grade", porque o Grafite o mostra pela ponte

#### Scenario: Painel fora do ar
- **WHEN** o endereço do painel não responde em 5 s
- **THEN** o painel fica "Fora do ar", sem exibição
