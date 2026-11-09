# modulo-alertas Specification

## Purpose
Reunir na casca o módulo Alertas: a lista dos alertas abertos e dos resolvidos, com o reconhecer e o adiar, a tela das regras para quem administra os alertas, o bloco Alertas na ficha do ativo, com o silêncio, e as ocorrências que levam os alertas a "O que resolver agora".

## Requirements

### Requirement: Alertas no dock

A casca SHALL ter o módulo Alertas, depois do Ativos e antes do Cofre, visível só para quem tem `alertas.ver` em algum escopo, inclusive por `alertas.tratar` ou `alertas.administrar`, e só com o módulo ligado na organização (spec modulos-da-organizacao). O item do dock SHALL levar à lista dos alertas abertos, e o menu dele SHALL ter "Abertos", "Resolvidos", "Indicadores" (spec indicadores) e, para quem tem `alertas.administrar`, "Regras". No celular, o Alertas SHALL ficar na barra de abas, depois do Ativos.

A busca (Ctrl+K) SHALL oferecer os itens do menu, como "Abertos" e "Indicadores", no caminho "Alertas", e, para quem administra os alertas, a ação "Nova regra de alerta".

#### Scenario: Conta sem a permissão
- **WHEN** uma conta sem `alertas.ver` entra
- **THEN** o dock e a busca não mostram o Alertas

#### Scenario: Quem só vê
- **WHEN** uma conta com só `alertas.ver` abre o menu do Alertas
- **THEN** o menu mostra "Abertos", "Resolvidos" e "Indicadores", sem "Regras"

#### Scenario: Indicadores pela busca
- **WHEN** uma conta com `alertas.ver` busca "indicadores"
- **THEN** a busca oferece "Indicadores", no caminho "Alertas", que leva à tela dos indicadores

### Requirement: Lista dos alertas abertos

A lista SHALL mostrar os alertas não resolvidos que a conta vê (spec alertas), com o número no título, como "4 abertos", e as colunas:
- Severidade, em texto e com o ícone;
- Ativo, com a miniatura e o nome, ou o coletor, com o nome;
- Alerta, com o texto;
- Regra, com o nome;
- Há, o tempo desde que abriu, como "32 min", "1 h" ou "2 d", atualizado a cada minuto;
- Situação: "Aberto", "Reconhecido por <nome>", "Adiado até <hora>", e "Ativo silenciado" quando o ativo está silenciado.

A ordem de fábrica SHALL ser pela severidade (Crítico, Atenção e Informação) e, na mesma severidade, o mais antigo primeiro. O usuário SHALL poder ordenar por Severidade, Ativo, Alerta e Há. Os filtros SHALL ser a severidade e a regra. A lista SHALL ser paginada no servidor, sem limite fixo.

Clicar na linha ou pressionar Enter nela SHALL abrir a ficha do ativo, e, no alerta de um coletor, a tela dos coletores. Quem pode tratar o alerta SHALL ver na linha "Reconhecer" e "Adiar", que oferece 15 minutos, 30 minutos e 1 hora, com o retorno "Alerta reconhecido." ou "Alerta adiado até <hora>.".

Sem alertas abertos, a lista SHALL mostrar "Nenhum alerta aberto.". Com os filtros sem resultado, SHALL mostrar "Nenhum alerta com esses filtros." e "Limpar filtros". Com a falha da API, SHALL mostrar "Não foi possível carregar os alertas." e "Tentar de novo".

#### Scenario: Ordem de fábrica
- **WHEN** há um alerta de Atenção de 7 h, um de Atenção de 1 h e um Crítico de 32 min
- **THEN** a lista mostra o Crítico, depois o de Atenção de 7 h e por último o de 1 h

#### Scenario: Reconhecer na lista
- **WHEN** Ana escolhe "Reconhecer" no alerta "Sem papel"
- **THEN** a lista mostra "Alerta reconhecido.", e a situação passa a "Reconhecido por Ana Souza"

#### Scenario: Quem só vê
- **WHEN** uma conta com só `alertas.ver` abre a lista
- **THEN** as linhas não têm "Reconhecer" nem "Adiar"

### Requirement: Lista dos alertas resolvidos

A lista dos resolvidos SHALL mostrar os alertas resolvidos e encerrados que a conta vê, do mais recente para o mais antigo, com a severidade, o ativo ou o coletor, o texto do alerta, a regra, quando abriu, quando terminou e como terminou: "Voltou ao normal" ou "A regra deixou de valer". Os filtros SHALL ser a severidade, a regra e o ativo. A lista SHALL ser paginada no servidor, sem limite fixo. Sem resultados, SHALL mostrar "Nenhum alerta resolvido.".

#### Scenario: Resolvidos de um ativo
- **WHEN** o usuário abre os resolvidos pelo bloco Alertas da ficha da impressora do RH
- **THEN** a lista mostra só os alertas resolvidos dessa impressora, com o filtro do ativo à vista

### Requirement: Regras na tela

A tela das regras SHALL explicar, acima da lista: "Uma regra diz quando abrir um alerta: a condição, o limite e para quais ativos. O alerta é cada vez que a regra dispara num ativo, e ele fecha sozinho quando o ativo volta ao normal. Para tratar um tipo, um modelo ou um local de outro jeito, use as exceções da regra."

Quem tem `alertas.administrar` SHALL ver a lista das regras, com:
- o nome;
- a condição com os parâmetros, como "Nível do toner em 10% ou menos, volta acima de 15%";
- a duração e a severidade;
- o escopo, como "Organização inteira" ou "Tipo: Impressora";
- as exceções, como "2 exceções" ou "Sem exceções";
- a situação, "Ativa" ou "Inativa".

A lista SHALL ter "Nova regra".

O formulário da regra SHALL mostrar os campos da condição escolhida, com as mensagens da spec alertas no campo, e SHALL NOT deixar trocar a condição de uma regra que existe. Na regra de uma condição dos ativos, o formulário SHALL ter as "Exceções", cada uma com o lugar, o efeito e "Tirar", e "Incluir exceção". Salvar SHALL dar o retorno "Regra salva.". A ficha da regra SHALL ter "Inativar" e "Reativar", com o retorno "Regra inativada." ou "Regra reativada.".

#### Scenario: Nova regra do toner
- **WHEN** quem administra os alertas escolhe "Nova regra" e a condição Nível do toner
- **THEN** o formulário mostra o limite e a folga, além do nome, da duração, da severidade, do escopo e das exceções

#### Scenario: Regra do coletor
- **WHEN** a condição escolhida é Coletor sem contato
- **THEN** o formulário mostra os minutos e a severidade, sem a duração, sem o escopo e sem as exceções

#### Scenario: Exceção do modelo
- **WHEN** quem administra os alertas abre a regra do toner, escolhe "Incluir exceção", o modelo HP M404 e "Outro limite" de 20%, com a folga de 5 pontos, e salva
- **THEN** a regra é salva com a exceção, e a lista mostra "1 exceção" nela

### Requirement: Alertas na ficha do ativo

A Visão geral da ficha do ativo (spec cadastro-de-ativos, "Aba Dados em cartões") SHALL ter o bloco Alertas, para quem tem `alertas.ver` no escopo do local do ativo, com:
- os alertas não resolvidos do ativo, com a severidade, o texto, há quanto tempo e a situação, e as ações de quem pode tratá-los;
- "Nenhum alerta aberto." quando não há nenhum;
- "Ver os resolvidos", que leva à lista dos resolvidos do ativo;
- o silêncio: "Alertas silenciados até <data e hora>", ou "até alguém retomar", com o motivo, e "Retomar alertas"; ou, sem silêncio, "Silenciar alertas", para quem pode tratá-los.

O cartão da Visão geral SHALL resumir o bloco em texto: "1 alerta aberto" ou "N alertas abertos", e "Alertas silenciados" com o silêncio. Sem alerta aberto e sem silêncio, o bloco SHALL NOT entrar no resumo.

"Silenciar alertas" SHALL pedir até quando, com uma data e hora ou "Até alguém retomar", e o motivo, e SHALL dar o retorno "Alertas silenciados.". "Retomar alertas" SHALL dar o retorno "Alertas retomados.".

#### Scenario: Ficha com alerta
- **WHEN** o usuário abre a ficha da impressora com o alerta "Toner preto em 8%"
- **THEN** o bloco Alertas, na Visão geral, mostra o alerta, Crítico, com há quanto tempo está aberto

#### Scenario: Silenciar pela ficha
- **WHEN** Ana silencia os alertas da impressora até 20/10 às 18:00, com o motivo "Em manutenção"
- **THEN** o bloco mostra "Alertas silenciados até 20/10/2026 18:00", com o motivo e "Retomar alertas"

#### Scenario: Resumo no cartão
- **WHEN** a impressora tem dois alertas abertos, e o usuário vê os alertas
- **THEN** o cartão da Visão geral diz "2 alertas abertos"

### Requirement: Ocorrências em "O que resolver agora"

O módulo Alertas SHALL registrar a fonte de ocorrências da tela inicial (spec tela-inicial), com os alertas abertos que a conta vê, menos os adiados e os dos ativos silenciados. Cada ocorrência SHALL trazer a severidade, o texto do alerta, o ativo, com o nome, o tipo e as imagens, ou o coletor, com o nome e a imagem genérica, quando o alerta abriu e o endereço da ficha do ativo ou da tela do coletor. A tela inicial mostra até 500 alertas.

#### Scenario: Toner na tela inicial
- **WHEN** abre o alerta "Toner preto em 8%" numa impressora que a conta vê
- **THEN** a tela inicial mostra a ocorrência, Crítica, com a imagem da impressora, sem recarregar a página

#### Scenario: Alerta adiado
- **WHEN** Ana adia o alerta "Offline" por 15 minutos
- **THEN** a ocorrência sai da tela inicial e volta quando o adiamento termina, se o alerta continuar aberto

### Requirement: Alertas atualizados pelos eventos

As listas dos alertas, a tela das regras, o bloco Alertas da ficha e as ocorrências da tela inicial SHALL se atualizar sozinhos quando o evento `alertas.mudaram` chega, sem uma ação do usuário. Um formulário de regra em edição SHALL manter o que foi digitado.

#### Scenario: Alerta resolvido com a lista aberta
- **WHEN** o alerta do toner se resolve enquanto a lista dos abertos está na tela
- **THEN** o alerta sai da lista, sem recarregar a página
