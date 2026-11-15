## Context

O S6 (change `distribuicao-de-software`, arquivada em 28/10) tem a base dos pacotes, a distribuição como uma tarefa e o Deploy do agente do GLPI: o `getJobs` entrega tudo o que aguarda a máquina, e o "Pedir agora" acorda o agente pela porta 62354. O S5 guarda os programas do inventário em `softwares_dos_ativos` (nome, versão, editor e data), troca todos a cada inventário completo, e o agente fala com o servidor uma vez por dia (`PRAZO_DO_AGENTE_EM_HORAS = 24`).

Os mockups `r3-11-software` (m01 a m12) foram todos aprovados. As decisões do usuário de 14/11/2026: a janela da noite repete toda noite até instalar; o prazo do sem contato é da organização; as categorias são da TI; e o resto dos casos que os mockups não mostram o Claude decide aqui.

A aba Software da ficha (m09 a m11) entra na ficha de hoje e passa à moldura nova na change `ficha-sem-vao`.

A revisão do lote das tarefas 1.1 a 4.7, em 15/11/2026, trouxe 7 pontos e um cuidado, que entram nas decisões 7, 10 a 14 e nas 15 a 17. Três deles o usuário decidiu por cartão: o pacote inativado segura a fila até ser reativado; a distribuição mostra só as máquinas do alcance da conta; e a máquina que já aguarda o mesmo pacote é pulada, com o motivo.

## Goals / Non-Goals

**Goals:**
- O pacote frente ao inventário em toda tela: na base, no pacote, no assistente, na matriz e na ficha, pela mesma regra de casamento e de versão.
- Distribuir só a quem precisa, na hora escolhida, com a conta antes de enviar.
- Tratar a máquina que falhou e a sem contato na própria distribuição.

**Non-Goals:**
- A regra de alerta "Agente sem contato" (vem com a moldura da ficha).
- Reinstalar numa máquina que já tem a versão: ela é pulada.
- Desinstalar programas ou distribuir fora do agente do GLPI.
- Dependências entre pacotes e ordem de instalação além da fila de cada máquina.

## Decisions

### 1. O casamento do pacote com o inventário

O pacote ganha o "Nome no inventário", de até 120 caracteres, que de fábrica é o nome do pacote. Um programa do inventário é do pacote quando o nome dele, sem acento, sem diferenciar maiúscula e com os espaços juntados:
- é igual ao nome no inventário; ou
- começa por ele seguido de um espaço e de um algarismo ou de "(".

Assim "7-Zip 23.01 (x64)" e "Notepad++ (64-bit x64)" casam, e "Google Chrome Beta" não casa com "Google Chrome". Quando o inventário traz o mesmo pacote duas vezes numa máquina, vale a versão mais alta.

O casamento roda no banco, pelos dois lados normalizados com o `normalizarTexto`:
- `softwares_dos_ativos` ganha o `nome_normalizado`, gravado no inventário. A migration preenche o dos programas de hoje com o `lower`, o `translate` dos acentos do português, o `regexp_replace` dos espaços e o `btrim`; o próximo inventário completo regrava com a regra inteira;
- o pacote ganha o `nome_no_inventario_normalizado`, gravado com o nome no inventário, ou com o nome quando ele fica vazio.

A condição é a igualdade ou o `starts_with` com o espaço, nunca o `LIKE`, porque o nome pode ter "%" e "_", e o caractere seguinte confere com `[0-9(]`.

Alternativa recusada: casar pelo nome do pacote sem campo novo. O nome que a TI dá ("Driver HP Universal") raramente é o que o Windows registra ("HP Universal Printing PCL 6").

### 2. A comparação de versões

`compararVersoes` (domínio):
- tira o "v" do começo ("v131" é "131") e quebra a versão nos separadores (ponto, hífen, sublinhado e espaço) e na troca entre algarismo e letra: "8u401" vira 8, "u" e 401; "2.4.1-beta" vira 2, 4, 1 e "beta";
- compara pedaço a pedaço: número com número pelo valor, sem os zeros à esquerda ("23.01" é igual a "23.1"); letra com letra sem diferenciar maiúscula; e o número vem depois da letra;
- vai só até a quantidade de pedaços da versão do pacote: "131.0.6778.86" está na versão "131", e "2.4.1-beta" está na "2.4.1";
- o pedaço que falta na versão instalada vale 0: "24" está abaixo de "24.08".

Sem versão no inventário, o programa conta como abaixo da versão-alvo.

**O pacote sem versão** (a `versao` aceita nulo, como na "Configuração do Office", um roteiro) não tem comparação:
- quem tem o programa conta como instalado, nada fica desatualizado, e a criação não pula ninguém;
- a ficha do pacote mostra só "Instalado em" e "Sem o <nome>", e as barras das versões vão todas em neutro, sem o estado;
- na base, a situação é "SEM VERSÃO-ALVO";
- na ficha da máquina, o programa diz "NA BASE, SEM VERSÃO-ALVO", e a camada do m10 diz "JÁ INSTALADO", que pode ser escolhido de novo.

A versão precisa ser a que o inventário mostra: o Office "2019" contra o "16.0.10417" do inventário ficaria desatualizado para sempre. O campo da versão do formulário diz isso: "Use a versão como o inventário a mostra; as barras da ficha do pacote dizem as que existem."

Cada máquina com o agente fica, frente a um pacote:
- **na versão-alvo**, com a versão igual ou mais nova;
- **desatualizada**, abaixo dela;
- **sem o programa**.

As barras das versões agrupam pela versão cortada no tamanho da versão-alvo ("Chrome 130"), da mais nova para a mais velha: a versão-alvo em sucesso, as abaixo em atenção e as acima em neutro, cada uma com o estado escrito ("· alvo", "· abaixo do alvo", "· acima do alvo").

As contas valem para as máquinas da conta: os ativos ativos com o agente ligado, nos locais em que ela tem `software.distribuir`.

### 3. As categorias

`categorias_de_software`, com `orgScoped()` e RLS: o nome (de 1 a 40 caracteres, único sem diferenciar acento) e a ordem. Cada organização começa com as 7 do mockup, na ordem dele: Navegadores, Compactadores, Drivers, Escritório, Utilitários, Rede e segurança e Mídia.
- A migration cria as 7 nas organizações que existem, e os pacotes de hoje vão para Utilitários.
- A organização nova recebe as 7 na criação, junto com os perfis de fábrica.

Quem tem `software.administrar` cria, renomeia, ordena e remove as categorias, em "Categorias…", no cabeçalho da base. A categoria com pacotes não é removida ("Tire os pacotes desta categoria antes de removê-la."). O pacote pode ficar sem categoria, e então aparece só em "Todos".

### 4. O tipo e o ícone do pacote

O tipo vem da extensão do arquivo:
- `.msi`: "Instalador MSI";
- `.exe`: "Instalador EXE";
- `.msix`: "Pacote MSIX";
- `.ps1`: "Roteiro do PowerShell";
- `.bat` e `.cmd`: "Roteiro em lote";
- `.zip`: "Arquivo ZIP";
- outra: a extensão em maiúsculas;
- sem arquivo: "Só o comando".

Nas listas, o tipo vai curto, com a extensão em maiúsculas ("MSI · 118 MB").

O ícone é o monograma do nome, com as iniciais das duas primeiras palavras, sem os conectivos ("Agente de backup" é "AB"), ou as duas primeiras letras quando o nome tem uma palavra só. As siglas do mockup ("Ch", "N+") foram escolhidas à mão e não saem de uma regra. O pacote ganha quem guardou o arquivo e quando, gravados na troca do arquivo.

### 5. O comando em português

`explicarOComando(comando)` (domínio) devolve os pedaços reconhecidos e a frase. Ela conhece:
- o `msiexec`: `/i`, `/x`, `/qn`, `/quiet`, `/qb`, `/passive`, `/norestart`, `/forcerestart`, `REBOOT=ReallySuppress`, `ALLUSERS=1` e `/l*v <log>`;
- os instaladores EXE mais comuns: `/S`, `/s`, `/SILENT`, `/VERYSILENT`, `/SUPPRESSMSGBOXES`, `/NORESTART`, `--silent` e `/quiet`;
- o `powershell -File`.

Ela também diz se o comando instala sem perguntar e sem reiniciar. Esse resumo vira o "instala sem perguntar" do cartão do pacote e o "sem perguntar e sem reiniciar" da distribuição.

O comando que ela não reconhece fica só em mono, sem o "Em português".

### 6. O código de saída

O `setStatus` do agente traz "exit status: `1603'" na mensagem da execução. A máquina guarda o código numa coluna nova, e `explicarOCodigoDeSaida` traz a frase dos códigos do Windows Installer:
- 1602: cancelada na máquina;
- 1603: erro fatal;
- 1618: outra instalação em andamento;
- 1619: o pacote não abriu;
- 1633: plataforma sem suporte;
- 1638: outra versão já instalada;
- 1641 e 3010: pede reinício.

O código sem frase aparece só com o número.

### 7. O quando e o Deploy

A distribuição guarda:
- o `quando`: `agora`, `noite` ou `dia`;
- o `a_partir_de`, no `dia`;
- o fuso IANA de quem enviou, o da preferência da conta ou o do navegador.

`podeSeguir(distribuição, momento)` (domínio):
- **agora:** sempre;
- **dia:** a partir do momento marcado;
- **noite:** das 22:00 às 06:00 no fuso guardado, toda noite, até a máquina sair da fila.

O `getJobs` entrega só as máquinas que aguardam e podem seguir, na ordem de criação. A que tem uma instalação em andamento recebe a próxima no contato seguinte.

O "Escolher o dia" aceita de amanhã até daqui a um ano (o m08 diz "a partir de quinta, 12/11"), com 22:00 de fábrica. O fuso que não existe no `Intl` do servidor é recusado com 400.

O dia chega como o instante ISO 8601 com o fuso. O esquema da rota leva a mensagem, `z.iso.datetime({ offset: true, error: MENSAGENS_DO_QUANDO.diaFaltando })`, e o texto malformado volta no 400 da validação, com "Escolha o dia e a hora." no campo `aPartirDe`, como os outros campos que o esquema recusa. O `conferirQuando` confere a mesma forma antes do `new Date`, para quem o chama fora da rota: o texto sem o fuso viraria a hora do servidor, e o `Date` aceita formas que o Node inventa. O teto de um ano é pelo calendário do fuso de quem envia ("Escolha um dia até daqui a um ano."); o calendário da tela não passa dele.

### 8. O agente volta na hora certa

O agente fala uma vez por dia, porque o CONTACT responde com o `expiration` de 24 horas. Uma máquina ligada o dia todo, com o contato às 14:00 e a porta 62354 fechada, nunca pegaria a janela da noite.

Por isso, o `expiration` muda para o agente que tem um pedido aguardando que ainda não pode seguir: ele recebe o tempo até uma hora depois do próximo momento em que o pedido pode seguir (as próximas 22:00, ou o dia marcado), em minutos, até 24 horas. O código do agente do GLPI 1.x, conferido no repositório público em 14/11/2026, garante que ele volta dentro da janela:
- `Protocol/Message.pm` aceita o `expiration` como `\d+[dshm]?`: só o número é em horas, e o "m" é em minutos;
- `Agent.pm` passa esse valor ao `setMaxDelay` do alvo, depois de cada CONTACT;
- `Target.pm` marca o próximo contato no fim do prazo, menos um sorteio de até uma hora (até um sexto do prazo, quando ele é menor que 6 horas). Por isso a mira fica uma hora depois do início: o agente volta entre 22:00 e 23:00.

A resposta do INVENTORY leva o mesmo `expiration` do CONTACT, por segurança, embora o agente só o leia no CONTACT; o PROLOG segue com as 24 horas. O agente guarda o `volta_ate`, o momento até o qual ele deve voltar, que é o contato mais o `expiration` dado, e a distribuição o mostra.

A máquina desligada na hora em que o agente voltaria fala ao ligar (o agente sai do sono em até uma hora) e recebe o pedido se ainda for a janela; se não for, recebe o `expiration` da noite seguinte.

### 8a. Acordar os agentes

A porta 62354 (o `acordarPeloHttp` de hoje) só adianta, porque o `expiration` já traz o agente de volta:
- **agora**, ao criar, e ao "Tentar de novo" de um pedido que pode seguir: a tarefa `software.acordar` sai na hora, pela fila, só para aquela distribuição ou máquina;
- **o resto**, pela tarefa periódica `software.acordar-agendados`, a cada 15 minutos, pela `agenda` do catálogo de tarefas. Ela chama as máquinas que aguardam, cujo pedido pode seguir agora, com o agente em contato e com o IP, e que não foram chamadas nas últimas 2 horas. Ela cobre a janela às 22:00, o dia marcado, a máquina ligada às 23:30 e a API reiniciada, sem reagendar nada.

Os chamados saem em paralelo, até 20 por vez, cada um com os 5 segundos de prazo de hoje. Cada máquina guarda o último chamado (`chamada_em` e `chamada_respondeu`), e o log dela ganha a linha "Chamado às 22:00" ou "Chamado às 22:00, sem resposta". A distribuição mostra a que não respondeu em "Na fila", com o momento em que o agente deve voltar ("Não respondeu ao chamado das 22:00; o agente volta até 23:00").

O `enviar` da fila não muda. O botão "Pedir agora" sai da tela, e a rota `POST /software/distribuicoes/:id/agora` sai com ele.

### 9. O sem contato

`cadastro_dos_agentes` ganha `dias_sem_contato`, de 1 a 30, com 2 de fábrica: duas voltas do contato diário. O agente fica "Sem contato" quando o último contato passou desse prazo, e o texto diz há quanto tempo ("Sem contato · há 3 dias").

Quem tem `coletores.administrar` ajusta o prazo na Administração, junto ao cadastro automático, com a auditoria.

A situação de hoje ("Em dia", "Parado há N dias"), que vem da idade do inventário, não muda.

### 10. O alvo e a conta do assistente

O passo Máquinas junta quatro escolhas:
- **Por local:** a árvore dos locais, com as caixas de marcar e a contagem ("17 com agente em dia · 1 sem contato").
- **Por visão:** as visões salvas da tabela do Ativos, as da organização e as da conta, como os grupos dinâmicos do GLPI. A aba se chama "Por visão", e não "Por grupo", porque os grupos do Grafite são de contas. Marcar uma visão marca as máquinas com o agente que os filtros dela acham, pelo `condicoesDosFiltros` da tabela.
- **Por busca:** pelo nome, pelo patrimônio, pelo hostname ou pela pessoa.
- **Colar lista:** nomes, patrimônios ou hostnames, um por linha ou separados por vírgula. A tela diz quais não achou.

A API resolve a união numa rota de prévia, `POST /software/distribuicoes/previa`, e devolve cada máquina com a classe, nesta ordem de precedência:
- **pulada:** já com a versão-alvo, mesmo sem contato;
- **já aguarda:** com o mesmo pacote aguardando ou em andamento noutra distribuição, também pulada. Mandar de novo ao mesmo local, com a primeira ainda na fila, daria duas instalações seguidas;
- **na fila:** sem contato;
- **vai instalar:** com o agente em contato e sem a versão-alvo, com a versão de hoje ou nenhuma.

A conta ganha o `jaAguardam`. O "Até agora" mostra "JÁ AGUARDAM ESTE PACOTE · PULADAS" só quando houver, e o Conferir põe essas máquinas num grupo próprio, "Seguem na outra distribuição". Na prévia, cada máquina que já aguarda traz a `outra`: o id, o `criadaEm` e o quando da distribuição em que ela aguarda. O grupo diz cada outra distribuição, com o quando e a hora do envio ("na janela da noite, enviada às 09:02") e o caminho até ela, onde o "Tirar da fila" deixa mandar de novo: quem manda "agora" o que já mandou para a noite precisa saber onde as máquinas ficaram. A criação sem nenhuma que entra recusa pelo motivo: "Todas as máquinas escolhidas já têm a versão <versão>.", "Todas as máquinas escolhidas já aguardam este pacote." ou, com os dois, "Todas as máquinas escolhidas já têm a versão <versão> ou já aguardam este pacote.". Na tela, a recusa por já aguardarem ganha o mesmo caminho, pelos dados da prévia. A auditoria guarda as `puladas` pela versão e as `jaAguardavam` à parte.

A conferência da fila e a gravação correm sob a trava do pacote: a criação e o "Tentar de novo" (decisão 11) esperam o `travar(tx, 'pacote:<id>')` (`travas.ts`, o `pg_advisory_xact_lock` na organização da transação) antes de ler quem já aguarda. Duas criações do mesmo pacote no mesmo instante passam uma de cada vez, e a segunda vê as máquinas da primeira.

A visão que deixou de valer, com a definição que o `lerDefinicaoDaVisao` não lê mais ou com um filtro que o `condicoesDosFiltros` recusa, não derruba o passo Máquinas inteiro com um 500. O `GET /software/distribuicoes/alvos` a devolve com o `deixouDeValer` e sem a contagem, e a aba "Por visão" a mostra desabilitada, com "Deixou de valer · refaça os filtros no Ativos": a técnica sabe que a visão existe no Ativos, e o sumiço sem texto vira "cadê a minha visão?". A captura pega só a recusa da definição e dos filtros, e o erro do banco continua 500. A prévia e a criação que a mandam pelo id recusam com 400 em `visoes`: "A visão <nome> deixou de valer. Refaça os filtros dela na tabela do Ativos."

A permissão na prévia e na criação, que refaz a conta pela mesma regra:
- a visão, a busca e a lista colada rodam com o escopo do `ativos.ver`; as máquinas fora dos locais com o `software.distribuir` ficam de fora em silêncio, e as da lista colada aparecem como "não achadas", para não dizer que existem;
- o 403 fica para o local ou o ativo mandado pelo id;
- a visão de outra conta dá 404;
- a lista colada aceita até 2.000 itens ("Cole até 2.000 máquinas de uma vez.").

A prévia também diz qual máquina tem outra instalação em andamento. O "Conferir" agrupa as que vão instalar pela versão de hoje ("Atualizam da 7.2 · 5") e pela primeira vez.

A prévia recebe o alvo: os locais, as visões, os ativos pelo id, a lista colada e as máquinas tiradas da lista. As contagens das abas, quantas máquinas cada local e cada visão têm, vêm de `GET /software/distribuicoes/alvos`, lido ao abrir o passo. A busca é a das máquinas para distribuir (`GET /software/maquinas`), que passa a rodar com o escopo do `ativos.ver`, a achar pela pessoa e a dizer o sem contato.

A criação refaz a conta no servidor e grava só as que vão instalar e as da fila. As puladas não entram na distribuição; a auditoria guarda quantas foram.

O "Para quem":
- o nome da máquina, quando é uma só;
- o local mais fundo que contém todas;
- "N locais", quando não há esse local;
- "N máquinas", quando elas não têm local, ou só uma parte tem e num local só.

A distribuição de antes desta change fica sem o "Para quem", e a tela mostra quantas máquinas ela tem ("12 máquinas").

### 11. Tentar de novo e tirar da fila

- **Tentar de novo:** a máquina que falhou volta a "Aguardando o agente", sem a etapa e sem o código, e o log ganha a linha "Tentar de novo, por <nome>". Ela também é acordada, pela decisão 8a. A rota recusa com 409:
  - com o pacote inativo, pelo `pacoteInativo` (decisão 17);
  - com a máquina que já aguarda ou instala o mesmo pacote noutra distribuição, com "A máquina já aguarda este pacote noutra distribuição.", pela regra do "já aguarda" da decisão 10 e sob a mesma trava. Sem isso, a máquina que falhou na distribuição A e entrou na B voltaria a aguardar nas duas e instalaria duas vezes.

  A máquina da distribuição traz a `aguardaNoutra` (o id, o `criadaEm` e o quando da outra), e a tela troca o "Tentar de novo" pelo caminho até ela. Na ficha, o mandado que falhou fica sem o "Tentar de novo" quando outro mandado do mesmo pacote aguarda ou instala.
- **Tirar da fila:** a máquina que aguarda passa à situação nova `tirada` ("Tirada da fila"), com o fim marcado.

As duas vão para a auditoria e publicam `software.mudou`. O progresso conta as tiradas à parte ("1 tirada da fila").

### 12. A matriz

A tela "Software × máquinas" fica em Gestão de ativos › Software, com o controle "Por máquina | Por local".
- **Por máquina:** as linhas são os pacotes ativos, filtráveis, e as colunas, as máquinas com o agente de um local escolhido. A célula traz a versão: a versão-alvo em sucesso, a desatualizada com "↓" e em atenção, e "Falta" com a borda tracejada.
  - Marcar células de um pacote abre a barra "N marcadas no <pacote>", com o que acontece com cada uma, "Limpar" e "Distribuir <pacote> <versão> a estas N".
  - Marcar uma célula de outro pacote recomeça a marcação.
- **Por local:** as colunas são os locais que têm máquinas com o agente, cada máquina contada no próprio local. A célula traz "N de M" na versão-alvo, com o fundo de todas, de parte ou de nenhuma.
  - O clique abre, à direita, as máquinas do local fora da versão-alvo, as que estão nela, a última distribuição, "Distribuir <pacote> <versão> a estas N" e "Abrir a matriz do local <local>".
  - No pacote sem versão, a API já conta quem tem o programa (o `instalado-sem-alvo`); a tela troca "na versão-alvo" por "com o programa" e "fora da versão-alvo" por "sem o programa", na célula, no nome dela para o leitor de tela e no painel.

O "Distribuir" da matriz abre o assistente no passo Quando, com o pacote e as máquinas escolhidos, a origem escrita ("Vindo da matriz do local Financeiro") e "Voltar à matriz" (m08).

Uma rota só, `GET /software/matriz?local=<id>` ou `?por=local`, devolve os pacotes, as colunas e as células. O "Por máquina" mostra as máquinas do próprio local, sem as dos locais de dentro, como o "Por local" as conta, e traz a última distribuição de cada pacote no local, que o painel do "Por local" mostra ao abrir a célula.

### 13. A ficha da máquina

`GET /ativos/:id/software` junta:
- os mandados pelo Grafite: as máquinas das distribuições do ativo, com a situação, o código e quem mandou;
- os instalados frente à base, com a origem e a comparação.

A origem de cada programa:
- "GRAFITE · <nome>", quando o pacote dele chegou ao ativo por uma distribuição concluída, com o nome de quem mandou a última delas, mesmo a de um pacote já inativo;
- "Veio com o Windows", nos do sistema (m09);
- "Fora do Grafite", nos outros.

A comparação com a base:
- "HÁ A <versão> NA BASE", quando a versão do inventário está abaixo da do pacote;
- "NA VERSÃO DA BASE";
- "NÃO ESTÁ NA BASE";
- "DO WINDOWS, NÃO SE DISTRIBUI".

A ordem "Frente à base · ação primeiro" vai nessa sequência, e pelo nome dentro de cada grupo. Para quem só vê o ativo, a rota traz os instalados pelo nome, sem a comparação, a origem, os mandados e os pacotes; o agente e o sem contato vêm para os dois. A rota substitui o `/ativos/:id/softwares` e o `/ativos/:id/distribuicoes`, que saem quando a aba passa a usá-la.

O programa do sistema vem dos campos que o agente do GLPI manda, conferidos no repositório público em 14/11/2026 (`Task/Inventory/Win32/Softwares.pm` e `Tools/Win32/Constants.pm` do agente, e o `inventory.schema.json` do `inventory_format`):
- o `system_category` vem em todo programa do Windows: `system_component` (o `SystemComponent` do registro), `application`, `update`, `security_update` e `hotfix` (as atualizações), e, nos aplicativos da loja, o `SignatureKind` em minúsculas (`system`, `store`, `developer`, `enterprise` e `none`);
- o `no_remove` vem do `NoRemove` do registro: o agente lê como número, e o esquema o declara booleano.

Contam como do sistema o `system_component`, o `update`, o `security_update`, o `hotfix` e o `system`, e também o `no_remove` verdadeiro (`true`, 1 ou "1") com o editor que tem "Microsoft". `softwares_dos_ativos` ganha o `do_sistema`, falso nos de hoje até o próximo inventário. Os testes usam um inventário escrito à mão com esses valores, sem nome de máquina nem de pessoa.

A tabela mostra as 10 primeiras linhas e "Mostrar os outros N". "Instalar outro pacote nesta máquina" abre a camada do m10, com a busca dos pacotes ativos e a relação de cada um com a máquina ("ATUALIZA A 129", "NÃO INSTALADO", "JÁ NA VERSÃO" ou "JÁ NA FILA", os dois últimos sem poder ser escolhidos), e cria uma distribuição de uma máquina, agora ou na janela da noite. O "JÁ NA FILA" vem do `naFila` de cada pacote, que a rota liga quando a máquina já o aguarda ou o instala (decisão 10); "JÁ NA VERSÃO" vem antes, como na ordem das classes.

### 14. Exportar

O "Exportar" da distribuição e o da matriz gravam no navegador um CSV com o que a tela mostra, como a tabela do Ativos já faz.

A célula que começa por "=", "+", "-" ou "@", e também por tabulação ou retorno de carro, que a planilha também lê como fórmula, ganha o apóstrofo. O BOM sai do código U+FEFF escrito no fonte, pelo `String.fromCharCode(0xfeff)`, e não do caractere invisível, que uma edição pode perder ou pôr sem ninguém ver.

### 15. A pessoa da máquina

A distribuição aberta, o CSV dela e a dica da matriz por máquina mostram a pessoa responsável pela regra da ficha do ativo, o `veOResponsavel`: `pessoas.ver` no local de trabalho da pessoa, e a pessoa não anonimizada. Sem isso, o `pessoa` vem nulo, como o da máquina sem responsável.

A busca do `/software/maquinas` acha pelo `pessoas.busca` só as pessoas que a conta vê: a condição da pessoa leva a situação e o alcance do `pessoas.ver` no SQL, e a conta sem o `pessoas.ver` não busca pela pessoa. Achar a máquina pelo nome da pessoa revelaria a ligação que a tela esconde.

### 16. O alcance da distribuição

Decisão do usuário de 15/11/2026, "Só as do alcance": a distribuição mostra e conta só as máquinas dos locais em que a conta tem `software.distribuir`, como a base, a matriz e a prévia já fazem. Entram no alcance:
- a lista e a distribuição aberta: o progresso, a régua, as seções e o CSV;
- as distribuições da ficha do pacote e a última da base.

O resumo ganha o `foraDoAlcance`, as máquinas da distribuição fora desses locais, e a distribuição aberta diz "N máquinas em locais fora do seu alcance" quando há alguma. A distribuição sem nenhuma máquina no alcance fica fora da lista, e abri-la dá 404, como a que não existe: ela não tem o que mostrar, e o 404 não diz que ela existe. A condição vai no SQL, por um `exists` das máquinas no alcance, para o limite das 100 mais novas valer depois dela. O "Para quem" continua o gravado na criação, de todas as máquinas, e a distribuição de antes desta change, sem ele, mostra o total das máquinas dela, também as de fora do alcance.

### 17. O pacote inativado segura a fila

Decisão do usuário de 15/11/2026, "Segurar até reativar": a TI inativa um pacote com defeito, e a fila dele não pode instalá-lo dias depois, na janela da noite ou na volta da máquina sem contato.
- O `getJobs` (`jobsDoAgente`), o `expiration` do CONTACT (`expirationDoAgente`) e os chamados (`maquinasParaChamar`) só olham as máquinas que aguardam um pacote ativo. As máquinas do pacote inativo continuam em "Aguardando o agente", sem mudar nada no banco: a reativação retoma a entrega sozinha, no próximo contato em que o pedido pode seguir, e a `software.acordar-agendados` chama os agentes no ciclo seguinte, a cada 15 minutos, fora os chamados há menos de 2 horas (decisão 8a), que o contato do próprio agente pega.
- O "Tentar de novo" recusa com 409 e o `pacoteInativo` ("O pacote está inativo."); o "Tirar da fila" continua.
- O resumo da distribuição e os mandados da ficha trazem a situação do pacote. A distribuição aberta avisa que as máquinas ficam na fila até o pacote ser reativado, troca o "quando segue" de cada uma por "Pacote inativado" e não oferece o "Tentar de novo"; na ficha, o mandado que aguarda ganha o rótulo "PACOTE INATIVADO", e o que falhou fica sem o "Tentar de novo".

Alternativa recusada: tirar da fila as máquinas ao inativar. A TI perderia a fila ao reativar um pacote que inativou por engano ou só por um tempo.

## Risks / Trade-offs

- **[A porta 62354 fechada]** O "Agora" espera o contato diário, e a primeira noite pode passar, quando o agente falou antes de a distribuição existir e só volta no dia seguinte → o `expiration` da decisão 8 garante a noite seguinte; "Na fila" diz que o agente não respondeu ao chamado e até quando ele volta; o runbook pede a porta.
- **[O `expiration` curto]** O agente com pedido para a noite faz o inventário de novo quando volta → o prazo curto vale só enquanto há pedido aguardando que ainda não pode seguir, e volta às 24 horas no contato seguinte.
- **[O nome no inventário errado]** O pacote casa com nada, e todas as máquinas aparecem "Sem o programa" → o "Instalado em 0" da base e da ficha do pacote mostra o erro, e o nome no inventário fica na ficha do pacote, ao lado da categoria.
- **[A conta pesada na base]** As contas cruzam todos os programas do inventário com os pacotes → uma consulta por tela, com o casamento no banco pelo `nome_normalizado` e um índice por organização e nome normalizado.
- **[O fuso de quem enviou]** Uma máquina noutro fuso instala na noite de quem enviou → o fuso fica escrito no resumo ("hoje às 22:00, horário de Brasília").
- **[A distribuição vista em parte]** Duas contas com alcances diferentes veem números diferentes da mesma distribuição → a linha "N máquinas em locais fora do seu alcance" diz que há mais, e o "Para quem" de todas fica no título.
- **[O pacote inativado esquecido]** As máquinas ficam na fila para sempre → a distribuição aberta e a ficha dizem "Pacote inativado" em cada uma, e o "Tirar da fila" continua.
