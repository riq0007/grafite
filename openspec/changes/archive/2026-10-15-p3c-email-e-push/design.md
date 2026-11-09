## Context

O P3b grava as notificações por conta, numa linha por conta, pela função `notificar`, chamada na transação de quem notifica: a avaliação dos alertas e a entrada com o último código de recuperação. A severidade, o título, a descrição, a origem e o endereço já estão na linha. As preferências das notificações ficam na conta e nos padrões da organização, resolvidas campo a campo pelo `resolverPreferencias` do domínio, que a API também usa.

A fila de tarefas (F2c) já tem as tentativas com intervalos crescentes, a lista das tarefas com falha, as tarefas agendadas pelo cron no fuso de São Paulo e o envio dentro de uma transação, que só vale se ela for confirmada. A pessoa guarda o e-mail, opcional, e a anonimização o apaga.

A web já é uma PWA, com o service worker gerado pelo Workbox (F1c) e registrado com a escolha de atualizar. A instalação no Windows gera as chaves e as senhas na configuração de cada ambiente, que só os administradores leem, e a atualização completa o que falta numa instalação de antes, como a chave do cofre.

## Goals / Non-Goals

**Goals:**
- O e-mail do crítico e o push saindo logo depois da notificação gravada, sem pesar na transação de quem notifica.
- Cada notificação indo uma vez só por canal e por destino, também com as novas tentativas da fila.
- O resumo diário com o que ainda não foi visto nem enviado.
- Os canais trocáveis por interface, testados de ponta a ponta sem a internet.
- O teste e o desenvolvimento sem avisar pessoas de verdade.

**Non-Goals:**
- O SMTP por organização e o e-mail em HTML.
- As escolhas de horário do resumo: ele sai às 8h para todos.
- O push sem as chaves VAPID, como o de um aplicativo nativo.
- O aviso de leitura entre os canais: ler no celular não apaga o e-mail já enviado.

## Decisions

### 1. Um carteiro e um entregador, atrás de interfaces

A API ganha duas peças, criadas na partida pela configuração:
- **o carteiro do e-mail**, que manda um e-mail em texto para um endereço, pelo SMTP, com o `nodemailer`;
- **o entregador do push**, que manda o conteúdo cifrado a uma inscrição, com as chaves VAPID, pelo `web-push`, e diz se a inscrição não existe mais (as respostas 404 e 410 do serviço de push).

Sem a configuração, ou no ambiente de teste, a peça não existe, e quem a usaria segue sem ela. A spec mestre já pede o e-mail trocável por interface (seção 4.4): os testes usam um servidor SMTP de verdade, em processo, com o `smtp-server`, e um serviço de push falso, em processo, que decifra o conteúdo com as chaves da inscrição.

Alternativa descartada: chamar o `nodemailer` e o `web-push` direto nas tarefas. Prenderia os testes à rede, e a troca do envio, como por uma API de e-mail, mudaria as tarefas.

### 2. A entrega pela fila, fora da transação da notificação

O `notificar` passa a receber a fila e põe nela, na mesma transação, a tarefa `entregar-notificacoes` com a organização e os ids das notificações gravadas, em lotes de 500 ids. Quem chama já tem a fila: a avaliação dos alertas pelo contexto das tarefas, e a rota do segundo passo pelo app. Sem a fila no ar, como nos testes que não tratam dela, nada entra.

A `entregar-notificacoes` roda depois de a transação ser confirmada e decide os canais de cada notificação (decisão 4). Para cada destino, ela põe na fila uma tarefa de um envio só:
- `enviar-email`, com a notificação, e a chave única `email:<id>`;
- `enviar-push`, com a notificação e a inscrição, e a chave única `push:<id>:<inscrição>`.

As chaves únicas fazem a tarefa de um destino entrar uma vez só, também quando a `entregar-notificacoes` é tentada de novo. Cada envio tem as próprias tentativas, e a falha de um não refaz os outros. A tarefa que falha em todas as tentativas aparece em Tarefas com falha com o nome em pt-BR, como "Envio do e-mail de uma notificação".

Alternativa descartada: uma tarefa a cada minuto que procura as notificações sem envio. O crítico esperaria até um minuto, e a procura passaria por todas as notificações de todas as organizações.

### 3. As marcas do envio na notificação

A notificação ganha `email_em`, o momento em que foi por e-mail, na hora ou no resumo, e `push_em`, o momento em que a entrega decidiu o push dela. A `enviar-email` confere a marca antes de mandar e grava logo depois do envio aceito pelo SMTP: uma nova tentativa depois do envio não manda de novo. A marca do e-mail também tira a notificação do resumo seguinte.

A `entregar-notificacoes` só cuida das notificações sem a marca do push, e grava a marca depois de pôr na fila os envios de push delas. Assim, uma nova tentativa dela não põe de novo os envios, além das chaves únicas.

### 4. A decisão dos canais no domínio

O domínio ganha a decisão, pura, de cada notificação, pelas preferências resolvidas da conta, pela pessoa e pelos aparelhos:
- **e-mail na hora:** a severidade é Crítico, a pessoa tem e-mail, o carteiro existe e a conta não desligou o e-mail do crítico;
- **push:** a severidade está entre as escolhidas para o push e, com o Foco ligado, é Crítico; a conta tem aparelhos, e o entregador existe;
- **resumo:** a notificação não lida e sem a marca do e-mail, da conta com o resumo diário.

As escolhas entram na seção `notificacoes` das preferências, campo a campo, como as do P3b: `emailCritico` (de fábrica, ligado), `resumo` (`desligado` ou `diario`, de fábrica, diário), `pushCritico` (ligado), `pushAtencao` e `pushInformacao` (desligados). Os padrões da organização valem para elas sem mudança no modelo.

### 5. O resumo pela fila, por organização e por conta

A tarefa agendada `resumos-por-email` roda às 8h no fuso de São Paulo, como as outras agendadas, e põe uma `enviar-resumos` por organização, com a chave do dia. Cada uma põe uma `enviar-resumo` por conta com o resumo diário e a pessoa com e-mail, com a chave da conta e do dia. A `enviar-resumo` lê as notificações não lidas e sem a marca do e-mail, manda as 50 mais novas, diz quantas mais há, e grava a marca em todas elas, também nas que só entraram na conta das "mais".

A falha do resumo de uma conta não atrasa as outras.

### 6. O e-mail em texto, com o endereço da organização

O domínio monta o assunto e o corpo, em texto, como o texto do alerta: o e-mail do crítico, o resumo e o e-mail de teste. O endereço do registro é o `destino` da notificação no endereço de acesso mais antigo da organização, em `https://`. Na configuração, a origem dos links (`GRAFITE_ORIGEM_DOS_LINKS`, opcional) substitui esse endereço, para o desenvolvimento e a ponta a ponta da pilha, que não atendem em `https://` nem na porta 443. O e-mail leva o cabeçalho `Auto-Submitted: auto-generated`, para as respostas automáticas não voltarem.

O e-mail não leva nada além do que a central mostra: o título, a descrição, a origem e o endereço.

Alternativa descartada: o e-mail em HTML. Pediria cores e estilos fora dos tokens, conferidos à parte em cada leitor de e-mail, para dizer o mesmo que o texto diz.

### 7. O push cifrado, com o conteúdo pronto para mostrar

O conteúdo do push é um JSON pequeno: o título com a severidade, a descrição, o endereço, a severidade e o id da notificação como etiqueta, para o mesmo aviso não aparecer duas vezes no aparelho. O crítico vai com urgência alta, e os outros com a normal; todos valem por 24 h no serviço de push.

O service worker gerado pelo Workbox ganha, por `importScripts`, um arquivo próprio da web, `sw-avisos.js`, que:
- mostra o push pelo sistema do aparelho, com o ícone do Grafite;
- ao toque, foca uma janela do Grafite já aberta e a leva ao endereço, ou abre uma nova.

Alternativa descartada: trocar o service worker gerado por um escrito à mão (`injectManifest`). Mudaria o cache e a atualização da PWA, que o F1c já testa, para acrescentar dois ouvintes.

### 8. A inscrição do aparelho

A rota `GET /conta/canais` diz, para a conta da sessão:
- o e-mail: a situação (ligado, sem configuração, ambiente de teste ou pessoa sem e-mail) e o e-mail da pessoa;
- o push: a situação, a chave pública e os aparelhos da conta, com o nome, o endereço da inscrição e o momento.

A web inscreve o aparelho com a chave pública, pelo `PushManager` do service worker pronto, e grava a inscrição com `POST /conta/push`, que troca a da conta se o endereço já existe. `DELETE /conta/push/{id}` tira um aparelho da própria conta, e responde 404 para o de outra. O nome do aparelho vem do navegador, como "Chrome no Android".

A tabela `inscricoes_de_push` guarda a conta, o endereço da inscrição, único, as duas chaves dela, o nome do aparelho, o momento e o último envio aceito, com RLS. A inativação da conta apaga as inscrições dela, na mesma transação.

O endereço da inscrição vem do navegador, mas passa pela conta: sem conferência, uma conta faria o servidor mandar pedidos a qualquer endereço, como os da rede interna. A API só aceita um endereço `https://` num dos serviços de push dos navegadores, pelo nome do servidor:
- `fcm.googleapis.com` e `android.googleapis.com`, do Chrome e do Android;
- `updates.push.services.mozilla.com`, do Firefox;
- `web.push.apple.com` e os de `push.apple.com`, do Safari;
- os de `notify.windows.com`, do Edge no Windows.

A configuração pode acrescentar origens com `GRAFITE_PUSH_SERVICOS_EXTRAS`, separadas por vírgula, para o serviço de push falso dos testes. O entregador confere o endereço de novo antes de cada envio, também os gravados antes de uma mudança da lista.

### 9. O teste dos canais, na hora

`POST /conta/canais/email/teste` e `POST /conta/canais/push/teste` usam o carteiro e o entregador direto, sem a fila, para a tela dizer o resultado na hora. Cada conta pode pedir um teste de cada canal a cada 30 s; antes disso, a API responde 429 com "Espere 30 s para mandar outro teste.". O teste não grava notificação.

### 10. A configuração e as chaves do push

A configuração da API ganha dois grupos opcionais, inteiros ou nada, como o do backup:
- `GRAFITE_SMTP_URL`, `smtp://` ou `smtps://`, com o usuário e a senha no endereço, e `GRAFITE_EMAIL_REMETENTE`, como `Grafite <grafite@empresa.com.br>`;
- `GRAFITE_PUSH_CHAVE_PUBLICA` e `GRAFITE_PUSH_CHAVE_PRIVADA`, em base64url, conferidas como um par da curva P-256, e `GRAFITE_PUSH_CONTATO`, `mailto:` ou `https://`.

As regras do formato ficam no domínio, para o comando de operação conferir o SMTP antes de gravar. No ambiente de teste, a API ignora os dois grupos e diz isso no log da partida.

A instalação gera as chaves do push só na configuração da produção, com o contato `https://<endereço da organização que opera o servidor>`, e a atualização completa uma produção de antes, como a chave do cofre (decisão 10 do P6). As chaves nunca são trocadas pelo comando.

O comando `.\grafite.ps1 email configurar` grava o SMTP e o remetente na configuração da produção, com o acesso restrito, reinicia o app e confere a saúde. `.\grafite.ps1 email testar` chama o comando da API da produção, `grafite email testar`, que manda o e-mail de teste pela configuração gravada e diz o resultado, sem mostrar a senha.

### 11. O desenvolvimento com o Mailpit

O `compose.yaml` do banco ganha o Mailpit, que recebe os e-mails no SMTP local e os mostra em `http://localhost:8025`. O `pnpm dev` completa o `.env` com o SMTP do Mailpit, o remetente, a origem dos links da web de desenvolvimento e as chaves do push, geradas uma vez.

## Risks / Trade-offs

- [O servidor da produção sem saída para a internet] → o push falha, e os envios aparecem em Tarefas com falha. O runbook diz os serviços de push que o firewall precisa liberar, em HTTPS.
- [O SMTP interno com certificado da AC da empresa] → os apps já confiam na AC interna pelo `NODE_EXTRA_CA_CERTS` da instalação; o runbook cobre a AC própria do SMTP.
- [Uma rajada de críticos] → o agrupamento acima de 5 do P3b vale antes do e-mail; o resto vai no resumo.
- [Um aparelho perdido continua inscrito] → a conta o tira pelos Ajustes, de qualquer outro aparelho, e a inativação da conta tira todos.
- [Uma resposta lenta do serviço de push] → cada envio é uma tarefa, com o tempo limite da fila, e não segura os outros.
- [O e-mail enviado e a tarefa interrompida antes da marca] → a nova tentativa manda de novo, uma vez; a janela é a de uma gravação.
- [A troca das chaves do push] → os aparelhos inscritos deixam de receber até se inscreverem de novo; por isso o comando nunca as troca.

## Migration Plan

1. A migration acrescenta as marcas do envio nas notificações, sem valor nas que já existem, e a tabela dos aparelhos, com RLS.
2. A atualização do teste não ganha nada novo na configuração. A da produção ganha as chaves do push antes de o app iniciar.
3. Depois da atualização, quem opera configura o SMTP com `.\grafite.ps1 email configurar` e confere com `.\grafite.ps1 email testar`.
4. A volta à versão anterior roda no banco novo: as colunas e a tabela novas ficam sem uso.
