# ANTI-AI-SLOP — ERP

## OBJETIVO

Este sistema é um ERP empresarial, não uma landing page, SaaS genérico ou demonstração de design.

A interface deve parecer um software empresarial real, desenvolvido especificamente para os processos da empresa.

Prioridades:

1. Clareza
2. Eficiência operacional
3. Densidade de informação
4. Previsibilidade
5. Consistência
6. Acessibilidade
7. Estética

Nunca sacrificar usabilidade operacional para deixar a interface mais "bonita", "moderna" ou "premium".

---

## 1. PRINCÍPIO CENTRAL

Não começar pelos componentes.

Antes de criar qualquer tela, entender:

- quem utiliza;
- qual é a tarefa principal;
- quais informações são necessárias;
- quais ações podem ser executadas;
- qual informação é mais importante;
- qual informação é secundária;
- qual é o fluxo operacional.

Cada elemento visual deve ter uma razão.

Se não for possível explicar por que um elemento existe, ele deve ser removido ou substituído.

"Fica mais bonito" não é justificativa suficiente.

---

## 2. IDENTIDADE DO ERP

A interface deve ser específica para este ERP.

Não copiar visualmente:

- Linear;
- Notion;
- Stripe;
- Vercel;
- SAP;
- Salesforce;
- Microsoft Dynamics;
- qualquer template SaaS;
- qualquer dashboard encontrado em bibliotecas de componentes.

Referências podem ser utilizadas para estudar padrões de UX, mas não para copiar identidade visual.

Pergunta obrigatória:

"Se eu remover o logo e trocar pelo logo de outra empresa, esta interface ainda pareceria pertencer à mesma empresa?"

Se a resposta for SIM, o design provavelmente está genérico.

---

## 3. PROIBIDO USAR O "KIT VISUAL DE IA"

Não utilizar automaticamente:

- roxo;
- índigo;
- gradiente roxo/azul;
- gradient text;
- aurora;
- blobs;
- glow;
- neon;
- glassmorphism;
- backdrop blur decorativo;
- sombras exageradas;
- cards gigantes;
- rounded-2xl em tudo;
- botões pill em excesso;
- emojis como ícones;
- ilustrações genéricas;
- personagens corporativos;
- formas abstratas decorativas;
- bento grid apenas por estética;
- dashboards cheios de KPIs sem utilidade;
- ícones gigantes;
- animações em todos os componentes.

Esses elementos não são proibidos em absoluto.

Podem ser utilizados SOMENTE quando houver uma justificativa específica de produto, marca ou função.

---

## 4. ERP NÃO É LANDING PAGE

Nunca estruturar uma tela interna como:

Hero
↓
Subtítulo
↓
CTA
↓
3 cards
↓
3 benefícios
↓
Gráfico
↓
CTA

Não utilizar:

- hero gigante;
- headline de marketing;
- frases motivacionais;
- "Bem-vindo ao futuro";
- "Transforme sua empresa";
- "Potencialize seus resultados";
- "Simplifique sua operação";
- "Desbloqueie seu potencial";
- textos genéricos de SaaS.

Interfaces internas devem começar pelo trabalho que o usuário precisa executar.

---

## 5. DASHBOARD NÃO É DECORAÇÃO

Dashboard deve responder:

"O que eu preciso saber ou resolver agora?"

Não:

"Quantos gráficos conseguimos colocar?"

KPIs somente devem existir quando:

- possuem significado;
- são relevantes para o usuário;
- possuem contexto;
- ajudam uma decisão;
- possuem dados reais.

Não criar KPI apenas para preencher espaço.

Não criar:

- 4 cards gigantes obrigatórios;
- 8 gráficos porque existe espaço;
- donut charts decorativos;
- gráficos sem ação associada.

---

## 6. DENSIDADE DE INFORMAÇÃO

ERP deve permitir alta densidade de informação sem parecer desorganizado.

Preferir:

- tabelas;
- filtros;
- agrupamentos;
- abas;
- breadcrumbs;
- status;
- listas;
- formulários;
- painéis laterais;
- ações contextuais;
- paginação;
- busca;
- ordenação.

Não aumentar espaços vazios apenas para parecer "premium".

Espaçamento deve existir para criar:

- agrupamento;
- hierarquia;
- separação;
- legibilidade.

Não para desperdiçar espaço.

---

## 7. TABELAS SÃO COMPONENTES PRINCIPAIS

Tabelas devem ser tratadas como componentes de primeira classe.

Quando aplicável, oferecer:

- ordenação;
- filtros;
- pesquisa;
- paginação;
- seleção múltipla;
- ações em lote;
- redimensionamento de colunas;
- ocultar/mostrar colunas;
- exportação;
- agrupamento;
- estados de loading;
- estado vazio;
- estado de erro.

Não transformar dados tabulares em cards apenas para deixar a interface visualmente mais bonita.

---

## 8. CARDS

Card não é solução universal.

Não transformar automaticamente:

- cliente em card;
- pedido em card;
- produto em card;
- indicador em card;
- serviço em card;
- configuração em card.

Utilizar card quando ele representar uma unidade conceitual realmente independente.

Para dados relacionais e tabulares:

PREFERIR TABELAS.

---

## 9. SIDEBAR

A sidebar deve refletir a estrutura real do ERP.

Exemplo:

Dashboard

Comercial
  Clientes
  Orçamentos
  Pedidos

Produção
  Ordens de Produção
  Programação
  Apontamentos

Estoque
  Produtos
  Movimentações
  Inventário

Compras

Financeiro

Qualidade

Administração

A navegação deve permitir entender:

- onde estou;
- onde posso ir;
- quais funções existem;
- qual módulo está ativo.

Não esconder toda a navegação em menus excessivamente profundos.

---

## 10. AÇÕES

Ações frequentes devem estar visíveis.

Não esconder funções importantes dentro de:

- menus de três pontos;
- menus secundários;
- dropdowns desnecessários;
- modais desnecessários.

A ação principal deve ser claramente identificável.

Exemplo:

[ Novo Pedido ] [ Exportar ] [ Importar ] [ Filtros ]

Não:

[ ⋮ ]

com todas as operações escondidas.

---

## 11. HIERARQUIA VISUAL

Cada tela deve possuir hierarquia clara.

Definir:

- elemento principal;
- informação secundária;
- informação auxiliar;
- ações principais;
- ações secundárias.

Não dar o mesmo peso visual para tudo.

Evitar:

- todos os títulos gigantes;
- todos os botões destacados;
- todos os cards com a mesma importância;
- todos os textos em negrito.

---

## 12. CORES

A cor deve comunicar função.

Estabelecer semanticamente:

- Primary
- Secondary
- Success
- Warning
- Error
- Info
- Neutral

Manter significado consistente em todo o ERP.

Exemplo:

Verde = sucesso

Amarelo = atenção

Vermelho = erro/perigo

Azul = informação/ação

Não alterar significado de cores entre módulos.

A cor nunca deve ser o único indicador de estado.

Sempre que possível:

cor + texto + ícone.

---

## 13. STATUS

Status devem ser imediatamente compreensíveis.

Preferir:

[ EM PRODUÇÃO ]

[ AGUARDANDO ]

[ CONCLUÍDO ]

[ CANCELADO ]

em vez de somente:

●

Cores podem acompanhar o status, mas não devem substituí-lo.

---

## 14. TIPOGRAFIA

Não utilizar Inter, Geist, Roboto ou outra fonte simplesmente porque é o padrão de um framework.

A tipografia deve ser uma decisão consciente.

Definir:

- família;
- pesos;
- escala;
- altura de linha;
- hierarquia;
- tamanho de tabelas;
- tamanho de formulários;
- tamanho de títulos.

Evitar:

- gradient text;
- títulos gigantes sem necessidade;
- tracking exagerado;
- font-extrabold em tudo.

ERP deve priorizar legibilidade e densidade.

---

## 15. BORDAS E RADIUS

Não utilizar o mesmo radius em absolutamente tudo.

Definir uma escala.

Exemplo:

- campos: pequeno;
- botões: pequeno;
- cards: moderado;
- modal: maior;
- pill: somente quando semanticamente apropriado.

Não transformar todos os componentes em cápsulas.

rounded-full deve ser reservado para casos como:

- avatar;
- badge realmente pill;
- indicador específico.

---

## 16. SOMBRAS

Evitar:

- shadow-2xl em tudo;
- cards flutuando artificialmente;
- glow;
- sombras coloridas;
- múltiplas camadas de sombra.

Preferir:

- bordas sutis;
- diferenças de superfície;
- hierarquia de planos;
- sombras discretas quando necessárias.

---

## 17. GLASSMORPHISM

Não utilizar glassmorphism como estética padrão.

Não criar:

- painéis translúcidos;
- blur atrás de tudo;
- fundos de vidro;
- cards flutuantes translúcidos.

Somente utilizar quando houver uma razão concreta.

---

## 18. GRADIENTES

Não utilizar gradiente para:

- títulos;
- botões;
- backgrounds;
- cards;
- bordas;

apenas para adicionar aparência "moderna".

Gradiente deve possuir função visual específica.

---

## 19. ÍCONES

Não utilizar emojis como ícones de interface.

Não misturar:

- estilos de ícones;
- espessuras;
- famílias;
- preenchidos e outline sem critério.

Utilizar uma biblioteca consistente.

Ícones devem representar ações ou informações.

Não utilizar ícone apenas porque existe espaço para ele.

---

## 20. BOTÕES

Não transformar todos os botões em grandes pills.

Botões devem ter hierarquia:

Primary
Secondary
Tertiary
Destructive

Uma tela não precisa destacar todas as ações.

Normalmente deve existir uma ação principal.

Evitar:

- gradiente;
- glow;
- hover scale;
- animação desnecessária.

---

## 21. FORMULÁRIOS

Formulários são parte central do ERP.

Devem possuir:

- labels claros;
- campos agrupados logicamente;
- obrigatoriedade explícita;
- validação;
- mensagens de erro;
- mensagens de sucesso;
- estados disabled;
- estados loading;
- foco visível;
- navegação por teclado.

Não utilizar placeholders como substitutos de labels.

---

## 22. MODAIS

Não utilizar modal para tudo.

Usar:

PÁGINA
quando a operação for complexa.

DRAWER
quando for necessário manter o contexto da tela atual.

MODAL
quando existir uma decisão curta ou confirmação.

Não colocar páginas inteiras dentro de modais apenas para evitar criar uma rota.

---

## 23. FEEDBACK

Toda operação importante precisa informar seu resultado.

Sucesso:

✓ Pedido #10291 atualizado.

Erro:

Erro ao salvar.

O campo "Quantidade" deve ser maior que 0.

Nunca deixar o usuário sem saber se a operação funcionou.

---

## 24. ESTADOS

Toda tela relevante deve considerar:

- loading;
- sucesso;
- vazio;
- erro;
- sem permissão;
- conteúdo longo;
- conteúdo insuficiente;
- operação em andamento.

Não desenvolver somente o "happy path".

---

## 25. EMPTY STATES

Não utilizar frases motivacionais.

Não:

"Está tudo tranquilo por aqui!"

"Pronto para começar sua jornada?"

Preferir:

"Nenhuma ordem de produção encontrada."

E oferecer uma ação relevante:

[ Limpar filtros ]

[ Nova ordem ]

---

## 26. RESPONSIVIDADE

Não simplesmente diminuir a interface desktop.

Cada dispositivo deve possuir uma estratégia.

Desktop:

- alta densidade;
- tabelas completas;
- múltiplas colunas;
- operações complexas.

Tablet:

- operações de campo;
- inspeção;
- apontamentos;
- produção.

Mobile:

- consultas;
- aprovações;
- ações simples;
- informações prioritárias.

---

## 27. ACESSIBILIDADE

Garantir:

- contraste adequado;
- foco visível;
- navegação por teclado;
- labels;
- aria quando necessário;
- mensagens de erro compreensíveis;
- tamanho adequado dos controles;
- informação não dependente exclusivamente de cor.

Suportar prefers-reduced-motion.

---

## 28. ANIMAÇÕES

Animação deve possuir função.

Pode ser usada para:

- feedback;
- transição de estado;
- mudança de contexto;
- abertura/fechamento;
- indicação de processamento.

Evitar:

- fade-in em tudo;
- scroll reveal em tudo;
- hover scale;
- bounce;
- parallax;
- animações longas.

Preferir animações curtas e discretas.

Sempre respeitar:

prefers-reduced-motion: reduce

---

## 29. MICROINTERAÇÕES

Microinterações devem melhorar compreensão.

Não utilizar microinteração simplesmente para "deixar vivo".

Se remover a animação não prejudicar a compreensão ou o feedback, provavelmente ela não é necessária.

---

## 30. DASHBOARDS OPERACIONAIS

Dashboard deve priorizar:

1. alertas;
2. pendências;
3. tarefas;
4. indicadores críticos;
5. tendências relevantes;
6. ações.

Não priorizar gráficos decorativos.

Pergunta obrigatória:

"Que decisão este gráfico permite tomar?"

Se nenhuma decisão puder ser identificada:

REMOVER O GRÁFICO.

---

## 31. GRÁFICOS

Escolher o gráfico conforme o dado.

Não usar donut/pie apenas porque parece bonito.

Preferir:

- tabela quando precisão importa;
- barra para comparação;
- linha para tendência;
- área quando evolução acumulada fizer sentido;
- KPI quando um número isolado for suficiente.

Todo gráfico deve possuir:

- título;
- unidade;
- período;
- contexto;
- legenda quando necessária.

---

## 32. DADOS REAIS

Nunca inventar:

- métricas;
- clientes;
- pedidos;
- faturamento;
- produtividade;
- certificações;
- depoimentos;
- números de produção;
- estatísticas.

Se dados reais não estiverem disponíveis:

usar dados explicitamente identificados como demonstração.

Não apresentar mock data como se fosse real.

---

## 33. CONTEÚDO

Evitar linguagem de marketing.

Não usar:

"Potencialize"

"Transforme"

"Desbloqueie"

"Revolucione"

"Experiência perfeita"

"Operação inteligente"

"Próxima geração"

quando não houver necessidade.

Usar linguagem específica da operação.

Exemplo:

"Ordens de produção aguardando material"

é melhor que:

"Otimize sua operação."

---

## 34. NÃO CRIAR SEÇÕES POR TEMPLATE

Toda seção precisa responder:

"Qual problema do usuário esta seção resolve?"

Se não resolver nenhum:

REMOVER.

Não criar seção simplesmente porque:

"todo ERP tem isso."

---

## 35. EVITAR REPETIÇÃO VISUAL

Não repetir continuamente:

Título
↓
Descrição
↓
3 cards
↓
Botão

Variar conforme a natureza da informação.

Usar:

- tabelas;
- listas;
- grids;
- formulários;
- timelines;
- abas;
- split views;
- drawers;
- painéis;
- gráficos;
- árvores;
- agrupamentos.

A variação deve ser funcional, não decorativa.

---

## 36. NAVEGAÇÃO E CONTEXTO

O usuário deve sempre saber:

- onde está;
- de onde veio;
- qual registro está vendo;
- qual operação está executando.

Usar quando necessário:

- breadcrumbs;
- tabs;
- títulos;
- contexto do registro;
- estado ativo da sidebar.

Não esconder contexto importante.

---

## 37. BUSCA E FILTROS

Para grandes volumes de dados:

- busca deve ser rápida;
- filtros devem ser claros;
- filtros ativos devem ser visíveis;
- usuário deve conseguir limpar filtros facilmente;
- estado filtrado deve ser evidente.

Não esconder filtros importantes em menus obscuros.

---

## 38. AÇÕES DESTRUTIVAS

Ações destrutivas devem ser claramente diferenciadas.

Exemplo:

[ Excluir ]

deve possuir confirmação adequada quando necessário.

Nunca colocar:

[ Excluir ]

como ação visualmente equivalente a:

[ Salvar ]

quando o risco for diferente.

---

## 39. ATALHOS

Quando houver ganho real de produtividade, suportar atalhos.

Exemplos:

Ctrl + K → busca global

Esc → fechar

Enter → confirmar quando apropriado

Ctrl + S → salvar quando apropriado

Não criar atalhos que conflitem com navegador ou sistema operacional.

---

## 40. PERFORMANCE PERCEBIDA

ERP deve parecer rápido.

Evitar:

- animações longas;
- loaders excessivos;
- transições desnecessárias;
- elementos pesados;
- renderização desnecessária.

Para operações demoradas:

mostrar claramente:

- processando;
- progresso quando disponível;
- sucesso;
- erro.

---

## 41. NÃO ADICIONAR IA SÓ POR MODA

Não adicionar:

- chatbot;
- "AI Insights";
- assistente;
- recomendações;
- resumo automático;

apenas porque sistemas modernos possuem IA.

IA deve existir somente quando resolver um problema real.

---

## 42. DESIGN SYSTEM

Antes de construir muitas telas, definir:

- cores;
- tipografia;
- espaçamento;
- radius;
- bordas;
- sombras;
- ícones;
- estados;
- botões;
- inputs;
- tabelas;
- badges;
- modais;
- drawers;
- navegação.

Componentes devem reutilizar o design system.

Não criar variações arbitrárias em cada página.

---

## 43. CONSISTÊNCIA

Consistência é obrigatória para:

- navegação;
- botões;
- tabelas;
- formulários;
- status;
- cores;
- espaçamento;
- mensagens;
- feedback.

Se duas telas fazem a mesma coisa, o comportamento deve ser semelhante.

---

## 44. NÃO USAR SHADCN/TAILWIND COMO IDENTIDADE

Bibliotecas podem ser utilizadas.

Porém:

NÃO aceitar a aparência padrão da biblioteca como identidade final.

Componentes devem ser adaptados ao design system do ERP.

A biblioteca é infraestrutura.

Não é identidade visual.

---

## 45. TESTE DO LOGO

Perguntar:

"Se o logo fosse substituído pelo logo de outra empresa, o sistema continuaria visualmente igual?"

Se SIM:

revisar identidade.

---

## 46. TESTE DO SCREENSHOT

Olhar a tela por aproximadamente 2 segundos.

Perguntar:

- consigo identificar o módulo?
- consigo entender o objetivo?
- consigo encontrar a ação principal?
- consigo identificar informações importantes?
- existe excesso de decoração?
- parece um software real?
- parece um template gerado por IA?

Se parecer um template:

REVISAR.

---

## 47. TESTE DA OPERAÇÃO

Para cada tela perguntar:

1. Qual é a tarefa principal?
2. Quantos passos são necessários?
3. Existe informação desnecessária?
4. Alguma ação importante está escondida?
5. O usuário consegue desfazer/corrigir erros?
6. O sistema fornece feedback?
7. A tela continua utilizável com muitos dados?

---

## 48. REGRA DE OURO

Se uma decisão visual:

- deixa a interface mais bonita;
- mas deixa a operação mais lenta;
- menos clara;
- menos previsível;
- menos densa;
- ou mais difícil de aprender;

REJEITAR A DECISÃO VISUAL.

---

## 49. QUALITY GATE

Antes de considerar qualquer tela pronta, executar esta verificação:

[ ] Não parece uma landing page.
[ ] Não parece um template SaaS genérico.
[ ] Não possui decoração sem função.
[ ] Não utiliza gradientes sem justificativa.
[ ] Não utiliza glassmorphism sem justificativa.
[ ] Não possui cards em excesso.
[ ] Não possui KPI decorativo.
[ ] Não possui gráficos decorativos.
[ ] Não possui emojis como ícones.
[ ] Não possui dados falsos apresentados como reais.
[ ] Não possui texto de marketing genérico.
[ ] Não possui ações sem função.
[ ] Possui loading state.
[ ] Possui empty state.
[ ] Possui error state.
[ ] Possui feedback de sucesso.
[ ] Possui estados de permissão quando necessário.
[ ] Possui navegação clara.
[ ] Possui hierarquia visual.
[ ] Possui densidade adequada.
[ ] Possui responsividade.
[ ] Possui acessibilidade básica.
[ ] Possui foco de teclado.
[ ] Respeita prefers-reduced-motion.
[ ] Tabelas são utilizadas quando apropriado.
[ ] Formulários possuem validação.
[ ] Ações principais estão claras.
[ ] Ações destrutivas são diferenciadas.
[ ] O design possui identidade própria.
[ ] A tela é específica para a operação.
[ ] Cada elemento possui uma justificativa.

---

## 50. TESTE FINAL ANTI-SLOP

Se 3 ou mais destes elementos aparecerem juntos sem justificativa:

- gradiente roxo/azul;
- Inter/Geist como default;
- hero centralizado;
- dois CTAs;
- 3 cards;
- rounded-2xl em tudo;
- botão pill;
- glassmorphism;
- aurora;
- blobs;
- glow;
- emojis;
- métricas inventadas;
- texto genérico de SaaS;

considerar a interface como AI SLOP.

PARAR.

Revisar a direção visual antes de continuar.

---

## 51. PRINCÍPIO FINAL

Não tentar fazer o ERP parecer "moderno".

Tentar fazer o ERP parecer:

- confiável;
- rápido;
- claro;
- específico;
- consistente;
- profissional;
- operacional;
- pertencente à empresa.

"Moderno" deve ser consequência da boa execução, não o objetivo visual.

O resultado final deve parecer um sistema que uma empresa realmente utiliza diariamente.
