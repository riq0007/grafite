## Why

O P3a abre os alertas, mas só quem abre "O que resolver agora" ou a lista dos alertas os vê. A central de notificações do F1b guarda só a sessão: ela esvazia ao recarregar a página, e nada avisa um alerta crítico na hora em que ele abre. O PMG avisa cada alerta do equipamento na primeira vez e depois de normalizar. A virada (P8) precisa desse aviso, e o F1b deixou a central pronta para trocar a fonte pelo servidor sem mudar a casca.

O P3b · Notificações no servidor é a segunda change do P3 · Alertas e notificações (spec mestre, seção 3.2). Por decisão desta change, o P3 passa a entrar em quatro:
- o P3a, com as regras e os alertas;
- o P3b, com as notificações no servidor, os avisos na tela numa aba só, o modo Foco e a etapa da chegada;
- o P3c, com o e-mail e o push;
- o P3d, com os indicadores.

O e-mail e o push saem do P3b porque dependem de configuração do servidor, o SMTP e as chaves do push, e de escolhas de cada pessoa sobre a central já gravada.

Ficam fora desta change:
- o e-mail imediato do crítico, o resumo por e-mail e o push no celular, com as escolhas de cada pessoa (P3c);
- os indicadores e a retenção dos alertas resolvidos (P3d);
- as notificações de outros módulos, que cada um acrescenta pelo mesmo caminho quando uma decisão pedir.

## What Changes

- **As notificações gravadas no servidor, por conta:**
  - cada uma com a severidade, o título, a descrição, a origem, o endereço e, quando vem de um alerta, o alerta;
  - a leitura é de cada notificação e vale em toda aba e em todo aparelho da conta;
  - a central e o sino as leem da API, com os filtros e as páginas no servidor;
  - a manutenção diária apaga as de mais de 90 dias.
- **A notificação do alerta:**
  - quando um alerta abre, cada conta que o vê ganha a notificação dele, com o texto do alerta, o ativo ou o coletor, e o endereço;
  - o alerta que abre no silêncio do ativo não notifica;
  - quando mais de 5 alertas abrem para a mesma conta numa avaliação, ela ganha uma notificação só, "N alertas abertos", com a severidade mais alta entre eles, que leva à lista dos alertas.
- **O último código de recuperação** passa a ser notificado pela API. A tela de entrada continua com o aviso.
- **Os avisos na tela:**
  - a notificação que chega com a aplicação aberta vira aviso conforme as preferências, só na aba usada por último;
  - o aviso crítico de um alerta tem "Reconhecer" e "Adiar 15 min";
  - o aviso sai da tela quando a notificação é lida ou quando o alerta é reconhecido ou se resolve, também em outra aba.
- **O modo Foco**, ligado na central ou nos Ajustes: só o Crítico vira aviso, o resto vai direto para a central, e o sino diz que o Foco está ligado.
- **A etapa "Conectando alertas" da chegada**, que espera a contagem das não lidas e a conexão de eventos, em no máximo 5 s.
- **O evento `notificacoes.mudaram`**, para as sessões da conta, quando uma notificação dela chega ou é lida.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `notificacoes`:
  - as notificações gravadas no servidor por conta, com a leitura em todo aparelho e a retenção de 90 dias;
  - os avisos numa aba só e as ações do alerta;
  - o modo Foco;
  - sai a central só da sessão.
- `alertas`: a notificação do alerta aberto, com o agrupamento.
- `verificacao-em-dois-passos`: o último código de recuperação vira uma notificação gravada.
- `chegada`: a etapa "Conectando alertas".
- `preferencias-da-interface`: o modo Foco nas preferências das notificações.
- `ajustes-do-sistema`: o modo Foco na seção Notificações.
- `estrutura-da-casca`: o sino diz o modo Foco.
- `eventos-em-tempo-real`: o tipo de evento `notificacoes.mudaram`.
- `fila-de-tarefas`: a manutenção diária apaga as notificações de mais de 90 dias.

## Impact

- **`packages/domain`:**
  - quem recebe a notificação de um alerta, pelo acesso de cada conta;
  - o agrupamento;
  - o modo Foco nas preferências;
  - o tipo de evento.
- **`packages/db`:** a tabela `notificacoes`, com RLS, e a migration.
- **`apps/api`:**
  - as rotas das notificações da conta;
  - a função que notifica, usada pela avaliação dos alertas e pela entrada com o último código;
  - a manutenção diária;
  - o contrato e o cliente gerados de novo.
- **`packages/ui`:**
  - a central com os filtros e as páginas de quem a usa;
  - o rótulo do adiar;
  - o sino com o modo Foco.
- **`apps/web`:**
  - as notificações lidas da API e pelos eventos;
  - os avisos numa aba só;
  - o modo Foco;
  - a etapa da chegada.
- **Documentação:**
  - a spec mestre: a divisão do P3 (seção 3.2), os canais (6.5) e a retenção (6.7);
  - o mapa;
  - o contrato de módulo, com a notificação pela API.
