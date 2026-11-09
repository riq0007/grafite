## Why

O P2 trouxe a coleta: a disponibilidade, os suprimentos e as condições das impressoras e a saúde dos controles de acesso. Mas a coleta, sozinha, só mostra o problema a quem abre a ficha ou a tabela no momento certo. O toner acaba sem aviso, um controle para de responder sem ninguém ver, e o coletor parado deixa todas as leituras velhas em silêncio. O PMG avisa o toner crítico e cada alerta do equipamento, só na primeira vez e depois de normalizar, e respeita a pausa de cada impressora. A virada (P8) precisa dessa paridade, e a tela "O que resolver agora" ainda está vazia, porque nenhum módulo registra ocorrências.

O P3a · Regras e alertas é a primeira change do P3 · Alertas e notificações (spec mestre, seção 3.2), que entra em três: o P3a, com as regras e os alertas; o P3b, com as notificações e os canais; e o P3c, com os indicadores. Por decisão desta change, tomada pelo que o PMG faz e pela seção 6.4 da spec mestre:
- as regras são dados da organização, com as de fábrica criadas para cada uma, e não limites fixos no código;
- o motor avalia o estado atual da coleta a cada minuto, pela fila de tarefas, e não a cada leitura;
- o alerta abre depois da duração da regra, fecha sozinho quando o valor se recupera além da folga, e a leitura sem dado nunca o fecha;
- o ativo silenciado continua com os alertas abertos e resolvidos à vista, mas eles saem da tela inicial, como a pausa do PMG.

Ficam fora desta change:
- as notificações gravadas no servidor, os avisos dos alertas na tela, o e-mail imediato e o resumo, o push no celular, o modo Foco, a aba única com o aviso e a etapa "Conectando alertas" da chegada (P3b);
- os indicadores e as metas deles (P3c);
- a limpeza dos alertas resolvidos antigos, que fica com o P3c, junto dos indicadores que os leem;
- as regras sobre os contadores de páginas e sobre a latência, que nenhuma decisão pede ainda;
- os alertas das portas dos switches (T2) e dos backups do Control iD (P5).

## What Changes

- **As condições de alerta**, definidas pelo sistema, cada uma com os parâmetros dela:
  - Ativo offline, pela disponibilidade na rede;
  - Nível do toner, com o limite em percentual e a folga da recuperação;
  - Condição da impressora, com as condições do equipamento escolhidas;
  - Saúde do Control iD, com as situações escolhidas;
  - Coleta atrasada, com quantos ciclos sem a leitura;
  - Coletor sem contato, com quantos minutos.
- **As regras de alerta** da organização: o nome, a condição com os parâmetros, a duração, a severidade (Crítico, Atenção ou Informação) e o escopo (a organização inteira, um tipo, um modelo, um ativo ou um local com os de baixo). Elas são cadastradas, editadas, inativadas e reativadas na tela, com a auditoria.
- **As regras de fábrica**, criadas para cada organização nova e para as que já existem: o ativo offline, o toner em 10% ou menos, as condições da impressora, o Control iD sem resposta e com o login recusado, a coleta atrasada e o coletor sem contato.
- **O motor**, que avalia as regras ativas a cada minuto sobre o estado atual da coleta e o último contato dos coletores:
  - o alerta é identificado pelo ativo (ou pelo coletor), pela regra e pelo item, como cada toner, e nunca há dois abertos iguais;
  - ele abre depois da duração da regra e se resolve sozinho quando o valor se recupera além da folga;
  - a leitura sem dado não abre nem resolve o alerta;
  - ele é encerrado quando a regra deixa de valer para o ativo, como o ativo inativado ou a regra inativada.
- **O ciclo do alerta:**
  - aberto, reconhecido (por quem e quando) e resolvido;
  - adiar até uma hora tira o alerta da tela inicial até a hora escolhida;
  - silenciar o ativo até uma data, ou até alguém retomar, tira os alertas dele da tela inicial, sem parar a coleta nem o motor.
- **O módulo Alertas**, opcional e ligado de fábrica: a lista dos alertas abertos e dos resolvidos, com os filtros e as ações, e a tela das regras.
- **O bloco Alertas na ficha do ativo**, com os alertas abertos, as ações e o silêncio.
- **As ocorrências da tela inicial**: os alertas abertos, sem os adiados e sem os dos ativos silenciados, entram em "O que resolver agora".
- **O evento `alertas.mudaram`**, quando um alerta abre, muda, é tratado ou se resolve, e quando uma regra muda.

## Capabilities

### New Capabilities

- `alertas`: as condições, as regras de alerta e as de fábrica, o motor que avalia o estado atual a cada minuto, o ciclo do alerta com o reconhecimento e o adiamento, e o silêncio dos alertas de um ativo.
- `modulo-alertas`: o módulo Alertas, com a lista dos alertas e a tela das regras, o bloco Alertas na ficha do ativo e as ocorrências da tela inicial.

### Modified Capabilities

- `permissoes`: o catálogo ganha `alertas.ver`, `alertas.tratar` e `alertas.administrar`.
- `modulos-da-organizacao`: o Alertas entra entre os módulos opcionais.
- `eventos-em-tempo-real`: o tipo de evento `alertas.mudaram`.
- `auditoria`: as mudanças das regras, o reconhecimento, o adiamento e o silêncio entram na auditoria.

## Impact

- **`packages/domain`:**
  - as condições e os parâmetros delas, com a conferência da regra;
  - as regras de fábrica;
  - a decisão do motor para cada alvo (abrir, manter, resolver ou encerrar);
  - o texto do alerta;
  - as permissões, o módulo opcional, o evento e as ações da auditoria.
- **`packages/db`:** as tabelas das regras, dos alertas e dos silêncios, com RLS; as regras de fábrica das organizações que já existem nascem na primeira avaliação, sem migration de dados.
- **`apps/api`:**
  - as rotas das regras, dos alertas e do silêncio;
  - a tarefa agendada a cada minuto e a avaliação de cada organização;
  - as regras de fábrica no comando que cria a organização;
  - o contrato e o cliente gerados de novo.
- **`apps/web`:** o módulo Alertas, o bloco na ficha do ativo e a fonte de ocorrências da tela inicial.
- **Documentação:**
  - a spec mestre (seção 3.2, a divisão do P3);
  - o mapa e o contrato de módulo, com a fonte de ocorrências de verdade;
  - o runbook, com as regras de fábrica.
