# Grafite — spec mestre

- **Status:** rascunho para revisão
- **Data:** 24/09/2026
- **Origem:** sessão de brainstorming (seis partes aprovadas em conversa + três telas aprovadas no navegador)
- **Escopo deste documento:** visão, decisões, arquitetura e decomposição em subprojetos. Cada subprojeto ganha a própria proposta, specs e tarefas antes de qualquer código (seção 12).

---

## 1. Resumo

Grafite é um sistema de gestão de ativos, operação e governança de TI com uma casca inspirada no macOS: dock, menus em árvore com material translúcido, busca global, notificações de KPI, temas claros e escuros e personalização por usuário.

Ele **substitui por completo o PMG** (Print Manager) com identidade nova. Nasce interno, rodando no servidor da empresa, e **preparado para virar produto** multiempresa.

A construção é em três fases:

1. **Fundação:** identidade, casca e núcleo.
2. **Paridade com o PMG:** ao final, o PMG é desligado.
3. **Além do PMG:** portal do colaborador, governança e login corporativo.

A inspeção 3D e o painel de switch andam numa trilha paralela, sem travar a paridade.

---

## 2. Objetivo, público e critérios de sucesso

### 2.1 O que foi pedido

- Recriar o sistema do zero, mais bonito, com visual "tech" sem cara de IA, animações e interação.
- Uma casca que imita o macOS:
  - barra (dock) com posição configurável;
  - cantos de arredondado a quadrado;
  - menus em árvore ao passar o mouse, com um fundo que isola as opções do conteúdo;
  - cursor customizado com suavização e sombra.
- Mais de um tema claro e mais de um escuro, inspirados na Apple.
- Tela de carregamento customizada e boas-vindas animada no estilo do "hello" da Apple.
- Conteúdo com margens consistentes (nem colado nem distante das laterais), escalando para várias resoluções.
- Ativos com imagem própria (PNG, SVG etc.) ou genérica. A lista de ativos é uma tabela com linhas demarcadas e miniatura no início da linha, ajustada à altura da linha.
- Notificações na tela para alertas de KPI.
- Modelos 3D:
  - para visualizar processos;
  - para inspecionar peças (explode, carrossel, zoom out, visão alternativa);
  - um switch realista com KPIs por porta.
- Governança e gestão das informações dos ativos.
- Tudo o que puder ser personalizado, o cliente personaliza.
- Aproveitar ideias do PMG sem migrar a lógica.
- Usar o Blender (MCP) no processo. As ferramentas de design (Figma, e depois Stitch) saíram no F0 (seção 12.4).

### 2.2 Decisões tomadas no brainstorming

| Tema | Decisão |
|---|---|
| Para quem | Interno agora, preparado para virar produto: multiempresa desde o schema, com uma organização ativa |
| Relação com o PMG | Substitui por completo, com identidade nova. Os **dados** migram; a **lógica** é reescrita |
| Quem usa | TI no computador; gestores no computador e no celular; colaboradores de outras áreas abrindo solicitações pelo celular ou tablet |
| Prioridade | Paridade com o PMG primeiro; 3D e switch em trilha paralela |
| Arquitetura | Monorepo TypeScript: web (SPA/PWA) + API + coletor, sobre PostgreSQL (seção 4) |
| Direção visual | A · Grafite (seção 7) |
| Padrões de fábrica | Escolhidos no protótipo interativo (seção 7.2) |
| Carregamento e boas-vindas | Sequência aprovada como base (seção 7.5) |
| Nome | **Grafite**, adotado para o uso interno. A consulta ao INPI (classes 9 e 42) é obrigatória antes de qualquer venda (`docs/identidade/nome.md`) |
| Marca | Conceito C · traço: o g num traço só, com a descida virando um risco reto. Regras em `docs/identidade/marca.md` |
| Janelas | Módulos em tela cheia, sem janelas arrastáveis |
| Regras visuais | ANTISLOP v3 (seção 7.10) |

### 2.3 Critérios de sucesso

1. **O PMG é desligado depois da virada sem perda de dados.** Cadastros, históricos, cofre e backups do Control iD chegam ao Grafite, e as contagens batem no ensaio.
2. **Paridade:** toda capacidade do PMG listada na seção 3.4 existe no Grafite.
3. **Qualidade visual:** toda tela passa no quality gate do ANTISLOP v3 e nos testes visuais nas resoluções e temas-alvo (seção 11).
4. **Personalização:** um usuário personaliza tema, dock, cantos, cursor, densidade e visões de tabela, e isso o acompanha em qualquer dispositivo (preferência gravada no servidor).
5. **Pronto para produto:** uma segunda organização pode ser criada sem mudar código nem schema, e um teste automatizado prova que uma não vê os dados da outra.
6. **Desempenho:**
   - a casca abre sem baixar o 3D;
   - uma tabela de 10 mil linhas rola sem travar;
   - as listas respondem em menos de 300 ms (p95) no servidor interno;
   - um alerta aparece na tela em até 5 s depois de gravado.

### 2.4 Fora de escopo por enquanto

- Cobrança, cadastro de empresas pelo próprio site, painel de administração de clientes e banco separado por cliente. A arquitetura deixa a porta aberta, mas nada disso é construído.
- App nativo: a PWA cobre celular e tablet.
- Assistente ou recursos de IA, que só entram se resolverem um problema real.
- Janelas arrastáveis tipo desktop.
- Migrar a lógica do PMG: vêm só os dados e as ideias.

---

## 3. Subprojetos e ordem

### 3.1 Fases

| Fase | Como anda | Termina quando |
|---|---|---|
| 1 · Fundação | Em sequência, na sessão principal com o usuário | A casca roda com login, preferências no servidor e auditoria |
| 2 · Paridade | Até 3 agentes em paralelo (seção 12.3) | O PMG é desligado (P8) |
| Trilha paralela | Um agente por item, sem bloquear a fase 2 | Inspeção 3D e rede física entregues |
| 3 · Além do PMG | Em paralelo | Portal, governança e login corporativo no ar |

### 3.2 Subprojetos

| ID | Subprojeto | Entrega | Depende de |
|---|---|---|---|
| **F0** | Identidade, design system e esqueleto técnico | Nome e logo finais (com checagem de marca e domínio); ANTISLOP v2 consolidado; tokens dos 6 temas, tipografia, espaçamento, raios, materiais e movimento; ícones próprios, incluindo os genéricos por tipo de ativo; componentes base; monorepo com CI, web renderizando os tokens, API com `/health` e banco com RLS mínimo | — |
| **F1** | Casca OS | Dock, menus em árvore, barra superior, busca Ctrl+K, cursor, interface das notificações, componente Quick Look, Ajustes do Sistema, carregamento, boas-vindas, posturas de tablet e celular, base da PWA. As preferências ficam no navegador até o F2 | F0 |
| **F2** | Núcleo | Organizações; locais; pessoas e contas; login, 2FA e sessões; permissões com escopo; auditoria; preferências no servidor, da organização e do usuário; arquivos e imagens; eventos (outbox → SSE); fila de tarefas; ambientes de desenvolvimento, teste e produção; serviços do Windows ou contêineres num servidor Linux com o Docker; HTTPS interno | F0 |
| **P1** | Ativos | Tipos com capacidades, modelos e ativos; campos personalizados com origem, momento, autor e trava; relacionamentos; tabela com miniaturas, visões, resumo e Quick Look; ficha do ativo; importação por planilha com prévia; etiqueta com QR code | F1, F2 |
| **P2** | Coletor local | Processo separado; disponibilidade; SNMP de impressoras (suprimentos e contadores); saúde do Control iD; séries temporais e estado atual; fila local para quando a API cair | F2, P1; o P2b e o P2c, também o P6 |
| **P3** | Alertas e notificações | Regras; ciclo do alerta; adiar e silenciar; "coleta atrasada"; canais (tela, e-mail, push); resumo por e-mail; modo Foco; tela "O que resolver agora" | F1, F2, P2 |
| **P4** | Operação | Fornecedores, consumíveis, estoque como livro-razão, solicitações, ordens de serviço ligadas a qualquer ativo, com histórico de status | P1 |
| **P5** | Control iD | Backup manual, em lote e agendado, com histórico e retenção; comparação de backups (ZIP e CSV); restauração respeitando dependências; download | P1, P2, P6 |
| **P6** | Cofre | Segredos; acesso concedido por pessoa, grupo ou perfil; revelar e copiar com 2FA e auditoria; troca da chave mestra | F2 |
| **P7** | Mapa da planta | Conversão de DXF para o modelo navegável, ou a importação do modelo do PMG; o mapa visto de cima, em canvas, com as camadas e a busca; posicionamento de qualquer ativo; estado dos ativos no mapa; as camadas que os outros módulos acrescentam pelos fornecedores de marcadores (change p7-mapa-da-planta) | P1, P3 |
| **P8** | Migração e virada | Importação dos dados do PMG, recifragem dos segredos, ensaio no ambiente de teste, checklist de paridade, desligamento do PMG | P1–P7 |
| **S1** | Salas de reunião | O módulo opcional Salas: as salas e os itens solicitáveis, a agenda do dia, o pedido de reserva com o conflito de horário, a aprovação do TI, os convites com a resposta dos participantes e a camada das salas no mapa (change salas-de-reuniao) | F2, P7 |
| **S2** | Painéis | O módulo opcional Painéis: os dashboards das VMs cadastrados pelo endereço, a verificação a cada minuto, a grade que aproveita a janela, o expandir e a camada no mapa (change painel-de-dashboards) | F2, P7 |
| **S3** | Acesso remoto | A tela da máquina no próprio Grafite, pelo VNC: a capacidade com a porta, a ponte WebSocket da API até a máquina, a permissão por local, a auditoria de cada acesso, a tela com o noVNC e a ação no mapa (change acesso-remoto-vnc) | P1, P7 |
| **S4** | Diretório (AD) | O diretório da organização pela Administração: a conta de serviço do Cofre e o teste da conexão, os grupos do AD mapeados para os grupos do Grafite, a entrada com o usuário do AD, com a conta criada e sincronizada, e a gerência dos usuários e dos grupos do AD pela tela, em servidor Linux ou Windows (change integracao-ad-ldap) | F2a, F2b, P6 |
| **S5** | Inventário pelo agente do GLPI | O agente do GLPI que já está nas máquinas manda o inventário também ao Grafite: o endereço com o token no `server` do agente, o protocolo JSON, os agentes ligados ao ativo pela série ou pelo hostname, os campos do inventário de hardware com a origem do agente e a aba Softwares na ficha. A TI pode escolher tipo/local para cadastrar novos computadores no primeiro inventário completo, sem duplicar identidades ambíguas ou inativas; IP, MAC, UUID, usuário e inicialização acompanham o inventário, e fabricante/modelo preenchem o catálogo (changes inventario-pelo-agente-glpi e cadastrar-computadores-pelo-agente) | P1, P2 |
| **S6** | Distribuição de software | A base dos pacotes de software, com o arquivo em partes, o comando silencioso e os códigos de sucesso, e a distribuição a uma ou várias máquinas pela tarefa Deploy do agente do GLPI que já está nelas: a situação, a etapa e o log de cada máquina, o pedir agora e o histórico na ficha do ativo (change distribuicao-de-software) | P1, S5 |
| **D1** | Linguagem visual v3 | O redesenho de todo o sistema, pedido em 29/10/2026 e organizado como os design systems de referência (Material, Fluent, Atlassian, Carbon, Linear, Anthropic e Kimi). Vem em etapas: as fundações, com os temas gerados em OKLCH, o contraste garantido, o destaque Grafite de fábrica, a elevação, as situações completas e a paleta de dados (change fundamentos-v3); os instrumentos de dados (change visualizacoes-de-dados); os toners, os rostos do Control iD e os backups com eles (change suprimentos-rostos-e-backups); os componentes e o dock (change componentes-v3); e o controle do usuário, com o tema personalizado (change tema-personalizado) e o Início ajustável (change inicio-ajustavel). Arquivado em 29/10/2026 | F0, F1 |
| **T1** | Inspeção 3D | Pipeline Blender → GLB; visualizador com modos explodido, carrossel, visão geral, grade e lista; peças ligadas a dados | P1 |
| **T2** | Rede física | Painel de switch 2.5D gerado de um JSON por modelo; KPIs por porta via SNMP; rack U a U | P1, P2, P3 |
| **A1** | Portal do colaborador | Perfil Solicitante; QR code → ficha resumida + "abrir chamado"; PWA com push; padrões de preferências por perfil | F1, P4 |
| **A2** | Governança | Contratos; TCO e depreciação; riscos (probabilidade × impacto); plano de ação 5W2H; revisão de acessos; garantias e licenças a vencer | P1, P4 |
| **A3** | Login corporativo | OIDC (Entra ID, Google), e AD/LDAP se for necessário | F2 |

O P1 é entregue em seis changes, nesta ordem:

| Parte | Entrega |
|---|---|
| **P1a · Catálogo** | Tipos de ativo, que a organização cria do zero; campos da organização, escolhidos por tipo; o motor de campos; as capacidades no código, a começar pelo inventário de hardware; modelos com imagem; o módulo Ativos com o catálogo, que a change gestao-de-ativos passou à Gestão de ativos, um ícone próprio do dock |
| **P1b · Cadastro de ativos** | O ativo, com os dados administrativos e os campos com origem, momento, autor e trava; inativação, permissões com escopo de local e auditoria; a lista simples e a ficha básica; ligar e desligar módulos por organização |
| **P1c · Tabela e visões** | Colunas configuráveis, visões do usuário e da organização, filtros, resumo ao parar o mouse, Quick Look, busca e miniaturas |
| **P1d · Ficha e relacionamentos** | Relacionamentos entre ativos; a ficha completa, com o histórico e os registros ligados; a imagem própria do ativo; os tipos de campo arquivo e imagem |
| **P1e · Importação** | Planilha de um tipo de ativo, em XLSX (a primeira aba) ou CSV, até 10 MB e 5.000 linhas, com as colunas ligadas aos campos pelo rótulo; prévia linha a linha ("de → para", campos travados, erros), casando por patrimônio → série → hostname, com o local, a pessoa, o ativo e o modelo lidos pelo texto; aplicada na fila de tarefas, linha a linha, com o escopo e os restritos de quem importou |
| **P1f · Etiqueta** | Etiqueta com QR code, uma ou até 200 de uma vez, para imprimir pelo navegador: o QR da ficha do ativo, o patrimônio, o nome e a organização, em preto sobre branco; na folha A4 de 21 etiquetas (63,5 × 38,1 mm), começando em qualquer etiqueta da folha, ou na impressora de etiquetas (50 × 30 mm); pela seleção da tabela e pela ficha |

O P2 é entregue em três changes, nesta ordem, com o P6 · Cofre entre o P2a e o P2b: a comunidade SNMP e o login do Control iD são segredos e moram no cofre (seção 5.2, decisão 7), e o P2a só usa ping.

| Parte | Entrega |
|---|---|
| **P2a · Coletor e disponibilidade** | O coletor da organização, com o token mostrado uma vez, as faixas de rede que ele alcança e o último contato, falando com a API pelo endereço da organização; a configuração da coleta, os lotes que não duplicam e a fila em disco; as leituras em série temporal e o estado atual, com o "sem dado" e a idade do dado; a disponibilidade por ping a cada 2 min, pelo campo de IP que o tipo escolhe, na tabela e na ficha |
| **P2b · Impressoras por SNMP** | Suprimentos, contadores e alertas do equipamento, lidos com a credencial SNMP do cofre; o painel Suprimentos; os agregados por hora |
| **P2c · Saúde do Control iD** | A sondagem dos controles de acesso com o login guardado no cofre, com a situação e o último contato |

O P3 é entregue em quatro changes, nesta ordem: as notificações avisam o que os alertas abrem, o e-mail e o push levam as notificações para fora da aplicação, e os indicadores leem o histórico dos alertas.

| Parte | Entrega |
|---|---|
| **P3a · Regras e alertas** | As regras de alerta da organização, com as de fábrica (ativo offline, toner em 10% ou menos, condições da impressora, Control iD, coleta atrasada e coletor sem contato); o motor que avalia o estado atual a cada minuto, com a duração e a folga; o ciclo do alerta, com o reconhecer, o adiar até 1 h e o silêncio do ativo até uma data; o módulo Alertas, o bloco na ficha do ativo e as ocorrências de "O que resolver agora" |
| **P3b · Notificações no servidor** | As notificações gravadas no servidor, por conta, e a central delas, com a leitura em todo aparelho; a notificação de cada alerta que abre, para quem o vê, agrupada acima de 5; os avisos na tela, numa aba só, com o reconhecer e o adiar; o modo Foco; a etapa "Conectando alertas" da chegada |
| **P3c · E-mail e push** | O e-mail imediato do crítico e o resumo; o push no celular, por severidade; as escolhas de cada pessoa; a configuração do SMTP e as chaves do push |
| **P3d · Indicadores** | Os indicadores com uma decisão ligada, com as metas (seção 15): o tempo de atendimento do toner, o tempo até reconhecer o Crítico, a disponibilidade dos ativos e os alertas que voltam; o aviso do indicador fora da meta; a retenção dos alertas resolvidos |

O P4 é entregue em seis changes, nesta ordem. O fornecedor vem primeiro, porque os consumíveis, o estoque e as ordens de serviço apontam para ele.

| Parte | Entrega |
|---|---|
| **P4a · Fornecedores** | O cadastro dos fornecedores na Administração, com o nome e o CNPJ únicos, o contato e a inativação; o tipo de campo fornecedor; o fornecedor do ativo como cadastro, com o texto de antes trocado pela referência na atualização |
| **P4b · Consumíveis** | O catálogo dos consumíveis no módulo opcional Operação, com o código único, o tipo, a cor, o rendimento e os fornecedores; a capacidade `consumiveis.compatibilidade`, com os modelos escolhidos na ficha do consumível e os compatíveis mostrados na ficha do modelo e na do ativo |
| **P4c · Estoque** | O livro-razão do estoque dos consumíveis por local, no Operação: a entrada com o fornecedor e a nota, a saída para um ativo, com o total de páginas lido na hora, a transferência e o ajuste com o motivo; o saldo que nunca fica negativo e o mínimo, com os abaixo do mínimo na tela do estoque e no Início; `estoque.ver` e `estoque.movimentar` por local; o estoque nas fichas do consumível, do ativo e do fornecedor |
| **P4d · Solicitações** | O pedido do colaborador, no Operação, registrado pela TI em nome da pessoa escolhida no cadastro (o colaborador abre o próprio pelo portal do A1): o toner, com as impressoras, os itens por cor, o consumível sugerido e o total de páginas congelado, o conserto, com o ativo e o defeito, e o equipamento, com o tipo, a quantidade e o motivo; o número por organização; o toner atendido pelo estoque, com a saída no livro-razão, ou pelo fornecedor, com a OS dele; a situação, a conclusão, o cancelamento com o motivo e o status em lote; `solicitacoes.ver` e `solicitacoes.atender` por local; as solicitações na ficha do ativo e na auditoria |
| **P4e · Ordens de serviço** | O trabalho da TI ligado a um ativo, no Operação: a OS aberta pela tela, pela ficha do ativo ou pela solicitação de conserto, que passa a segui-la; o número por organização; as situações Aberta, Em atendimento, Aguardando peça, Aguardando fornecedor, Resolvida e Encerrada, com o histórico, o fornecedor da espera, a resolução que conclui a solicitação de origem, a reabertura e os dois encerramentos; as peças do estoque, com a saída no livro-razão e "OS <número>"; o status em lote; `ordens.ver` e `ordens.atender` por local; as OS na ficha do ativo e na auditoria, e o tipo Peça nos consumíveis |
| **P4f · Indicadores da operação** | Os indicadores do Operação, com as metas (seção 7.6): o tempo de resolução das OS, da abertura à resolução, com a espera pela peça e pelo fornecedor; as OS repetidas no mesmo ativo; as páginas por toner, pelo total de páginas entre a saída de um toner e a do seguinte, comparadas ao rendimento. Cada um para quem vê as OS ou o estoque, com o que a conta vê; a meta mudada por quem tem `operacao.administrar`, com o "Mudar a meta" comum ao Alertas; o aviso do indicador fora da meta na avaliação das 7h |

O P5 é entregue em duas changes, nesta ordem: o backup primeiro, porque a comparação e a restauração leem os ZIP dele.

| Parte | Entrega |
|---|---|
| **P5a · Backup do Control iD** | A capacidade `controlid.backup`, com o horário do tipo e o IP, a porta e o login da saúde do Control iD; o backup feito pelo coletor, pelos pedidos que ele busca na API a cada 15 s: manual pela ficha, de todos os controles e agendado todo dia, com a expiração do pedido sem resposta; o ZIP no formato do PMG, com as dez categorias e as fotos, no armazenamento da API; a retenção de 7 diários, 4 semanais e 12 mensais (seção 6.7); o histórico na ficha e na tela "Backups do Control iD", o download, a exclusão e o conteúdo na tela, pelas abas Pessoas, Grupos, Regras de acesso e Horários; `controlid.ver` e `controlid.backup` por local |
| **P5b · Comparação e restauração** | A comparação de um backup com o controle, pelo coletor, e o comparador de dois arquivos, ZIP ou CSV do equipamento; a restauração num controle, na ordem das dependências, com as categorias escolhidas, o aviso do modelo diferente, a confirmação pelo código do app e a auditoria; `controlid.restaurar`. O indicador dos backups em dia vai com os indicadores criáveis, como uma medida do catálogo |

### 3.3 Ordem da fase 1

**F0 → F1 → F2.**

A casca validada no brainstorming vira produto cedo, com as preferências no navegador. Depois o F2 entra por baixo e passa a gravá-las no servidor, sem mudar a interface.

O F1 é entregue em três changes, nesta ordem:

| Parte | Entrega |
|---|---|
| **F1a · Estrutura da casca** | Preferências no navegador com os padrões de fábrica; registro de módulos e navegação; barra superior; dock e menus em árvore; posturas de computador, tablet e celular; Ajustes do Sistema com as seções Aparência, Dock e Acessibilidade |
| **F1b · Interação** | Busca Ctrl+K, cursor suavizado, notificações (avisos e central lateral) e Quick Look, com as seções Cursor, Notificações e Tabelas dos Ajustes |
| **F1c · Chegada e PWA** | Carregamento, boas-vindas e montagem da casca; a tela "O que resolver agora"; a base da PWA; a seção Idioma e região dos Ajustes |

O F2 é entregue em quatro changes, nesta ordem:

| Parte | Entrega |
|---|---|
| **F2a · Contas e acesso** | Organização pelo endereço de acesso; pessoas e contas; entrada com usuário e senha; verificação em dois passos; sessões; auditoria; o comando no servidor que cria organizações e contas e recupera um acesso; a tela de entrada e a seção Conta dos Ajustes |
| **F2b · Permissões e locais** | Árvore de locais; perfis e grupos com escopo; as telas de administração de pessoas, contas e permissões; a consulta da auditoria; a anonimização da pessoa |
| **F2c · Plataforma** | Preferências no servidor, com os padrões da organização e as escolhas de cada conta (o nível do perfil fica para o A1); arquivos e imagens; eventos (outbox → SSE); fila de tarefas |
| **F2d · Operação** | Ambientes de desenvolvimento, teste e produção; serviços do Windows; HTTPS interno; backup; depois, na v0.1.1, o atalho de instalação de dois cliques e o menu da operação no servidor Windows (change instalador-e-menu-da-operacao) e o roteiro de instalação do Linux ao lado do pacote, na release (change instalar-sh-na-release); por fim, o painel da operação no navegador do próprio servidor, com o estado, as tarefas, as configurações e as operações sensíveis (change painel-da-operacao) |

O esqueleto técnico (monorepo, CI, API e banco mínimos) nasce no F0, para que a casca já rode dentro da arquitetura final.

### 3.4 Paridade com o PMG

| Capacidade do PMG (`openspec/specs`) | Onde fica no Grafite |
|---|---|
| `autenticacao`, `gestao-usuarios` (usuários, sessões, minha conta) | F2a (entrada, sessões e conta) + F2b (administração de usuários) |
| `autorizacao-rbac` (perfis, grupos, permissões) | F2b (com escopo por local) |
| `interface-aparencia` | F0, F1 |
| `dashboard-indicadores` | F1 ("O que resolver agora") + P3 (indicadores) |
| `gestao-impressoras` | P1 (tipo Impressora) + P2 |
| `monitoramento-rede-snmp` (ping, suprimentos, contadores) | P2 + P3 |
| `solicitacoes-toner` | P4 (consumíveis + solicitações) |
| `ordens-servico` | P4 (OS ligadas a qualquer ativo) |
| `controlid-dispositivos`, `controlid-backup`, `controlid-restauracao`, `comparador-backups` | P5 |
| `cofre-credenciais` | P6 |
| `mapa-3d` (planta da unidade, DXF) | P7 |
| `operacao-servicos` (serviços do Windows, rotinas, e-mail, ambiente de teste, promoção de migrations) | F2d (serviços, ambientes) + P3 (e-mail) |
| Computadores + importação por planilha | P1 |
| Colaboradores | F2a (pessoas) + F2b (administração) |
| Pausa de notificação por impressora | P3 (silenciar ativo até uma data) |
| Auditoria de segurança e auditoria do Control iD | F2a (auditoria única) |

---

## 4. Arquitetura

### 4.1 Repositório

```
apps/
  web/         casca OS e módulos (React + Vite, PWA)
  api/         HTTP, tempo real (SSE) e tarefas agendadas
  collector/   coletor local: SNMP e Control iD
  operacao/    comando de operação do servidor: instalar, atualizar, voltar, backup e restauração
packages/
  domain/      tipos de ativo, capacidades, tipos de campo, regras de alerta (funções puras)
  ui/          design system: tokens e componentes
  db/          schema, migrations e políticas de isolamento (RLS)
  api-client/  cliente tipado gerado do contrato da API
  operacao/    o que o comando de operação e as tarefas da API usam juntos: ferramentas do PostgreSQL, manifesto, backup e restauração
docs/          specs, planos, referências e o runbook da operação
```

### 4.2 Tecnologias

| Camada | Escolha | Motivo |
|---|---|---|
| Monorepo | pnpm + Turborepo | O pnpm guarda as dependências num depósito único, então cada worktree de agente sai barata |
| API | Fastify + Zod | O mesmo schema valida o formulário na tela e a requisição na API, e gera o OpenAPI |
| Banco | PostgreSQL + Drizzle | SQL explícito, migrations em SQL legível, RLS declarado no schema, JSONB para campos personalizados, busca sem acento (`unaccent` + `pg_trgm`), `LISTEN/NOTIFY` para eventos |
| Tarefas | pg-boss (fila no próprio Postgres) | Alertas, e-mails e backups agendados sem Redis no servidor |
| Web | React, TanStack Router e Query, React Aria, Motion | Navegação instantânea com cache, menus, árvores e tabelas acessíveis por padrão, animação com molas, e tabelas grandes virtualizadas e redimensionáveis pelo próprio React Aria |
| 3D | three.js via React Three Fiber, carregado sob demanda | Só baixa quando alguém abre um visualizador |
| Arquivos | Interface de armazenamento: disco agora, S3 depois | Imagens, miniaturas, GLB e backups do Control iD |
| Imagens | sharp (regravação e miniaturas) + sanitização de SVG no servidor | Remove metadados e scripts |
| Coleta | net-snmp e cliente HTTP do Control iD | Já provados no PMG |
| Notificação | nodemailer (e-mail) + Web Push (VAPID) | E-mail já usado no PMG; o push serve à PWA |
| Servidor interno | WinSW (serviços do Windows) + Caddy (proxy HTTPS) | Um binário cada, sem dependências; o Caddy renova o certificado sozinho e tem a própria AC interna |
| Testes | Vitest, Testing Library, Playwright | Seção 11 |

As versões são as estáveis ou LTS atuais, fixadas no F0.

### 4.3 Onde roda

- **Servidor interno:** um servidor Windows ou um servidor Linux só com o Docker, as duas plataformas para sempre, com os mesmos processos:
  - **app de produção:** API, web compilada e tarefas agendadas;
  - **app de teste:** o mesmo pacote, com a cópia dos dados da produção;
  - **coletor**, só na produção;
  - **proxy:** o Caddy;
  - **PostgreSQL:** duas instâncias, a da produção e a do teste, cada uma com as próprias senhas.

  No Windows, cada processo é um serviço (WinSW), como o PMG faz hoje, e o PostgreSQL da produção é o do servidor. No Linux, cada processo é um contêiner de um projeto do Docker Compose, os dois PostgreSQL também, e cada versão é o conjunto das imagens do pacote dela. O comando de operação, os fluxos e as regras são um só para as duas (change servidor-linux-com-docker). Os apps atendem só no próprio servidor (no Linux, na rede interna do Docker), e a rede chega a eles pelo proxy.

  No Windows, a instalação começa pelo atalho de instalação, com dois cliques: ele instala o Node 24 e o PostgreSQL 18 que faltam, pelos instaladores oficiais com a versão e o hash fixados no pacote, e desliga o IIS que ocupa as portas do proxy, com o sim de quem opera. No Linux, a instalação começa pelo roteiro de instalação que a release publica ao lado do pacote, e que acha o pacote da pasta dele (changes instalador-e-menu-da-operacao e instalar-sh-na-release).

  A operação do dia a dia é pelo painel da operação: uma página do próprio servidor, separada do app e de pé com o Grafite parado, servida só em 127.0.0.1 e aberta com um código de uso único, pelo atalho "Grafite" da área de trabalho no Windows ou pelo `sudo grafite painel` numa sessão com interface no Linux. Ela mostra o estado dos serviços, com a lista vinda da instalação, e roda as tarefas, as configurações e as operações sensíveis pelos mesmos comandos, com as mesmas conferências e confirmações; a restauração, a volta e a troca da chave do cofre pedem o nome do banco da produção digitado. O menu no terminal continua no Windows, pelo `grafite.ps1 menu`, e os comandos valem nas duas plataformas (change painel-da-operacao).
- **HTTPS é obrigatório,** mesmo na rede interna, porque PWA, service worker, push e cookie `Secure` só funcionam em HTTPS. O Caddy fica na frente, com o certificado num de dois modos, escolhido na instalação:
  - **domínio público:** Let's Encrypt pelo desafio de DNS, renovado sozinho, em que todo dispositivo confia sem instalar nada;
  - **AC interna:** a do próprio Caddy, com o certificado raiz distribuído às máquinas e aos celulares, ou um certificado da AC da empresa.

  Uma tarefa diária confere a validade do certificado, e a renovação parada aparece em Tarefas.
- **PWA:** um service worker guarda a web compilada, então a aplicação abre rápido e abre mesmo sem rede. A API vai sempre à rede e nunca sai do cache. Uma versão nova espera o usuário escolher "Atualizar", sem recarregar no meio do trabalho. Só os arquivos com a versão no nome têm cache longo.
- **Produto:** os mesmos processos em Docker. O coletor é instalado na rede de cada cliente e fala com a API por HTTPS, autenticado por token.

### 4.4 Multiempresa desde o primeiro dia

1. Toda tabela carrega a organização e é protegida por RLS, mesmo com uma organização só.
   - A organização de cada requisição vem do endereço de acesso. Cada organização registra os seus endereços (por exemplo, `grafite.empresa.local`), e um produto com vários clientes dá um endereço a cada um.
   - As chaves estrangeiras entre tabelas de negócio levam o `org_id` junto, porque o PostgreSQL confere chaves estrangeiras sem aplicar o RLS.
2. Nada da empresa fica no código: nome, logo, cores, terminologia, locais e setores são dados.
3. As peças de infraestrutura são trocáveis por interface: login (local agora, OIDC depois), armazenamento (disco agora, S3 depois) e e-mail.
4. Cada organização liga ou desliga os módulos opcionais, a partir do P1b, com o primeiro deles, o Ativos.
   - Um módulo opcional começa ligado. Quem define os padrões da organização o liga e desliga na Administração.
   - Desligado, o módulo some do dock, da barra de abas e da busca de todas as sessões, sem recarregar, e a API recusa as rotas dele. Os dados ficam guardados e voltam quando ele é ligado de novo.
   - O Início, a Administração e os Ajustes não são opcionais.
5. O empacotamento em Docker existe desde o F0, mesmo que o servidor interno use serviços do Windows.

---

## 5. Modelo de domínio

### 5.1 Mapa

```
Organização
├── Locais (em árvore livre, com tipo): Unidade, Prédio, Andar, Setor, Sala ou Outro
├── Pessoas ──(0 ou 1)── Conta de acesso → Perfis e grupos (com escopo)
├── Tipos de ativo ──(ligam)── Capacidades
│     └── Modelos (fabricante + modelo: imagem, 3D, layout de portas)
│           └── Ativos (patrimônio, série, hostname, local, responsável, campos)
├── Fornecedores (nome e CNPJ únicos) ← o fornecedor do ativo, dos consumíveis e do estoque
├── Consumíveis → Estoque por local (o saldo e o mínimo) → Movimentações (o livro-razão)
├── Solicitações → Ordens de serviço
├── Cofre (segredos e acessos concedidos)
├── Séries temporais (leituras) + estado atual
├── Alertas e notificações
└── Auditoria (só recebe registros novos)
```

### 5.2 Decisões

1. **Pessoa e conta são separadas.** Todo colaborador é uma pessoa, e só quem entra no sistema ganha conta. O responsável por um ativo não precisa de login. O Solicitante é uma pessoa com conta e o perfil certo.
   - A conta entra por um **usuário**, único na organização, como no PMG. O e-mail da pessoa é opcional, para servir também a quem não tem e-mail corporativo.
   - A pessoa guarda só o necessário: o nome e, se houver, o e-mail, a matrícula (única na organização), o local de trabalho e o telefone ou ramal.
2. **Tipo é dado, capacidade é código.**
   - Criar o tipo "Nobreak" é um cadastro.
   - O que exige lógica é uma capacidade que o tipo liga. Cada capacidade traz seus campos, painéis na ficha, métricas e modelos de alerta.
   - A organização começa sem tipos: ela cria os que usa, e a migração do PMG (P8) cria os dela. Cada tipo escolhe um dos ícones genéricos do F0.
3. **Imagem, modelo 3D e layout de portas pertencem ao modelo do equipamento.** O ativo só sobrescreve se precisar: a imagem própria dele vale no lugar da do modelo (seção 7.9). Ativos se relacionam entre si (computador e monitor, porta e equipamento, rack e switch), e cada ficha leva aos registros ligados a ela, desde o P1d:
   - **pelos campos do tipo ativo:** o campo diz os tipos de ativo que aceita e o nome do lado de lá, e a ficha do ativo escolhido mostra os ativos que apontam para ele, como os "Monitores" do computador;
   - **pela ligação livre "Ligado a":** entre dois ativos quaisquer, sem tipo nem sentido, para o que não tem campo, feita por quem edita os dois.

   As ligações com posição, como o rack U a U e a porta do switch, ficam para o T2, como campos das capacidades dele.
4. **Campos personalizados ficam em JSONB,** validados pelas definições dos campos. Cada campo guarda **origem** (manual, planilha, coleta, API), **momento**, **autor** e **trava**. Um campo travado só muda por edição manual.
   - Os campos são da organização, e cada tipo escolhe os que usa: o "IP" é criado uma vez e serve à impressora, ao switch e à câmera. A obrigatoriedade fica na ligação com o tipo.
   - No ativo, os valores ficam num JSONB pelo id do campo, e a origem, o momento, o autor e a trava, num segundo JSONB, ao lado. Renomear um campo não toca nos ativos.
   - Os campos das capacidades têm uma chave fixa no código, como `hardware.processador`, igual em toda organização.
   - Os campos comuns a todo ativo também têm chave fixa, como `ativo.patrimonio`. Os que o banco precisa garantir ou filtrar ficam em colunas: o nome, o patrimônio (único na organização), a série, o hostname, a situação de uso, o local e o responsável. Os outros ficam no JSONB, como os da organização. O estado de todos, inclusive o do modelo, fica no segundo JSONB, pela chave.
   - A gravação manual sempre pode e mantém a trava. A importação e a coleta não mudam um campo travado nem um campo só manual.
   - A importação mostra na prévia o campo que a trava ou o só manual seguram, e a fila confere de novo ao gravar cada linha: a trava ligada depois da prévia vale.
5. **Cada coleta vira histórico:** a leitura vai para uma série temporal e um "estado atual" separado mantém as listas rápidas. "Sem dado" nunca vira zero.
6. **Solicitação e OS são coisas diferentes.**
   - A solicitação é o pedido do colaborador (toner, conserto, equipamento).
   - A OS é o trabalho da TI, sempre ligado a um ativo.
   - O estoque é um livro-razão: nada é editado, só se lançam movimentações.
7. **Todo segredo mora no cofre:** senha do Control iD, credencial SNMP, chave de licença.
8. **Nada se exclui, tudo se inativa.** Toda alteração vira um evento de auditoria com "antes → depois", gravado na mesma transação.
   - A regra vale para os registros de negócio. As credenciais se substituem: o segredo da verificação em dois passos e os códigos de recuperação são apagados ao desativar ou ao gerar de novo, e a auditoria guarda o histórico. As sessões nunca se apagam, só se encerram.
   - A foto da pessoa também se substitui. A foto trocada ou removida deixa de ser entregue na hora e é apagada do armazenamento na manutenção diária; o registro do arquivo fica, sem o conteúdo, e a auditoria guarda a troca.
   - A anonimização (seção 9.9) apaga os dados pessoais de uma pessoa, e não o registro dela.
   - A planta do mapa é um desenho enviado: quem cuida do mapa a substitui por outro arquivo e a exclui. A substituição mantém o nome, o local e as posições. A exclusão apaga o desenho e as posições do que estava nela, o que estava posicionado continua cadastrado, e a auditoria guarda o nome, as medidas e a quantidade de posições apagadas.
9. **Personalização em três níveis:** organização → perfil → usuário, incluindo visões de tabela por usuário e visões compartilhadas da organização.
   - O F2c entrega a organização e o usuário, resolvidos campo a campo: o padrão de fábrica, o da organização e a escolha do usuário. O nível do perfil entra no A1, e as visões de tabela, no P1c.
   - Os padrões da organização vão para a auditoria; as preferências de cada usuário, não.
   - Uma visão guarda as colunas, com a ordem e a largura, a ordenação e os filtros; a busca não entra. Cada tabela com visões tem a de fábrica, que não muda, como "Todos os ativos".
   - As visões da organização são de todos e ficam com quem define os padrões da organização (`organizacao.editar`), que também escolhe a padrão. Cada conta cria as suas, que só ela vê.
   - A tabela abre na visão escolhida pela conta, depois na padrão da organização e depois na de fábrica. A escolha fica nas preferências da conta e a acompanha em qualquer aparelho.
   - As mudanças ainda não salvas ficam no endereço, marcadas como "Alterada": o link reproduz a tabela.
   - As visões da organização vão para a auditoria, e as de cada conta, não. Remover uma visão é definitivo, porque ela é configuração, e não registro de negócio.
10. **IDs em UUIDv7:** ordenáveis no tempo e não sequenciais. O ID que vai no QR code não permite adivinhar os outros, e abrir o link continua exigindo login.
11. **Locais em árvore livre.** Qualquer tipo de local fica dentro de qualquer outro, até 8 níveis, com o nome único entre os irmãos. O tipo vem de uma lista fixa (Unidade, Prédio, Andar, Setor, Sala ou Outro) e dá o ícone e o filtro. O rack é um ativo (T2), e não um local.

### 5.3 Tipos de campo

Texto, texto longo, inteiro, decimal, moeda (formato brasileiro), data, lista, lista múltipla, pessoa, local, ativo (referência), fornecedor (referência, desde o P4a), licença, URL, IP, MAC, arquivo e imagem.

- **Data** aceita dd/mm/aaaa, ISO e o número de série do Excel.
- **Lista** compara as opções sem acento e sem diferenciar maiúsculas.
- **Licença** recusa uma chave de produto e orienta a guardá-la no cofre.
- **Arquivo e imagem** chegam com a ficha do ativo (P1d), que traz o envio de arquivos:
  - um arquivo por campo, enviado na ficha depois do cadastro, e nunca digitado nem importado; por isso, esses campos não podem ser obrigatórios no tipo;
  - a imagem segue as imagens da seção 7.9;
  - o arquivo aceita PDF, imagens, documentos, planilhas e apresentações do Office e do LibreOffice, texto, CSV e ZIP, com o tipo conferido pelo conteúdo, até 25 MB, e é sempre entregue para baixar.

Cada definição de campo tem rótulo, grupo, validação, visibilidade por permissão (o campo restrito) e política de escrita (só manual, ou também coleta e importação). A obrigatoriedade fica na ligação do campo com cada tipo. O ponto de partida é o catálogo do PMG em `src/lib/asset-fields.js`.

### 5.4 Capacidades iniciais

| Capacidade | Para | Acrescenta |
|---|---|---|
| `rede.disponibilidade` | Qualquer ativo com IP | Ping a cada 2 min pelo campo de IP que o tipo escolhe ao ligá-la; online, offline ou sem dado, com a latência; o alerta de fábrica "Ativo offline", depois de 5 min (P3a) |
| `snmp.suprimentos` | Impressora | Suprimentos e contadores; painel Suprimentos; os alertas de fábrica do toner em 10% ou menos e das condições da impressora, a que a para e a que pede atenção (P3a); credencial SNMP no cofre |
| `controlid.saude` | Controle de acesso | Sondagem a cada 5 min pelo login do cofre, escolhido no tipo ou ligado ao controle; respondendo, login recusado, sem resposta ou resposta inesperada, com o último contato e o firmware (P2c); os alertas de fábrica do controle sem resposta há 10 min e do login recusado ou da resposta inesperada (P3a) |
| `controlid.backup` | Controle de acesso | Credencial no cofre; backups, comparação e restauração (P5) |
| `hardware.inventario` | Computador | Processador, memória, discos, sistema e licenças (edição e modalidade, nunca a chave); peças para o 3D. Os monitores são ativos próprios, ligados ao computador (P1d) |
| `mapa.posicao` | Todos | Posição na planta (P7) |
| `snmp.portas` | Switch | Layout de portas do modelo; métricas por porta; painel Portas (T2) |
| `rack.montagem` | Rack e equipamentos de rack | Posição e altura em U (T2) |
| `consumiveis.compatibilidade` | Impressora e afins | Consumíveis compatíveis com o modelo, escolhidos na ficha de cada consumível; a ficha do modelo e o cartão da ficha do ativo os mostram a quem vê o modelo ou o ativo (P4b) |

Os dados administrativos e financeiros (patrimônio, fornecedor, nota fiscal, compra, garantia, propriedade, contrato, custo mensal, centro de custo, vida útil, responsável) são **comuns a todo ativo**, como o `AssetProfile` do PMG. Não são uma capacidade.

Os campos comuns (P1b) são:
- **Identificação:** nome, patrimônio, número de série e hostname;
- **Uso:** a situação de uso (em uso, em estoque ou em manutenção, uma lista fixa), o local e o responsável;
- **Administrativo:** o fornecedor, que aponta o cadastro dos fornecedores desde o P4a, o contrato, como texto até o A2, nota fiscal, data e valor de compra, garantia até, propriedade (próprio, alugado ou comodato, uma lista fixa), custo mensal, centro de custo e vida útil em meses.

O ativo aparece pelo nome, ou pelo fabricante e o modelo, ou pelo tipo, sempre com o patrimônio ao lado. Os rótulos dos campos comuns e das capacidades ficam reservados: um campo da organização não os repete.

---

## 6. Fluxo de dados e notificações

### 6.1 Visão geral

```
Equipamentos ─SNMP/HTTP─▶ Coletor ─lotes HTTPS─▶ API ─▶ PostgreSQL
                          (fila local se a API    (dado + auditoria + evento,
                           estiver fora do ar)     tudo na mesma transação)
                                                        │
                                   Motor de regras ◀────┘
                                          │
                                       Alertas ─▶ Notificações
                                                   ├─ na tela: SSE → toast + central
                                                   ├─ e-mail: fila, com resumo
                                                   └─ push no celular (PWA)

Tela ◀─SSE "registro mudou"─ API   (as listas se atualizam sozinhas)
```

### 6.2 Coleta

- O coletor busca na API a configuração do que coletar.
- Recebe só as credenciais dos seus ativos, e só na memória.
- Envia as leituras em lotes com chave única, então reenviar nunca duplica.
- Se a API estiver fora do ar, guarda as leituras numa fila em disco e reenvia depois.
- Uma leitura que falha é registrada como "sem dado" daquela métrica, nunca como zero.
- Um valor fora da faixa válida fica marcado como inconsistente, sem ser descartado.
- A coleta respeita a trava de campo e registra a origem de cada valor.
- **Intervalos iniciais** (configuráveis por organização e tipo):

  | Coleta | Intervalo |
  |---|---|
  | Disponibilidade | 2 min |
  | Suprimentos e contadores de impressora | 10 min (como no PMG) |
  | Portas de switch (T2) | 1 min |
  | Backup do Control iD | diário, às 02:00 |

- **"Coleta atrasada"** é aberta depois de 3 ciclos sem resposta (configurável).

### 6.3 Escrita

Validação (Zod) → permissão → transação com o contexto da organização (RLS) → dado + evento de auditoria + evento de saída (outbox) → commit → `NOTIFY` → SSE. O motor de regras lê o estado gravado a cada minuto (6.4), e as notificações saem dos alertas.

Não existe mudança sem auditoria nem evento perdido.

### 6.4 Regras de alerta

- **Uma regra é feita de** métrica, condição, duração, severidade e escopo (tipo, modelo, ativo ou local), mais uma folga de recuperação para o alerta não ficar piscando. Exemplo: dispara abaixo de 10% e só se recupera acima de 15%.
- **Identidade:** ativo (ou coletor) + regra + item (ex.: `toner:1`). Nunca há dois alertas abertos iguais.
- **Ciclo:** aberto → reconhecido (quem, quando) → resolvido.
  - Resolve sozinho quando o valor se recupera.
  - Pode ser adiado até uma hora, e o ativo pode ser silenciado até uma data (a "pausa" do PMG).
- **Os limites são dados:** editáveis na tela e auditados, nunca fixos no código.
- **Avaliação (P3a):** a cada minuto, pela fila de tarefas, sobre o estado atual da coleta e o último contato dos coletores, e na hora quando uma regra muda. A leitura sem dado não abre nem resolve um alerta, e o alerta se encerra quando a regra deixa de valer para o ativo.
- **Regras de fábrica (P3a):** cada organização começa com o ativo offline, o toner em 10% ou menos, a impressora parada e a que pede atenção, o Control iD sem resposta e o que não aceita a sondagem, a coleta atrasada e o coletor sem contato. Ela as edita, inativa e reativa como as outras, e a atualização nunca as recria.
- **Severidades:** Informação, Atenção e Crítico. Sempre texto + ícone + cor.
- O próprio sistema se monitora pelas mesmas regras, por exemplo "coletor sem contato há 10 min".

### 6.5 Canais

- **Tela (P3b):** sempre, com o aviso e a central de notificações.
  - A notificação é gravada no servidor, por conta: a central, a leitura e o número do sino são os mesmos em todo aparelho da conta.
  - O alerta que abre notifica quem o vê, pelo acesso de cada conta. Acima de 5 de uma vez para a mesma conta, elas viram uma notificação só, com a severidade mais alta.
  - Só a notificação que chega com a aplicação aberta vira aviso, conforme as severidades escolhidas nos Ajustes. O Crítico de um alerta traz "Reconhecer" e "Adiar 15 min" para quem pode tratá-lo.
- **E-mail (P3c):** o Crítico vai na hora; o resto, ainda não lido, vai num resumo diário às 8h, com as 50 mais novas e quantas mais há.
  - Vai para o e-mail da pessoa da conta. Cada um desliga o e-mail do Crítico e o resumo em Ajustes › Notificações, e os padrões da organização valem para essas escolhas.
  - O e-mail é em texto e leva só o que a central mostra: o título, a descrição, a origem e o endereço do registro, no endereço de acesso da organização. O cabeçalho `Auto-Submitted: auto-generated` impede que as respostas automáticas voltem.
- **Push (P3c):** para os aparelhos que cada pessoa inscreve em Ajustes › Notificações, nas severidades que ela escolhe; de fábrica, só o Crítico. Com o Foco, só o Crítico vai ao celular.
  - O conteúdo vai cifrado, e só para os serviços de push dos navegadores. O toque no aviso abre o registro no Grafite.
  - O aparelho que o serviço de push diz não existir mais sai da conta, e a inativação da conta tira os aparelhos dela.
- **Entrega pela fila (P3c):** a notificação gravada põe a entrega na fila, na mesma transação, e cada e-mail e cada push é uma tarefa com as próprias tentativas. Uma nova tentativa não manda de novo. O envio que falha em todas aparece em Tarefas com falha, e a notificação continua na central.
- **Configuração (P3c):** quem opera o servidor configura o SMTP e o remetente da produção pelo comando de operação e confere o envio pelo mesmo comando. As chaves do push são geradas na instalação e ficam só na configuração da produção.
  - Sem a configuração, o canal fica desligado, e os Ajustes dizem o motivo em texto. No teste, nenhum dos dois canais sai.
  - Cada pessoa testa os canais dela nos Ajustes, com o resultado na hora.
- **Modo Foco (P3b):** só o Crítico vira aviso, e o resto fica na central. Liga nos Ajustes ou na própria central, e o sino mostra "Foco".
- **Várias abas abertas (P3b):** só a aba usada por último mostra o aviso; as outras só atualizam o sino.

### 6.6 Tempo real e listas

- O SSE retoma de onde parou (`Last-Event-ID`).
- Um evento "registro mudou" invalida o cache da tela e as listas se atualizam sozinhas.
- Listas paginadas no servidor por cursor, sem limite fixo (acabam os tetos de 100 e 50 registros do PMG).
- A idade do dado fica sempre visível.

### 6.7 Retenção (padrões iniciais, ajustáveis por organização)

| Dado | Retenção |
|---|---|
| Leituras brutas | 30 dias |
| Agregados por hora | 13 meses |
| Backups do Control iD | 7 diários, 4 semanais e 12 mensais. Substitui a regra de "um backup por dispositivo" do PMG; confirmado no P5 |
| Auditoria | No mínimo 5 anos, a contar de cada registro. Nada é apagado no F2; uma limpeza futura respeita esse mínimo |
| Eventos de saída (outbox) | 24 h, para a retomada da conexão de eventos; a manutenção diária apaga os mais antigos |
| Arquivos removidos | Apagados do armazenamento na manutenção diária seguinte à remoção; o registro fica, sem o conteúdo |
| Notificações | 90 dias, lidas ou não; a manutenção diária apaga as mais antigas (P3b) |
| Alertas resolvidos | 13 meses depois do fim, para a lista dos resolvidos, a ficha e os indicadores; a manutenção diária apaga os mais antigos, e o que a auditoria registrou sobre eles fica (P3d). O alerta aberto nunca sai pela retenção |

---

## 7. Casca OS e identidade

### 7.1 Direção visual: A · Grafite

- **Tipografia:** Instrument Sans na interface e JetBrains Mono em IDs, IPs, patrimônios, horários e números de tabela. Números de KPI usam algarismos tabulares. As duas fontes têm licença livre (OFL).
- **Materiais:**
  - vidro fosco (desfoque + saturação + tinta + borda de 1 px) **só em camadas sobrepostas**: dock, menus, avisos e busca;
  - tabelas e formulários sempre com superfície sólida.
- **Referências da Apple:** imitam-se o comportamento e o acabamento, nunca os ativos. Não usamos SF Pro, SF Symbols, papéis de parede da Apple nem os três botões coloridos de janela.

### 7.2 Padrões de fábrica

Escolhidos pelo usuário no protótipo:

```json
{
  "theme": "grafite",
  "accent": "azul",
  "dock": "bottom",
  "dockSize": 48,
  "magnify": true,
  "autohide": false,
  "radius": 12,
  "cursor": "smooth",
  "smooth": 95,
  "magnet": true,
  "transp": "normal",
  "density": "compact"
}
```

As preferências que o protótipo não tinha seguem o comportamento das seções 7.4 e 7.6:
- avisos de Atenção e de Informação ligados, com 6 s na tela;
- linhas alternadas e miniaturas ligadas nas tabelas;
- o fuso horário do sistema operacional;
- a tela inicial por severidade e, dentro dela, a mais antiga primeiro;
- a barra de rolagem "Ao rolar": o polegar aparece com o ponteiro sobre a área, enquanto ela rola e com o foco do teclado nela; a outra escolha é "Sempre visível";
- todos os módulos no dock, na ordem de fábrica, com Ajustes no fim: a conta escolhe a ordem e tira módulos do dock, e a organização define a ordem de quem não escolheu.

Cada organização pode definir os próprios padrões, e cada usuário muda os seus em Ajustes.

### 7.3 Temas

| Escuros | Claros |
|---|---|
| Grafite (padrão) | Névoa |
| Meia-noite | Papel |
| OLED | Alto contraste |

- Quatro cores de destaque: azul (padrão), verde, laranja e grafite.
- Os tokens iniciais estão no Apêndice A e são refinados no F0.
- Todos os temas precisam passar na checagem automática de contraste.
- O tema e o destaque Personalizado (D1, change tema-personalizado) são montados pela conta, na Aparência, a partir das mesmas entradas do gerador, com as mesmas garantias de contraste (Apêndice A.1 e A.2).

### 7.4 Comportamentos

- **Dock**
  - Posição embaixo, à esquerda ou à direita.
  - Tamanho de 28 a 64 px.
  - Ampliação ao passar o mouse (até +55%, curva gaussiana).
  - Ocultar automático: reaparece quando o mouse chega à borda.
  - Um ponto marca o módulo atual, e um separador isola Ajustes.
  - A conta escolhe a ordem dos módulos e tira módulos do dock, em Ajustes › Dock. Ajustes fica sempre no fim, fora da escolha.
  - O botão Mais, com três pontos, traz os módulos que não couberam na tela e, depois deles, os que a conta tirou do dock, com os menus de cada um. O módulo tirado continua na busca e nos endereços. Só com os tirados, o Mais fica antes do separador de Ajustes, e a ampliação continua; com os que não couberam, ele fica no último lugar, e a ampliação fica suspensa.
  - No celular, as abas seguem a ordem escolhida, e o módulo tirado do dock fica em "Mais". O módulo que fica sempre em "Mais", como a Administração, continua lá.
- **Menus em árvore**
  - Abrem depois de um pequeno atraso sobre o item do dock e trocam mais rápido quando outro menu já está aberto.
  - Fecham com atraso ao sair.
  - Uma área de tolerância em triângulo mantém o submenu aberto enquanto o mouse vai até ele na diagonal.
  - O submenu abre para o lado com espaço.
  - Teclado: setas, Enter e Esc. No toque, um toque abre.
  - Tempos exatos no Apêndice B.
- **Barra superior:** módulo atual e seus menus à esquerda; itens de status à direita (rede, alertas com contador, relógio, usuário).
- **Janela**
  - A janela de conteúdo termina sempre antes do dock, com o mesmo respiro que a separa da barra superior. A página não rola: o conteúdo rola dentro da janela, abaixo da barra das abas.
  - Perto da borda de cima e da de baixo, o conteúdo esmaece enquanto há mais além dela. O campo que recebe o foco rola para fora da faixa esmaecida.
  - Com o ocultar automático, o dock passa por cima da janela quando reaparece.
- **Busca (Ctrl+K):** ativos, ações, ajustes e navegação. Busca sem acento e com as palavras em qualquer ordem, setas + Enter, Esc fecha.
- **Cursor suavizado**
  - Um ponto segue o mouse exatamente, e um anel o acompanha com suavização. O clique continua preciso.
  - Sobre um elemento interativo compacto (botão, link, aba, segmento, item do dock), o anel o abraça: o contorno do elemento com 4 px de folga de cada lado. Itens de menu e opções de lista, que já se destacam sozinhos, não são abraçados.
  - Some em campos de texto (volta o cursor de texto), no toque e com movimento reduzido.
  - O usuário pode escolher "Do sistema".
- **Notificações**
  - Os toasts aparecem no canto superior direito, com animação de mola, no máximo três ao mesmo tempo.
  - Com três na tela, o que chega tira o temporário mais antigo. Um crítico nunca sai da tela por causa de outro aviso: com três críticos, o novo espera a vez.
  - Pausam enquanto o mouse ou o foco estão em cima.
  - O que não é crítico some em 6 s, ou em 10 ou 20 s, à escolha do usuário; o **crítico fica até ser reconhecido ou adiado**.
  - Cada usuário escolhe se Atenção e Informação viram aviso na tela. O que não vira aviso vai direto para a central.
  - Há uma central lateral com histórico e filtros.
- **Quick Look:** a barra de espaço na linha selecionada abre a prévia (imagem ou 3D, campos principais e ações). As setas trocam de registro e Esc fecha.
- **Abas de cadastro**
  - Um campo que pede outro cadastro, como o local de um ativo, mostra embaixo "Cadastrar novo local", que abre o cadastro numa aba da janela, sem fechar a tela de onde veio.
  - Trocar de aba não descarta nada, nem o ponto da rolagem. Ao salvar, a aba fecha, e o campo volta com o registro criado. Uma aba de cadastro pode abrir outra.
  - A barra de abas só aparece com mais de uma aba, e a primeira é sempre a tela em que a pessoa estava.
- **Cadastro em etapas**
  - O cadastro do ativo é feito em etapas: à esquerda, a lista empilhada (Tipo, Modelo, Identificação, Uso, os grupos dos campos do tipo, as capacidades e Administrativo), cada etapa com o que falta em texto, como "Falta: IP"; à direita, a etapa aberta, com a imagem do modelo, ou o ícone do tipo, e os campos ao lado, lado a lado enquanto cabem.
  - O título "Novo ativo" sai da vista quando a barra das abas aparece, porque a primeira aba já o mostra.
  - "Voltar" e "Continuar para …" andam sem recusar campos vazios, e qualquer etapa abre pela lista. Na última, "Cadastrar" abre a primeira etapa com um problema, com o foco no campo.
  - O que foi preenchido fica num rascunho da conta, no servidor, com "Rascunho guardado agora" à vista: recarregar a página, sair e entrar ou abrir em outro aparelho retoma o cadastro de onde parou. "Descartar o rascunho" recomeça, e cadastrar o ativo apaga o rascunho.
- **Ficha em cartões**
  - A aba Dados da ficha do ativo segue o desenho do cadastro: à esquerda, um cartão por grupo (Visão geral, Identificação, Uso, os grupos dos campos do tipo, as capacidades e Administrativo), cada um com o resumo do que tem em texto, como "Em uso · Jundiaí › Expedição", ou "Falta: IP" quando um obrigatório está vazio; à direita, o cartão aberto, com a imagem do ativo, ou a do modelo, ou o ícone do tipo, e o conteúdo ao lado, com os campos lado a lado enquanto cabem, como no cadastro.
  - A Visão geral abre primeiro, com os blocos que os módulos mostram na ficha, como os alertas, e os segredos; o resumo dela junta os dos blocos, como "1 alerta aberto", ou diz "Nada pede atenção". O cartão de uma capacidade mostra o painel dela, como o dos suprimentos, com a situação no resumo, como na coluna da tabela.
  - "Salvar alterações" grava o que mudou em qualquer cartão numa gravação só, e embaixo da lista a ficha diz "Nenhuma alteração" ou "N alterações não salvas". Uma recusa abre o cartão do campo, com o foco nele. O cartão aberto fica no endereço, como a aba.
- **Tabela**
  - Cabeçalho fixo, linhas demarcadas e alternadas, miniatura no início da linha. As linhas alternadas, a miniatura e o resumo da linha podem ser desligados pelo usuário (Ajustes › Tabelas).
  - Colunas redimensionáveis, ocultáveis e reordenáveis pelo painel "Colunas"; o menu de cada coluna ordena, filtra, oculta e redimensiona; visões salvas por usuário e visões compartilhadas (seção 5.2, decisão 9).
  - Ordenação e filtros no servidor, sobre todos os registros; filtros e busca visíveis; virtualização, com a página seguinte trazida ao fim da rolagem.
  - Clicar na linha abre o registro (exceto sobre controles), e Enter também abre. A seleção é com Ctrl/Cmd e Shift, e não tira do clique a abertura.
  - Clique direito, tecla de menu ou toque longo abrem o menu de contexto, que age sobre a seleção. Ctrl+C copia as linhas selecionadas como texto com tabulações, que cola numa planilha.
  - Resumo das colunas fora da área visível ao parar o mouse 1,5 s sobre a linha (herdado do PMG).
- **Ajustes do Sistema:** Aparência, Dock, Cursor, Notificações, Tabelas, Idioma e região, e Acessibilidade, todos com prévia ao vivo.
- **Acessibilidade:** movimento reduzido e transparência reduzida são sempre respeitados. A ampliação do dock e as molas também se desligam com movimento reduzido.

### 7.5 Carregamento e boas-vindas

1. **Carregamento:** marca do produto, barra fina e etapas reais. Nunca é um timer falso.
   - A barra avança quando cada etapa termina.
   - A lista de etapas é aberta. Desde o F2a, ela é "Carregando o Grafite", "Carregando suas preferências", "Validando sessão" e "Pronto". O P3 acrescenta "Conectando alertas".
   - O carregamento só aparece se a chegada demorar mais que 500 ms, também no primeiro acesso.
   - A chegada não espera o servidor por mais de 5 s. Sem resposta, a casca abre com a sessão desconhecida e a valida quando o servidor voltar.
2. **Boas-vindas:** "olá" escrito à mão da esquerda para a direita, seguido de "Bem-vindo ao Grafite".
   - Aparece **só no primeiro acesso** a este navegador.
   - Pode ser pulada com clique, Esc ou o botão "Pular".
   - O "O que há de novo" fica para depois do P3: "Bem-vindo de volta", as novidades da versão e o resumo de alertas novos.
3. **Entrada:** sem sessão, a tela de entrada vem depois das boas-vindas (ou direto, nos acessos seguintes), com os passos pendentes da conta.
4. **A casca se monta:** depois das boas-vindas e da entrada, a barra desce, a janela aparece e o dock sobe com mola (no celular, a barra de abas).
5. **Acessos seguintes:** sem "olá" e sem montagem. Com a sessão valendo, a casca aparece já no lugar; depois de uma entrada, ela aparece com troca de opacidade.
6. **Movimento reduzido:** tudo vira troca simples de opacidade, e o "olá" aparece já escrito.

### 7.6 Tela inicial

**"O que resolver agora"** é a primeira tela depois do login. Ela lista as ocorrências abertas dos módulos, com a imagem do ativo, por severidade e, dentro dela, a mais antiga primeiro. O usuário reordena pelas colunas, e a escolha fica gravada.

Os indicadores só aparecem quando existe uma decisão ligada a eles, conforme o ANTISLOP (§5 e §30).

**Início ajustável (D1, change inicio-ajustavel):** o Início abre com a busca no topo e é feito de blocos. "O que resolver agora" é o primeiro e fica sempre à vista; os módulos registram os outros, como os suprimentos que acabam primeiro, numa prateleira de cartuchos com a estimativa, e os backups do Control iD, com os rostos e os dias sem backup. Cada conta sobe, desce e oculta os blocos em "Personalizar o Início".

**Opções e largura dos blocos (change opcoes-dos-blocos-do-inicio):** o módulo declara as opções do bloco dele, e o Início as mostra numa gaveta, no modo Personalizar: cada mudança vale na hora e fica gravada na conta. O bloco dos suprimentos tem os tipos (Toner, Cilindro, Fusor e Outros), os locais, quantas impressoras e até que nível, e diz o recorte em texto, como "Toner · até 30% · Jundiaí". Cada bloco de módulo tem a largura inteira ou a metade: na janela larga do computador, dois de metade seguidos ficam lado a lado. "O que resolver agora" é sempre inteiro.

**Indicadores dos alertas (P3d):** ficam na tela Indicadores do Alertas, para quem vê os alertas, calculados com os alertas que a conta vê, nos últimos 30 dias e comparados com os 30 anteriores.

| Indicador | O que mede | Meta de fábrica | Decisão fora da meta |
|---|---|---|---|
| Tempo de atendimento do toner | A mediana do alerta do toner à troca | 2 dias | Deixar toner de reserva nos locais que mais esperam, ou subir o limite da regra do toner |
| Tempo até reconhecer o Crítico | A mediana da abertura ao reconhecimento; o Crítico ainda sem reconhecimento conta até agora | 30 min | Conferir quem pode tratar os alertas e quem recebe o Crítico por e-mail e no celular |
| Disponibilidade dos ativos | Os ativos abaixo da meta, pelo tempo sem responder dos alertas de ativo offline | 99% | Conferir a rede e a energia desses ativos, ou se eles ainda estão em uso |
| Alertas que voltam | Os ativos em que o mesmo alerta abriu a quantidade de vezes da meta ou mais | 3 vezes | Verificar o equipamento, ou a duração e a folga da regra |

- **Metas:** são da organização, mudadas por quem administra os alertas, com a auditoria.
- **Fora dos indicadores:** o alerta que abriu com o ativo silenciado, que marca uma parada combinada.
- **Sem dado:** o indicador sem dado diz o motivo em texto, e nunca mostra um zero.
- **O indicador fora da meta avisa:** uma avaliação por dia, às 7h, notifica quem administra os alertas quando um indicador sai da meta, uma vez a cada saída. Ele não entra em "O que resolver agora", que continua com as ocorrências.

**Indicadores da operação (P4f):** ficam na tela Indicadores do Operação, nos mesmos 30 dias, comparados com os 30 anteriores. O tempo de resolução e as OS repetidas aparecem para quem vê as OS, calculados com as OS que a conta vê; as páginas por toner, para quem vê o estoque, com os toners trocados pelas saídas que a conta vê.

| Indicador | O que mede | Meta de fábrica | Decisão fora da meta |
|---|---|---|---|
| Tempo de resolução das OS | A mediana da abertura à resolução das OS resolvidas no período, com a espera pela peça e pelo fornecedor; a reaberta conta até a última resolução | 3 dias | Ver onde as OS esperam: deixar no estoque as peças que mais faltam, ou cobrar os fornecedores que mais demoram |
| OS repetidas | Os ativos com a quantidade de OS da meta ou mais, abertas no período, fora as encerradas sem resolver | 2 OS | Conferir se o conserto resolveu a causa do problema, ou se o ativo deve ser substituído |
| Páginas por toner | Os toners trocados no período que renderam menos que a meta: as páginas entre a saída do toner e a seguinte da mesma cor, para a mesma impressora, sobre o rendimento do consumível | 80% | Conferir a qualidade do consumível e do fornecedor, e a configuração da impressora |

- **Metas:** são da organização, mudadas por quem tem `operacao.administrar`, com a auditoria, pelo mesmo "Mudar a meta" dos alertas.
- **Fora dos indicadores:** a OS encerrada sem resolver, que marca a aberta por engano ou no ativo errado, e o toner sem o rendimento, sem o total de páginas numa das saídas ou de uma saída de mais de um toner.
- **O indicador fora da meta avisa:** a mesma avaliação das 7h, com o Operação ligado, notifica quem tem `operacao.administrar`, com a origem "Operação".

### 7.7 Três formas de uso

| Aparelho | Como detecta | Comportamento |
|---|---|---|
| Computador | Ponteiro fino (mouse ou trackpad) e largura ≥ 768 px | Casca completa. Abaixo de 1024 px, a barra superior esconde os menus do módulo |
| Tablet | Ponteiro de toque e largura ≥ 768 px | Dock embaixo; alvos de toque com pelo menos 44 px; sem cursor customizado; menus como popovers |
| Celular | Largura < 768 px | Barra de abas com 4 ou 5 itens + "Mais"; menus em árvore viram painéis que sobem de baixo; foco em consultas, aprovações e solicitações |

### 7.8 Layout e resoluções

- **Margem lateral fluida:** `clamp(16px, 16px + 1vw, 40px)`, ou seja, 16 px mais 1% da largura, até 40 px. O termo fixo fica em px porque a raiz da interface usa o corpo de texto (14 px), e nela `1rem` não vale 16 px.
- **Formulários** têm largura máxima de 960 px; no cadastro em etapas e na ficha em cartões, o limite vale para a área dos campos, e a lista e a imagem ficam fora dele. **Tabelas** ocupam a largura toda.
- **Componentes** se adaptam por container query, e não só pela largura da janela.
- **Matriz de teste:**

  | Aparelho | Resolução |
  |---|---|
  | Notebook | 1366×768 |
  | Full HD | 1920×1080 |
  | QHD | 2560×1440 |
  | 4K com escala de 150% | 3840×2160 |
  | Ultrawide | 3440×1440 |
  | Tablet | 1024×768 |
  | Celular | 390×844 |

### 7.9 Imagens e 3D dos ativos

- **Formatos aceitos:** PNG, JPG, WebP, AVIF e SVG.
- **Tratamento do upload:**
  - o tipo é conferido pelo conteúdo real, não pela extensão;
  - SVG é sanitizado;
  - as imagens são regravadas, o que remove localização e metadados;
  - são geradas miniaturas de 64, 128, 256 e 512 px.
- **3D:** GLB validado e com limite de tamanho.
- **Onde cada coisa fica:** imagem e 3D ficam no modelo do equipamento, com sobrescrita opcional por ativo. A imagem própria do ativo (P1d) vale no lugar da do modelo na ficha, na tabela, na prévia e nas listas de ligados. Sem imagem, entra o ícone genérico do tipo (desenhado no F0).
- **Na tabela:** a miniatura ocupa um quadrado proporcional à densidade (24 px na compacta, 30 px na normal, 36 px na confortável), com a mesma margem das células.

### 7.10 ANTISLOP v2 e v3

O [ANTISLOP do PMG](../../referencias/ANTISLOP-v1-pmg.md) (cópia do original) continua valendo como quality gate, com as mudanças abaixo. A versão v2 consolidada foi escrita no F0, e a v3, no D1 (`docs/ANTISLOP.md`).

A v3 põe quatro princípios no topo:
- precisão de prancheta;
- o dado antes da decoração;
- calma por padrão, ênfase por exceção;
- o usuário ajusta, o sistema garante.

Ela organiza o design em camadas, com a cor gerada e o contraste garantido. As mudanças da v2, abaixo, continuam valendo.

1. **Vidro fosco é permitido só em camadas sobrepostas** (dock, menus, popovers, avisos, busca), porque tem uma função: separar a camada do conteúdo. Sempre com a opção "transparência reduzida". Nunca em superfícies de conteúdo.
2. **Animação é permitida para:**
   - mudança de estado;
   - continuidade espacial (abrir menu, ampliação do dock, chegada de aviso);
   - a sequência de boas-vindas, uma vez, com a montagem da casca que vem depois dela.
   
   A duração é de até 300 ms, com três exceções: a mola dos avisos (~550 ms), a sequência de boas-vindas, que pode ser pulada, com a montagem da casca que vem depois dela, e o 3D.
3. **"Sem hover scale" continua valendo para conteúdo.** A ampliação do dock é a exceção, porque é um retorno funcional de alvo.
4. **O cursor customizado** existe como preferência, com o padrão aprovado, e nunca substitui o cursor de texto.
5. **Continua proibido:** gradiente decorativo, glow, kit visual roxo, emoji como ícone, KPI sem decisão, dado inventado apresentado como real e texto de marketing.

---

## 8. Visualização 3D e rede física (trilha paralela)

### 8.1 Pipeline Blender → web

1. **Modelagem no Blender** (via MCP), com cada peça nomeada e com propriedades personalizadas:
   - `part_id`;
   - `explode_dir` (vetor);
   - `explode_dist`;
   - `ordem`;
   - `rotulo`;
   - `campo_vinculado`.
2. **Exportação para glTF/GLB**, com as propriedades saindo como `extras`.
3. **Otimização** (Draco ou Meshopt, texturas KTX2) e **validação** automática.
4. **Miniaturas** de cada peça renderizadas pelo próprio Blender.
5. **Upload no modelo do equipamento.**

Os modelos 3D são próprios ou têm licença que permite uso comercial.

### 8.2 Visualizador de inspeção

- **Modos:** montado → **explodido** (cada peça anda ao longo de `explode_dir`) → **carrossel** (a peça em foco na frente, as outras esmaecidas; setas ou arrastar) → **visão geral** (zoom out mostrando o anel inteiro, estilo Mission Control) → **grade** → **lista** com miniaturas.
- **Dados:** clicar numa peça mostra os dados ligados a ela (RAM: slot e capacidade; disco: saúde).
- **Movimento reduzido:** troca de modo sem animação.
- **Sem WebGL:** a lista 2D serve de alternativa.
- **Carregamento:** só quando o visualizador é aberto.

### 8.3 Painel de switch 2.5D

- **Desenho:** gerado a partir de um JSON do modelo (grupos de portas, RJ45 e SFP, numeração, orientação, LEDs), em SVG ou Canvas. Não se modela cada switch à mão.
- **Estado de cada porta, via SNMP:**
  - IF-MIB: estado, velocidade, tráfego de entrada e saída, erros e descartes;
  - POWER-ETHERNET-MIB: PoE;
  - LLDP-MIB: vizinho conectado;
  - BRIDGE e Q-BRIDGE-MIB: MAC por porta e VLAN.
- **LEDs:** piscam de acordo com o tráfego, calculado entre as coletas.
- **Interação:** o hover mostra os KPIs e um gráfico curto; o clique abre a porta, com histórico, equipamento conectado e alertas.

### 8.4 Rack

Vista frontal U a U, com a altura de cada equipamento em U. Liga rack → switch → porta → equipamento.

### 8.5 Onde não usar 3D

Em processos abstratos, fluxos 2D leem melhor. O 3D só entra onde existe espaço físico: planta, rack, peça e porta.

---

## 9. Segurança

1. **Login**
   - Entrada por usuário, único na organização, e senha.
   - Senha com hash Argon2id, de 12 a 128 caracteres, sem regra de composição. São recusadas as senhas comuns e as que contêm o usuário.
   - Sessão guardada no banco, com cookie HttpOnly, Secure e SameSite=Lax. O banco guarda só o hash do token.
   - Expiração depois de 2 h sem uso e de 12 h no total. Fechar o navegador não encerra a sessão. A conexão de eventos e as atualizações que a tela faz sozinha, sem o usuário interagir, não contam como uso.
   - Bloqueio progressivo por usuário: 5 recusas seguidas bloqueiam por 1 min, e cada recusa depois de um bloqueio dobra o tempo, até 15 min. O bloqueio vale também para um usuário que não existe, e a mensagem nunca diz se o usuário existe.
   - Passos pendentes: depois da senha, a sessão só resolve o que falta, nesta ordem: o código do segundo passo, a troca de uma senha temporária e o cadastro dos dois passos exigidos. Pendente, ela dura 10 min, e o token é trocado quando a pendência termina.
   - Cada usuário vê e encerra as próprias sessões. Trocar a senha ou ativar os dois passos encerra as outras.
   - A primeira conta de cada organização nasce de um comando no servidor, com senha temporária. O mesmo comando é a recuperação de último recurso de um acesso perdido.
   - A exceção é o ambiente de desenvolvimento: a conta `admin` da organização de desenvolvimento entra com a senha fixa `admin123`, sem troca. Só o `pnpm dev` grava essa senha, numa organização que só tem endereços locais e fora da produção.
2. **Verificação em dois passos** (código de app autenticador), obrigatória para quem administra ou acessa o cofre. Revelar ou copiar um segredo pede a confirmação pelo código do app de novo, mesmo com a sessão aberta. O código certo libera revelar e copiar por 5 minutos naquela sessão (P6); os códigos de recuperação não liberam o cofre.
   - O código vale no intervalo atual de 30 s e nos dois vizinhos, e nunca duas vezes.
   - Dez códigos de recuperação de uso único, guardados em hash.
   - A chave de cada app fica cifrada, com uma chave que vem do ambiente.
   - A exigência vem da conta ou de qualquer perfil dela, como o Administrador. Ela vale já: uma sessão aberta pede o cadastro na requisição seguinte e mantém o prazo que tinha.
3. **Permissão com escopo**
   - O catálogo de permissões fica no código e cresce com cada módulo. Perfis (conjuntos de permissões), grupos (conjuntos de contas) e atribuições são dados da organização.
   - O escopo fica na atribuição: o perfil dado a uma conta ou a um grupo vale para a organização inteira ou para um ramo da árvore de locais. Uma permissão que só faz sentido na organização inteira, como consultar a auditoria, não vale num ramo.
   - O perfil Administrador nasce com cada organização, tem todas as permissões, inclusive as dos módulos futuros, e não muda. A organização nunca fica sem alguém que administre os acessos.
   - O Solicitante vê só os próprios pedidos e os ativos sob sua responsabilidade.
   - O ativo segue o local dele, como a pessoa segue o local de trabalho: o ativo sem local só é alcançado pela organização inteira, e mudar o local exige a permissão nos dois. Os campos restritos pedem uma permissão própria, e a API não devolve o valor deles a quem não a tem.
   - Quem escolhe o responsável de um ativo lê só o nome das pessoas ativas, sem precisar ver a Administração.
   - Tudo é negado por padrão, checado na API e escondido na tela. Cada recusa fica auditada, e a tela diz a quem pedir acesso.
4. **Isolamento garantido pelo banco**
   - O RLS separa as organizações.
   - A aplicação conecta com um usuário que não pode furar o RLS.
   - As migrations rodam com outro usuário.
   - Só duas consultas atravessam organizações, cada uma numa função estreita do banco: a descoberta da organização pelo endereço, que devolve só a organização de um endereço exato, e a lista das organizações para as tarefas de cada uma, como a manutenção diária, que devolve só os identificadores.
   - A fila de tarefas e o aviso de eventos atendem todas as organizações e levam só o tipo e identificadores. O trabalho de cada tarefa roda no contexto da organização dela, e cada evento só chega às conexões da organização dele.
5. **Cofre com dupla camada de chaves**
   - Cada segredo é cifrado (AES-256-GCM) com a própria chave.
   - Essas chaves são cifradas por uma chave mestra que fica fora do banco.
   - A chave mestra pode ser trocada sem refazer os segredos.
   - O acesso é dado segredo a segredo, a contas, grupos e perfis. Quem administra o cofre vê os dados de todos os segredos, mas só revela os que liberou a si mesmo, e cada liberação, revelação e cópia fica na auditoria, sem o valor.
6. **Segredos fora do Git desde o primeiro commit.** Uma verificação automática barra o commit ou o PR que contenha segredo.
7. **Web**
   - CSP estrita e proteção contra CSRF (SameSite + token nas requisições que alteram dados). A origem da requisição é conferida, e o token da sessão vai num cabeçalho próprio.
   - Limite de requisições por IP: 600 por minuto em geral, e 20 por minuto na entrada e no código do segundo passo.
   - Validação por schema em toda entrada.
   - O coletor só aceita alvos dentro das faixas de rede cadastradas.
8. **Uploads:** conforme a seção 7.9. Os arquivos são servidos com o tipo correto e como anexo quando cabível, e só a quem pode ver o registro dono deles. O SVG é servido com uma política que bloqueia scripts e conteúdo externo, mesmo aberto direto no navegador.
9. **LGPD**
   - Só o necessário de cada pessoa é guardado.
   - As consultas a dados sensíveis são auditadas.
   - Remover uma pessoa anonimiza os dados pessoais e preserva o histórico dos ativos.
     - Só uma pessoa inativa é anonimizada, sem volta. Ela vira "Pessoa anonimizada" com um código, sem e-mail, matrícula, local, telefone e foto. A conta perde o usuário, que fica livre, e a senha; as sessões perdem o IP e o dispositivo.
     - A auditoria fica intacta pela retenção mínima (seção 6.7), como prova das ações, e só quem tem a permissão a consulta. O registro da anonimização não copia os dados apagados, e quem fez cada ação aparece pelo nome atual, o anonimizado.
10. **Backup**
    - Diário, do banco e dos arquivos, com um manifesto (versão, migrations, linhas por tabela e hashes). Ele é copiado para cada destino que quem opera o servidor escolhe, como uma pasta local e um compartilhamento de rede.
    - Retenção de 7 diários, 4 semanais e 12 mensais, por padrão.
    - Teste de restauração periódico, num banco descartável da instância de teste, que compara as linhas com o manifesto.
    - O banco é lido por um papel só de leitura, que passa por cima do RLS só no backup.
    - A tela de backup fica só na organização que opera o servidor.
    - A chave mestra fica guardada separadamente, porque perdê-la é perder o cofre. Nenhuma chave vai no backup.

---

## 10. Tratamento de erros

1. **Formato único de erro na API** (problem+json), com mensagem por campo em pt-BR e um código de rastreio que aparece para o usuário.
   - O código de rastreio tem 8 caracteres em dois grupos, como "R7K2-9QXM". Ele vai num cabeçalho de toda resposta e no log da requisição.
2. **Toda tela trata todos os estados:**
   - carregando;
   - vazio, com uma ação;
   - erro, com "tentar de novo";
   - sem permissão, dizendo a quem pedir acesso;
   - sem conexão;
   - dado desatualizado, com a idade.
3. **As edições aparecem na hora.** Se o servidor recusar, a tela volta ao estado anterior e explica o motivo.
4. **O coletor e as tarefas agendadas tentam de novo** com intervalos crescentes. O que continua falhando vai para a lista de "tarefas com falha", visível ao administrador.
5. **Logs estruturados** com o código de rastreio, e endpoints de saúde na API e no coletor.
6. **Migrations**
   - Chegam no pacote da versão e são validadas antes no ambiente de teste. A produção só recebe a versão que já roda no teste, com as mesmas migrations aplicadas.
   - Um backup conferido é feito antes de aplicar, e o nome do banco é digitado.
   - Mudanças de estrutura em duas etapas (primeiro adiciona, depois remove), para nunca quebrar a versão que está no ar e para a volta à versão anterior funcionar sem desfazer migrations.

---

## 11. Testes

1. **Domínio primeiro, com o teste antes do código.** Cobre tipos de campo e leitura pt-BR, regras de alerta (limite, duração, folga), estoque e escopo de permissão.
2. **API contra um PostgreSQL de verdade.** Testes que nunca podem falhar:
   - a organização A não vê dados da B;
   - a permissão recusa o que deve recusar;
   - a auditoria é gravada junto com o dado;
   - o reenvio do coletor não duplica nada.
3. **Contrato:** o OpenAPI sai dos schemas. Se a API mudar sem regenerar o cliente, o CI barra.
4. **Casca:** testes de componente cobrem o atraso dos menus, o triângulo de tolerância, o teclado e o foco. A acessibilidade é checada automaticamente.
5. **Ponta a ponta (Playwright)**
   - Fluxos principais: login → ativo → OS → alerta → notificação.
   - Rodam em 1366, 1920 e 2560 px, nos temas Grafite e Névoa, e no celular para o portal.
   - A comparação de screenshots pega regressões visuais.
6. **Metas de desempenho:** as da seção 2.3, medidas no CI.
7. **Coletor com equipamentos simulados:** gravações SNMP de impressoras e switches reais e um simulador da API do Control iD.
8. **Ensaio da virada:** um dump do PMG é importado no ambiente de teste, as contagens são comparadas e registros são conferidos por amostragem.

---

## 12. Forma de trabalho

### 12.1 Repositório e specs

1. **Repositório:** `riq0007/grafite`, público no GitHub, com a pasta de trabalho em `D:\grafite`, separado do PMG.
   - O histórico começa num commit só, na versão 0.1.11, sem os dados privados. O anterior fica num repositório privado.
   - Não há licença: todos os direitos são reservados, e o código pode ser lido, mas não copiado, modificado nem redistribuído.
   - As proteções do GitHub: a aprovação dos PRs de fora, a `main` e as tags `v*` sem remoção nem reescrita, a busca de segredos com o bloqueio no push, só as ações do GitHub e as do dono, e o token dos workflows só de leitura por padrão.
   - Os commits e as tags levam o e-mail noreply do GitHub.
2. **Esta spec** é a referência de todos os subprojetos. Cada subprojeto passa por proposta, specs e tarefas (fluxo OpenSpec) antes do código, e o plano de implementação detalhado sai dessas tarefas.
3. **`CLAUDE.md` na raiz** com as regras do projeto:
   - ANTISLOP v2;
   - cores só por tokens;
   - textos em pt-BR;
   - nenhum segredo nem termo privado no repositório;
   - teste antes do código no domínio;
   - os comandos do projeto.

### 12.2 CI e ambientes

- **CI a cada PR:** lint, checagem de tipos, testes unitários e de integração, ponta a ponta e busca de segredos. Ele roda no GitHub Actions, só nos executores hospedados pelo GitHub, nas imagens fixadas `ubuntu-24.04` e `windows-2022`.
  - Cada job começa numa máquina nova, e os jobs rodam em paralelo. Nenhum executor próprio fica ligado ao repositório, para nenhum PR, nem o de um fork, rodar código numa máquina da equipe. O teste-guarda dos workflows reprova o job que pede outro executor, e o das ações, a ação que não é do GitHub nem do próprio repositório.
  - Nada passa de um run a outro: o cache do turbo fica dentro do job, e o teste que lê fora do pacote declara o que lê.
  - Num PR só de documentação e specs, a integração, as pontas a ponta e a regressão visual são puladas, com o motivo no resumo do run.
- **Pacotes da versão:** cada tag gera, no CI, um zip para Windows, com a web e o painel da operação compilados, as dependências de produção, o atalho de instalação e os pré-requisitos com versão e hash, e um tar para Linux, com as cinco imagens da versão (a aplicação, o coletor, o comando de operação, o proxy e o PostgreSQL), o roteiro de instalação e o lançador. A release publica também o atalho de instalação ao lado do zip e o roteiro de instalação ao lado do tar. A imagem do comando de operação leva o painel compilado. Antes da release, uma verificação instala cada pacote do zero, num servidor Windows de verdade, pelo atalho de instalação e com uma tarefa do menu, e num Docker Engine dentro de um contêiner, sobe o painel pelo comando e confere o estado pela sessão do código, faz o backup, testa a restauração, atualiza e volta a versão. As pontas a ponta do painel rodam a página compilada contra o servidor do painel com um servidor simulado. No Windows, o atalho instala o Node, como num servidor novo; o caminho do zero com o PostgreSQL pelo atalho é conferido à mão numa máquina virtual limpa. Cada pacote é montado, instalado de teste e enviado no mesmo job: a release nasce como rascunho e só é publicada com os seis arquivos, depois das duas instalações, e o rascunho de uma execução que falha é apagado.
- **Três ambientes,** ditos na configuração (`GRAFITE_AMBIENTE`): desenvolvimento, teste e produção.
  - O teste tem uma instância própria do PostgreSQL. Sob pedido, ele recebe a cópia do último backup da produção, com os endereços trocados pelos do teste.
  - No teste, a interface avisa em texto, e as automações que agem fora do sistema não rodam.
  - Uma migration só é promovida depois de validada no teste.

### 12.3 Multi-agente

| Fase | Como trabalha |
|---|---|
| Fundação (F0–F2) | Só a sessão principal, junto com o usuário. Tudo depende dela, e paralelizar geraria designs diferentes |
| Paridade e trilha paralela | Até 3 agentes ao mesmo tempo, cada um numa worktree Git e numa pasta que só ele mexe. Contratos (tipos, API, tokens) congelados antes. Nenhum agente de feature altera componente compartilhado: pede ao orquestrador |
| Orquestrador (sessão principal) | Dono das specs e dos componentes compartilhados; faz os merges |
| Agente 3D | Único a usar o Blender |
| Revisor | Antes de cada merge: code review, screenshots nas 3 resoluções × 2 temas e checklist do ANTISLOP v2 |

### 12.4 Ferramentas de design e Blender

- **Ferramentas de design:** nenhuma. O design system vive no código (`packages/ui`) e no catálogo do Storybook, com regressão visual.
  - O Figma, previsto no início, saiu no F0: o plano Starter permite um modo só por coleção de variáveis, e a escrita pelo MCP exige assento Full.
  - O Stitch foi avaliado em seguida e também saiu: ele reescreve com IA o design system recebido, e o espelho não ficaria fiel aos tokens.
  - O JSON DTCG (`pnpm tokens:gerar`) fica pronto para uma ferramenta futura.
- **Blender:** uma instância local com o add-on MCP (porta 9876), usada só pelo agente 3D. O servidor precisa estar iniciado no Blender.

### 12.5 Definição de pronto

Uma tarefa está pronta quando:
- os testes passam;
- os screenshots foram revisados;
- a acessibilidade foi checada;
- a auditoria está coberta;
- a documentação foi atualizada.

---

## 13. Lições do PMG

### 13.1 Ideias que ficam (a ideia, não o código)

| Ideia | Onde está no PMG |
|---|---|
| Campo com origem, momento e trava | `src/components/assets/FieldInput.tsx`, `FieldMeta.tsx`, modelo `AssetFieldState` |
| Catálogo de campos tipados com leitura pt-BR; licença que recusa chave de produto | `src/lib/asset-fields.js` |
| Importação com prévia linha a linha ("de → para", campos travados, erros), casando por patrimônio → série → hostname | `src/app/computers/_components/ImportWizard.tsx` |
| Resumo ao parar o mouse, linha clicável, Enter abre, colunas configuráveis | `src/components/ConfigurableTable.tsx` |
| Dados administrativos comuns a qualquer ativo | modelo `AssetProfile` |
| Colaborador só inativado; cofre com acesso por usuário, grupo e perfil; permissão checada na tela e na API | schema e `src/lib` |
| Pausa de notificação por ativo e e-mail de recuperação | `src/lib/printer-notification-*` |
| Ambiente de teste com banco separado e promoção protegida de migrations | `TEST_ENVIRONMENT.md` |
| Planta convertida de DXF com posições por ativo | `docs/mapa-3d`, modelo `MapAssetPlacement` |

Do dsachboard ficam estas ideias:
- limites guardados no banco;
- "sem dado" nunca vira 0%;
- valor fora da faixa sinalizado como inconsistente;
- idade do dado visível;
- um grupo "Não classificado" para nada sumir;
- separação por permissão de banco em vez de disciplina de código.

### 13.2 Erros que não se repetem

- Edição sem auditoria.
- Exclusão que apaga histórico.
- Colunas gravadas iguais para todos os usuários.
- Tetos fixos de 100 e 50 registros.
- Coleta que sobrescreve o histórico.
- Solicitante e local como texto livre.
- Segredos versionados no Git.

### 13.3 Ação recomendada no PMG (fora do escopo do Grafite)

O PMG versionava arquivos de configuração com segredos, o erro que a seção 13.2 lista. Ele foi desligado, e a ação que esta seção recomendava, a de trocar as chaves e tirar os arquivos do Git, deixou de ser necessária.

---

## 14. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| O substituto nunca alcança o PMG | Paridade primeiro, com o checklist da seção 3.4; novidades na trilha paralela |
| Desfoque e animações pesados em máquinas fracas | Transparência e movimento reduzidos; queda de FPS sugere o modo leve; orçamento de desempenho testado no CI |
| Falta de HTTPS no servidor interno | O Caddy na frente, com o domínio público pelo desafio de DNS ou a AC interna. A validade do certificado é conferida todo dia, e a renovação parada aparece em Tarefas antes de vencer. Sem HTTPS, a PWA não instala, não recebe push e o cookie `Secure` não funciona |
| Diferenças de SNMP entre fabricantes | Simulador alimentado por gravações reais; mapeamento de métricas por modelo |
| Migração do cofre | Recifragem ensaiada no teste, contagens e conferência por amostragem. A chave antiga só é destruída depois da virada |
| Produção de modelos 3D virar gargalo | Poucos modelos genéricos por tipo no começo; o 3D não bloqueia a paridade |
| Escopo grande | Subprojetos com spec e plano próprios; multi-agente só a partir da paridade |
| PostgreSQL no Windows | Backup diário com manifesto e teste de restauração periódico; a instalação confere a versão das ferramentas; teste numa instância separada; runbook de operação em `docs/operacao/`; a instalação, o backup, o teste de restauração, a atualização e a volta verificados num servidor Windows de verdade |

---

## 15. Decisões adiadas e onde serão tomadas

| Decisão | Onde |
|---|---|
| Consulta ao INPI do nome "Grafite" (classes 9 e 42). O nome, para o uso interno, e o logo foram decididos no F0 | Antes de qualquer venda ou uso comercial |
| Provedor de login corporativo (Entra ID, Google, AD) | A3 |
| Metas dos indicadores: as dos alertas foram decididas no P3d e as da operação, no P4f (seção 7.6); faltam as dos backups do Control iD e a da revisão de acessos | P5 e A2 |
| Mapeamento campo a campo PMG → Grafite | P8 |
| Retenção dos backups do Control iD (proposta na seção 6.7) | P5 |
| Primeiros modelos 3D | T1 |

---

## Apêndice A — Tokens

A fonte da verdade é `packages/ui/src/tokens` (TypeScript), de onde saem o CSS, os tipos e o JSON DTCG (`pnpm tokens:gerar`).

Desde o D1 (change fundamentos-v3), nenhuma cor de tema é escrita à mão. Um gerador em OKLCH produz todos os papéis a partir das entradas abaixo e move a luminosidade de cada papel até o mínimo da WCAG 2.2 AA contra as superfícies em que ele aparece (`packages/ui/src/tokens/gerador.ts`). As tabelas com os valores em hexadecimal do F0 ficam no histórico do repositório e na change arquivada do F0.

O contraste é verificado automaticamente (`pnpm tokens:contraste`), de duas formas:
- nas 24 combinações dos seis temas com os quatro destaques;
- numa varredura de entradas: as matizes de 0 a 360, o croma da base de 0 a 0,06 e o contraste de 0 a 100.

O relatório fica em `docs/identidade/contraste.md`.

### A.1 Temas

Cada tema é gerado a partir do tom, da base (a matiz e o croma dos neutros) e do contraste, de 0 a 100:

| Tema | Tom | Base (matiz, croma) | Contraste |
|---|---|---|---|
| Grafite | escuro | 265, 0,006 | 45 |
| Meia-noite | escuro | 262, 0,03 | 45 |
| OLED | escuro, com o fundo preto absoluto | 0, 0 | 70 |
| Névoa | claro | 260, 0,006 | 45 |
| Papel | claro | 80, 0,016 | 45 |
| Alto contraste | claro | 0, 0 | 100 |

O tema **Personalizado** (change tema-personalizado) sai das mesmas entradas, escolhidas pela conta na Aparência:
- o tom, escuro ou claro;
- a matiz da base, de 0 a 359 graus;
- o tingimento dos cinzas, de 0 a 100%, em que 100% é o croma 0,06;
- o contraste, de 0 a 100, com a dureza do lápis ao lado: 2H (0 a 19), H (20 a 34), HB (35 a 54), B (55 a 69), 2B (70 a 84) e 4B (85 a 100).

O padrão é o Grafite: escuro, 265, 10% e 45. O tema de fábrica do mesmo tom (o Grafite ou o Névoa) fica por baixo, para os tokens que não são cor.

Os papéis de cada tema:

| Papel | O que é | Mínimo garantido |
|---|---|---|
| `fundo` | atrás da janela | — |
| `superficie-afundada` | poços, como a trilha de um medidor | — |
| `superficie` | o conteúdo da janela | — |
| `superficie-2` | controles e blocos | — |
| `superficie-elevada` | blocos sobre o conteúdo, com a `sombra-elevada` | — |
| `material-solido` e `material` | a superfície sobreposta, sólida e translúcida, com a `sombra-sobreposta` | — |
| `texto` | o texto principal | 7:1 sobre a `superficie-2` |
| `texto-2` | o texto secundário | 4,5:1 sobre a `superficie-2` com a camada de pressionado |
| `borda-controle` | a borda de campos, checkbox e interruptor | 3:1 sobre a `superficie-2` |
| `linha` e `linha-forte` | as linhas finas | — |
| `zebra`, `miniatura`, `veu` e `barra` | a linha alternada, o fundo da miniatura, o véu dos diálogos e a barra superior | — |

As camadas neutras de interação, `hover` e `pressionado`, são a cor do `texto` a 6% e a 10%, por cima do fundo do controle.

### A.2 Destaques

Cada destaque sai da matiz e do croma e é gerado para cada tema:
- **preenchimento:** botão primário, seleção e anel de foco, com 3:1 contra a superfície;
- **texto:** texto e ícone na cor do destaque, com 4,5:1 sobre a `superficie-2`;
- **sobre:** texto sobre o preenchimento, com 4,5:1. É o branco ou o quase preto, o que der mais contraste.

| Destaque | Matiz | Croma |
|---|---|---|
| Grafite (padrão) | — | 0, monocromático |
| Azul | 258 | 0,17 |
| Verde | 155 | 0,14 |
| Laranja | 55 | 0,16 |

- **Grafite:** com croma 0, o preenchimento é quase branco nos temas escuros e quase preto nos claros, e o texto do destaque é o texto do tema.
- **Personalizado:** sai da matiz, de 0 a 359 graus, e da intensidade, de 0 a 100%, em que 100% é o croma 0,2 e 0 é o monocromático. O padrão é o azul: 258 e 85%.
- **Hover e pressionado do preenchimento:** são gerados, e não escolhidos. O preenchimento se afasta da cor do texto: preto a 10% e a 20% sob o texto claro, ou branco sob o texto escuro. Por isso o contraste só sobe.

### A.3 Severidades, situações e dados

| Situação | Matiz | Croma |
|---|---|---|
| `ok` | 150 | 0,14 |
| `atencao` | 75 | 0,14 |
| `critico` | 25 | 0,17 |
| `info` | 245 | 0,12 |

- **As quatro cores de cada situação**, geradas por tema:
  - `{situação}`: o texto e o ícone, com 4,5:1 sobre a `superficie-2` e sobre o próprio fundo;
  - `{situação}-fundo`: a cor a 15%;
  - `{situação}-borda`: a cor a 40%;
  - `{situação}-forte` e `sobre-{situação}`: o preenchimento e o texto sobre ele, com 4,5:1.
- **Neutra:** `neutro` usa o `texto-2`.
- **Séries de dados:** `serie-1` a `serie-8`, com as matizes 258, 55, 175, 340, 125, 25, 210 e 85, de luminosidade parecida e com 3:1 contra a `superficie`.
- **Tintas dos suprimentos:**
  - `tinta-ciano` (matiz 220), `tinta-magenta` (350) e `tinta-amarelo` (95);
  - `tinta-preto`, que é um neutro, visível nos temas escuros.

  Todas têm 3:1 contra a `superficie`.

### A.4 Raios

Derivados da base `r` (padrão 10 px desde o D1, ajustável de 0 a 24):

| Elemento | Raio |
|---|---|
| Janela | `r` |
| Controle | 0,58 `r`, limitado a (altura do controle ÷ 2) − 1 px: nenhum botão vira cápsula |
| Dock | 1,45 `r` |
| Item do dock | 0,85 `r` |
| Menu | 0,85 `r` |
| Miniatura | 0,58 `r` |
| Rótulo | 0,42 `r` |
| Aviso | `r` |

### A.5 Densidade

| Densidade | Linha | Miniatura | Controle |
|---|---|---|---|
| Compacta | 36 px | 24 px | 32 px |
| Normal (padrão) | 44 px | 30 px | 36 px |
| Confortável | 52 px | 36 px | 40 px |

### A.6 Movimento

| Token | Valor | Com movimento reduzido |
|---|---|---|
| `dur-rapida` | 120 ms | igual |
| `dur-media` | 200 ms | igual |
| `dur-lenta` | 300 ms | igual |
| `dur-deslocamento` | = `dur-media` | 0 ms |
| `dur-opacidade` | = `dur-rapida` | igual (esmaecer continua) |
| `dur-menu` | 170 ms | igual |
| `dur-escala-menu` | = `dur-menu` | 0 ms |
| `dur-mola-aviso` | 550 ms | 0 ms |
| `dur-giro` (indicador de carregando) | 900 ms | 0 ms (fica parado) |
| `dur-ciclo` (esqueleto e progresso sem valor) | 1400 ms | 0 ms (fica parado) |

As curvas são `padrao`, `saida`, `mola` e `mola-suave`, definidas em `escalas.ts`.

### A.7 Outros

- **Espaços:** 4, 8, 12, 16, 20, 24, 32, 40 e 48 px (`esp-1` a `esp-12`).
- **Tipografia:** Instrument Sans e JetBrains Mono, auto-hospedadas. Tamanhos de 11 a 28 px (legenda, rótulo, dado, corpo, subtítulo, título, título grande e o numeral, em JetBrains Mono), pesos 400, 500 e 600.
- **Opacidade do desabilitado:** 0,45. A WCAG isenta controles desabilitados de contraste.

---

## Apêndice B — Tempos e parâmetros de interação

| Elemento | Valor |
|---|---|
| Abrir menu do dock (nenhum aberto) | 150 ms parado sobre o item |
| Trocar para outro menu (um já aberto) | 60 ms |
| Fechar menus depois de sair | 320 ms |
| Tolerância diagonal do submenu | Triângulo entre o ponteiro e a borda próxima do submenu; decide em 150 ms (a tolerância do React Aria, com o tempo ajustado por patch; ver o design do F0) |
| Abrir submenu | 150 ms parado sobre o item |
| Dica | 700 ms parado sobre o gatilho, ou na hora com o foco do teclado; some ao sair ou com Esc |
| Animação de abrir menu | 160–180 ms, com leve escala a partir do item |
| Ampliação do dock | Até +55%, gaussiana com σ = 1,3 × tamanho do item, suavizada quadro a quadro |
| Ocultar dock | Área de revelação de 18 px na borda; esconde 650 ms depois; animação de 280 ms |
| Cursor | Anel com fator `k = 0,65 − 0,55 × suavização/100` por quadro de 60 Hz, convertido para a duração real de cada quadro (padrão 95% → k ≈ 0,13); abraço = contorno do elemento + 4 px de cada lado (8 px no total), com o raio do elemento + 4 px |
| Aviso | Mola de ~550 ms; o não crítico some em 6 s (10 ou 20 s, à escolha do usuário), com pausa no hover e no foco; no máximo 3 na tela, sem tirar um crítico |
| Busca | Abre e fecha em ~180 ms |
| Carregamento | Etapas reais; só aparece se a chegada passar de 500 ms, também no primeiro acesso; sai em 200 ms |
| Boas-vindas | Traço do "olá" em 2,1 s, preenchido a partir de 1,75 s (em 0,7 s); "Bem-vindo ao Grafite" a partir de 2,1 s, à vista por 0,85 s depois de aparecer; sai em 0,38 s |
| Montagem da casca | Só depois das boas-vindas: barra em 0,42 s; janela em 0,5 s, com 0,08 s de atraso; dock com mola em 0,62 s, com 0,16 s de atraso |
| Versão nova | Conferida ao abrir e a cada hora; troca só com "Atualizar" |
| Validação da sessão na chegada | Até 5 s; sem resposta, a casca abre, e a validação tenta de novo quando a rede volta e a cada 30 s |
| Sessão | Termina depois de 2 h sem uso ou de 12 h desde que passou a valer; pendente, termina 10 min depois da entrada |
| Bloqueio da entrada | 5 recusas seguidas do mesmo usuário → 1 min; cada recusa depois de um bloqueio dobra o tempo (2, 4 e 8 min), até 15 min |
| Código do segundo passo | 6 dígitos a cada 30 s; aceita o intervalo atual e os dois vizinhos; 5 códigos errados encerram a entrada pendente |
| Resumo da linha | 1,5 s parado sobre a linha |
| Polegar da barra de rolagem | À vista por 1 s depois da última rolagem da área |

---

## Apêndice C — Referências visuais aprovadas

São protótipos descartáveis do brainstorming, não código do produto. Ficam em `docs/referencias/brainstorm/`:

| Arquivo | O que mostra | Decisão |
|---|---|---|
| `01-direcao-visual.html` | Três direções (A Grafite, B Instrumento, C Alumínio), em modo claro e escuro | Escolhida a **A** |
| `02-casca-ajustes.html` | Casca A funcionando: dock, menus em árvore, cursor, alertas, busca e painel de Ajustes | Padrões da seção 7.2 |
| `03-boas-vindas.html` | Carregamento, "olá" e montagem da casca; acesso seguinte; movimento reduzido | Aprovado como base |
