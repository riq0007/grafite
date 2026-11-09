## Why

O P3b grava as notificações no servidor, mas elas só chegam a quem está com o Grafite aberto. O técnico de plantão que está longe da tela não sabe do alerta crítico até abrir a aplicação. O PMG manda e-mail de cada alerta do equipamento, e a virada (P8) precisa de pelo menos esse alcance. A spec mestre (seção 6.5) já define os canais de fora:
- o e-mail imediato do crítico, com o resto num resumo periódico;
- o push no celular, por severidade, com o que cada usuário escolher.

O P3c · E-mail e push é a terceira change do P3 · Alertas e notificações (spec mestre, seção 3.2). Ele leva para fora da aplicação as mesmas notificações que o P3b grava: nenhum módulo muda para ganhar o e-mail e o push.

Ficam fora desta change:
- o SMTP por organização: o servidor tem um SMTP só, configurado na operação, e o remetente é o mesmo para todas as organizações dele;
- o e-mail em HTML: o e-mail sai em texto, com o endereço do registro;
- o envio pelo ambiente de teste, que tem a cópia das contas da produção e não pode avisar pessoas de verdade;
- os indicadores e a retenção dos alertas resolvidos (P3d).

## What Changes

- **O e-mail do crítico na hora:** cada notificação crítica vai por e-mail para a pessoa da conta, com o título, a descrição, a origem e o endereço do registro, quando a pessoa tem e-mail e a conta não desligou esse e-mail.
- **O resumo diário por e-mail:** às 8h, cada conta recebe um e-mail só com as notificações não lidas que ainda não foram por e-mail. Sem nenhuma, nada sai. A conta pode desligar o resumo.
- **O push:**
  - cada aparelho em que a pessoa liga os avisos recebe a notificação pelo sistema do aparelho, mesmo com o Grafite fechado;
  - a conta escolhe as severidades: de fábrica, só o Crítico;
  - com o modo Foco ligado, só o Crítico vai para o push;
  - tocar no aviso abre o Grafite no registro.
- **Os aparelhos da conta:** a lista nos Ajustes, com "Este aparelho" marcado e "Tirar"; o aparelho que o serviço de push diz que não existe mais sai sozinho.
- **O teste dos canais:** "Mandar um e-mail de teste" e "Mandar um aviso de teste", nos Ajustes.
- **A seção Notificações dos Ajustes** ganha os grupos "Por e-mail" e "No celular", com o que o servidor tem configurado e o que falta, em texto.
- **A configuração do servidor:**
  - o SMTP e o remetente, validados na partida, configurados pelo comando de operação na produção;
  - as chaves do push, geradas na instalação da produção e completadas na atualização de uma instalação de antes;
  - sem o SMTP ou sem as chaves, o canal fica desligado, e a tela diz isso.
- **O desenvolvimento** sobe um servidor de e-mail local, o Mailpit, e gera as chaves do push no `.env`.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `notificacoes`: o e-mail do crítico na hora, o resumo diário, o push por severidade, os aparelhos da conta, o teste dos canais e os canais desligados sem configuração e no ambiente de teste.
- `preferencias-da-interface`: as escolhas do e-mail e do push nas preferências das notificações, com os padrões de fábrica e a validação.
- `ajustes-do-sistema`: os grupos "Por e-mail" e "No celular" na seção Notificações.
- `plataforma-base`: o SMTP e as chaves do push na configuração validada na partida; o servidor de e-mail local e as chaves do push no desenvolvimento.
- `operacao-servicos`: as chaves do push na instalação e na atualização da produção; o SMTP pelo comando de operação; o runbook.

## Impact

- **`packages/domain`:**
  - as escolhas do e-mail e do push nas preferências;
  - a decisão de cada canal para cada notificação;
  - o texto do e-mail e do resumo, e o conteúdo do push.
- **`packages/db`:** a tabela dos aparelhos do push, com RLS, e a marca do envio por e-mail e por push em cada notificação, na migration.
- **`apps/api`:**
  - a configuração do SMTP e do push;
  - o envio pelo `nodemailer` e pelo `web-push`, atrás de uma interface cada;
  - a entrega das notificações e o resumo diário, pela fila de tarefas;
  - as rotas dos canais da conta e dos aparelhos;
  - o comando que gera as chaves do push;
  - o contrato e o cliente gerados de novo.
- **`apps/web`:**
  - a seção Notificações dos Ajustes;
  - a inscrição do aparelho no push;
  - o service worker, que mostra o push e abre o registro.
- **`apps/operacao` e `scripts/dev.ts`:** as chaves do push na instalação e na atualização, o comando do SMTP e o desenvolvimento com o Mailpit.
- **Dependências novas:** `nodemailer` e `web-push` na API, e `smtp-server` só nos testes.
- **Rede:** o push exige que o servidor da produção alcance os serviços de push dos navegadores, pela internet, em HTTPS.
- **Documentação:**
  - a spec mestre: os canais (seção 6.5) e a configuração;
  - o runbook, com o SMTP e as chaves do push;
  - o mapa;
  - o contrato de módulo, com os canais que a notificação ganha.
