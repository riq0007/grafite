## Context

O Grafite já tem os pedidos à TI que viram trabalho: as solicitações (Toner, Conserto e Equipamento) e as OS, no módulo Operação. Os dois:
- usam o número por organização, com a tabela de contador (`numeracao_das_ordens`);
- usam o alcance pelos locais (`locais uuid[]` e `sem_local`, nas solicitações);
- publicam pelo `publicoDaOrdem`;
- notificam pela `notificar()`.

A pessoa tem o local de trabalho opcional, e a busca de pessoas pelo nome serve a toda sessão. A organização não tem um fuso próprio: cada conta tem o dela nas preferências (`regiao.fuso`, conferido pelo `fusoReconhecido`). O `software/quando.ts` já faz conta de relógio de parede num fuso com o `Intl`.

A web não tem biblioteca de arrastar. As categorias do software sobem e descem por botões, e o mapa arrasta com os eventos de ponteiro.

Os mockups `r3-16-chamados-ti` (m01 a m12) foram aprovados em 14/11/2026. A prévia do colaborador (m07 a m11) usa as palavras e as peças da `r3-19-aba-abrir-chamado`, que é a dona do que o colaborador vê. Em 15/11/2026, o usuário pediu tudo o que envolve o chamado nas seis changes, sem atalho provisório: a mensagem da TI chega à pessoa quando o chat (17) e a aba (20) existirem.

## Goals / Non-Goals

**Goals:**
- Um modelo de chamado que as changes 17 a 21 estendem sem migrar o que existe: a origem, a conversa com a autoria da pessoa, o formulário em JSON e o relógio.
- O prazo calculado por uma função só, no domínio, que a API, a tarefa do prazo e a web usam. O mesmo chamado diz o mesmo prazo em todas as telas.
- O formulário e as condições conferidos no domínio, com a mesma regra na prévia da web e na abertura pela API.

**Non-Goals:**
- A entrega da mensagem à pessoa, a resposta dela e a reabertura por ela (chat 17, aba 20).
- Os feriados no horário da TI.
- Os indicadores dos chamados: tempo médio, primeira resposta no prazo. Ficam para quando houver dados.
- Uma biblioteca de arrastar: os eventos de ponteiro bastam, com o teclado como alternativa.
- Mudar a forma da OS e da solicitação: só a ligação ao chamado.

## Decisions

### 1. As tabelas

Todas com `orgScoped()`, RLS ativo e forçado, e as chaves estrangeiras em `(org_id, id)`.

- **`tipos_de_chamado`:**
  - a identificação: `nome`, `nome_normalizado` (único), `icone` e `frase`, que só o Rascunho do "Novo tipo" deixa vazia;
  - a situação e a ordem: `situacao` (`rascunho`, `em-uso` ou `inativo`, com o hífen das situações das solicitações e das OS), `ordem`;
  - o prazo: `resposta_valor`, `resposta_unidade`, `resolucao_valor`, `resolucao_unidade` (`min`, `h` ou `d`) e `modo` (`corridas` ou `horario`);
  - o atendimento: `atende_por_padrao` (conta, opcional) e `sem_ninguem` (`triagem` ou `fica`);
  - o que acontece depois: `pode_virar_os`, `gera_solicitacao` (`nao`, `toner` ou `equipamento`), `tipo_de_ativo_do_equipamento` e `pede_o_ativo`;
  - quem vê: `aparece_para_o_colaborador` e `so_a_ti_abre`;
  - o formulário: `formulario` jsonb (decisão 2);
  - a origem da cópia: `duplicado_de`;
  - o registro: `criado_em` e `criado_por`.
- **`chamados`:**
  - a identificação: `numero` (único na organização), `tipo_id`, `titulo` e `titulo_normalizado`;
  - quem e de onde: `pessoa_id`, `origem` (`ti`; o chat e a aba entram nas changes deles), `aberto_por` e `aberto_em`;
  - o formulário: `formulario` (a cópia da abertura) e `respostas`, em jsonb;
  - o ativo e o alcance: `ativo_id`, `locais uuid[]`, `sem_local` e `local_da_pessoa`, o local de trabalho da pessoa na abertura, que a troca do ativo usa (tarefa 4.15);
  - o atendimento: `situacao` (`triagem`, `em-atendimento`, `aguardando` ou `resolvido`), `responsavel_id` e `responsavel_desde`. Os CHECKs seguem a tabela da spec: ninguém na triagem, alguém no atendimento e no aguardando, e o relógio contando só na triagem e no atendimento;
  - o prazo (decisão 3): o `prazo` jsonb, com o modo, os minutos da resposta e da resolução e o valor e a unidade do tipo, só para o texto; `contado_s`; `relogio_desde`; `primeira_resposta_em`; `estouro_avisado_em`;
  - a resolução: `resolvido_em` e `resolvido_por`;
  - as ligações: `os_id` (única) e `solicitacao_id`;
  - a concorrência: `versao` (decisão 4).
- **`mensagens_dos_chamados`:**
  - `chamado_id` e `especie` (`mensagem`, `nota` ou `evento`);
  - a autoria: `autor_conta` ou `autor_pessoa`. A pessoa escreve a partir do chat; o CHECK aceita uma das duas na mensagem e só a conta na nota e no evento. Nenhum evento desta change é do sistema: cada um é de quem agiu. O chat e a aba, que já mudam a lista das origens, trazem na mesma migration os autores que precisarem;
  - o conteúdo: `texto`, na mensagem e na nota, e `evento` e `dados` jsonb, no evento (decisão 8);
  - o momento: `criada_em`.

  O papel da aplicação perde o UPDATE e o DELETE nela (`REVOKE`), como no histórico das OS.
- **Os documentos JSON** (o formulário, as respostas, o prazo e os dados do evento) têm o tipo conferido no banco e um teto em bytes que só serve de rede, acima do pior caso que o domínio aceita: 512 KB no formulário, 1 MB nas respostas e nos dados e 1 KB no prazo. As 20 respostas de 4.000 caracteres, com até 6 bytes cada no texto do JSON, ficam perto de 480 KB.
- **`anexos_dos_chamados`:** `arquivo_id` (único), com o arquivo na tabela `arquivos` de hoje, e o dono: `chamado_id` e `mensagem_id` ou `campo_id` (decisão 10). O CHECK aceita três formas: sem dono (os três nulos), o da mensagem (o chamado e a mensagem) e o do campo (o chamado e o id do campo, no formato da decisão 2). A chave estrangeira da mensagem leva o chamado junto, com a chave única `(org_id, id, chamado_id)` na conversa: o anexo da mensagem é sempre do mesmo chamado. O papel da aplicação não apaga o anexo (`REVOKE DELETE`): a linha liga o arquivo ao dono, e o que sai, sem dono ou de um campo, ganha o `removido_em` no arquivo.
- **`numeracao_dos_chamados`:** o contador por organização, como o das OS.
- **`respostas_prontas`:** `rotulo` e `rotulo_normalizado` (único), `texto`, `espera_a_resposta`, `tipos uuid[]` (vazio para todos) e `ordem`.
- **`horario_da_ti`:** uma linha por organização, opcional, com `dias smallint[]` (1 a 7, segunda a domingo, sem repetir), `inicio` e `fim` em minutos do dia, das 00:00 às 23:59 (o fim não chega à meia-noite, 24:00, que um campo de hora não escreve), `fuso` e `carga_cheia`. Sem a linha, vale o padrão do domínio.

`chamados` e `mensagens_dos_chamados` recusam o DELETE pelo papel da aplicação, como as solicitações.

### 2. O formulário em JSON, com ids estáveis

O formulário é um documento conferido pelo domínio (`packages/domain/src/chamados/formulario.ts`), à mão, como a configuração dos campos do ativo (`campos/configuracao.ts`): o pacote do domínio não tem dependências, e o Zod fica na borda da API.

```ts
{
  titulo: { comecaPeloTipo: boolean, campoId: string | null },
  campos: Campo[],
}
```

Cada campo tem um id curto e estável, de 1 a 40 letras sem acento, números, `-` ou `_`, gerado na criação e nunca reaproveitado. O banco confere esse formato no anexo do campo. Quem gera é o construtor da web, com o `idDoFormulario` do domínio, para a condição poder citar o campo novo antes da gravação. O tipo de "Novo tipo" nasce sem campos, o duplicado copia os ids e os tipos de fábrica têm ids fixos, então todo pedido chega com os ids. Também tem o tipo, o rótulo, o nome no resumo (nulo quando vazio), `obrigatorio`, `soDaTi`, `apagarSeSumir` (ligado por padrão, como no m10), as opções, os tipos de ativo e a condição:
- **as opções** têm id, no mesmo formato, e texto. Só a Escolha única e as Várias opções as guardam;
- **os tipos de ativo** são os ids dos tipos aceitos no campo Ativo, ou nenhum, para qualquer tipo. Se existem e estão ativos, quem confere é a API;
- **a condição** é uma lista de até 5 cláusulas `{ campoId, opcaoId | valor, juncao: 'e' | 'ou' }`: a opção na Escolha única e nas Várias opções, o `valor` sim ou não no Sim ou não, e a junção com a cláusula anterior, que a primeira não tem.

`conferirFormulario(pedido, { pedeOAtivo })` devolve o formulário conferido, só com as chaves conhecidas, ou os erros por chave, para a tela mostrá-los no lugar: `formulario`, `campos`, `campos.<id>`, `campos.<id>.rotulo`, `campos.<id>.nomeNoResumo`, `campos.<id>.opcoes`, `campos.<id>.opcoes.<id da opção>`, `campos.<id>.tiposDeAtivo`, `campos.<id>.condicao` e `pedeOAtivo`.
- **O que outro usa:** a recusa de remover um campo ou uma opção de que outro depende, ou o campo do título, vai na chave do que saiu (`campos.<id>` ou `campos.<id>.opcoes.<id da opção>`). Assim, o construtor confere o formulário com o campo tirado antes de tirá-lo, pela mesma função. A do "Só a TI vê" no campo do título vai na chave do campo (`campos.<id>`), e a do campo que a pessoa vê com a condição sobre um campo só da TI, na condição dele.
- **O que a tela não monta** recebe a recusa geral do formulário: o id que falta, fora do formato ou repetido, o id com o nome de uma propriedade do objeto do JavaScript (como `constructor` e `__proto__`, que como chave das respostas devolveria a do protótipo ou o trocaria, e que o `idDoFormulario` nunca gera), o tipo de campo desconhecido, a condição sobre o próprio campo ou sobre um tipo de campo que não serve, a sexta cláusula, a junção que não é "e" nem "ou" e o título num tipo de campo que não serve. Como o tipo de campo não muda depois de acrescentado (spec tipos-de-chamado, "Formulário do tipo"), nada que a tela produz cai nela.

As respostas são um mapa do id do campo para a resposta, no tipo do campo, e o campo sem resposta não tem a chave:

| Tipo de campo | Resposta |
|---|---|
| Texto curto e Texto longo | o texto, sem os espaços nas pontas |
| Escolha única | o id da opção |
| Várias opções | os ids das opções, na ordem delas no campo, sem repetir |
| Ativo, Local e Pessoa | o id do ativo, do local ou da pessoa |
| Data | a data em `aaaa-mm-dd`, como o campo de data do kit a escreve |
| Número | o número inteiro |
| Anexo | os ids dos arquivos, sem repetir |
| Sim ou não | `true` ou `false` |

`conferirRespostas(formulario, pedido)` devolve as respostas dos campos visíveis, só com os campos do formulário, ou os erros na chave do campo (`campos.<id>`). O que a tela não monta, como a resposta fora do tipo do campo, recebe a recusa geral do formulário, na chave `formulario`. Se o ativo, o local e a pessoa existem e estão ativos, e se os arquivos são aceitos, quem confere é a API. As respostas dos campos só da TI são aceitas na abertura, porque nesta change quem abre é a TI, com esses campos na gaveta; a abertura pela pessoa fica para a 19 e a 20 (decisão 11).

`responder(formulario, respostas, campoId, resposta)` é o estado do formulário que se preenche, na gaveta da abertura e na prévia: grava a resposta nova, e o campo que some perde a dele quando tem o "Apagar a resposta se o campo sumir" ligado. Desligado, ele a guarda para quando voltar, e o `conferirRespostas` a deixa de fora enquanto ele está escondido.

Os ids, e não os textos, ligam as condições e as respostas. Assim, renomear uma opção não quebra a condição nem os chamados abertos.

Alternativa recusada: uma tabela por campo. O formulário é lido e gravado inteiro, sempre com o tipo, e a cópia de cada chamado também seria várias tabelas. O JSON com o esquema dá a mesma conferência com uma leitura só.

O domínio tem as funções puras:
- `conferirFormulario`: a gravação do tipo, com o limite de 20 campos, as opções, a ordem das condições e o campo do título;
- `camposVisiveis`: com as respostas, aplica as condições, com o "e" antes do "ou". A condição só vê os campos visíveis: a resposta guardada de um campo escondido não mostra o que depende dele;
- `responder`: o formulário que se preenche;
- `conferirRespostas`: a abertura;
- `tituloDasRespostas(formulario, respostas, contexto)`: o título;
- `resumoDasRespostas(formulario, respostas, contexto)`: a linha da conversa.

O contexto do título e do resumo traz o nome do tipo e, pelo id, o patrimônio e o nome dos ativos e o nome dos locais e das pessoas. A API os lê na abertura, para o título, e na leitura do chamado, para o resumo (decisão 8). A web os tem nos campos, na prévia e na gaveta. A resposta que o contexto não traz fica de fora, como a que não foi dada; como a falta não dá erro, os testes de integração da abertura e da leitura conferem o resumo com o ativo, o local e a pessoa. Os dois usam só os campos visíveis que a pessoa vê, e leem também o formulário que se preenche, na prévia: o que não está no tipo do campo fica de fora.

A prévia da web, a gaveta da abertura e a API usam as mesmas.

### 3. O relógio guardado e o prazo calculado

**O prazo em minutos, na abertura.** O chamado copia o prazo do tipo já em minutos (`prazoEmMinutos(tipo, horario)`):
- a hora vale 60 min;
- o dia vale 24 h em horas corridas e, no horário da TI, o comprimento da janela do horário de agora (`fim - inicio`).

A cópia guarda também o valor e a unidade do tipo, só para o texto ("Prazo do tipo, 3 dias úteis, no horário da TI"), no `prazo` jsonb: `{ modo, respostaMin, resolucaoMin, resposta: { valor, unidade }, resolucao: { valor, unidade } }`. Assim, mudar o horário depois não muda o prazo dos chamados abertos: 3 dias úteis de 10 h continuam 30 h com um horário de 9 h. O `minutosDoPrazo(valor, modo, horario)` converte um prazo só, e a conferência do tipo o usa para a resposta que passa da resolução.

**O horário da TI.** O domínio tem o `HORARIO_DA_TI_PADRAO`, que vale enquanto a organização não grava o dela, e o `conferirHorario(pedido)`, com as recusas da spec e os dias sem repetir e em ordem, de segunda (1) a domingo (7). A rota recebe o início e o fim em minutos do dia, como o banco os guarda, e o esquema dela confere o formato: os dias de 1 a 7, entregues no tipo `DiaDaSemana` (`z.literal([1, 2, 3, 4, 5, 6, 7])`), e os minutos inteiros de 0 a 1.439. O domínio não tira o dia fora do formato, para o esquema frouxo aparecer no compilador e, por último, no CHECK do banco. A tela converte a hora do campo.

**O relógio.** O chamado guarda:
- `contado_s`: os segundos contados até a última parada, inteiros, arredondados para baixo a cada fechamento. O segundo, e não o minuto, para cada parada e retomada não perder até um minuto;
- `relogio_desde`: o instante em que o relógio voltou a contar, ou nulo, parado.

O domínio calcula, no `packages/domain/src/chamados/prazo.ts` e, a situação, no `situacao-do-prazo.ts`:
- **`segundosNoHorario(de, ate, modo, horario)`:** em horas corridas, a diferença. No horário da TI, a soma das sobreposições com as janelas de cada dia, no fuso do horário. O dia e a hora locais saem do `Intl.DateTimeFormat` com o `timeZone`, pelo `fuso.ts` do domínio, que o `software/quando.ts` também usa, e valem também com o horário de verão. As janelas ficam guardadas por fuso, dia e horas, porque a lista dos prazos calcula as mesmas para centenas de chamados;
- **`momentoEmQueAlcanca(desde, segundosQueFaltam, modo, horario)`:** anda pelas janelas até completar o tempo. O tempo que acaba no fim de uma janela vence no fim dela, e não no começo da seguinte. Como ela roda na API e na tarefa de cada minuto, um laço preso pararia o processo inteiro. Por isso, recusa com um `RangeError` o tempo que não é de um prazo (sem número, infinito ou maior que 999 dias de 24 h, o maior prazo do tipo) e o horário sem dia ou sem janela. E anda dia a dia só no primeiro ano, 53 semanas: depois dele, pula de uma vez as semanas inteiras, cada uma com a janela do horário em cada dia dele, e anda dia a dia só a última. As semanas puladas não contam o horário de verão: o vencimento que passa de um ano pode sair com uma hora a mais ou a menos por troca, quando a janela cobre a hora da troca, e o de dentro do primeiro ano sai exato. O ano conta do `relogioDesde`, e não de agora: no chamado que conta há mais de um ano sem parar, essa hora de diferença fica também perto do vencimento, e o texto dele pode discordar do que resta, que o `segundosNoHorario` anda dia a dia e sai exato. Assim, nenhum vencimento anda mais que um ano e algumas semanas, nem o prazo de 999 dias copiado de um horário de dia inteiro com o horário trocado depois para uma janela de 1 minuto, que andava 2 milhões de dias e levava 42 s por chamado (revisão da 4.10). A última semana ainda tem um teto, de 3 semanas, que um horário conferido nunca alcança;
- **`situacaoDoPrazo(relogio, horario, agora, fuso)`,** no `situacao-do-prazo.ts`, com o relógio guardado do chamado (o `prazo`, o `contadoS`, o `relogioDesde` e o `primeiraRespostaEm`) e o fuso da conta que olha:
  - o contado, o prazo da resolução e o que resta, em segundos do relógio: as barras dos prazos usam esses, e o quadro do parado diz "restam 1 h 44 min" ou, com o que resta negativo, "passou 20 min do prazo";
  - o vencimento, o momento em que o contado alcança o prazo da resolução (`momentoEmQueAlcanca` desde o `relogioDesde`, com o que restava nele), ou nulo, com o relógio parado. O chamado que volta a contar já depois do prazo, reaberto ou retomado, vence nessa volta: o tempo parado não conta como estouro. A mudança do horário, que fecha os relógios, faz o mesmo com os estourados que contam no horário: o "estourado há" recomeça dela, sem um aviso novo, porque a marca do estouro só se limpa na reabertura;
  - o texto curto ("vence em 2 h", "estourado há 20 min" e "relógio parado"), arredondado para baixo: os dias inteiros a partir de 48 h, as horas inteiras de 1 h a 48 h, os minutos inteiros de 1 min a 1 h e "menos de 1 min" abaixo dele. Os dias vêm porque, no relógio comum, a sexta à tarde chega a 63 h até a segunda, e o chamado esquecido, a centenas de horas. A distância é a do relógio comum, entre agora e o vencimento, como no "venceu às 09:20" do painel dos prazos e nos grupos: no horário da TI, o chamado com 1 h restante às 17:30 "vence em 15 h" e fica em "Vence depois de hoje", em vez de dizer "vence em 1 h" num grupo do dia seguinte. O estouro começa no vencimento;
  - o grupo: estourado; até 2 h, com o vencimento até agora mais 2 h; hoje, no dia de agora; depois de hoje; ou parado. O dia sai no fuso da conta que olha, como o "até as 11:40" da tela;
  - a primeira resposta pendente: o momento em que o contado alcança o prazo dela e se ele já passou ("Responder até 08:30" ou "Resposta atrasada desde 08:30"). Com o relógio parado, ela já foi dada, porque esperar a resposta e resolver mandam mensagem à pessoa;
- **`compararPrazos(a, b)`:** a ordem da lista dos prazos e das colunas do quadro: pelo vencimento, com os estourados à frente, e os parados por último, pelo que resta. O empate fica com quem ordena, como pelo número.

A API manda o relógio guardado, o prazo copiado e o horário da TI. A web recalcula a cada minuto pela mesma função, sem pedir de novo ao servidor, como a idade das leituras. A lista dos prazos ordena no servidor pela mesma função: com as centenas de chamados em aberto de uma organização, a conta em memória custa menos que uma consulta com as janelas em SQL.

**A mudança do horário.** Ela fecha, na mesma transação, os relógios que estão contando no horário da TI: `contado_s += segundosNoHorario(relogio_desde, agora, horario antigo)` e `relogio_desde = agora`. Os de horas corridas não mudam. Assim, o tempo já contado não muda com o horário novo. O fechamento não sobe a `versao` (decisão 4).

Por isso, só a trava da linha separa o fechamento de uma ação que mexe no relógio ao mesmo tempo, como esperar ou resolver. O fechamento pega a trava do horário e trava os chamados que vai fechar (`FOR UPDATE`), relidos num comando à parte, e cada ação trava o chamado antes de ler o horário. Assim, uma espera pela outra, e o tempo não é contado duas vezes nem com o horário errado. A trava do horário é a transacional `horario-da-ti` (`apps/api/src/travas.ts`), e não a da linha, porque a organização que nunca gravou o horário não tem a linha: com ela, a segunda de duas trocas juntas lê o horário que a primeira deixou. Só a carga cheia não mexe nos relógios, e a troca que muda só ela não fecha nenhum. Como ele muda os relógios guardados, a web relê os chamados ao receber o `ajustes-dos-chamados.mudaram` (decisão 13).

Alternativa recusada: guardar o vencimento. Ele muda com o horário da TI e para com o relógio, e teria de ser recalculado a cada mudança. O relógio guardado é o que não muda.

### 4. A situação e as ações no domínio, com a versão

`packages/domain/src/chamados/acoes.ts` decide cada ação pela tabela da spec (chamados, requisito "Ações do atendimento"): assumir, passar, devolver, enviar a mensagem, enviar e esperar a resposta, a nota, retomar, resolver e reabrir. Ele recebe o chamado, quem age e o alcance dela e devolve a mudança, com o efeito no relógio e os eventos da conversa, ou a recusa com a frase da spec. A rota só aplica.

A tabela é uma matriz no código, situação × ação, e os testes da 2.7 e da 2.8 a percorrem célula a célula. O invariante do chamado aguardando, sempre com alguém atendendo, sai dela: o "enviar e esperar" na triagem passa o chamado a quem enviou, e o devolver do aguardando é recusado.

A `versao` sobe só nas ações que mudam a situação ou quem atende (assumir, desfazer, passar, devolver, enviar e esperar, fora no chamado que já aguarda, retomar, resolver e reabrir) e na troca do ativo, que muda quem pode atender. A mensagem sem esperar, o "enviar e esperar" no chamado que já aguarda, a nota, o título, os campos da TI e o fechamento dos relógios pela mudança do horário não a sobem. Assim:
- assumir devolve a versão nova;
- o "Desfazer" manda só a versão. A rota lê o estado de antes do evento `assumiu` que ela gravou: quem estava é o `de`, e a situação de antes é a triagem, com o `de` nulo, e a de agora nos outros casos. Ele é recusado com 409 e "O chamado mudou depois. Confira antes de desfazer." quando a versão não bate ou quando o último evento que sobe a versão não é um `assumiu` de quem desfaz. Assim, o cliente não escolhe para quem o chamado volta, e o desfazer não vira um passar sem aviso, com um evento falso na conversa;
- a nota escrita entre o assumir e o desfazer não o impede;
- o assumir, o passar, o devolver, o retomar, o resolver e o reabrir usam a mesma conferência quando o cliente manda a versão, para duas pessoas da TI não agirem no mesmo chamado ao mesmo tempo sem saber. Os seis são botões do quadro, dos prazos e da ficha, que mostram a versão. Pela tela de antes, o resolver fecharia o chamado que outra pessoa acabou de assumir, e o retomar voltaria ao atendimento o que outra pessoa acabou de passar, sem que quem age soubesse (tarefa 4.14). A mensagem, o "Enviar e esperar" e a nota não levam a versão: pela tela de antes, elas no máximo acrescentam a mensagem ou param o relógio de um chamado que quem age atende (revisão da 4.13).

**As ações que mudam quem atende.** O `decidirAcao(chamado, quemAge, pedido)` decide assumir, passar e devolver pela `MATRIZ_DAS_ACOES`. Cada célula diz a situação de chegada, com quem o chamado fica (quem age, a conta escolhida ou ninguém) e o efeito no relógio (segue, para ou volta), ou a recusa da célula. A decisão é a mudança (a situação, quem atende, o relógio, se a versão sobe, se a ação cumpre a primeira resposta e a conversa, na ordem em que a rota a grava) ou a recusa, que o `mensagemDaRecusaDaAcao(numero, recusa)` escreve com a frase da spec:
- o chamado chega com o nome da pessoa e com os locais e as contas com o nome, para as frases. Elas usam o primeiro nome (`nomeCurto`, no `pessoas/pessoa.ts`), fora a pessoa anonimizada, que fica com o nome inteiro, com o código;
- quem age sem atender os locais recebe "Você não atende os chamados de <local>.", a frase da abertura. A conta escolhida que não atende os locais, ou está inativa, dá "<Nome> não atende os chamados de <local>.". O local é o primeiro do chamado fora do alcance; no chamado da organização inteira, a frase diz "os chamados da organização inteira";
- o `decidirDesfazer(chamado, quemAge, { versao, antes })`, com o estado de antes que a rota lê do `assumiu`, confere a versão que o assumir deixou, que o chamado continua com quem desfaz e que o estado de antes é um dos que o assumir deixa: a triagem sem ninguém, ou o atendimento e o aguardando com outra conta. Senão, recusa com "O chamado mudou depois. Confira antes de desfazer.". A conta de antes chega como está agora, e a que deixou de atender os locais recusa o desfazer. Como o assumir não mexe no relógio, o desfazer também não;
- os eventos são o `assumiu` (de quem estava), o `passou` (de quem e para quem), o `devolveu` (de quem) e o `desfez` (para quem o chamado volta, ou a triagem). Quem agiu é o autor do evento.

**As rotas das ações que mudam quem atende** (tarefa 4.12): `POST /chamados/:numero/assumir`, `/passar`, `/devolver` e `/desfazer`, com `chamados.atender`. O chamado que a conta não vê responde como inexistente (404), e o que ela vê e não atende recebe a recusa do domínio (409). Cada rota:
- trava o chamado (`for update`) e o lê para o domínio, com os locais pelo caminho (`arvore.caminho`), como a frase da abertura, a pessoa pelo nome e o `desde`: o `responsavel_desde` ou, na triagem, desde quando o chamado está nela. Esse é o último entre a abertura, o `devolveu`, o `reabriu` sem ninguém e o `desfez` sem ninguém, que guarda o `desde` de antes do assumir;
- confere a versão pelo domínio, antes de tudo, quando a tela a manda. Ela é opcional no assumir, no passar e no devolver, e obrigatória no desfazer. A versão que não bate dá "O chamado #1042 mudou. Confira antes de assumir." (o `motivo: 'versao'`, com a ação): a tela que olha o chamado de antes confere antes de qualquer outra recusa;
- no desfazer, lê o estado de antes do último evento que sobe a versão: o `assumiu` de quem desfaz, com o `de` e o `desde` legíveis. Senão, a recusa "mudou", como a versão que não bate;
- grava o chamado (a situação, quem atende, o `responsavel_desde` e a versão mais 1), a conversa na ordem, a auditoria e o `chamados.mudaram`, pela saída da auditoria. O `assumiu` guarda `{ de, desde }`, e o `desfez`, `{ para, desde }`, com o `desde` do `assumiu` que ele desfaz: o `responsavel_desde` volta ao de antes, e a triagem volta a contar de quando o chamado caiu nela;
- registra na auditoria `chamado.assumido`, `chamado.passado`, `chamado.devolvido` e `chamado.assumir-desfeito`, com a situação e quem atende, pelo nome, antes e depois;
- notifica pelo domínio: o passar avisa a conta escolhida, fora quem passa a si mesmo; o devolver avisa quem atende os locais, fora quem devolveu; o assumir e o desfazer não avisam ninguém (spec chamados, "Notificações dos chamados");
- responde com o número, a versão, a situação e quem atende, com o nome. A versão do assumir é a que o "Desfazer" do aviso manda.

O 409 da versão e o "mudou" do desfazer levam o `type` próprio `urn:grafite:problema:chamado-mudou`, como o `propria-conta`: a tela relê o chamado, o quadro e os prazos nele, porque o que ela mostra é velho. As outras recusas são o `conflito` da abertura. A versão vai também em cada chamado da lista dos prazos e, no quadro, pelo número de cada chamado aberto (o `versoes`), de onde a tela assume, passa e devolve. A ficha lê o `desde` do `assumiu`.

**As ações da conversa e do fim.** A mensagem, a espera, a nota, retomar, resolver e reabrir entram na mesma matriz, em que o chamado também fica com a mesma conta ou com quem resolveu. Como o `para` do passar, o que só uma ação usa vem no pedido, e as outras rotas não leem o formulário:
- a `conversa` da mudança traz, na ordem, a mensagem ou a nota, com o texto sem os espaços das pontas, e os eventos. No "Enviar e esperar" da triagem, o `assumiu`, a mensagem e o `aguardando`; no resolver, a mensagem do "O que foi feito" e o `resolveu`. Com o mesmo `criada_em` na transação, a ordem é a do id (uuidv7), que a rota grava em sequência;
- a versão sobe, e o evento entra, só quando a situação ou quem atende muda. O "Enviar e esperar" no chamado que já aguarda vale como a mensagem: sem evento, e o "Parou às" do quadro do prazo continua o da espera, que a leitura tira do evento;
- o `cumpreAPrimeiraResposta` diz se a ação cumpre a primeira resposta: a mensagem, a espera e o resolver, que escrevem à pessoa, com a primeira resposta ainda pendente. A nota não. A rota grava o `primeira_resposta_em` com ele;
- os textos são contados em caracteres, como os dos campos, com os tetos do `LIMITES_DA_CONVERSA`: 4.000 na mensagem e na nota, 2.000 no "O que foi feito" e 5 anexos, que o contador da tela também usa. O esquema da rota confere só o formato, o texto e os anexos como ids (UUID): os tetos e as frases são do domínio, que conta os caracteres, e a rota leva a recusa ao campo. O pedido traz o número de anexos; quais são e se são aceitos, a rota confere (decisão 10);
- o resolver recebe a cópia do formulário e as respostas e recusa o primeiro campo só da TI obrigatório, vazio e mostrado pela condição (`camposVisiveis`), na ordem do formulário, pelo nome no resumo (o `nomeNoResumo`, que o `titulo-e-resumo.ts` exporta). As recusas vêm nesta ordem: quem age, a célula, o campo e o texto. O campo vazio pede outra coisa antes de resolver, e o texto se corrige no mesmo quadro;
- o resolvido da triagem fica sem ninguém, e o do atendimento ou do aguardando guarda quem atendia. A rota grava quem resolveu e quando, e o reabrir os limpa com a marca do estouro, como os CHECKs da resolução pedem;
- o reabrir recebe quem resolveu como a conta está agora. Ativa e com os locais, o chamado volta a ela; senão, à triagem, e o `reabriu` diz para quem;
- o `relogioDepois({ modo, contadoS, relogioDesde }, efeito, agora, horario)` dá o relógio guardado depois da ação. O modo é o do prazo guardado, pelo `modoDoPrazoGuardado`: o `modo` do jsonb, como a troca do horário o lê, ou horas corridas, quando nem ele se lê. O chamado de prazo estragado aparece sem relógio (4.10), e a ação não fica presa a ele. Parar soma o `segundosNoHorario` desde o `relogioDesde` e o zera; voltar o põe em agora; seguir não muda nada. Parar o relógio parado e voltar o que conta são erros do programa: a matriz só para o relógio na triagem e no atendimento, em que o CHECK o quer contando, e só o volta no aguardando e no resolvido, em que ele está parado.

**O gravador das ações e as rotas da conversa** (tarefa 4.13). As ações gravam por um lugar só, o `agirNoChamado` (`apps/api/src/chamados/acoes.ts`), que as quatro da 4.12 também usam e as da 4.14 vão usar:
- trava o chamado e lê os eventos da conversa para o `desde`; decide pelo domínio; e, só quando a ação para ou volta o relógio, lê o horário da TI, depois da trava (decisão 3);
- grava o chamado: a situação, quem atende, o `responsavel_desde`, o relógio pelo `relogioDepois`, o `primeira_resposta_em` pelo `cumpreAPrimeiraResposta` e a versão mais 1, só quando ela sobe;
- grava a conversa na ordem da mudança, uma linha por vez, com o id do banco (`uuidv7()`), e toma os anexos para a mensagem ou a nota (`tomarAnexos`, decisão 10);
- registra na auditoria só as ações que mudam a situação ou quem atende, com o `chamados.mudaram` pela saída dela. A mensagem, a nota e o "Enviar e esperar" que vale como a mensagem não vão para a auditoria (spec), e o `chamados.mudaram` delas sai pelo `registrarEvento`;
- notifica pelo `notificacoesDaAcao`, que não avisa ninguém da mensagem, da espera nem da nota.

As rotas da conversa são o `POST /chamados/:numero/mensagem`, `/esperar` e `/nota`, com `chamados.atender` e o pedido `{ texto, anexos }`, com os anexos opcionais. O texto que falta vale como o vazio, para a recusa ter a frase da ação ("Escreva a nota."), e o id de anexo fora do formato UUID, conferido no esquema pelo `z.uuid()` na lista inteira, é o anexo que não se acha, no campo `anexos`, e não no `anexos.0`. As recusas do texto e dos anexos ("Escreva a mensagem.", "Use até 4.000 caracteres.", "Anexe até 5 arquivos." e a do anexo que não se toma) são o 400 `dados-invalidos`, no campo `texto` ou `anexos`, como as do formulário; as de quem age e da célula, o 409 `conflito`. O "Enviar e esperar" que para o relógio é o `chamado.aguardando` na auditoria, com a situação e quem atende antes e depois; na triagem, o assumir vai no mesmo registro. A resposta é a das ações da 4.12: o número, a versão, a situação e quem atende.

**As rotas do fim e da volta** (tarefa 4.14): `POST /chamados/:numero/retomar`, `/resolver` e `/reabrir`, com `chamados.atender`, pelo `agirNoChamado`. O retomar e o reabrir levam o pedido do assumir, `{ versao }`, e o resolver leva `{ feito, versao }`, com a versão opcional nas três:
- só o resolver lê o formulário: a cópia guardada no chamado e as respostas, numa leitura própria, depois da trava. A recusa do campo só da TI ("Preencha Contador de páginas antes de resolver.") é o 409 `conflito`, como as da célula, porque o campo se preenche na ficha, e não no quadro do resolver. O "O que foi feito" que falta vale como o vazio, como o texto da conversa, e as recusas dele ("Escreva o que foi feito." e "Use até 2.000 caracteres.") são o 400 no campo `feito`;
- quem resolveu é quem age, e não quem atende. O resolver grava o `resolvido_em` e o `resolvido_por`, que o quadro usa nos resolvidos de hoje de cada pessoa. O reabrir os limpa, com o `estouro_avisado_em`, para o chamado reaberto que passar do prazo ser avisado de novo (decisão 12). A resolução segue a situação, como o CHECK `chamados_resolucao_coerente` pede: o gravador a grava no chamado que chega a Resolvido e a limpa no que sai dele;
- o reabrir lê quem resolveu (`resolvido_por`) como a conta está agora, pelo `lerContaQueAtende`. O domínio recebe a conta ou nulo: o chamado que não está resolvido não tem quem resolveu e leva a recusa da célula antes, e o resolvido sem a conta, que a chave estrangeira não deixa acontecer, vai à triagem, como o de quem não atende mais;
- o reaberto conta de agora com quem o recebe, mesmo quando é a conta que já estava com o resolvido. O `responsavel_desde` do resolvido é de antes da resolução, e o "estava há 2 h com Ana" do próximo assumir mediria também o tempo resolvido. O `desdeDeQuemAtende` trata o `reabriu` como uma chegada, e o reaberto na triagem conta do `reabriu` (`desdeNaTriagem`);
- o `primeira_resposta_em` não muda no resolver. O chamado aberto pela TI nasce com ele (CHECK `chamados_abertura_coerente`), e o "O que foi feito" só o cumpre no chamado que ainda o espera, o que a pessoa abre pela aba e pelo chat;
- registra na auditoria o `chamado.retomado`, o `chamado.resolvido` e o `chamado.reaberto`, com a situação e quem atende, pelo nome, antes e depois, e o `chamados.mudaram` pela saída dela;
- notifica pelo domínio. O reabrir que devolve o chamado a quem o resolveu avisa essa conta com o "Chamado #1035 com você", fora quando é ela que reabre, como o passar. O que o deixa na triagem avisa quem atende os locais, fora quem reabriu, como o devolver. O retomar e o resolver não avisam ninguém: quem atende não muda, e nada cai na triagem.

**O ativo, o título e os campos da TI** (tarefa 4.15): três rotas com `chamados.atender`, fora do `agirNoChamado`, porque não mudam a situação nem quem atende. Cada uma trava o chamado (`for update`) e responde com o chamado depois, como as ações (`ChamadoDepoisDaAcao`):
- `PUT /chamados/:numero/ativo`, com `{ ativo, versao }`: o id do ativo, ou nulo, para tirar, e a versão opcional, como nas ações dos botões, porque a troca sobe a versão. O ativo é conferido antes da decisão, como na abertura, e as recusas vão no campo `ativo` (400): o que quem age não vê (`ativos.ver` no local dele) é "Ativo não encontrado.", e o inativo tem a recusa do cadastro. Os tipos aceitos do campo Ativo não valem aqui: o ativo ligado é do chamado, e não da resposta. A decisão é do domínio (`decidirTrocaDoAtivo`), na ordem das ações: a versão, quem age nos locais de agora, o chamado resolvido, o mesmo ativo, quem age nos locais novos e quem atende nos locais novos, como a conta está agora, com "<Nome> não atende os chamados de <local>. Passe o chamado antes de trocar o ativo.". A conta inativa de quem atende também recebe essa recusa: o chamado precisa ser passado antes. Os locais novos são o local de trabalho da pessoa na abertura e o do ativo novo, pela regra da abertura: o `locaisDaTroca` chama o `locaisDaSolicitacao` com os ids e devolve os nomes dos dois locais que já tem. A troca sobe a versão, grava o evento `ativo` com os ids do ativo de antes e do de depois (`{ antes, depois }`, ou nulo) e registra o `chamado.ativo-trocado`, com o ativo antes e depois, pelo rótulo e o patrimônio. O `chamados.mudaram` vai aos locais de antes e aos de depois;
- `PUT /chamados/:numero/titulo`, com `{ titulo }`: o `conferirTituloDoChamado` da abertura, com as recusas no campo `titulo`, e o `chamado.titulo-trocado`, com o título antes e depois;
- `PATCH /chamados/:numero/campos`, com `{ respostas }`: só as chaves que mudam, com o vazio ou o nulo para apagar. O domínio (`mudarCamposDaTi`) junta as respostas novas às guardadas e confere tudo pelo `conferirRespostas`, com a cópia do formulário do chamado. A chave que não é um campo só da TI recebe a recusa geral, porque a tela não a monta, e as recusas de cada campo vão na chave dele. O campo que some pela condição perde a resposta, como na abertura. O ativo, o local e a pessoa a API confere como na abertura, só nos campos que mudaram: o ativo da resposta da pessoa que ficou inativo depois não recusa a mudança de outro campo. O anexo novo é tomado pelo campo (`tomarAnexos`), e o que sai do campo (trocado, tirado ou do campo que sumiu) ganha o `removido_em` na mesma transação, sem volta pela tela. Como a tela grava a escolha na hora (tarefa 5.14), um clique errado num Sim ou não só da TI apagaria o anexo do campo que depende dele. Por isso, a tela pede a confirmação antes de gravar a mudança que esconde um campo com anexo, com o nome do campo e quantos arquivos saem (o m04 não mostra o caso; tarefa 5.14). A rota registra o `chamado.campos-trocados`, com cada campo que mudou, pelo nome no resumo, antes e depois, como o resumo mostra a resposta;
- quem age precisa atender os locais do chamado, e o resolvido é recusado com "O chamado #1042 está resolvido.", nessa ordem, as duas no 409 (`recusaDaEdicao`, do domínio). Nas três, essas recusas vêm antes das do campo, fora a do ativo, que é lido antes;
- o mesmo ativo, o mesmo título e as mesmas respostas não mudam nada: a rota responde o chamado como está, sem a auditoria, o evento e a versão. Assim, a tela que grava o campo sem conferir não precisa saber se ele mudou;
- só a troca do ativo sobe a versão e vai à conversa. O título e os campos da TI ficam na auditoria, e o `chamados.mudaram` atualiza as telas;
- nenhuma das três notifica: quem atende não muda, e nada cai na triagem.

**O ativo ligado e as respostas.** O ativo ligado nasce da resposta do primeiro campo Ativo e depois só muda pela troca do ativo. As respostas guardam o que foi dito na abertura, que o resumo mostra, e a conversa guarda as trocas. Por isso, a troca não muda a resposta, e a resposta de um campo Ativo só da TI, preenchida depois, não liga o ativo: quem atende o liga pela troca.

**O local da pessoa na abertura.** A troca do ativo refaz os locais com o local de trabalho da pessoa na abertura, e não com o de agora: o chamado não acompanha a pessoa que mudou de local depois. O chamado o guarda na coluna `local_da_pessoa`, com a chave estrangeira `chamados_local_da_pessoa_fk` (migration 0064). Os chamados que já existiam ficam com o local de agora da pessoa, o único que se conhece. O nulo é a pessoa sem local, que deixa o chamado sem local, como na abertura.

**A ficha lê o evento do ativo** com o ativo de antes e o de depois, pelo rótulo e o patrimônio de agora, a toda conta que vê o chamado, como o ativo ligado: o campo `ativo` do evento, nulo nos outros. Os dados do evento não usam o `de` e o `para`, que a ficha lê como contas. O `ativo` entra no `EVENTOS_QUE_SOBEM_A_VERSAO`: o desfazer depois da troca é recusado, porque o último evento que sobe a versão não é o assumir.

O atendimento na abertura (`decidirAtendimento`) também é do domínio. Ele recebe:
- o "Fica comigo";
- o tipo;
- quem atende por padrão, com o alcance;
- o horário da TI;
- o momento.

### 5. Os locais e o alcance

Como nas solicitações, com `locais uuid[]` e `sem_local`:
- o local de trabalho da pessoa na abertura, guardado no `local_da_pessoa`;
- o local do ativo, recalculado quando o ativo muda;
- `sem_local` quando um dos dois falta.

As consultas usam os helpers de alcance das solicitações:
- ver: algum local no alcance;
- atender: todos no alcance;
- sem local: a organização inteira.

O público dos eventos é o `publicoDoChamado`, igual ao `publicoDaOrdem`, com os locais de antes e os de depois.

**A pessoa no chamado.** A leitura manda o nome e o local de trabalho da pessoa a toda conta que vê o chamado, porque o pedido é dela. Os contatos e o atalho da ficha vão só a quem tem `pessoas.ver` no local da pessoa, como a pessoa da máquina no software (spec distribuicao-de-software, "Pessoa da máquina"). A pessoa anonimizada vai com o nome anonimizado do cadastro dela, que já tem o código, e sem os contatos.

**O ativo no chamado.** A leitura manda o rótulo, o patrimônio e o caminho do local do ativo ligado a toda conta que vê o chamado, como a pessoa: os locais do chamado já têm o do ativo. O atalho da ficha do ativo aparece só a quem tem `ativos.ver` no local dele, e os alertas, só a quem tem `alertas.ver` (decisão 9).

O resumo da seção "Ativo ligado" (spec modulo-chamados, "Chamado aberto") também vai pela ficha do chamado a quem o vê, e não pelas rotas dos Ativos, que pedem `ativos.ver`. Assim, quem atende sem `ativos.ver`, como o Diego, vê o toner da impressora do chamado que atende: a spec só põe condição no saldo e na solicitação. O resumo vai com o Ativos ligado (tarefa 4.25) e tem:
- a situação em texto: a disponibilidade, como "Online há 12 dias", e o pior suprimento, como "Toner crítico";
- os suprimentos, cada um com o nome, o nível e a situação;
- o total de páginas e, quando as leituras do contador a dão, a média por mês;
- as OS do ativo no ano, como "2 concluídas, nenhuma aberta" (m04), só a quem tem `ordens.ver` no local dele;
- o saldo do toner compatível, só a quem tem `estoque.ver`, e a solicitação pendente da impressora, só a quem a vê com `solicitacoes.ver`, como "CF258A: 3 de 6, abaixo do mínimo; a solicitação 4 está Aberta".

Os valores coletados saem das mesmas leituras da lista dos ativos (`disponibilidadeDosAtivos`, `suprimentosDosAtivos` e `lerContador`). O que é restrito, como o IP no motivo da disponibilidade, vai só a quem tem `ativos.restritos` no local do ativo. As OS, o saldo e a solicitação vão, com o Operação desligado, como a quem não os vê.

**O resumo na ficha (tarefa 4.25).** O resumo vai no `ativo.resumo` da ficha do chamado (`apps/api/src/chamados/resumo-do-ativo.ts`), nulo com o Ativos desligado. Decisões que o plano não fechava:
- **Os dados, e não o texto.** A disponibilidade e os suprimentos vão nos mesmos esquemas da ficha do ativo (`DisponibilidadeDoAtivo` e `SuprimentosDoAtivo`), com o pior suprimento no `menor` e o total de páginas no `total`. A tela (5.13) escreve o "Online há 12 dias" como a tela dos ativos escreve a idade da leitura, e o "8% · Black Toner" do suprimento como a lista dos ativos. Cada um é nulo onde a ficha do ativo o deixa nulo: no ativo inativo e no tipo sem a capacidade.
- **O "Toner crítico" vem do alerta.** O selo não tem um limiar próprio: o limite do toner já é um ajuste da organização, a regra de fábrica "Toner em 10% ou menos", com as exceções por tipo, modelo, ativo e local, e um limiar fixo na tela discordaria da organização que mudou a regra. O resumo leva o `tonerCritico`: verdadeiro quando o ativo tem um alerta aberto de uma regra do toner (`toner.nivel`) na severidade Crítico, a mesma do selo, e falso sem ele. O alerta ainda pendente na duração, o resolvido e o de outra condição não fazem o selo, e o do toner na Atenção também não, porque o selo diz "crítico". A quem não vê os alertas no local do ativo, ou com o Alertas desligado, vai nulo, e a tela não mostra o selo, como a ficha do chamado faz com os alertas da conversa. É o que o m04 desenha: o selo ao lado do alerta de 09:36 do toner preto abaixo de 10%.
- **A média de páginas por mês** é do domínio (`paginasPorMes`), entre a leitura de agora do contador (`lerContador`) e a mais antiga dos agregados por hora dos últimos 90 dias, do mesmo item do contador: o último valor válido daquela hora, com o momento dele. Ela pede pelo menos 7 dias entre as duas, para uma leitura de ontem não virar uma média; o contador que diminuiu, como na troca da placa, não dá média; o mês tem 30 dias; e a média é arredondada. Os 90 dias mostram o uso de agora, e não o de um ano atrás. Os 7 dias e os 90 ficam no domínio, ao lado do `paginasPorMes` (`DIAS_DA_MEDIA_DE_PAGINAS` e `JANELA_DA_MEDIA_DE_PAGINAS`).
- **As OS** são duas contagens do ativo, a quem tem `ordens.ver` no local dele: as em aberto agora, de qualquer ano, porque a OS aberta em dezembro ainda pede atenção em janeiro; e as concluídas no ano, as resolvidas e as encerradas, pela resolução ou, sem ela, pelo encerramento, desde o 1º de janeiro no fuso do horário da TI (`comecoDoAno`). Elas contam também as OS de um local de antes do ativo: só o número sai.
- **Os consumíveis compatíveis** são todos os do modelo, como no cartão da ficha do ativo, na ordem do domínio, cada um com o saldo e o mínimo somados nos locais em que a conta vê o estoque. A tela escolhe o que mostra, como "CF258A: 3 de 6, abaixo do mínimo". O `abaixo` vem de cada local, e não da soma: é verdadeiro quando algum local do alcance está abaixo do mínimo, como as telas do estoque o marcam (o `abaixo_desde` do saldo, o mínimo acima de 0 e o saldo abaixo dele). A soma deixaria passar a Recepção com 0 de 2 ao lado do Administrativo com 10 de 2. O tipo sem a capacidade dos compatíveis fica nulo, e o ativo sem modelo, com a lista vazia, como na ficha do ativo.
- **A solicitação pendente** é a que o "Pedir toner" juntaria (`pendenteDa`): a de Toner pendente com a impressora, de menor número, com o número e a situação, a quem a vê. Se a conta não vê essa, nada vem, mesmo que veja outra pendente: o "Pedir toner" se juntaria àquela.

### 6. Os tipos de fábrica, numa lista só

`TIPOS_DE_CHAMADO_DE_FABRICA` (domínio) traz os 9 tipos com o formulário de cada um. O `organizacao criar` os grava na mesma transação, com uma `tipo-de-chamado.criado` por tipo na auditoria. A migration os grava nas organizações que já existem, como a `0057_categorias_de_software`. O texto da migration sai de um gerador conferido por um teste contra a lista do domínio, para os dois não se afastarem:
- **O gerador** é o `sqlDosTiposDeFabrica`, no `apps/api/src/chamados/fabrica.ts`, com as tabelas e as colunas tiradas do schema. Ele fica na API porque o `@grafite/db` não depende do domínio. O `linhasDosTiposDeFabrica`, ao lado, dá as mesmas linhas ao `organizacao criar`.
- **A `0062_tipos_de_chamado_de_fabrica`** é o texto dele, e o teste ao lado do gerador a confere. Depois de solta numa versão, a 0062 não muda. Quando a lista mudar, o teste da igualdade e o `sqlDosTiposDeFabrica` saem, e a change que mudar a lista decide se as organizações que já existem recebem algo, numa migration nova: uma versão nova não recria os tipos de fábrica (spec tipos-de-chamado).
- **O teste da migration**, no `@grafite/db`, roda a 0062 sobre duas organizações de antes e confere os tipos gravados com os valores da spec. Ele segue cobrindo a 0062 depois que o teste da igualdade sair.

Os formulários de fábrica:

| Tipo | Campos (os só da TI marcados) | Título |
|---|---|---|
| Toner | Qual impressora? (Ativo, obrigatório); Qual cor acabou? (Escolha única: Preto, Ciano, Magenta e Amarelo, obrigatório) | "Toner preto" |
| Computador | Qual computador? (Ativo, obrigatório); O que está acontecendo? (Escolha única, obrigatório: Não liga, Está lento, Está travando, Com a tela preta, Sem som, Com o teclado ou o mouse falhando, Sem rede e Com outro problema); Quer contar mais? (Texto longo) | "Computador não liga" |
| Impressora | o da spec, com o Contador de páginas e o Contrato de manutenção só da TI | "Impressora manchando" |
| Acesso e senha | O que você precisa? (Escolha única, obrigatório: Esqueci a senha, Minha conta bloqueou e Acesso a pasta ou sistema); Qual pasta ou sistema? (Texto curto, obrigatório, só com o acesso); Por que você precisa? (Texto longo, só com o acesso) | "Esqueci a senha", sem o nome do tipo |
| Software | O que você precisa? (Escolha única, obrigatório: Instalar um programa e Um programa está com erro); Qual programa? (Texto curto, obrigatório); Quer contar mais? (Texto longo) | "Software 7-Zip" |
| Rede e internet | O que está acontecendo? (Escolha única, obrigatório: Sem internet, Internet lenta, Wi-Fi não conecta e A conexão cai toda hora); Onde você está? (Local, obrigatório); Quer contar mais? (Texto longo) | "Internet lenta", sem o nome do tipo |
| Telefone | Qual telefone? (Escolha única, obrigatório: Ramal da mesa e Celular da empresa); O que está acontecendo? (Escolha única, obrigatório: Sem tom, Com chiado, Não toca e Não liga) | "Telefone sem tom" |
| Outro | Conte o que aconteceu (Texto longo, obrigatório); Onde você está? (Local); Uma foto ajuda (Anexo) | o relato, cortado em 120 caracteres |
| Troca de equipamento | Qual equipamento? (Ativo, obrigatório); Por quê? (Texto longo, obrigatório) | "Troca de equipamento NB-0231" |

Nos formulários de fábrica:
- **Os ids** dos campos e das opções são fixos e legíveis, como `problema` e `nao-liga`. A migration e o `organizacao criar` os gravam iguais em toda organização.
- **O nome no resumo** é curto, no molde do m04 ("Problema: Manchando, na borda · Ativo: PAT-00139"):
  - "Ativo" nos campos Ativo;
  - "Problema" no "O que está acontecendo?";
  - "Detalhes" no "Quer contar mais?";
  - "Local" no "Onde você está?";
  - "Foto" no "Uma foto ajuda";
  - "Pedido" no "O que você precisa?";
  - "Motivo" no "Por quê?";
  - "Cor", "Programa", "Telefone" e "Relato" nos outros.

  Os campos que só aparecem por uma condição vão depois da vírgula, no resumo, e os só da TI ficam fora dele. Os dois ficam com o rótulo.
- **Os campos Ativo** aceitam qualquer tipo de ativo, porque os tipos são de cada organização. A TI os restringe depois.
- **O título** sai do campo da coluna "Título": a cor, o problema, o pedido, o programa ou o equipamento. Ele começa pelo nome do tipo, fora o Acesso e senha, a Rede e internet e o Outro. O Outro não tem campo, e o título é o relato.

A 19 (a aba) é a dona das palavras que o colaborador vê. Ela pode trocar os formulários de fábrica por uma migration dela, só nas organizações em que a TI ainda não mudou o tipo. As peças próprias da aba ficam com ela:
- o diagnóstico da rede;
- o "Meu computador";
- os programas aprovados;
- quem aprova o acesso.

Os ícones dos tipos são uma lista fechada do domínio, mapeada para o lucide na web (`Icone`, traço 1,7):

| Ícone | Lucide | Série |
|---|---|---|
| gota | `Droplet` | 4 |
| notebook | `Laptop` | 1 |
| impressora | `Printer` | 2 |
| cadeado | `LockKeyhole` | 3 |
| janela | `AppWindow` | 5 |
| globo | `Globe` | 7 |
| telefone | `Phone` | 6 |
| reticências | `CircleEllipsis` | nenhuma: o texto secundário |
| setas | `ArrowLeftRight` | 8 |
| computador | `Monitor` | 1 |
| torre | `PcCase` | 8 |
| fone | `Headset` | 6 |
| chave | `KeyRound` | 3 |
| caixa | `Package` | 4 |
| câmera | `Camera` | 8 |
| wi-fi | `Wifi` | 7 |

Os mockups usam o Phosphor, mas o Grafite usa o lucide.

A série é a cor do ícone do tipo nas telas da TI (decisão 22). A dos ícones dos tipos de fábrica é a dos mockups (os `t-*` do `ch3.css`), com a torre do "Equipamento novo" do m08 na série da troca de equipamento. Os outros seguem o ícone de fábrica mais perto: o computador o notebook, o fone o telefone, a chave o cadeado, a caixa a gota dos suprimentos, a câmera os equipamentos e o wi-fi o globo da rede. A prévia do colaborador pinta o ícone na cor da aba (decisão 16).

**A conferência do tipo.** O `conferirTipoDeChamado` (`packages/domain/src/chamados/tipo.ts`) recebe o pedido, com o formato conferido pelo esquema da rota, e o que a API lê na transação da gravação:
- a situação em que a gravação deixa o tipo, porque só o Rascunho aceita a frase vazia; o "Criar o tipo" e o reativar a chamam com o tipo e a situação Em uso;
- o que o tipo gerava antes, para o "Gera uma Solicitação";
- quem atende por padrão, pela conta pedida, como ela está agora (`ContaQueAtendePorPadrao`, da decisão 7);
- os tipos de ativo ativos da organização;
- o formulário gravado, para o "Pede o ativo", pela mesma regra do `conferirFormulario` (`recusaDoPedeOAtivo`);
- o alcance de `solicitacoes.atender` de quem grava;
- o horário da TI, para comparar a resposta e a resolução em minutos, com o dia útil de agora.

Ele devolve o tipo limpo, com o `nome_normalizado` pelo `normalizarTexto`, ou as recusas por campo; na mesma chave, vale a primeira. O tipo de ativo fica nulo fora do Equipamento, como o banco pede. O nome repetido, quem acha é o `tipos_de_chamado_nome_unico`: a API troca a violação pela frase do domínio, no nome.

A gravação do tipo e a do formulário travam a linha do tipo (`for update`) antes de ler. Uma confere o "Pede o ativo" pelo formulário gravado, e a outra pelo `pede_o_ativo` gravado: sem a trava, as duas se cruzariam, e o tipo ficaria com a chave ligada sem o campo Ativo.

O `ligaASolicitacao(antes, depois)` diz se a gravação liga o "Gera uma Solicitação" ou o faz gerar outra: a outra solicitação ou, no Equipamento, outro tipo de ativo. O duplicar usa a mesma regra, com o antes nulo, para o Rascunho nascer com ele desligado (tarefa 4.2).

### 7. O atendimento padrão e o "fora do horário"

"Não houver ninguém" quer dizer:
- fora do horário da TI;
- ou quem atende por padrão não pode atender os locais;
- ou essa conta está inativa.

Com "Cai na triagem", o chamado vai à triagem. Com "Fica com <pessoa> mesmo assim", vai à pessoa fora do horário, e à triagem nos outros dois casos, porque a pessoa não pode atender. O LEIA dos mockups explica a triagem do #1038, do #1040 e do #1042 assim: os três abriram antes das 08:00.

**No domínio.** O `decidirAtendimento` (`packages/domain/src/chamados/atendimento.ts`) recebe quem abre com o "Fica comigo", a conta de quem atende por padrão (se está ativa e o alcance de `chamados.atender` dela), o "Se não houver ninguém", os locais do chamado, o horário da TI e o momento, e devolve a triagem ou quem atende. Quem abre com o "Fica comigo" chega conferido: a abertura recusa antes quem não atende os locais. A conta atende o chamado pelo `atendeOChamado`, que é o `atendeASolicitacao` (decisão 5). O horário é o `noHorarioDaTi`, do `prazo.ts`: num dia do horário, do início até antes do fim, no fuso dele; às 18:00 já é fora.

**Quem não atende mais.** O chamado guarda quem atende, e a leitura confere a cada vez se essa conta ainda está ativa e atende os locais dele. Quando não, a leitura a marca "não atende mais os chamados": o quadro abre a coluna dela depois das outras, e a tarefa do prazo avisa quem atende os locais, como na triagem. O chamado não muda até alguém o assumir ou passar. Assim, a desativação de uma conta e a troca de um perfil não precisam saber dos chamados. A troca do ativo, que é dos chamados, recusa os locais novos que quem atende não atende.

**A carga no domínio.** O `cargaDasPessoas` (`packages/domain/src/chamados/carga.ts`) recebe:
- as contas: as ativas com `chamados.atender` e as de quem atende os chamados abertos, lidas depois dos chamados (4.9), cada uma com o alcance de agora;
- os chamados abertos e os resolvidos;
- o alcance de `chamados.ver` de quem olha, a carga cheia, o momento e o fuso de quem olha.

Ele conta só os chamados que quem olha vê, pelo `veOChamado`, que é o `veASolicitacao` (decisão 5). A conta é da TI pelo `ehDaTi`, a mesma regra de quem atende o tipo por padrão (decisão 6): ativa, com `chamados.atender` em algum local. Devolve a triagem, as colunas, todos os resolvidos hoje, para a contagem do Início, e o `contandoSoOsLocaisQueVe`. Cada coluna traz os números dos abertos, o mais antigo, os pedaços e os resolvidos hoje. A marca de quem não atende mais é de cada chamado: a conta que perdeu um dos locais fica com duas colunas, a dela e a dos chamados que não atende mais. A ordem dos quadrados pelo vencimento é da tela, pelo `compararPrazos`. A saudação é o `saudacao(nome, agora, fuso)`, no mesmo arquivo.

### 8. A conversa e o resumo

A conversa é uma tabela só, ordenada pelo `criada_em` e pelo id (uuidv7).

O evento tem o código na coluna `evento`, como `assumiu`, `passou`, `devolveu`, `desfez`, `aguardando`, `retomou`, `resolveu`, `reabriu`, `virou-os`, `solicitacao`, `ativo` e `abertura`, e os `dados`: as contas, a OS e a solicitação. Nas ações do atendimento, o `assumiu` guarda de quem, o `passou` de quem e para quem, o `devolveu` de quem, o `desfez` e o `reabriu` para quem o chamado volta, ou a triagem, e o `aguardando`, o `retomou` e o `resolveu` não têm dados: a pessoa vem do chamado, e quem agiu é o autor. A web monta a frase, para o nome atual das pessoas aparecer, como nas OS.

A abertura não guarda o resumo pronto. A leitura do chamado o monta pelo `resumoDasRespostas`, da cópia do formulário e das respostas que o chamado guarda desde a abertura, com os nomes de agora dos ativos, dos locais e das pessoas. As respostas do Ativo, do Local e da Pessoa guardam o id: com o resumo pronto, a pessoa anonimizada ficaria nele com o nome, e a spec manda a anonimização trocar a referência à pessoa, e não o texto livre (spec chamados, "Quem vê e quem atende os chamados").

Os alertas do ativo entram na leitura (decisão 9), e não na tabela.

**A ficha.** O `GET /chamados/:numero`, com `chamados.ver`, lê o chamado inteiro numa resposta, para a tela não montar a ficha de várias consultas:
- **o cabeçalho:** o número, o título, a situação, a versão, a origem, a abertura, o tipo, a pessoa e o ativo ligado, com o resumo da seção "Ativo ligado" (decisão 5, "O ativo no chamado", que chega com a tarefa 4.25), quem atende, desde quando e se não atende mais os chamados, pela mesma conta das colunas do quadro, e o `permite.atender`, se a conta atende todos os locais do chamado, como o das OS;
- **o prazo:** o relógio guardado, como na lista dos prazos, o horário da TI e o momento em que o relógio parou, lido da conversa: o do primeiro `aguardando` ou `resolveu` depois da última volta do relógio (a abertura, o `retomou` ou o `reabriu`), porque o resolvido que veio do aguardando parou na espera. Com o relógio contando, ele é nulo;
- **a OS e a solicitação,** com a situação, só a quem as vê: a OS com `ordens.ver` no local dela, e a solicitação com `solicitacoes.ver` num dos locais dela, como nas listas delas. A quem não as vê, elas vêm nulas;
- **as respostas:** o formulário copiado, as respostas guardadas, o que elas citam pelo id (os ativos, com o rótulo e o patrimônio, os locais, pelo caminho, e as pessoas), com os nomes de agora, os anexos de cada campo e o resumo, montado desses nomes;
- **a conversa:** as mensagens, as notas e os eventos, na ordem da tabela, com os nomes de agora e os anexos de cada mensagem e de cada nota, e os alertas do ativo (decisão 9), na hora em que abriram. O evento traz quem agiu e as contas dos dados, o `de` e o `para`, com o nome; o que não tem uma delas a traz nula. O evento de um código que esta versão não lê, como o gravado por uma versão mais nova antes do `voltar` da operação, fica de fora da ficha, em vez de derrubá-la;
- **as respostas prontas** do tipo do chamado, na ordem da lista delas (as sem tipos e as que têm o tipo), com o `{nome}` trocado pelo primeiro nome da pessoa (`nomeCurto`). A lista das respostas prontas é só de quem configura, e quem atende as lê aqui.

Os anexos vão com o id do arquivo, o nome, o tipo e o tamanho, como o envio os devolve, e o arquivo removido não vai. A tela os baixa pelo `GET /chamados/:numero/anexos/:arquivo` (decisão 10).

Com um módulo opcional desligado na organização, a ficha leva o que é dele como a quem não o vê, como o cartão dos compatíveis da ficha do ativo e os ativos da ficha do fornecedor: sem os alertas, com o Alertas desligado; sem a OS e a solicitação, com o Operação; e sem o atalho do ativo, com o Ativos. O ativo ligado e os ativos das respostas continuam no cabeçalho e no resumo, porque são do chamado.

### 9. Os alertas do ativo, lidos na hora

A rota da conversa junta os alertas do ativo ligado abertos entre a abertura do chamado e a resolução, ou agora, só para quem tem `alertas.ver` no local do ativo. Eles não são copiados para a conversa: o alerta tem dono, a regra dos alertas, e a cópia ficaria velha quando o alerta mudasse de texto.

### 10. Os anexos

**O envio, antes da gravação.** Cada anexo é enviado sozinho, pelo `POST /chamados/anexos`, com o corpo em `application/octet-stream`, como os campos de arquivo de hoje, e as regras de "Arquivos aceitos" (até 25 MB). O envio pede `chamados.atender` em algum local e grava o arquivo em `arquivos`, com o `enviado_por`, e a linha sem dono em `anexos_dos_chamados`. Ele devolve o id do arquivo, que a gravação toma, com o nome guardado, o tipo conferido e o tamanho. O envio não vai para a auditoria nem dá evento: o que muda o chamado é a gravação.

**A gravação toma os anexos.** A mensagem, a nota, a abertura e o campo da TI tomam os anexos pelo `tomarAnexos` (`apps/api/src/chamados/anexos.ts`), na mesma transação. Ele trava as linhas sem dono dos ids pedidos e, num comando à parte, toma-as por um UPDATE só: passam ao chamado, com a mensagem ou o campo, só as do arquivo enviado pela mesma conta e não removido. Se o número de linhas tomadas não bate com o de ids, a gravação é recusada com "O anexo não foi encontrado. Envie o arquivo de novo." (400, na chave dos anexos da mensagem ou na do campo), e a transação volta. A trava antes da conferência do arquivo fecha duas corridas:
- a segunda gravação com o mesmo anexo espera a primeira e não o acha mais sem dono;
- a gravação que espera a manutenção relê o arquivo, já removido, e recusa.

O `arquivo_id` único impede o mesmo arquivo em dois donos. O campo Anexo do formulário guarda nas respostas os ids que tomou.

**A manutenção.** A manutenção diária marca `removido_em` nos anexos sem dono enviados há mais de 24 h, antes de apagar os arquivos removidos, e o conteúdo deles sai na mesma volta. Ela trava as linhas dos anexos antes, como a gravação: o anexo que uma gravação tomou primeiro fica de fora. A linha sem dono já removida fica na tabela, porque o papel da aplicação não apaga o anexo, e o filtro é o `removido_em` do arquivo. O anexo que sai de um campo só da TI, trocado ou tirado, ganha o `removido_em` na mesma transação, como o arquivo trocado de um campo do ativo. O apagamento do conteúdo segue o de hoje.

**A entrega.** Sempre para baixar, com o nome original, como o arquivo de um campo do ativo:
- `GET /chamados/:numero/anexos/:arquivo` confere que a conta vê o chamado, e o que ela não vê responde como inexistente, e que o anexo é dele:
  - o anexo da mensagem e o de um campo que a pessoa vê, a quem vê o chamado;
  - o da nota e o de um campo só da TI, só com `chamados.ver`, que nesta change é o único jeito de ver um chamado;
- `GET /chamados/anexos/:arquivo` entrega o sem dono só a quem o enviou, para a tela mostrá-lo antes da gravação.

Quando o chat (17) e a aba (20) derem à pessoa a leitura do próprio chamado, a entrega dela recusa os anexos da nota e dos campos só da TI.

Alternativa recusada: conferir só o id do arquivo na gravação. Quem soubesse o id de um arquivo alheio o poria no chamado e o receberia pela entrega do chamado.

### 11. A OS e a solicitação pelo chamado

O chamado guarda `os_id`, único, e `solicitacao_id`, que vários chamados podem ter, porque o "Pedir toner" se junta à pendente.

A OS e a solicitação mostram os chamados delas por uma consulta, "Do chamado #1042" ou "Dos chamados #1040 e #1042". Elas não ganham coluna: o chamado é que muda.

"Virar OS" e "Pedir toner" chamam as funções de abertura e de registro de hoje (`ordens/abertura.ts` e o registro das solicitações), na mesma transação da ligação, para as regras e as recusas serem as delas.

**Virar OS (tarefa 4.16).** O `POST /chamados/:numero/os`, com `{ problema }`, pede `chamados.atender`, como as ações. A OS pede o que pede hoje: a abertura (`abrir`) confere o problema, o ativo ativo que a conta vê e `ordens.atender` no local dele, com as recusas dela. O problema que falta é o título do chamado, que a tela mostra para quem abre corrigir antes. Decisões que o plano não fechava:
- **As recusas do chamado vêm antes da abertura,** no domínio (`recusaDoVirarOs`), todas no 409, nesta ordem: quem age precisa atender os locais do chamado; o resolvido; a OS que o chamado já tem ("O chamado #1042 já tem a OS 12."); o tipo que não vira OS, pelo tipo como está agora ("O tipo Acesso e senha não vira OS."); e o chamado sem o ativo ligado ("O chamado #1042 não tem um ativo ligado."). O estado do chamado vem primeiro, depois o ajuste do tipo e por fim o ativo, que quem atende ainda pode ligar.
- **Com o módulo Operação desligado,** a rota responde o 403 do módulo desligado antes das recusas do chamado e da OS, como as rotas das OS. A guarda da permissão e a validação do pedido, que valem em toda rota, vêm antes dele. A rota mora no módulo Chamados, e a guarda do escopo dela não vê a Operação: o `virarOs` lê a organização na transação, como a ficha.
- **O evento `os` não sobe a versão.** Virar OS não muda a situação, quem atende nem os locais, como a troca do título. O desfazer do assumir segue valendo depois dele. O `desde.ts` ganha a lista `EVENTOS_QUE_NAO_SOBEM_A_VERSAO`, e o guarda passa a conferir que cada evento do domínio está numa das duas listas.
- **Na mesma transação,** a OS nasce, o chamado guarda o `os_id` e a conversa ganha o evento `os`, com o número da OS ("Virou a OS 13"). O número não muda, então o evento o guarda direto, sem o id.
- **A auditoria:** o `chamado.virou-os`, com a OS depois, e o `ordem.aberta` da OS, como toda OS. O `chamados.mudaram` vai aos locais do chamado, e o evento das OS, a quem vê as OS do local. Nada notifica.
- **A resposta é a OS (201),** como na abertura pela solicitação, já com o chamado.
- **Só o problema que falta vira o título.** O problema em branco, que quem abre apagou na tela, é recusado pela abertura da OS ("Descreva o problema.", no 400), como no "Nova OS": trocar o branco pelo título abriria a OS com um texto que a pessoa tirou.
- **As recusas da OS ficam como são,** também quando parecem do chamado: o ativo que ficou inativo depois da ligação dá o 409 da OS, e quem atende o chamado e as OS sem ver os ativos do local recebe o "Ativo não encontrado." no campo `ativo`, porque a OS pede `ativos.ver` no local do ativo. A tela mostra a frase da recusa, sem o campo.
- **O `ordem.aberta` não leva o chamado.** A auditoria da OS é gravada pela abertura de hoje, antes de o chamado guardar a OS; o `chamado.virou-os`, no mesmo código de rastreio, liga os dois.

**O chamado na leitura da OS.** A OS ganha `chamado`, com o número, a toda conta que vê a OS, e o `abrir` só para quem vê o chamado (`chamados.ver` nos locais dele), como o ativo da OS. É um só, e não uma lista: a OS sai de um chamado só (`chamados_os_unica`). Sem chamado, ou com o módulo Chamados desligado, ele vem nulo. A ficha do chamado mostra o evento `os` a toda conta que vê o chamado, como o evento do ativo, e a OS ligada, com a situação, só a quem vê as OS (4.11).

**A troca do ativo depois da OS** (revisão da 4.15) segue permitida: a OS é do ativo em que nasceu e não muda com a troca, e o chamado continua ligado a ela. Recusar a troca prenderia o chamado a um ativo errado. A OS aberta por engano se encerra, como qualquer outra. A 4.17 e a 4.18 seguem a mesma regra para a solicitação.

**Pedir toner (tarefa 4.17).** O `POST /chamados/:numero/toner` pede `chamados.atender`, como as ações, e tem dois passos na mesma rota:
- **sem o `registro`:** havendo a pendente, o chamado se junta a ela (200, `{ resultado: 'juntou', solicitacao: { numero } }`); sem ela, a resposta é o registro do Toner para a tela abrir (200, `{ resultado: 'registro', registro }`), e nada é gravado;
- **com o `registro`,** o pedido do Toner do `POST /solicitacoes`: o registro das solicitações de hoje (`registrar`) grava, com as regras e as recusas dele, e o chamado se liga à solicitação nova (201, `{ resultado: 'pediu', solicitacao: { numero } }`).

Decisões que o plano não fechava:
- **As recusas são as mesmas com e sem a pendente,** e nos dois passos, nesta ordem:
  - as do chamado, no domínio (`recusaDoPedirToner`), no 409: quem age precisa atender os locais do chamado; o resolvido; a solicitação que o chamado já tem ("O chamado #1042 já está na solicitação 4."); e o chamado sem o ativo ligado (a frase do "Virar OS");
  - as da impressora, pela conferência do registro (`conferirImpressora`), com as frases e o campo dele (`impressoras.0`): a que a conta não vê com `ativos.ver` (400, "Impressora não encontrada."), a inativa e a que não usa consumíveis ("PAT-00139 não usa consumíveis."), no 409. A tela mostra a frase, sem o campo, como no "Virar OS";
  - e a permissão do registro, `solicitacoes.atender` nos locais da impressora (403), também para se juntar (spec solicitacoes, "por quem atende o chamado e as solicitações nos locais da impressora").
- **Com o módulo Operação desligado,** a rota responde o 403 do módulo antes das recusas, como o "Virar OS".
- **A pendente** é a solicitação de Toner Aberta, Em atendimento ou Aguardando entrega com a impressora entre as dela. Havendo mais de uma, é a de menor número, a mais antiga. Ela vale também quando a conta não a vê, porque a impressora mudou de local depois do registro: a spec não deixa nascer a segunda, e a ficha só mostra a solicitação a quem a vê.
- **A pendente que nasce entre os dois passos** recusa a gravação, no 409: "A PAT-00139 já está na solicitação 6: peça o toner de novo para o chamado se juntar a ela.". Juntar em silêncio jogaria fora o registro que quem atende mudou. A rota toma a trava da impressora (`toner:<impressora>`, desde a 4.18) antes de procurar a pendente, e dois "Pedir toner" da mesma impressora ao mesmo tempo não registram duas.
- **O registro dado** tem a pessoa do chamado, a impressora e um item da cor do chamado, com a quantidade 1 e o consumível nulo, que o registro sugere na gravação, como no "Nova solicitação". A observação vem nula.
- **O registro gravado precisa da impressora do chamado** entre as dele: sem ela, 400 no `impressoras`, "A solicitação do chamado leva a impressora dele, PAT-00139.". O resto, quem atende muda: a pessoa, as outras impressoras, os itens e a observação.
- **O evento `solicitacao`,** com `{ numero, como }`: o `como` é `juntou` ("Juntou-se à solicitação 4") ou `pediu` ("Pediu toner: solicitação 5"), e a 4.18 acrescenta o `gerou`. Ele não sobe a versão, como o `os`, e a ficha o mostra a toda conta que vê o chamado.
- **A auditoria:** o `chamado.pediu-toner`, com a solicitação e o `como` depois, e o `chamados.mudaram` pela saída dele; com a solicitação nova, o `solicitacao.registrada` do registro. Ao se juntar, a solicitação ganha um chamado, e o `solicitacoes.mudaram` vai também aos locais dela. Nada notifica.
- **A resposta leva só o número da solicitação,** porque a pendente pode ser uma que a conta não vê. A tela relê a ficha, que mostra a solicitação com a situação a quem a vê.

A cor do toner é a do chamado (spec solicitacoes), que o `corDoToner` do domínio decide para o "Pedir toner" e para a solicitação gerada pelo tipo:
- a respondida no formulário, pela primeira escolha única, na ordem dos campos, cuja opção respondida tem o nome de uma cor de consumível, sem diferença de maiúsculas nem de acentos, quando a impressora usa um consumível dessa cor. A escolha única de uma cor que a impressora não usa é pulada. O texto da opção, e não o id, vale também no formulário que a TI monta, cujos ids são aleatórios;
- sem ela, a cor mais baixa na última leitura válida dos suprimentos (P2b): o nível medido de cada toner com a tinta pela descrição (`tintaDoSuprimento`). O ciano, o magenta e o amarelo de uma impressora que só usa o colorido viram o colorido, e a tinta que ela não usa fica de fora. No empate, vale a ordem das cores (o preto primeiro);
- sem a leitura, o preto.

A impressora usa as cores dos consumíveis compatíveis ativos do modelo dela. Sem nenhum compatível cadastrado, ela é tratada como se usasse todas: sem o cadastro, não há como saber, e a cor respondida é a melhor informação.

**A solicitação gerada pelo tipo.** A abertura chama o registro das solicitações dentro de um ponto de salvamento (a transação aninhada do Drizzle, um `savepoint`). Uma recusa do registro volta só o ponto de salvamento: o chamado abre, e a conversa ganha o evento "A solicitação não foi gerada: <motivo>". O motivo tem texto próprio nos casos conhecidos (sem local, impressora sem consumíveis, tipo de ativo inativado e local inativado) e é a recusa do registro nos outros. Conferir antes, no lugar do ponto de salvamento, repetiria as regras do registro e se afastaria delas com o tempo.

A gravação do tipo pede `solicitacoes.atender` na organização inteira para ligar o "Gera uma Solicitação" ou trocar o que ele gera (spec tipos-de-chamado). Assim, a solicitação registrada sem a permissão de quem abre foi delegada por quem poderia registrá-la em qualquer local. A auditoria da solicitação gerada leva o chamado e o tipo de chamado.

**A solicitação gerada pelo tipo (tarefa 4.18).** A abertura a gera depois do chamado, do evento de abertura e dos anexos, e antes da auditoria `chamado.aberto`, pelo tipo como foi lido na abertura (travado para leitura). Decisões que o plano não fechava:
- **Com o módulo Operação desligado,** nada é registrado, e a conversa ganha "A solicitação não foi gerada: o módulo Operação está desligado.". A abertura não falha: o chamado é do módulo Chamados, e a TI fica sabendo por que a solicitação não veio.
- **O Toner** é o "Pedir toner" sem a tela:
  - o chamado sem o ativo ligado (o campo Ativo pode não ser obrigatório no formulário que a TI monta) não gera, com "o chamado não tem um ativo ligado.";
  - a impressora passa pela conferência do registro (`conferirImpressora`), e a recusa dela é o motivo ("PAT-00139 não usa consumíveis.");
  - havendo a pendente, o chamado se junta a ela, com o `como` `juntou` e o `solicitacoes.mudaram` aos locais dela, como no "Pedir toner"; sem ela, o registro de hoje grava o Toner com a pessoa, a impressora e 1 da cor do chamado (`corDoToner`), e o `como` é `gerou`.
- **A trava da impressora.** Duas aberturas do Toner com a mesma impressora, ao mesmo tempo, registrariam duas solicitações. A abertura já tem a impressora travada para leitura (o `conferirAtivo`), e subir essa trava para a de escrita, como o "Pedir toner" fazia, deixaria as duas aberturas esperando uma pela outra até o PostgreSQL derrubar uma (deadlock). A decisão sobre a pendente de uma impressora passa a rodar com a trava `toner:<impressora>` (`travas.ts`), na abertura e no "Pedir toner", que a usa no lugar do `for update` da 4.17. O que se perde: com o `for update`, o registro avulso e a alteração que acrescenta a impressora esperavam o "Pedir toner", pela trava de leitura do `conferirAtivo` deles; com a `toner:`, eles não esperam, e a avulsa gravada entre a leitura da pendente e o commit do "Pedir toner" ou da abertura deixa duas pendentes da impressora, e o 409 do cenário "Pendente nascida com o registro aberto" não vale nessa janela. Fica aceita: a janela é de milissegundos, e o registro avulso já pode criar a segunda pendente quando quiser, porque ele não procura a pendente. Fazer o registro e a alteração tomarem a trava de cada impressora, na ordem do id, pediria ao "Pedir toner" travar de uma vez a impressora do chamado e as do registro, para os dois não se esperarem um ao outro.
- **O Equipamento:** o tipo de ativo do tipo de chamado, a quantidade 1, o motivo "Chamado #1043: Equipamento novo para Marina" (`motivoDoEquipamento`) e o local de trabalho da pessoa ou, sem ele, o do ativo ligado. Sem nenhum dos dois, não gera, com "Marina Lopes não tem local de trabalho.", sem chamar o registro: o local é regra da abertura, e não do registro.
- **O registro delegado.** O `registrar` ganha o `doChamado` (o número e o nome do tipo de chamado): com ele, não pede `solicitacoes.atender`, e a `solicitacao.registrada` leva `chamado` (o número) e `tipoDeChamado` (o nome) no depois. As conferências seguem com a conta de quem abre, que já viu o ativo ligado na abertura. A solicitação é registrada por quem abriu.
- **A recusa do registro** volta o ponto de salvamento, e a conversa ganha o evento `solicitacao-nao-gerada`, com o `motivo` escrito na hora, porque conta o que aconteceu naquele momento, com os nomes de então. Fora o Equipamento sem local: a frase tem o nome da pessoa, que é uma referência a ela, e o evento guarda só o caso (`{ semLocal: true }`, o `DadosDaSolicitacaoNaoGerada`). A ficha escreve a frase com o nome de agora (`motivoDoEventoNaoGerado`), e a pessoa anonimizada aparece com o nome anonimizado, como no resumo ("A abertura não guarda o resumo pronto"), porque a anonimização troca a referência à pessoa, e não o texto livre (spec chamados). O motivo vem do campo da recusa: no `tipoDeAtivo`, "o tipo de ativo Notebook está inativo."; no `local`, "o local Financeiro está inativo.", pelo caminho do local; nos outros, a frase do primeiro campo, ou a da recusa sem campo. Só a recusa da API (`ProblemaDaApi`) vira o evento: o erro inesperado derruba a abertura, como em toda rota.
- **Os eventos `solicitacao` (com o `gerou`) e `solicitacao-nao-gerada`** vêm logo depois do de abertura, no mesmo momento, e não sobem a versão. A ficha os mostra a toda conta que vê o chamado, como o `solicitacao` da 4.17.
- **A auditoria:** o `chamado.aberto` leva `solicitacao` (o número) quando o chamado nasceu ligado a uma, gerada ou a que ele se juntou; a gerada tem a `solicitacao.registrada` dela, com o chamado e o tipo. Nada notifica além da abertura.
- **A resposta da abertura não muda:** a tela abre a ficha, que mostra a solicitação ou o motivo.

**Os chamados na leitura da solicitação.** A solicitação ganha `chamados`, pelo número, a toda conta que vê a solicitação, cada um com o `abrir` só para quem vê o chamado (`chamados.ver` nos locais dele), como o chamado na leitura da OS. É uma lista, porque vários chamados se juntam à mesma solicitação. Com o módulo Chamados desligado, ela vem vazia.

Para a 19 e a 20: lá, quem abre o chamado é a pessoa, sem uma conta da TI.
- A solicitação gerada pelo tipo vai precisar de um registrador, e a decisão fica com essas changes.
- Na abertura pela pessoa, a API tira ou recusa as respostas dos campos só da TI, que o `conferirRespostas` aceita porque aqui quem abre é a TI (decisão 2). Sem isso, a pessoa responderia o "Contrato de manutenção", que nem vê.

### 12. As notificações e a tarefa do prazo

A tarefa `chamados.prazo` roda na fila (pg-boss) a cada minuto, com `missed: 'once'`. Por organização, ela:
- lê os chamados com o relógio contando e o `estouro_avisado_em` nulo;
- calcula o vencimento pela função do domínio;
- notifica os que passaram e marca o `estouro_avisado_em`.

O reabrir limpa a marca.

As notificações seguem a `notificar()`, com a origem "Chamados", e o e-mail e o push pela severidade, como os alertas.

**A tarefa do prazo (tarefa 4.19).** Decisões que o plano não fechava:
- **A tarefa** entra no catálogo das tarefas (`fila/tarefas.ts`), com a agenda a cada minuto, no fuso de São Paulo, como as outras, e a rotina "Prazo dos chamados" na tela das rotinas. Ela percorre as organizações (`organizacoes_para_tarefas`), cada uma na transação dela. A falha de uma organização desfaz a transação dela, vai para o log e não para as outras; a do minuto seguinte tenta de novo, sem encher a lista das tarefas com falha. A falha fora das organizações, como a leitura delas, vai para a lista das tarefas com falha, como a da verificação dos painéis.
- **O módulo Chamados desligado** pula a organização. Ao religar, o chamado que passou do prazo nesse tempo é avisado no minuto seguinte, porque a marca ficou nula: quem atende fica sabendo do que estourou enquanto o módulo estava fora.
- **Os chamados lidos:** na triagem e em atendimento, as situações com o relógio contando (o `chamados_relogio_coerente`), pelo índice da situação, e com a marca nula. A primeira leitura é sem trava: no minuto em que nada estourou, que é quase sempre, nenhuma linha fica travada (nem gravada pela trava), e nenhuma ação espera a verificação. Só os estourados são lidos de novo, travados com `for update skip locked`, e conferidos outra vez, para valer a ação que os mudou entre as duas leituras. O chamado que uma ação muda naquele instante fica para o minuto seguinte, sem a tarefa esperar a ação; a ação no chamado estourado espera só os milissegundos da verificação. Duas verificações ao mesmo tempo, como a de uma segunda instância da API, avisam o chamado uma vez.
- **O vencimento** é o `prazoEstourado` do domínio, pela `situacaoDoPrazo`, com o horário da TI de agora, como a lista dos prazos. O prazo estragado é pulado, sem a marca, e não derruba os outros.
- **Quem recebe** é o `notificacoesDoEstouro` do domínio, pelas contas ativas com o alcance de `chamados.atender`, as mesmas da triagem: a conta com o chamado, se ela está entre elas e atende os locais dele; senão, cada conta que atende os locais. Na severidade Atenção, com "Chamado #1033 passou do prazo: Wi-Fi cai na Sala Atlântico". O e-mail e o push vão pela entrega da fila.
- **A marca** grava o momento da verificação mesmo sem ninguém para avisar: sem ela, o chamado seria lido de novo a cada minuto.
- **Nada mais muda:** a marca não sobe a versão nem grava na conversa, na auditoria ou no tempo real. Para quem vê o chamado, nada mudou, e a web calcula o estouro pelo relógio.
- **O reabrir limpa a marca** (tarefa 4.13): o reaberto volta a contar já depois do prazo, vence na volta, e a verificação o avisa de novo. O retomar não limpa: o chamado que estourou antes da espera já foi avisado, e a spec pede o aviso de volta só no reaberto.

### 13. Os eventos

| Evento | Quando |
|---|---|
| `chamados.mudaram` | toda mudança e mensagem do chamado, ao `publicoDoChamado` |
| `ajustes-dos-chamados.mudaram` | os tipos, o formulário, as respostas prontas e o horário, a quem tem uma das três permissões |

Os dois entram nos tipos de evento da plataforma (os `TIPOS_DE_EVENTO`, em `packages/domain/src/eventos/eventos.ts`), com o teste de lá, e na cópia da lista no contrato de módulo (`docs/casca/modulos.md`).
- **O nome dos ajustes** tem um ponto só, porque o banco aceita o tipo no formato `assunto.verbo` (o CHECK `eventos_tipo_valido`).
- **O público do `chamados.mudaram`** é dado por quem grava, como o das OS. O dos ajustes sai do tipo, pelo `publicoDerivado`: as três permissões dos chamados.

**O público "uma das permissões".** O público dos eventos aceitava uma permissão só (o `permissao`), e os ajustes vão a quem tem uma das três. Ele ganha o `permissoes`: quem tem uma delas, em qualquer escopo, sem os locais, que seguem só com o `permissao`. A mudança passa por:
- o `PublicoDoEvento` e o `podeReceber`, no domínio;
- a coluna `permissoes text[]` dos eventos, com os CHECKs do público (ela vale como uma das partes, e são no máximo 8 permissões), e o aviso do gatilho (`app.avisar_evento`), que a leva na carga, numa migration;
- a gravação (`registrarEvento`) e a retomada (`eventoDaLinha`), na API. O distribuidor não muda: sem os locais, ele não lê a árvore.

Alternativas recusadas:
- o `todas`, que mandaria os ajustes a quem não tem nenhuma das permissões dos chamados, contra a spec;
- dois eventos, um por permissão, que chegariam duas vezes a quem tem as duas.

A web declara, no registro do módulo, as consultas que cada evento atualiza. O `ajustes-dos-chamados.mudaram` atualiza também as consultas dos chamados, porque a mudança do horário fecha os relógios (decisão 3). O campo de escrever guarda o rascunho num estado próprio, fora da consulta, para não o perder.

### 14. A primeira tela e o dock

**O dock.** O módulo `chamados` entra primeiro no `REGISTRO`, que é a ordem de fábrica do dock. O comportamento com o dock já arrumado é o da spec do dock: o módulo novo vai para depois dos arrumados.

**A primeira tela (tarefa 5.2).** O redirecionamento acontece só na primeira carga de cada aba:
- se o endereço é a raiz pura, `/` sem busca nem âncora, como o `start_url` da PWA, a conta vê os chamados com o módulo ligado e a marca `grafite.entrou` do `sessionStorage` não é dela, a casca troca o endereço por `/chamados` (`replace`). Um endereço do Início com parâmetros é um destino, e fica;
- a marca guarda o usuário da conta. A casca a grava quando abre com a sessão conhecida, com ou sem a troca, e quando a sessão desconhecida passa a ser conhecida;
- recarregar a página mantém o Início, porque a marca continua na aba. Uma aba nova não tem a marca, e outra conta que entra na mesma aba, depois do "Sair", tem a primeira tela dela;
- com a sessão desconhecida na primeira carga, a casca fica no Início. Quando a sessão fica conhecida, a casca continua onde a pessoa está e grava a marca;
- a navegação interna para `/`, pelo dock, não passa por ali, e o Início continua no endereço dele.

O `sessionStorage` é lido e gravado num `try/catch`. Sem ele, a troca acontece em toda carga da raiz, o que só repete a primeira tela.

Decisões que o plano não fechava:
- **Onde:** antes da primeira carga do roteador. O roteador só monta quando a porta monta a casca, com a sessão conhecida ou desconhecida; entre a porta e ele, a `PrimeiraCarga` decide e troca o endereço do histórico (`replace`), e só depois monta o roteador, que carrega já no endereço novo. Assim o Início não abre nem pede os dados dele antes da troca, e o foco da abertura fica onde está (design do F1b, decisão 4), porque não há navegação. As navegações depois não passam por ali. Recusados: uma navegação num efeito da casca, depois da primeira carga, que abriria o Início e levaria o foco ao título; e um `beforeLoad` na raiz, que roda em toda navegação e muda o tempo de todas (na tela das visões dos ativos, a lista relida chegava antes da navegação para a visão de fábrica, e a tela avisava que a visão removida tinha sido removida). O `beforeLoad` só na rota do Início, com o `redirect`, não foi tentado: ele rodaria só nas idas à raiz, mas também na do dock; precisaria da sessão no contexto do roteador, que hoje leva só os módulos; e o `redirect` é uma segunda navegação, depois de a raiz começar a carregar. A `PrimeiraCarga` decide uma vez, antes de o roteador montar, com a sessão que a porta já tem.
- **No contrato de módulo:** o módulo declara a `primeiraTela`, com as permissões dela, e a casca leva a raiz ao endereço do primeiro módulo do registro da conta que a declara. O registro da conta tira a primeira tela de quem não tem as permissões dela, como faz com o menu dinâmico, e o módulo desligado sai inteiro. O Chamados a declara com `chamados.ver` ou `chamados.atender`: quem só configura fica no Início.

**O módulo na casca (tarefa 5.1).** O módulo vive em `apps/web/src/modulos/chamados/`. Decisões que o plano não fechava:
- **Os endereços:** `/chamados` (o Início dos chamados), `/chamados/quem-esta-com-o-que`, `/chamados/prazos`, `/chamados/tipos`, `/chamados/respostas-prontas` e `/chamados/horario`. O chamado aberto, `/chamados/<número>`, entra com a tela dele (5.10), junto do provedor da busca, que leva a ele pelo Enter.
- **O menu:** "Início", "Quem está com o quê" e "Prazos" com `chamados.ver` ou `chamados.atender`; depois de uma linha, "Tipos de chamado", "Respostas prontas" e "Horário da TI" com `chamados.configurar`. O módulo aparece com qualquer uma das três. Quem só configura vê o menu sem a linha: o `itensPermitidos` tira a linha do primeiro item que a conta vê, no menu e em cada submenu, porque ela separava de itens que a conta não vê. Vale para todos os módulos; hoje, só os Tipos de chamado podem ser o primeiro item com a linha.
- **O endereço do módulo** é o `/chamados`: quem vê os chamados fica no Início dos chamados; quem só configura vai aos Tipos de chamado, sem o Início no histórico, como a Gestão de ativos leva à primeira tela que a conta pode usar; quem não tem nenhuma das três lê "Você não tem acesso aos chamados.", com a quem pedir. As telas de ver dizem o mesmo a quem só configura, e as de configurar dizem "Você não tem acesso aos tipos de chamado.", "às respostas prontas." e "ao horário da TI." a quem não configura.
- **A ação da busca** "Abrir um chamado", no caminho "Chamados", a quem atende, leva ao Início dos chamados com a gaveta (`/chamados?abrir=1`, que a 5.18 abre), como as ações do Operação abrem a tela com o formulário. As telas do menu entram na busca sozinhas, cada uma com a permissão dela.
- **No celular,** o Chamados vem antes do Início (`prioridadeNoCelular: 0`), como no dock: é a primeira tela da TI, e a notificação do chamado leva a ele. A barra tem cinco abas, ou quatro e o "Mais" quando a conta tem algum módulo que fica nele, como o Operação. Com o Chamados, a conta que vê os ativos e os alertas e tem um desses módulos passa a ter os Ajustes no "Mais"; sem nenhum deles, as cinco abas cabem.
- **As consultas:** tudo o que é dos chamados fica debaixo de `['chamados']` (o quadro, os prazos e a ficha), a ficha em `['chamados', 'ficha']`, e os ajustes (os tipos, o formulário, as respostas prontas e o horário) debaixo de `['ajustes-dos-chamados']`.
- **Os eventos:** o `chamados.mudaram` relê os chamados; o `ajustes-dos-chamados.mudaram` relê os ajustes e os chamados, porque o horário fecha os relógios (decisão 3). Os dados das outras capacidades nas telas relêem pelo evento delas: `pessoas.mudaram` (o nome de quem pediu e das contas da TI), `locais.mudaram` (o caminho dos locais), `acessos.mudaram` (quem atende e o alcance) e `ativos.mudaram` (o ativo ligado) relêem os chamados; `alertas.mudaram`, `ordens.mudaram`, `solicitacoes.mudaram`, `estoque.mudou`, `consumiveis.mudaram`, `disponibilidade.mudou`, `catalogo.mudou` e `modulos.mudaram`, só a ficha, que mostra os alertas da conversa, a OS, a solicitação e o resumo do ativo, que muda com o Alertas e o Operação desligados.
- **As telas, uma por tarefa:** a 5.1 traz cada tela do menu só com o cabeçalho e a recusa sem permissão, e a tarefa de cada uma a preenche. O PR só sai com todas, e o contrato de módulo ("Nenhum item leva a uma tela em construção") vale para o que entra na `main`.

Alternativa recusada: mudar o Início para `/inicio` e fazer da raiz um redirecionamento sempre. Isso mudaria os links de hoje para o Início (a página não encontrada, as notificações e os endereços salvos) e a chegada.

### 15. Arrastar sem biblioteca

Um hook da web, `useArrastar` (`apps/web/src/modulos/chamados/useArrastar.ts`), com os eventos de ponteiro (`pointerdown`, `pointermove`, `pointerup` e `pointercancel`), serve às três listas:
- os tipos;
- os campos;
- as respostas prontas;

e às colunas de "Quem está com o quê".

Ele dá:
- a posição do encaixe: a metade do alvo em que o ponteiro está, antes ou depois, que diz onde a linha de encaixe das listas fica;
- o alvo sob o ponteiro;
- o Esc para cancelar;
- o limiar de 4 px antes de começar, para o clique continuar sendo clique.

Como ele funciona (tarefa 5.4):
- **as peças:** `const { arraste, alca, alvo } = useArrastar<T>({ recebe, aoSoltar })`. O `alca(item)` vai no que se arrasta (o quadrado ou a alça da linha), e o `alvo(chave)`, em cada lugar que recebe (a coluna ou a linha). Parado, o `arraste` é `null`; no arraste, traz o item, o ponteiro na janela, quanto ele andou desde o aperto, o alvo sob ele (a chave e a metade) e se esse alvo recebe o item;
- **o alvo que recusa:** o `recebe(item, chave)` diz se o alvo aceita o item, como a coluna de quem não atende os locais do chamado; sem ele, todo alvo aceita. Soltar num alvo que recusa, ou fora de um alvo, não faz nada;
- **o alvo sob o ponteiro** sai do `document.elementFromPoint`, subindo até um alvo deste arraste: cada `useArrastar` marca os seus alvos com o próprio id, e o alvo de outro arraste na mesma tela não conta. O quadrado no ar, que segue o ponteiro, fica com `pointer-events: none`, para não tapar o alvo;
- **os ouvintes na janela,** do aperto até soltar, e não a captura do ponteiro: a janela já recebe o movimento fora do item, e a captura no aperto mandaria o clique ao item, e não aos botões de dentro dele, como os do quadrado. Sem a captura, a soltura pode se perder (o Alt+Tab, um diálogo, o menu do botão direito), e o arraste preso soltaria o chamado no clique seguinte: o movimento sem o botão principal e a janela que perde o foco acabam o aperto, sem soltar;
- **o clique depois do arraste** não chega a ninguém, nem no arraste cancelado: nem ao item, nem a um botão dele, nem ao quadro, que o recebe quando a soltura cai fora do item. O ouvinte é da janela, na captura, e sai no primeiro clique, no fim da tarefa ou no aperto seguinte; o clique de teclado, que vem depois, chega. O arrastar do próprio navegador, o de um link ou de uma imagem dentro do item, fica desligado, porque ele cancelaria o ponteiro;
- **um alvo por elemento:** o elemento leva o `data-alvo-de` de um arraste só. As listas que soltam coisas diferentes nas mesmas linhas, como a paleta e a ordem dos campos (5.21 e 5.22), usam o mesmo `useArrastar`, com o item numa união;
- **o Esc** cancela o arraste e não chega a mais ninguém: a janela o pega primeiro, e a prévia ou o painel de trás não fecham. O `pointercancel` também cancela, e um segundo ponteiro não mexe no arraste;
- **o resto é da tela:** o `touch-action: none` do que se arrasta, o cursor e o texto sem seleção durante o arraste ficam no CSS de cada tela;
- **no toque (5.9):** o quadrado só se arrasta com o mouse (`pointerType === 'mouse'`) e fica sem o `touch-action: none`, que tiraria a rolagem por cima dos quadrados. No toque e na caneta, as colunas rolam, e o chamado passa pelo "Passar para…" do menu ou do chamado aberto (5.10). A roda do mouse sem mover o ponteiro deixa o alvo velho até o próximo movimento: a soltura recalcula, e só o destaque erra;
- **o que só o navegador prova** fica para a 5.9, no `pnpm dev` contra o m02, e para o ponta a ponta da 6.3, com o `page.mouse` (apertar, mover e soltar), que dá o clique de verdade: soltar em outra coluna; arrastar 5 px e soltar no mesmo quadrado; o Esc com a prévia aberta; o Alt+Tab e a roda no meio do arraste; e o toque emulado, em que o toque curto pode virar clique numa tarefa seguinte.

O teclado tem a alternativa em cada caso:
- "Subir" e "Descer" no menu do item;
- "Passar para…" no menu do quadrado.

A inclinação e a sombra do quadrado no ar são as do mockup m02, só com os tokens de sombra e de movimento.

Alternativa recusada: o `@dnd-kit`. Ele resolve o arraste, mas traz um modelo próprio de sensores e de acessibilidade para quatro usos. Os eventos de ponteiro e o menu do teclado já dão o que a spec pede.

### 16. A prévia do colaborador

Os componentes da prévia ficam em `apps/web/src/modulos/chamados/previa/`:
- a faixa da aba;
- a grade dos tipos;
- o formulário com as condições.

Eles usam:
- as cores da aba nos tokens (`--cor-aba-*`), feitas na matiz da informação, e o raio da cápsula (`--raio-capsula`);
- o corpo neutro do tema;
- as funções do formulário do domínio.

A 19 (a aba, em Tauri 2) pode levá-los para um pacote comum quando precisar deles fora da web. Até lá, eles moram onde são usados.

**As peças (tarefa 5.6)**, no visual da aba da 19 (r3-19, o m01 e o m05) em tamanho de prévia, como o `ch3-aba.css` da r3-16:
- **a tela da aba** (`TelaDaAba`): uma região com o nome de quem a usa ("Como o colaborador vê"), a moldura com a borda na cor da aba, a faixa no alto, o miolo neutro do tema e, quando há, o rodapé de duas pontas, a frase à esquerda e a ação à direita;
- **a faixa** (`FaixaDaAba`): a trilha em pílulas, a lista "Onde você está", separadas pela seta, com a atual marcada (`aria-current="step"`). A lista não é um marco de navegação, porque nenhum passo é um link, e a prévia não põe um marco a mais na página de quem administra. Depois vêm o passo em mono à direita ("1 de 3") e, quando há, quem pede: o avatar e "No nome de **Fernanda Rocha** (você)". O "Trocar" só aparece com a ação: na prévia do editor, sem ação, ele não entra, porque o botão que não faz nada engana;
- **a grade dos tipos** (`GradeDosTipos`): a lista "Sobre o que é o chamado?", com "Aperte 1 a 8 ou clique" (o último atalho é o do último tipo, até o 9; com um tipo só, "Aperte 1 ou clique"), e os tipos em 4 colunas, cada um com o atalho no canto, o ícone na cor da aba (o mapa da decisão 6), o nome e a frase. Só os 9 primeiros têm atalho. "editando" e "novo" são selos cheios de atenção no canto de cima, à direita, e o "novo" tem a borda tracejada. Sem tipos, a grade diz "Nenhum tipo aparece para o colaborador.":
  - com o `aoEscolher`, cada tipo é um botão, com o nome no nome lido, a frase na descrição e o atalho no `aria-keyshortcuts`; o escolhido fica cheio na cor da aba, com o `aria-pressed` e o visto no canto, para a escolha não ficar só na cor (no tipo com selo, o "editando" ou o "novo" ocupa o canto e já diz qual é). As teclas 1 a 9 escolhem pela posição, sem o Ctrl, o Alt ou o Command (o atalho é do sistema) e fora de um campo do formulário, o `input`, o `textarea`, o `select` e o texto editável (a tecla é do campo), pelas funções puras do `previa/atalhos.ts` (`tipoPeloAtalho`, `ultimoAtalho` e `atalhoDoEvento`), que a gaveta da 5.18 também usa;
  - sem ele, a grade é só para ver, como na prévia do editor (m07 e m08). O "Aperte 1 a 8 ou clique" fica, como nos dois mockups: é o texto que o colaborador lê, e não um controle. O "Trocar" sai porque é um botão;
- **o formulário no visual da aba** (`visual="aba"` do `FormularioQueSePreenche`, decisão 21):
  - as perguntas numeradas na ordem das que aparecem, pelo `numerosDasPerguntas` do `formulario/estado.ts`: o número num círculo cheio na cor da aba, num elemento fora do nome lido (`aria-hidden`), sobre o recuo que o visual da aba dá ao rótulo (`data-parte="rotulo"`, que o rótulo do kit e os do módulo passam a ter, como a bolinha e a caixa);
  - o campo que tem condição fica sem número, e a numeração não muda enquanto a pessoa responde. Ele se cola à pergunta de cima, como a continuação dela (o m05 da 19), só quando o campo que aparece antes dele é a base da condição ou outra continuação da mesma pergunta, pelo `continuacoesDasPerguntas` do `formulario/estado.ts`; fora disso, fica no vão normal, sem se prender à pergunta errada. Na continuação, a Escolha única, o Sim ou não e as Várias opções vão em chips, na linha do rótulo, como o "Onde as manchas aparecem?" do m05;
  - fora da continuação, a Escolha única e o Sim ou não em cartões, duas colunas de rádios, com a escolhida cheia na cor da aba e o visto. O "Nenhum" do campo que não é exigido é o último cartão, e não o primeiro, como na lista da tela: na aba, a pessoa lê as respostas antes de pular a pergunta. Escolhido, como vem de saída, o "Nenhum" tem a borda na cor da aba e o visto, sem o preenchimento: é a falta de resposta e não pesa como uma. As Várias opções em chips, a ligada cheia, com o visto. As opções do grupo ganham o `data-parte="opcoes"` no kit, para a aba as arrumar;
  - os outros campos ficam como na tela, com a marca de obrigatório: a peça é uma só, e a aba da S8 decide a dela.

**As cores da aba** seguem as misturas `--proposta-aba-*` do mockup, por decisão do usuário de 18/11/2026 ("Seguir o mockup"), e viram tokens do tema (spec design-tokens, "Cores da aba"): o gerador as faz na matiz da informação (245), com a luminosidade e o croma do `ch3-aba.css`, e a verificação do contraste as confere nas 24 combinações e na varredura. A cor que não cabe no sRGB tem os canais cortados (`oklchParaHexCortando`), como o navegador mostrou o mockup: o fundo fica no #004f9d da captura aprovada. Com o croma reduzido das outras cores do gerador, ele ficaria no #005182, um azul mais apagado que o do mockup. Os componentes usam só os tokens:
- o `--cor-aba-fundo` na faixa, no número, no tipo e na escolha escolhidos e no traço do visto;
- o `--cor-aba-texto` sobre ele e no círculo do visto, que, no cartão do "Nenhum", fica nas cores trocadas;
- o `--cor-aba-fundo-2` nas pílulas da trilha, com a atual nas cores trocadas;
- o `--cor-aba-bloco` no bloco de quem pede;
- o `--cor-aba-contorno` na moldura, nos ícones dos tipos, na borda tracejada do "novo" e na borda do "Nenhum" escolhido: a cor clara do mockup nos temas escuros e o próprio fundo nos claros, como o mockup faz no Papel, para o contorno passar de 3:1 sobre as superfícies claras;
- o `--cor-aba-atencao` e o `--cor-aba-sobre-atencao` nos selos "editando" e "novo".

As cores são as mesmas em todos os temas, fora o contorno, porque o mockup só tira a matiz do `--cor-info-forte`. Isso vale também no Alto contraste: o texto sobre o bloco fica em 5,74:1, no AA que a spec design-tokens pede a todo texto, sem chegar ao AAA. Foi decidido assim para a aba ser a mesma em qualquer tema, e o mockup não tem o Alto contraste.

**Os raios e as medidas** vêm dos tokens do Grafite. As cápsulas do mockup entram como a exceção nomeada do ANTISLOP (seção 15), pela mesma decisão de 18/11:
- a trilha, o "Trocar", os chips, os selos e o bloco de quem pede ficam no `--raio-capsula`, que deriva da base como os outros raios. A cápsula não gradua: de 1 px de base em diante ela já é cheia, e só a base zero a deixa reta;
- a moldura e os cartões, o do tipo e o da escolha, ficam no `--raio-dock`, o maior raio da escala. Na base de fábrica, ele fica a meio pixel dos 14 px do tipo do mockup e a 1,5 px dos 16 px do cartão da escolha. A moldura fica 3,5 px abaixo dos 18 px do mockup, porque um raio só para ela seria um degrau novo na escala;
- o círculo do número, o visto e o avatar são redondos.

Os controles seguem com 32 px ou mais (`--altura-controle`).

**O que fica para depois:** o "Como vai o chamado" do m05 da 19, o resumo dentro da aba, fica para a S8 (a aba em Tauri): a prévia do m11 mostra embaixo o "O que chegaria para a TI" (5.24). A marca do campo condicional na prévia do editor ("aparece só quando for Manchando") é da 5.23. O cartão da escolha mostra só o texto da opção, sem o ícone e a frase pequena dos cartões do m05: a opção do formulário só guarda o texto, e a falta é do modelo do formulário, e não da peça.

O botão da aba é da 5.24, a primeira a pôr a ação no rodapé da tela da aba (o m11). São dois, os do `ch3-aba.css`:
- o cheio, de 40 px, na cor da aba e em cápsula, do "Enviar para a TI";
- o de contorno, das fotos.

Até lá, a `TelaDaAba` recebe a ação pronta. Sem o botão da aba, entraria o botão do kit, na cor do destaque.

### 17. A busca

O chamado guarda `titulo_normalizado` (o `normalizarTexto` do domínio). O provedor acha:
- pelo número, quando o termo é só algarismos, com ou sem o "#";
- pelas palavras, cada uma num `strpos` do título normalizado.

Os dois respeitam o alcance da conta. O grupo é "Chamados", com no máximo 8 resultados.

**A rota da busca (tarefa 4.20).** Decisões que o plano não fechava:
- **A rota** é o `GET /chamados/busca?termo=`, com `chamados.ver`, no bloco do módulo: com o módulo desligado, ela responde a recusa do módulo desligado, como as outras rotas do bloco, e nada vem. O termo vai de 1 a 100 caracteres, sem os espaços das pontas; a web só chama com 2 ou mais.
- **Cada resultado** traz o número, o título, o nome de agora de quem pediu e a situação; a web escreve a situação em texto, com o rótulo do selo. Não há "Ver todos": o módulo não tem uma lista de todos os chamados para onde levar.
- **O número com o "#"** acha só o chamado daquele número. **Só os algarismos** acham o chamado daquele número primeiro e, depois, os títulos que têm os algarismos, como "404" acha a "Impressora M404 travando": o modelo de um equipamento aparece no título com frequência, e quem digita o "#" diz que quer o número. O número maior que o do banco não acha nenhum chamado pelo número, sem recusa.
- **As palavras** são as do `normalizarTexto`, cada uma num `strpos` do título normalizado, sem escapar nada, porque o `strpos` não tem curinga. O termo só de acento não sobra palavra nenhuma e não acha nada, porque a palavra vazia acharia todos os títulos. O "#" seguido de mais coisa, como "# 1042" ou "#1042 toner", vira palavra e não pede o número.
- **O que o termo pede** (o "#", a faixa do número, as palavras) é regra sem banco e fica no domínio, no `termoDaBusca` de `packages/domain/src/chamados/busca.ts`, com os casos no teste unitário; a integração fica com um caso de cada ligação: o número, as palavras, os dois juntos, o termo que não pede nada, o alcance, o limite, a validação e o módulo desligado.
- **A ordem:** o chamado do número primeiro; depois, os abertos (na triagem, em atendimento e aguardando) antes dos resolvidos, porque quem busca na TI quase sempre procura o que está aberto; e, em cada grupo, o mais novo primeiro, pelo número.
- **O alcance** é a condição das listas, que sai do quadro e dos prazos para o `alcance.ts` (`ondeAContaVe`): o chamado com um dos locais no alcance de `chamados.ver`, e o sem local só para quem vê a organização inteira.

### 18. O contrato e as permissões

As rotas entram no OpenAPI pelo Zod, e o cliente tipado sai do `contrato:gerar`. As três permissões entram no catálogo do domínio, na área "Chamados". O perfil Administrador, que tem todas por definição, passa a tê-las sem mudança no perfil.

A leitura que serve a quem atende e a quem configura, como as sugestões do Ativo e do Local (4.8) e a busca da pessoa (4.22), tem duas rotas, uma por permissão, porque cada rota pede uma permissão só: a da gaveta, com `chamados.atender`, e a da prévia do colaborador, com `chamados.configurar`, em `/chamados/tipos/`. As duas dão o mesmo, só com o que a conta vê.

As rotas ficam num bloco próprio em `apps/api/src/app.ts`, com o `exigirModuloLigado` do módulo `chamados`, como os outros módulos opcionais. Fora do bloco, a busca segue a regra dos módulos desligados (spec modulos-da-organizacao), e a tarefa do prazo pula a organização com o módulo desligado, pelo `modulosDesligados`.

**A busca da pessoa (tarefa 4.22).** A gaveta (5.18) e o "Ver como" da prévia (5.24) buscam a pessoa pelo `GET /chamados/pessoas?busca=`, com `chamados.atender`, e pelo `GET /chamados/tipos/pessoas?busca=`, com `chamados.configurar`, montadas juntas, como as das sugestões. A lista das pessoas (`GET /pessoas`) pede `pessoas.ver`, e os nomes das pessoas (`GET /pessoas/nomes`), que servem a qualquer sessão e o formulário das Solicitações e o responsável do ativo usam, saem de propósito sem o local de ninguém (design do P1b, decisão 10, e do escolhas-a-vista, decisão 4). A gaveta precisa do local: para separar as pessoas de mesmo nome e para quem abre ver, antes de escolher, que a pessoa é de um local que a conta não atende. Quem atende e quem configura já recebem o local da pessoa pelas sugestões e pela frase da recusa da abertura, e por isso a rota própria, com a permissão dos chamados, pode dá-lo. Decisões que o plano não fechava:
- **O termo** vai de 1 a 100 caracteres, sem os espaços das pontas, como o da busca dos chamados. As palavras são as do `normalizarTexto`, cada uma num `strpos` do nome sem acento no banco (o `semAcento`, o mesmo das listas dos ativos, das OS e das solicitações). O termo só de acento não sobra palavra nenhuma e não acha ninguém.
- **Só o nome.** O texto de busca das pessoas (`pessoas.busca`) tem também a matrícula e o e-mail, e acharia a pessoa por um contato que a conta pode não ver: a busca pela parte de um e-mail diria a quem não tem `pessoas.ver` de quem ele é.
- **Só as pessoas ativas.** A inativa não abre chamado, pela recusa da abertura, e a anonimizada tem a situação própria e fica de fora junto.
- **Toda a organização, sem o alcance de quem busca.** A abertura recusa a pessoa de um local que a conta não atende com a frase que diz o local; a busca que a escondesse pareceria dizer que a pessoa não existe. A prévia mostra o formulário como qualquer pessoa o veria.
- **Cada pessoa** vem com o id, o nome e o caminho do local de trabalho, nulo sem o local, como o chamado a mostra a quem o vê (a pessoa dos prazos e da ficha), e nada dos contatos.
- **A ordem** é a do nome sem acento, com o id no desempate, até 10: "Álvaro" vem antes de "Bruno", e não depois de "Zélia", como na ordem dos bytes.
- **O total** das pessoas que casam vem junto, como nos nomes das pessoas: com 11 "Silva", quem procura a Zélia e não a vê entre as 10 sabe que há mais e afina o termo, em vez de concluir que ela não tem cadastro.

**Os tipos da gaveta (tarefa 5.18).** A gaveta lê os tipos que oferece pelo `GET /chamados/abertura`, com `chamados.atender`: a lista dos tipos e o formulário de cada um, em `/chamados/tipos`, pedem `chamados.configurar`, e quem atende sem configurar, como o Diego, não teria o que escolher. Decisões que o plano não fechava:
- **Só os Em uso,** na ordem dos tipos (`naOrdem`), também os que só a TI abre e os que não aparecem para o colaborador. O Rascunho e o Inativo ficam de fora, porque a abertura os recusa ("O tipo escolhido não está em uso.").
- **Cada tipo** vem com o id, o nome, o ícone, a frase e o formulário de agora, o mesmo que a abertura confere. O prazo, quem atende por padrão, as chaves e as contagens ficam de fora: são de quem configura, e a gaveta não os mostra.
- **Uma leitura só,** com os formulários juntos: a gaveta abre com tudo, e a troca do tipo não espera a rede. Os nove tipos de fábrica dão poucos kB.
- **Na web,** a consulta fica debaixo da chave dos ajustes (`CHAVE_DOS_AJUSTES_DOS_CHAMADOS`), que o `ajustes-dos-chamados.mudaram` relê: o tipo ativado, inativado ou com o formulário trocado chega à gaveta aberta. O tipo escolhido que sai da lista deixa a escolha vazia, e a abertura pede "Escolha o tipo.".

**As contas de quem atende (tarefa 5.19).** O editor do tipo oferece em "Quem atende por padrão" as contas do `GET /chamados/tipos/contas`, com `chamados.configurar`: a lista das contas é da Administração, e quem só configura os chamados não teria quem escolher. Vêm as contas ativas, com a pessoa ativa, que têm `chamados.atender` em algum local, com o id e o nome da pessoa, pelo nome. A conta gravada que deixou de atender não vem: o editor a mostra escolhida, e a gravação a recusa. O tipo de ativo do equipamento vem do `GET /tipos-de-ativo`, que é de referência.

**Os alvos na consulta da auditoria (tarefa 4.21).** A consulta (`apps/api/src/rotas/auditoria.ts`) dá o nome de agora do alvo, lido de uma vez para os registros da página, como o dos ativos, dos segredos, das solicitações e das OS. Decisões que o plano não fechava:
- **O chamado** é "#<número> · <título>", com o título inteiro: ele já tem no máximo 120 caracteres e fica numa linha só, ao contrário do problema da OS, que o `nomeDaOrdem` corta. O título é o de agora, como foi escrito, também depois da anonimização da pessoa.
- **O tipo** vai pelo nome, e **a resposta pronta**, pelo rótulo. O Rascunho descartado e a resposta removida não têm mais a linha: o alvo fica sem o nome, e o filtro pelo alvo segue achando os registros pelo id. O nome e o rótulo ficam no antes do `tipo-de-chamado.descartado` e do `resposta-pronta.removida`, que já os gravam.
- **Os alvos sem id** (a ordem dos tipos, a ordem das respostas prontas e o horário da TI) ficam sem o nome: o tipo do alvo já diz o que é, e a tela da Auditoria o escreve (tarefa 5.28).
- **Com o módulo desligado**, a consulta segue com os nomes, como a do segredo com o Cofre desligado: a auditoria é da plataforma, só de quem tem `auditoria.ver`, que já lê o título no depois da abertura, e o desligar guarda os dados (spec modulos-da-organizacao).
- **A leitura dos nomes** passa a um mapa por tipo de alvo, com uma consulta por tipo que aparece na página, para os sete tipos lidos à parte não repetirem o mesmo bloco.

### 19. O que o plano põe e o mockup não mostra

A referência das revisões das telas. Cada item é do plano, e não do mockup:
- **m07:** o cabeçalho do tipo mostra a frase do colaborador, no lugar da explicação "Falha, mancha ou atolamento.". O tipo tem uma frase só, a que o colaborador vê;
- **m09:**
  - o nome no resumo de cada campo, que monta o "O que chegaria para a TI" (m11) e a primeira linha da conversa (m04);
  - as escolhas do item "Título do chamado": "Começar pelo nome do tipo" e a resposta que dá o título;
  - o título montado cortado em 120 caracteres, com as reticências, e a sigla que guarda a maiúscula;
  - no campo aberto, "Remover o campo", os tipos de ativo do campo Ativo e a recusa na hora, junto do que se mudou;
  - o menu "Subir" e "Descer" de cada campo, pelo botão direito e pelo teclado;
- **m05:** o grupo "Vence depois de hoje";
- **m03:**
  - a ajuda do campo de escrever, "Escreva a resposta para Fernanda.", até a 17 e a 20;
  - "Reabra o chamado para escrever." no chamado resolvido;
- **m01 e m12:**
  - "Contando só os chamados dos locais que você vê." a quem não vê a organização inteira;
  - a coluna de quem não atende mais os chamados;
- **m02:** a coluna "Sem responsável", que recusa o chamado aguardando;
- **todos:** os textos com o nome da pessoa vão sem o artigo, como "Aguardando Fernanda", "Mensagem para Fernanda", "Avisar Sandra" e "Soltar para passar a Renato", porque o Grafite não sabe o gênero das pessoas. Os mockups põem o artigo.

### 20. Os selos e o prazo em texto

As peças comuns das telas (tarefa 5.3) ficam em `apps/web/src/modulos/chamados/Pecas.tsx`, que só exporta componentes e tipos, como as do Software, para não perder a atualização a quente do Vite; a conta do prazo fica no `prazo.ts`, ao lado.

**O selo** é o `RotuloDeSituacao` do `@grafite/ui`, com a marca e o ícone de cada palavra da spec numa lista fechada, o `SELOS`. O rótulo ganha o `icone`, que troca o ícone da situação, como ganhou o `semIcone` no software-por-pacote: a spec dá um ícone a cada palavra, e as palavras da mesma marca têm desenhos diferentes, como o "Em atendimento", o "Aguardando o colaborador" e o "Só a TI abre", os três de informação. A contagem vai no lugar da palavra, na mesma marca ("1 estourado", "3 com o relógio parado"). A chave do selo de uma situação, do chamado ou do tipo, é o código dela, e a tela passa a situação direto ao selo. Decisões que o plano não fechava:
- **Os ícones no lucide** (os mockups usam o Phosphor):

  | Selo | Lucide |
  |---|---|
  | Estourado e Toner crítico | `CircleAlert` |
  | Vencem em até 2 h | `Clock` |
  | Relógio parado e Aguardando o colaborador | `Hourglass` |
  | Na triagem | `Inbox` |
  | Em atendimento | `Headset` |
  | Resolvido e Em uso | `CircleCheck` |
  | Inativo | `Circle` |
  | Só a TI abre | `Lock` |
  | Rascunho e Ainda não criado | `SquarePen` |

  O cadeado é o `Lock`, o do "Só a TI vê" das notas (o `lock-simple` dos mockups), e não o `LockKeyhole` do ícone do tipo Acesso e senha. O lápis é o `SquarePen`, o mais perto do `note-pencil` do m08. O Estourado e o Toner crítico levam o `CircleAlert`, o `warning-circle` que os dois dividem nos mockups, no quadrado, na linha e no selo, e não o octógono do crítico do rótulo: o mockup decide o visual (revisão da 5.3).
- **O Inativo** do tipo entra na lista, neutro e com o círculo, como o "Inativo" no resto do Grafite. Os mockups não mostram um tipo inativo.

**O prazo em texto** (`PrazoEmTexto`) recebe a situação do prazo (`situacaoDoPrazo`, decisão 3) e mostra o ícone, a palavra e a cor do estado, na mono, com algarismos tabulares: a exceção nomeada do ANTISLOP, por decisão do usuário de 17/11/2026, que escolheu a mono dos mockups no lugar da Instrument Sans da idade "há 2 min". Duas formas, como nos mockups:
- **a curta,** do quadrado (m01): "estourado", "parado" ou o "vence em 2 h";
- **a inteira,** da linha dos prazos (m05) e da triagem do Início (m12): o texto do domínio, como "estourado há 20 min", "relógio parado" ou "vence em 2 h".

O ícone é o do selo do estado: o círculo com a exclamação no estourado, a ampulheta no parado e o relógio nos outros. A cor entra no estourado, a de perigo, em peso forte, e no que vence em até 2 h, a de atenção; os outros ficam na cor do texto, como no m05.

**O âmbar do "vence em 2 h".** O grupo "Vencem em até 2 h" inclui as 2 h exatas, e o texto corta para baixo. Por isso, o âmbar com "vence em 2 h" só aparece com exatamente 2 h, como no m01, às 09:40 com o vencimento às 11:40, e de 1 h a 1 h 59 min o texto diz "vence em 1 h". Cortar é o lado seguro no prazo. Na coluna do quadro, ficam duas contas lado a lado: a idade do mais antigo arredonda para o mais perto (decisão 22), e o prazo corta para baixo (revisão da 5.7).

**A cada minuto.** O `useContarOPrazo()` do `prazo.ts` devolve a conta do prazo agora, `(relogio, horario) => SituacaoDoPrazo`: o `relogioDaApi` converte as datas da resposta, e a situação sai do `useAgora` da casca, que vira na virada do minuto, como a idade das leituras, no fuso das preferências (`useDataHora`), e não no do horário da TI. A tela chama o gancho uma vez e conta cada chamado: no quadro, nos prazos e no Início, o texto, o grupo e a ordem mudam juntos, num relógio só; o chamado aberto, que pode vir sem relógio, conta só quando ele vem. A tela que mostra também uma idade, como a do mais antigo no quadro (decisão 22), lê o `useAgora` uma vez e conta pelo `contadorDoPrazo(agora, fuso)`, o mesmo de dentro do gancho, para a idade e o prazo virarem juntos.

**O prazo ilegível.** O chamado que vem sem o relógio, porque o prazo copiado não se lê (4.10), diz "prazo ilegível", nas duas formas, com o relógio e na cor do texto: o `PrazoEmTexto` recebe a situação nula. O vencimento cai em qualquer segundo, e o texto muda na virada seguinte: o "vence em menos de 1 min" fica até ela, e o estouro aparece nela, até um minuto depois do vencimento. É a precisão que a spec pede ("a cada minuto"), a mesma da tarefa que avisa o estouro.

### 21. O formulário que se preenche

Uma peça só, o `FormularioQueSePreenche` (`apps/web/src/modulos/chamados/formulario/`), para os três que preenchem o formulário do tipo:
- **a gaveta da abertura** (5.18): quem abre, em nome da pessoa, com todos os campos que a condição mostra, também os só da TI;
- **os "Campos do tipo" do chamado aberto** (5.14): quem atende, com os campos só da TI para preencher e as respostas da pessoa só para ler;
- **a prévia do colaborador** (5.24, no visual da aba, que a 5.6 acrescenta à mesma peça): quem configura, com o que a pessoa vê, sem enviar arquivo nenhum.

O `quem` diz qual dos três (`'abertura' | 'chamado' | 'pessoa'`), e o `soLeitura` deixa tudo só para ler, a quem vê o chamado sem atender.

**O estado é de quem usa a peça:** as respostas e os citados, o nome do que elas citam pelo id:
- os ativos, com o patrimônio e o rótulo;
- os locais, com o caminho;
- as pessoas, com o nome;
- os anexos, com o nome, o tamanho e onde estão: sem dono, no chamado ou, na prévia, só no navegador.

A peça muda as respostas pelo `responder` do domínio, com o "Apagar a resposta se o campo sumir", e guarda o nome de cada escolha. A mudança chega a quem usa pelo `aoMudar`, pelo estado anterior, e é aplicada na hora, como o `set` do `useState`: o Número mostra a resposta, e a mudança adiada apagaria o que se digita. Com os citados, quem usa monta o contexto do `tituloDasRespostas` e do `resumoDasRespostas` sem pedir nada à API: o título da gaveta e o "O que chegaria para a TI" da prévia. O chamado aberto começa pelos citados que a ficha traz (`citados` e `anexosDosCampos`). As funções puras ficam no `estado.ts`, com o teste delas.

**Cada tipo de campo, no visual da tela:**

| Tipo de campo | Entrada |
|---|---|
| Texto curto e Texto longo | o campo de texto e a área de texto |
| Escolha única | a seleção, com "Nenhum" no campo que não é obrigatório, como os campos do ativo |
| Várias opções | as caixas de marcar, com a resposta na ordem das opções |
| Ativo | a busca, com as sugestões da pessoa sem nada digitado |
| Local | a escolha na árvore dos locais, com o local de trabalho da pessoa sugerido |
| Pessoa | a busca pelo nome, com o local de cada pessoa, para os homônimos |
| Data | o campo de data do kit |
| Número | o campo de texto com o teclado numérico |
| Anexo | a lista dos arquivos e "Anexar arquivos" |
| Sim ou não | a seleção com "Sim" e "Não", e "Nenhum" no campo que não é obrigatório |

Todo campo exigido tem a marca de obrigatório, como os campos do kit: as Várias opções pelo `obrigatorio` que o grupo de caixas do kit passa a receber, e o Anexo no rótulo da lista. Nos dois grupos, a marca é lida com o nome, porque o papel `group` não aceita o `aria-required`: o grupo de caixas, pelo `marcaLida` do rótulo do kit, e o Anexo, no próprio rótulo.

**As rotas, pelo `quem`:**
- a gaveta e o chamado aberto pedem as sugestões ao `GET /chamados/sugestoes` e buscam a pessoa no `GET /chamados/pessoas` (4.22), com `chamados.atender`;
- a prévia pede ao `GET /chamados/tipos/sugestoes` e ao `GET /chamados/tipos/pessoas`, com `chamados.configurar`;
- sem a pessoa do chamado, não há sugestão, e o pedido das sugestões que falha dá o mesmo: o campo segue com a busca;
- o campo Ativo, com o texto, busca no `GET /ativos`, com os tipos do campo no filtro, porque a abertura só aceita o ativo que a conta vê (decisão 5). As sugeridas que o texto acha ficam no alto. Sem `ativos.ver` em nenhum local, a busca seria recusada, e o campo fica sem ela, com a marca, a explicação e a recusa, como os outros campos. A resposta que já tem aparece só para ler, com "Você não vê os ativos.", porque a ficha traz o nome dela nos citados. Sem resposta, o campo exigido diz também quem pode respondê-lo (`avisoSemOsAtivos`, no `estado.ts`): "Quem vê os ativos pode abrir este chamado." na abertura e "Quem vê os ativos pode responder este campo." no chamado aberto;
- a origem das sugestões sai do `motivo` de cada ativo: só os da pessoa, só os do local ou os dois.

**O número** guarda o número inteiro. O campo aceita só os algarismos e tira os pontos de milhar e os espaços, também o inseparável de um número colado ("48.210" e "48 210" viram 48210). Outro caractere, como a vírgula, não entra, para a resposta nunca sair do tipo do campo, o que daria a recusa geral do formulário. O limite (999.999.999) é a recusa do domínio, no campo.

**Os anexos:**
- **o envio:** um a um, pelo `POST /chamados/anexos`, na hora (decisão 10), com o progresso de cada um, e a resposta guarda os ids;
- **a fila:** o envio que acaba entra pelo `aoAnexar` de agora, que já conhece o formulário trocado no meio da fila. Desmontada a peça, o envio em curso acaba fora da resposta e a fila para: o arquivo enviado fica sem dono, para a manutenção. Uma falha no laço não prende a fila;
- **as recusas:** o arquivo vazio e o maior que 25 MB são recusados antes do envio, como no kit. Essas e a recusa da API ficam no campo, com o nome do arquivo;
- **o limite:** o do domínio (`MAXIMO_DE_ANEXOS`), o mesmo que a gravação confere. Com 5 arquivos, "Anexar arquivos" sai. Dos escolhidos a mais, os que passam do limite não vão, com "Anexe até 5 arquivos." e o nome dos que ficaram de fora;
- **"Tirar"** tira o arquivo da resposta. O arquivo sem dono sai na manutenção (decisão 10), e o do campo só da TI, na gravação;
- **o download:** cada arquivo baixa pelo endereço de onde ele está, que o estado guarda com o nome. O enviado agora, ainda sem dono, baixa pelo `GET /chamados/anexos/:arquivo`, que só o entrega a quem o enviou, também no chamado aberto até a gravação. O do chamado baixa pelo `GET /chamados/:numero/anexos/:arquivo`, que só entrega o anexo já tomado;
- **na prévia,** o arquivo não é enviado. Ele entra na resposta com um id do navegador (`crypto.randomUUID`), para a condição, o título e o resumo o contarem.

**As recusas** chegam de quem usa a peça, na chave do domínio (`campos.<id>`), do `conferirRespostas` ou do 400 da API, e a geral (`formulario`) fica no alto da peça.

### 22. Quem está com o quê

A tela (tarefa 5.7) monta as colunas com dois pedidos, os dois debaixo da chave dos chamados e com o fuso das preferências da conta (`useDataHora`), pelos ganchos do `consultas.ts` que o Início (5.17) e os prazos (5.15) também usam:
- **o quadro** (`GET /chamados/quadro?fuso=`, 4.9) dá a ordem das colunas e, em cada uma, os números, o mais antigo, os pedaços e os resolvidos hoje, além do aviso do alcance;
- **a lista dos prazos** (`GET /chamados/prazos?fuso=`, 4.10) dá o tipo, o título e o relógio de cada quadrado.

**Os dois pedidos fora de passo.** Eles são lidos em momentos diferentes, e o `chamados.mudaram` relê os dois, cada um no seu tempo. A tela segue os números do quadro, e a lista só completa os quadrados:
- o número que o quadro tem e a lista não traz fica num quadrado só com o número: "Carregando…" enquanto um dos dois pedidos é relido, e "Detalhes não carregados" fora disso, que só acontece se os dois ficarem fora de passo sem um evento que os releia;
- o número que só a lista traz fica de fora, até o quadro o pôr numa coluna.

A primeira leitura espera os dois ("Carregando os chamados…"), e o selo dos abertos entra com as colunas. A falha:
- **sem as colunas na tela,** a de um dos dois fica no lugar delas, com a frase do erro e o "Tentar de novo", como nas outras telas. Tentar de novo volta ao "Carregando os chamados…";
- **com as colunas na tela,** a de uma releitura, pelo evento ou pelo foco da janela, vai acima delas, com a frase do erro, "As colunas mostram a última leitura." e o "Tentar de novo", que diz que relê. As colunas e o selo ficam com a última leitura: a tela fica aberta o dia todo, e um soluço da rede não apaga o que quem atende está lendo (revisão da 5.7).

**A chave de cada coluna** é a conta e a marca de quem não atende mais (`<conta>:atende` e `<conta>:nao-atende-mais`), porque a mesma conta pode ter as duas. A 5.9 usa a mesma chave no alvo do arraste.

**A ordem dos quadrados** é a do `compararPrazos`, com o empate pelo número. Depois vêm os de prazo ilegível e os que a lista ainda não trouxe, pelo número.

**Um relógio só.** A tela lê o `useAgora` uma vez. Com o mesmo momento, ela conta o prazo de cada quadrado, pelo `contadorDoPrazo(agora, fuso)` (decisão 20), e a idade do mais antigo. Assim, a idade e o prazo viram juntos.

**A idade do mais antigo** (`idadeDoMaisAntigo`, no `quadro/quadro.ts`) arredonda para o mais perto, como o mockup (16 h 35 min dá "há 17 h"), e não corta como o `idadeRelativa` da casca:
- em minutos até 59 min, em horas até 23 h e em dias daí em diante;
- a unidade sobe quando o arredondamento chega à seguinte: 59 min 40 s dá "há 1 h", e 23 h 40 min, "há 1 d";
- abaixo de meio minuto, "há menos de 1 min", como no prazo. O mockup não mostra idades abaixo de 1 h.

**As cores das pessoas e dos tipos** são as das séries, como no ícone do pacote do Software, e o nome vai sempre junto, em texto:
- a sigla de quem atende (`SiglaDaPessoa`) fica na série da conta, de 1 a 8, sempre a mesma para a mesma conta. A série sai da soma do id, e não do nome, que muda. A coluna da triagem leva a bandeja, neutra;
- o ícone do tipo (`IconeDoTipo`) fica na série do ícone (a tabela da decisão 6) e tem o nome do tipo para o leitor de tela. O ícone que a web não conhece fica nas reticências, neutro.

**A coluna:**
- **a triagem:** a bandeja, "Sem responsável", "3 na triagem" e o mais antigo, sem barra e sem pé;
- **a pessoa:** a sigla, o nome, "2 abertos" e o mais antigo, a barra, com "Carga: 2 de 5" no nome lido e no título, e o pé;
- **quem não atende mais:** a mesma coluna, com "não atende mais os chamados" embaixo do nome, também no nome lido da coluna.

O "2 abertos" e o "mais antigo…" ficam um embaixo do outro, como no mockup, e o "·" da spec entre os dois fica só para o leitor de tela. O título é o nível 2 de cada coluna.

**A largura.** As colunas e os quadrados acompanham a janela, como o m01 a 1440 px:
- a triagem tem no mínimo 232 px, e cada pessoa, 200 px. Abaixo disso, as colunas rolam de lado dentro da tela, em vez de estreitar;
- dois quadrados por linha quando cabem dois de 112 px, como no m01, e um por linha quando não cabem;
- o quadrado tem no mínimo 92 px de altura e cresce quando o prazo vai para duas linhas. O respiro dele é de 7 px dos quatro lados, e o do m01, de 8 px dos lados. O "vence em 2 h" tem 95,2 px, e o quadrado de 113 px do m01 dá 95 px por dentro: o mockup não deixa o prazo quebrar, e aqui o pixel a mais o mantém numa linha sempre que cabem dois quadrados por linha;
- o prazo curto quebra antes da medida ("vence em" numa linha e "35 min" na outra), e nenhuma medida ("35 min", "17 h", "2 d" ou "menos de 1 min") se parte, também no mais antigo (`TextoComMedidas`, no `Pecas.tsx`).

**O que fica para depois.** No cabeçalho do m01:
- o "Buscar nos chamados" entra com a busca (5.10);
- o "Novo chamado" entra com a gaveta (5.18).

**A prévia e o menu (tarefa 5.8).** O quadrado é um `article` com o foco, como no m01, com o nome "#1033 Switch Rack 2 sem link na porta 3", e o prazo o descreve ("estourado"), para quem chega a ele pelo foco com o leitor de tela. Com o ponteiro em cima, ele ganha a camada do hover por cima da superfície, que continua opaca sobre o fundo da coluna: o m01 não mostra o hover. O quadrado sem os detalhes da lista ("Carregando…" ou "Detalhes não carregados") fica sem prévia e sem menu, porque o que eles mostram e o que mandam vêm dela.

A prévia abre:
- **com o ponteiro parado 200 ms sobre o quadrado.** Cada movimento recomeça a conta, e o ponteiro que só passa não abre nada. Só o mouse: o toque e a caneta não a abrem;
- **na hora, com o foco que vem do teclado.** O foco que vem do aperto do ponteiro não a abre: o botão direito abre o menu, e o arraste (5.9) começa no aperto. A tela guarda se a última interação foi o aperto ou a tecla, como o React Aria faz no anel do foco. O foco posto pelo código segue a última interação, e, antes de qualquer uma, conta como o do teclado.

Não abrem a prévia o foco que volta ao quadrado com o Esc, o que volta quando o menu fecha e o que o clique direito põe nele, nem o foco no quadrado cuja ação espera a resposta.

A prévia fecha:
- 300 ms depois de o ponteiro sair do quadrado e dela (o `tempos.cartao.fechar` do kit), o tempo de passar de um ao outro;
- aberta pelo foco, quando o foco sai do quadrado e dela;
- com Esc, com o foco no quadrado ou nela;
- aberta pelo ponteiro, com a rolagem de qualquer parte fora dela e com a mudança do tamanho da janela, como o resumo da linha da tabela. A aberta pelo foco fica e acompanha o quadrado, porque o foco que chega a um quadrado fora da área rola as colunas até ele;
- aberta pelo foco, quando a rolagem tira o quadrado inteiro da área das colunas, de lado ou na altura: o foco que estava nela vai ao quadrado, sem rolar as colunas de volta. O quadrado que encosta na borda, ou fica meio fora, ainda a tem (`foraDaArea`);
- aberta pelo ponteiro, com a resposta da ação (abaixo);
- aberta pelo ponteiro, quando o quadrado sai da coluna em que estava, pela ação da conta ou pela mudança de outra pessoa, porque ele sai de baixo do ponteiro, e a espera dele também acaba. A aberta pelo foco acompanha o quadrado;
- aberta pelo ponteiro ou pelo foco, quando o número sai do quadro, para ela não voltar com ele;
- quando a de outro quadrado abre: só uma fica aberta.

O relógio dela é puro (`controleDaPrevia`, no `quadro/previa.ts`), e a tela (`PreviaDoChamado.tsx`) só a desenha.

**O lugar da prévia.** Ela vai logo depois do quadrado, no mesmo item da lista, e não numa camada à parte: o Tab passa do quadrado aos botões dela e dela ao quadrado seguinte, na ordem da leitura. Ela fica na posição fixa, a 8 px embaixo do quadrado, e encosta na borda direita das colunas quando não cabe, como a do #1033 no m01. Sem lugar embaixo, ela vai em cima. A conta é pura (`lugarDaPrevia`, no `quadro/previa.ts`), com a caixa do quadrado, a da área das colunas e o tamanho da prévia. Ela é opaca, sem o vidro, com a superfície elevada, a borda forte, o raio do menu e a sombra sobreposta do m01, e tem 388 px de largura, ou a da área, se for menor.

**O conteúdo,** na ordem do m01:
- o número, o tipo com o ícone e a situação do prazo num selo, com a primeira letra maiúscula ("Estourado há 20 min", "Vence em 2 h", "Relógio parado" ou "Prazo ilegível"). O selo (`SeloDoPrazo`, no `Pecas.tsx`) tem o texto e a marca do `seloDoPrazo`, no `prazo.ts`: crítica no estourado, atenção nos que vencem em até 2 h e neutra no resto, como a cor dos grupos (decisão 20). A ficha (5.10) usa o mesmo;
- o título inteiro;
- "Pediu": a pessoa e o local dela;
- "Ativo": o patrimônio, em mono, o nome e o local, ou "Nenhum ativo ligado". O m01 mostra o IP do ativo, que a lista não traz, e aqui vai o local;
- "Atende": quem atende, com "não atende mais os chamados" quando o quadrado está na coluna dessa marca, ou "Ninguém ainda, na triagem";
- a última mensagem, com quem a escreveu e a hora no fuso da conta: "09:12" hoje, "ontem, 15:10" e "seg 9 nov, 16:00" antes, e, noutro ano, "10/11/2025, 16:00" (`momentoDaMensagem`). Sem mensagem, "Nenhuma mensagem ainda.";
- "Assumir", fora no chamado que já está com a conta;
- "Passar para…", com um botão por pessoa: a sigla, o primeiro nome e os abertos dela ("Ana · 2 abertos"), com o nome inteiro no nome lido. As pessoas são as das colunas de quem atende, na ordem delas, fora quem está com o chamado, como no m01, em que Ana, a conta da sessão, está na lista do #1033. Quem não atende os locais do chamado fica de fora, pela mesma regra da coluna que não recebe o arraste (5.9, abaixo).

A quem só vê os chamados, a prévia vai sem as ações, e o menu, desde a 5.10, só com o "Abrir o chamado". A permissão é a geral (`chamados.atender`, pelo `useAcesso`), como o contrato de módulo pede para uma ação: o local de cada chamado, a API confere.

**O menu** abre com o botão direito, no ponto do clique, e, com o foco no quadrado, com a tecla de menu e com Shift+F10, junto do quadrado, como o da tabela. Ele fecha a prévia e, quando fecha, devolve o foco ao quadrado. Os itens seguem a matriz das ações (spec chamados, "Ações do atendimento"):
- "Assumir", fora no chamado que já está com a conta;
- "Passar para…", num submenu com as mesmas pessoas da prévia, cada uma com o nome e os abertos;
- "Devolver à triagem", só no chamado em atendimento.

O quadrado sem nenhuma ação, como o aguardando da própria conta numa TI de uma pessoa só, tem o menu só com o "Abrir o chamado", da 5.10, como o de quem só vê os chamados. Antes dela, esse menu ficava sem itens e não abria.

O `MenuDeContexto` do kit ganha o submenu, que a spec componentes-base já pede ("os mesmos itens com submenu"). A ação fica em cada item, como nos menus da casca, porque a do menu de fora não chega ao submenu.

**As ações** ficam no `acoes.ts` do módulo (`useAcoesDoAtendimento`), que a ficha (5.10) e o painel dos prazos (5.16) também usam. Cada uma manda a versão que a tela mostra. No quadro, ela é a das `versoes`, que é a das colunas: a lista, que pode estar fora de passo, só completa o quadrado. O botão da prévia gira enquanto espera. Com a resposta:
- **a aberta pelo ponteiro fecha,** porque o quadrado que muda de coluna sai de baixo dele, e o foco que estava nela volta ao quadrado;
- **a aberta pelo foco fica,** relida, e acompanha o quadrado, com o foco. Assim, depois da recusa, quem usa o teclado lê nela o chamado como ele está.

O retorno vai num aviso:
- "Você assumiu o #1033.", com "Desfazer", que manda a versão que o assumir devolveu;
- "Você passou o #1033 a Bruno.";
- "Você devolveu o #1033 à triagem.";
- no desfazer, "O #1033 voltou a Renato." ou "O #1042 voltou à triagem.";
- a recusa, no aviso crítico com a frase da API, como nas outras telas.

Depois de cada ação, aceita ou recusada, a tela relê os chamados (a `CHAVE_DOS_CHAMADOS`: o quadro, os prazos e a ficha), sem esperar o `chamados.mudaram`. Assim, depois do `chamado-mudou`, a tela mostra o chamado como ele está, e a conta que agiu vê a mudança na hora. O quadrado que muda de coluna é outro elemento, e o foco nele se perderia: depois da releitura, o foco que se perdeu com ele vai ao quadrado do mesmo número, com a prévia como estava, aberta ou fechada. Assim, a ação pelo menu não abre a prévia que o menu fechou. Se a releitura chega antes de o foco voltar do menu, o foco vai direto ao quadrado relido. O foco que a pessoa tira de um elemento que continua na tela fica onde ela o pôs.

**O que fica para a 5.10:** "Abrir o chamado", no menu, o Enter e o clique, com o endereço `/chamados/<número>`. Até lá, o item que não leva a nada não entra.

**O arraste (tarefa 5.9),** no `useArrastar` (decisão 15), com o m02:
- **quem recebe** sai de uma função pura, `naColuna(chamado, coluna, arvore)`, no `quadro/arraste.ts`: a frase de soltar, ou o motivo da recusa. O alcance de cada coluna é o `atende` do quadro (4.9), com os ramos das raízes pela árvore do `/locais` (`useArvoreDosLocais`). O motivo leva o caminho do primeiro local fora do alcance. Sem a árvore ainda, só o chamado sem local fica de fora, e a API recusa o resto. A mesma função filtra o "Passar para…" da prévia e do menu (`pessoasParaPassar`);
- **no começo,** a prévia fecha. O quadrado no ar, `aria-hidden` e fixo na janela, parte da caixa do quadrado no aperto, com a inclinação de −2,5°, a sombra sobreposta e a borda do destaque do m02. O de origem fica tracejado, a 60 %, com o aviso embaixo dos quadrados da coluna;
- **a coluna sob o ponteiro que recebe** ganha a área de soltar no alto (a `.solta` do m02) e o pedaço tracejado. As que não recebem mostram o motivo durante todo o arraste, para quem arrasta saber antes de chegar;
- **soltar** chama o passar ou o devolver da prévia (5.8), com a versão, o aviso e a releitura;
- **a dica do cabeçalho** vai no `apoio`, novo, do `CabecalhoDaPagina` do kit, ao lado do título e fora dele, e some sem o mouse (`hover: none`);
- **o quadrado que entra numa coluna** (o movimento do quadro), depois da primeira leitura, desce `--esp-2` em `--dur-deslocamento` e aparece em `--dur-opacidade`; com o movimento reduzido, só aparece. Na primeira leitura, nada se move.

**O chamado aberto, o cabeçalho (tarefa 5.10),** com o m03:
- **o endereço** `/chamados/$numero`, para quem vê ou atende os chamados, com a ficha em `['chamados', 'ficha', número]`, que os eventos da decisão 14 relêem. As notificações já levam a ele (`destinoDoChamado`, 4.8). O número que não tem de 1 a 9 algarismos não pede nada; ele, o 400 e o 404 da API dizem "Chamado não encontrado.", e as outras falhas, a frase delas, com "Tentar de novo";
- **o cabeçalho é o `CabecalhoDaPagina` do kit,** como em toda tela (o teste-guarda reprova o título solto), com duas partes novas, feitas para o `.cab` do m03 (spec componentes-base, "Cabeçalho da página"):
  - a `trilha`, numa linha só dela, em cima do título, a 2 passos dele;
  - o `quadro`, à direita do título e das ações, no meio da altura dos dois. Com ele, as ações vão embaixo do título, a partir da esquerda, e "Responder", a principal, fecha o grupo. O título fica no alto, no mesmo lugar do carregamento, também sem as ações, quando o quadro é mais alto que ele. Na largura que não comporta os dois lado a lado, o quadro desce para baixo das ações, ainda à direita;
  - a tela só ajusta o que é dela: o cabeçalho de borda a borda, o título no tamanho grande do m03 e os dados no texto principal;
  - a trilha leva ao Início dos chamados pelo "Chamados". Quem atende vem com o desde na hora da mensagem ("ontem, 17:20") e, no mesmo dia, "desde as 09:40", como no m04; na triagem, ele não aparece, e o selo diz "Na triagem";
- **as ações,** a quem atende os locais do chamado (`permite.atender`), na ordem do m03: "Assumir", fora do que está com a conta, "Transferir", "Virar OS", "Resolver" e "Responder", a principal; no resolvido, só "Reabrir". "Virar OS" fica só no chamado de um tipo que vira OS, com o ativo ligado, sem a OS e com o Operação ligado. O botão que espera a resposta gira, e os outros esperam com ele:
  - "Transferir" abre o menu do "Passar para…", com as colunas do quadro e a regra do arraste (`pessoasParaPassar`); sem ninguém, o menu diz "Ninguém mais atende os locais do chamado.";
  - "Virar OS" abre o diálogo com o "Problema", que começa com o título. A OS aberta dá "OS 13 aberta.", com "Abrir", e a recusa fica no diálogo;
  - "Resolver" abre o diálogo com "O que foi feito", de 1 a 2.000 caracteres. O aviso diz "Você resolveu o #1042.", e a recusa fica no diálogo;
  - "Reabrir" age direto, com "Você reabriu o #1042.", e "Assumir", com o aviso e o "Desfazer" do quadro;
  - "Responder" leva o foco ao campo de escrever, que chega na 5.12;
- **o quadro do prazo** sai de uma função pura (`quadroDoPrazo`, no `chamado/prazo.ts`), com os testes antes:
  - o prazo do tipo: "Prazo do tipo, 8 h, no horário da TI" ou "em horas corridas";
  - em destaque, o texto do selo do prazo, com a cor só no estourado e no que vence em até 2 h;
  - contando, "Abriu às 07:40 · conta das 08:00 · vence às 16:00". O "conta das" aparece só no relógio que ainda não contou nada e voltou a contar fora do horário, e depois do prazo o "vence" vira "venceu";
  - parado, também no resolvido, "Parou às 09:21 · restam 1 h 44 min" ou "Parou às 09:40 · passou 20 min do prazo", com o que resta em horas e minutos;
  - o dia vai como na hora da mensagem, também para a frente: "às 16:00" hoje, "ontem às 17:05", "amanhã às 08:12" e "qui 19 nov às 08:12";
  - o vencimento e o que resta, ou o que passou, vão na fonte mono, como no m04;
  - sem relógio (o prazo ilegível), "Prazo ilegível" e só o "Abriu às";
- **no quadro de "Quem está com o quê",** o Enter no quadrado com o foco e o clique abrem o chamado; o clique depois de um arraste, não, porque o `useArrastar` o engole. O menu ganha "Abrir o chamado" no alto, separado das ações por uma linha, e quem só vê os chamados passa a ter o menu só com ele;
- **o provedor da busca** (`provedorDosChamados`), no grupo "Chamados", com `chamados.ver` e a partir de 2 caracteres: "#1042 Impressora manchando" e, no caminho, "Marina Lopes · Em atendimento", com o rótulo do selo;
- **o "Buscar nos chamados"** fica nos cabeçalhos do Início, de "Quem está com o quê" e dos Prazos (o m12, o m01, o m02 e o m05). É um campo de 260 px, com a lupa e o texto de exemplo, sem rótulo à vista, o `BuscaComResultados`, novo no kit, com a busca feita por fora:
  - a partir de 2 caracteres, depois da pausa dos provedores (`tempos.busca`), ele pede a mesma busca e abre embaixo a lista, em duas linhas por chamado, como a do provedor, com o primeiro já escolhido;
  - as setas andam pela lista, e Enter ou o clique abrem o chamado e limpam o campo. Esc fecha a lista;
  - o Enter no "Buscando…", de quem digita "1042" e tecla Enter em seguida, abre o primeiro resultado quando ele chega; sem resultado ou na falha, o Enter não fecha a lista, que diz o aviso;
  - sem resultado, a lista diz "Nenhum chamado com “impressora”.", e a falha diz a frase dela.
  É a busca do sistema só com os chamados, para quem já está nas telas deles.

**O chamado aberto, a conversa (tarefa 5.11),** com o m03 e o m04:
- **a coluna,** de até 720 px, no centro da área embaixo do cabeçalho, numa lista na ordem da ficha, que a API já ordena (decisão 8). Como no m03, a tela fica da altura da janela, com o cabeçalho no alto e o campo de escrever da 5.12 preso no pé, e só a conversa rola, pela tela que rola por dentro do contrato de módulo (`data-janela-inteira="rola-por-dentro"`). Ela abre no fim, na última mensagem, e fica no fim quando chega um item novo ou o campo cresce, se quem lê já estava nele;
- **a mensagem,** sem balão: a sigla de 32 px (a da conta com a série dela, a da pessoa no círculo neutro), o nome em peso forte, a hora e o texto, com as quebras de linha;
- **a nota,** no quadro tracejado da atenção: o cadeado, "Nota interna · Ana Souza", a hora e o selo "Só a TI vê" à direita;
- **a hora,** como no m03: "hoje, 09:21", "ontem, 17:22" e "seg 9 nov, 16:00" nas mensagens, nas notas, na abertura e nos alertas; nos eventos das ações, só a hora no mesmo dia, como no "assumiu o chamado · 09:40" do m04;
- **o evento,** numa linha no centro entre dois traços, com a frase que a web monta (decisão 8) e o nome sem artigo (decisão 19):
  - a abertura: "Ana Souza abriu o chamado para Marina Rocha · hoje, 07:40" (a origem é só a TI nesta versão; o "pela aba do computador" do m04 chega com a aba) e, logo depois, o resumo das respostas num quadro, com o nome de cada uma em versal pequena e o patrimônio do ativo na mono (m04). O resumo sai do `partesDoResumo` do domínio, de que o `resumoDasRespostas` passa a ser a junção;
  - "Ana Souza assumiu o chamado · 09:40 · estava há 2 h na triagem", ou "com Bruno Lima", pelo `desde`; "Bruno Lima passou o chamado para Ana Souza", com "de Diego Martins" quando quem passou não estava com ele; "Ana Souza devolveu o chamado à triagem"; "Ana Souza desfez o assumir · 09:41 · o chamado voltou à triagem", ou "para Bruno Lima";
  - "Aguardando Fernanda · 09:21 · o relógio parou", em peso forte e com a ampulheta (m03), com o primeiro nome; "Ana Souza retomou o atendimento · o relógio voltou a contar"; "Ana Souza resolveu o chamado"; "Ana Souza reabriu o chamado · o relógio voltou a contar", com "voltou à triagem" ou "para Bruno Lima" quando não fica com quem reabriu;
  - "Ana Souza ligou o ativo PAT-00139", "trocou o ativo PAT-00139 por PAT-00140" e "tirou o ativo PAT-00139";
  - "Virou a OS 13 · 10:00 · por Ana Souza", "Juntou-se à solicitação 4", "Pediu toner na solicitação 5" e "Gerou a solicitação 6", como na spec; e "A solicitação não foi gerada: o módulo Operação está desligado", sem o ponto do motivo antes da hora;
- **o alerta do ativo,** na linha do evento, em peso forte e com o sino: "Alerta no ativo PAT-00139: toner preto abaixo de 10% · hoje, 09:36". O m04 diz "ligado à PAT-00139", e o artigo sai pela regra da decisão 19, porque o rótulo do ativo pode ser de qualquer gênero;
- **os anexos** da mensagem e da nota, embaixo do texto, como no campo Anexo do formulário: o ícone, o nome, o tamanho e "Baixar", pelo `GET /chamados/:numero/anexos/:arquivo`, sem miniatura, porque a entrega é sempre para baixar (decisão 10). Os mockups não os mostram.

**O campo de escrever (tarefa 5.12),** com o m03:
- **o lugar:** no pé da tela, na faixa afundada de borda a borda, com a coluna da conversa (720 px no meio, a largura da área nos cantos), só a quem atende os locais do chamado (`permite.atender`). No resolvido, a faixa diz "Reabra o chamado para escrever.", com o "Reabrir" das ações do atendimento. Os botões do kit são mais largos que os do m03: na coluna de 720 px, o clipe, o atalho e "Enviar" descem para a linha de baixo, à direita, e nos cantos cabem na linha das respostas prontas. A regra é pura (`chamado/escrever.ts`): o campo, o reabrir ou nada, e o envio, com a rota e o rótulo do botão; os testes dela vêm antes do código, porque decidem a permissão;
- **a chave:** o `ControleSegmentado` do kit, "Mensagem para Fernanda", com o balão, e "Nota interna", com o cadeado. Na mensagem, à direita da chave, a caixa de marcar "Esperar a resposta" troca "Enviar" por "Enviar e esperar a resposta". O m03 não mostra o "Enviar e esperar": a caixa deixa à vista, antes de mandar, que o relógio vai parar, e a linha dos botões fica a do m03. Ela desliga depois de mandar;
- **a caixa:** a `AreaDeTexto` do kit, que ganha o `ocultarRotulo` e o `ref` da caixa. O nome dela é o da chave, e a ajuda é o texto de exemplo, como no m03. Ela cresce com o texto até a metade da altura da janela e depois rola. Na nota, ela fica no quadro tracejado da atenção, sem as respostas prontas e sem a caixa de marcar, a ajuda diz "Escreva a nota. Fernanda não a vê." e o botão diz "Salvar a nota". Trocar a chave tira as recusas do outro modo;
- **as respostas prontas:** o menu "Respostas prontas", com o raio, tem todas as do tipo, na ordem da ficha, e "Espera a resposta" embaixo do rótulo das que esperam; as duas primeiras ficam também ao lado, em botões, como no m03. A escolhida entra onde está o cursor, no lugar da seleção, e o cursor fica depois dela, com o foco na caixa; colada no texto, ela entra numa linha dela, com a quebra antes, quando o de antes não acaba em espaço nem em quebra, e depois, quando o de depois não começa neles (revisão da 5.12): o menu fechado devolve o foco ao botão dele, que o passa à caixa, como o quadro faz com o foco que volta do menu. A que espera a resposta liga o "Esperar a resposta". O `{nome}` já vem trocado na ficha (tarefa 4.11);
- **os anexos:** o clipe ("Anexar arquivos") escolhe os arquivos, que vão um a um pelo `POST /chamados/anexos`, como no formulário: a fila e a lista saem do `AnexosDoCampo` para peças comuns aos dois. Até 5; enquanto um arquivo vai, o "Enviar" espera;
- **mandar:** "Enviar", Ctrl+Enter ou ⌘+Enter pedem o `/mensagem`, o `/esperar` ou o `/nota`, com o texto e os anexos; enquanto o pedido vai, a caixa não muda. Aceito, o campo esvazia, a conversa vai ao fim, e a tela relê os chamados, sem aviso: a mensagem na conversa é o retorno. A recusa do texto fica na caixa, a dos anexos embaixo da lista e as outras embaixo do campo, com a frase da API;
- **o rascunho:** o texto, a chave, a caixa de marcar e os anexos ficam no estado do componente de fora do campo, com a chave do número do chamado, e não na consulta. A releitura não os apaga, e o chamado que alguém resolve enquanto outro escreve guarda o texto até o "Reabrir".

**A conversa no meio ou nos cantos (tarefa 5.29),** um pedido do usuário depois da 5.11, sem mockup:
- **a escolha** é uma preferência da aparência, `conversas`, com "No meio" (`no-meio`), a de fábrica e a do m03, e "Nos cantos" (`nos-cantos`). Como as outras, a organização define o padrão e a conta escolhe a dela, em Ajustes › Aparência, com a explicação de cada uma e a entrada "Conversas" na busca. Vale na hora, sem salvar, e fica fora do anti-flash, porque a conversa só aparece depois de a ficha chegar. O nome é geral para o chat poder usar a mesma escolha;
- **no meio,** a conversa da 5.11, sem mudança;
- **nos cantos,** a conversa ocupa a largura da área, e cada mensagem vai num balão, com a sigla do lado de fora:
  - a de quem pede (o autor do tipo `pessoa`) à esquerda, no fundo da superfície afundada;
  - a da TI (o autor do tipo `conta`) e a nota interna à direita, com a sigla à direita: a mensagem no fundo da superfície 2, e a nota no quadro tracejado dela;
  - a mensagem, com a sigla, vai até 80 % da largura, com no máximo 44rem, e o balão encolhe na mensagem curta, com o texto alinhado à esquerda dentro dele;
  - o resumo das respostas fica à esquerda, na largura máxima do balão, porque é o que a pessoa respondeu ao abrir; os eventos e os alertas continuam no meio, entre os traços;
  - cada balão continua com o nome de quem escreveu e a hora: o lado não é a única pista de quem falou.

**A coluna da direita, a pessoa e o ativo (tarefa 5.13),** com o m04:
- **o lugar:** embaixo do cabeçalho, a conversa e o campo de escrever ficam na coluna da esquerda, e a coluna da direita, de 370 px, no fundo afundado e com a borda à esquerda, rola sozinha. Na tela com menos de 900 px de largura, ela desce para baixo do campo de escrever, sem rolar sozinha, e o corpo do chamado rola até ela; a conversa e o campo ficam com a altura que sobra, nunca menos de 420 px nem menos que o campo, porque o cabeçalho alto da tela estreita não deixa lugar a três partes que rolam;
- **as seções** recolhem pelo `<details>` do navegador, com a legenda em versal pequena, o fio e a seta, como no m04. A Pessoa começa fechada, e o Ativo ligado, aberto; guardar a escolha neste navegador é da 5.14;
- **a pessoa:** a sigla, o nome e o local; o e-mail e o telefone, em links, e "Abrir a ficha", só quando a ficha os traz (`contatos` e `abrir`). A anonimizada vem com o nome anonimizado e sem os dois;
- **o ativo:** a miniatura do tipo, o nome, o patrimônio, o selo "Toner crítico" pelo `tonerCritico` e "Abrir a ficha", a quem a abre; os suprimentos no medidor do kit, com a tinta e o nível em texto; e o local, o estado (a situação como na tabela dos ativos e há quanto tempo, como "há 12 d", pelo `desde`, com o "Desatualizado"), as páginas ("12.500 · cerca de 1.900 por mês") e as OS no ano ("2 concluídas, nenhuma aberta"), cada um só quando o resumo o traz. A ficha passa a trazer o tipo do ativo (`tipo`, com o nome e o ícone), para a miniatura, e o `usaConsumiveis`, para o "Pedir toner";
- **o estoque,** no quadro da atenção quando algum está abaixo do mínimo: os compatíveis com cor, como "CF258A: 3 de 6, abaixo do mínimo" e, quando a soma não está abaixo, "abaixo do mínimo num dos locais"; e a solicitação pendente, "A solicitação 4 está aberta; “Pedir toner” se junta a ela.", sem a segunda parte quando o botão não aparece e sem a linha quando ela já é a do chamado. A OS e a solicitação do chamado vêm embaixo, a quem as vê, com a situação e o link;
- **as ações:** "Virar OS" e "Pedir toner" no cabeçalho, como no m04, e "Trocar o ativo" (sem o ativo, "Ligar um ativo") na seção, só a quem atende, fora do resolvido. "Pedir toner" aparece com a impressora que usa consumíveis, a quem abre a ficha dela e atende as solicitações, sem solicitação no chamado e com o Operação ligado. Ele se junta à pendente ("O #1042 se juntou à solicitação 4.") ou abre a gaveta "Pedir toner para o #1042", com o registro que a API dá, gravado pela rota do chamado ("Solicitação 5 registrada.", com "Abrir");
- **trocar o ativo:** o diálogo busca como o campo Ativo do formulário (os sugeridos da pessoa e a busca entre os que a conta vê), tem "Tirar o ativo" e manda a versão, e as recusas ficam nele. Os retornos são "Você trocou o ativo do #1042.", "Você ligou um ativo ao #1042." e "Você tirou o ativo do #1042.".

**A linha do tempo, os campos do tipo e as seções guardadas (tarefa 5.14),** com o m03 e o m04:
- **a linha do tempo** é o caminho do chamado pelas situações, que a web monta dos eventos da conversa (`linhaDoTempo`, no `lado.ts`): a abertura, o assumir, o passar, o devolver, a espera, a retomada, a resolução e a reabertura. A situação de cada passo sai da matriz das ações, que a web repete sobre os eventos: o assumir e o passar no aguardando continuam no aguardando, e a reabertura sem ninguém volta à triagem. O desfazer tira o passo do assumir que ele desfaz, porque o assumir desfeito não é caminho; a troca do ativo, a OS e a solicitação ficam só na conversa;
- **cada passo** tem a situação em peso forte, com o nome do selo ("Na triagem", e não o "Novo" dos mockups, que o app não usa). Embaixo vêm a hora, como na conversa, o que houve e quem fez, sem o artigo antes do nome ("aberto por Fernanda Rocha", e não "pela Fernanda"), e o relógio, quando ele para ou volta a contar ("o relógio parou", "o relógio voltou a contar"). O m04 diz "o prazo segue" no assumir; a linha não o repete, como o m03, porque ele valeria para todo passo sem mudança no relógio. O passo de agora é o último, com o ponto na cor da informação e o `aria-current="step"`;
- **os campos do tipo** usam a peça do formulário (decisão 21) com o `quem` do chamado: as respostas da pessoa para ler e os campos só da TI para preencher, só a quem atende e fora do resolvido, como a API (`recusaDaEdicao`); a quem só vê, tudo para ler. A contagem vai na cabeça da seção, como no m04: os campos que a condição mostra com resposta e os pendentes, os só da TI obrigatórios e vazios, os mesmos que o resolver recusa ("1 respondido", "Nenhum respondido, 2 pendentes"). O tipo sem campos não tem a seção;
- **a gravação:** a escolha (Escolha única, Várias opções, Sim ou não, Ativo, Local, Pessoa e Anexo) grava na hora, porque cada clique é uma decisão. O texto, o número e a data gravam quando o foco sai do campo ou quando a tela fecha, porque cada tecla não é uma decisão e cada gravação entra na auditoria. A tela manda só os campos que mudaram (`PATCH /chamados/:numero/campos`). A recusa fica no campo, com a resposta da conta, e o campo recusado fica fora dos próximos pedidos até ela mudá-lo (`separarARecusa`): a API confere o pedido inteiro, e a recusa repetida a cada campo que a conta deixa levaria junto a mudança de outro campo. A recusa que não é de um campo vai num aviso, e a ficha relida volta a valer. Sem resposta da API, ou no erro do servidor, nada foi recusado: o aviso diz a falha, e o que a conta escreveu fica na tela e volta no próximo pedido (`destinoDaFalha`). A tela mostra a mudança até a ficha relida chegar, e a ficha relida volta a valer quando nada fica para gravar. Quem não preenche, como no resolvido, vê o que está gravado, sem a mudança nem a recusa;
- **a confirmação:** só a Escolha única, as Várias opções e o Sim ou não fazem um campo sumir (a condição só usa os três), e os três gravam na hora. Antes de aplicar a escolha que esconde um campo com arquivo, a tela pergunta "Mudar o campo “Contrato de manutenção”?", com "O campo “Foto da peça” some, e 1 arquivo é apagado." (no plural, "Os campos “Foto da peça” e “Laudo” somem, e 3 arquivos são apagados."), "Cancelar" e "Mudar", destrutivo. O nome é o do resumo, depois de "o campo", porque o artigo mudaria com o nome. "Cancelar" deixa a resposta de antes;
- **as seções guardadas:** a escolha de cada seção, aberta ou fechada, fica no `localStorage` (`grafite.chamados.secoes`), a mesma em todos os chamados, e começa com o Ativo ligado e a Linha do tempo abertos. Com o armazenamento bloqueado, a escolha vale até a tela fechar.

**A lista dos prazos (tarefa 5.15),** com o m05:
- **os grupos** saem da situação do prazo que a tela conta a cada minuto (`useContarOPrazo`), e não do `grupo` da leitura, para o texto, o grupo e a ordem andarem juntos (`gruposDosPrazos`, no `prazos/lista.ts`). Só o grupo com chamados tem faixa. O chamado sem o relógio, de prazo ilegível, vai no último grupo, "Prazo ilegível", pelo número. Os selos do alto contam os grupos, e o de contagem zerada sai, porque um "0 estourados" no vermelho chamaria a atenção para nada;
- **as faixas** levam o apoio do m05: "passou do prazo e ainda está aberto", "até as 11:40" e "depois das 11:40", com o agora mais 2 h no fuso das preferências ("até amanhã, 00:30" depois da meia-noite). No relógio parado, "aguardando o colaborador: o prazo volta a contar ao retomar", no lugar do "quando ele responder" do mockup, porque o relógio volta com o retomar da TI, e não com a resposta. O "Vence depois de hoje", que o m05 não tem, vai sem apoio, e o "Prazo ilegível", com "o prazo guardado no chamado não se lê";
- **a barra** (`barraDoPrazo`) usa o contado, o prazo e o que resta, em segundos do relógio (decisão 3): o gasto até o "agora" e o que resta até a marca do prazo, ou, no estourado, o gasto até a marca e o hachurado dela até o "agora". A escala vai de −10 h a +8 h, de 2 em 2 h, como no m05. O que passa dela fica cortado na borda, e a marca depois do +8 h vira a seta. No horário da TI, as horas da barra são as do relógio do prazo, e o texto à direita diz a distância no relógio comum;
- **cada linha** é o link do chamado, com o número, o tipo, o título, quem pediu e o primeiro nome de quem atende ("sem responsável" na triagem). A barra é só desenho, e o prazo em texto diz o estado. O painel do m06 (5.16) troca o clique pela escolha, e o "Novo chamado" do cabeçalho é da 5.18.

**O painel dos prazos (tarefa 5.16),** com o m06:
- **a escolha:** a linha vira um botão, com o `aria-expanded`, e a escolhida, com o `aria-controls` do painel, no lugar do link da 5.15. O clique, o Enter e o Espaço escolhem, e o foco vai ao título do painel; o Esc em qualquer parte da tela fecha, e fechar devolve o foco à linha. A linha escolhida fica com o fundo da superfície e a marca de 3 px do destaque no número, como no m06. A escolha é o número, no estado da tela, e cada chamado tem o painel dele (a `key`); a releitura sem ele fecha o painel, e o foco que estava nele vai à primeira linha da lista;
- **o lugar:** a tela passa a rolar por dentro (`rola-por-dentro`, como o chamado aberto): a coluna da lista, com o cabeçalho, rola sozinha, e o painel, de 440 px, fica ao lado, da altura da janela, com o rodapé fixo. Com a tela abaixo de 900 px, o painel cobre a lista, opaco, e a lista fica invisível, fora do Tab e da leitura, até ele fechar. As consultas de largura da lista passam a medir a coluna dela, e não a tela;
- **a lista compacta** (o `compacto` do `gruposDosPrazos`): as marcas de 4 em 4 h, as colunas do m06 e os apoios curtos, sem o "sem contagem de prazo". Com as colunas menores, ela fica com as barras até a coluna de 760 px, e não de 860 px. A legenda fica, que o m06 não tem, para a lista não pular quando o painel abre;
- **o prazo:** o `quadroDoPrazo` do chamado aberto, sem o `parouEm`, que a lista não traz: no parado, só o que resta. A barra (`barraDoPainel`, no `prazos/painel.ts`) é a proporção do prazo, e não a escala da lista: o gasto e o que resta, ou o prazo e o além dele, hachurado; o ilegível vai sem ela. Os textos são os do chamado aberto ("Prazo do tipo, 8 h, em horas corridas" e "Abriu às 01:20"), e não os do m06 ("8 h corridas" e "Abriu hoje, 01:20");
- **pediu, atende, o ativo e a última mensagem,** como na prévia do quadro, na ordem do m06, com a sigla ao lado de quem atende;
- **"Passar para…"** são as pessoas da prévia do quadro (`pessoasParaPassar`), com a coluna do chamado achada no quadro pela conta de quem atende (`chamadoArrastado`), e o `passar` do `useAcoesDoAtendimento`; o painel fica, relido, com quem recebeu. As ações saem de uma função pura (`acoesDoPainel`), com os testes antes, porque decidem a permissão. Sem "Assumir", como no m06;
- **a mensagem pronta** (`mensagemPronta`, no `prazos/painel.ts`, com os testes antes) segue a spec. Fora do dia de agora, o vencimento e a hora vão como no detalhe ("amanhã às 08:12"). Na mensagem que ninguém mudou, o texto acompanha o minuto; a mudada fica até a escolha de outro chamado ou até o envio, também com o painel fechado, porque a lista a guarda, e não o painel;
- **"Avisar Sandra"** manda pelo `POST /chamados/:numero/mensagem`, a rota do campo de escrever, sem a API nova: "Você avisou Sandra no #1033." no aviso, a recusa do texto no campo, a outra recusa no aviso crítico, e a releitura dos chamados;
- **quem só vê** tem o painel sem as ações, só com o "Abrir o chamado".

**O Início dos chamados (tarefa 5.17),** com o m12:
- **o alto:** o cabeçalho da página, com a saudação do domínio (`saudacao`, no fuso das preferências, que vira com o `useAgora`) no tamanho do m12, a contagem no detalhe, na cor do texto, e, embaixo dela, o "Contando só os chamados dos locais que você vê.", com o ícone da informação. À direita, o "Buscar nos chamados"; o "Novo chamado" entra com a gaveta (5.18). O "Início da TI · abre ao entrar" do m12 fica de fora: a spec não o tem, e a primeira tela já é o Início (decisão 14);
- **a contagem** (`contagemDoInicio`, no `inicio/inicio.ts`, com os testes antes): a triagem, os abertos e os resolvidos hoje vêm do quadro; os que passaram do prazo, da lista dos prazos, contados pelo relógio da tela, no mesmo minuto da lista. Com zero, "Nenhum chamado espera na triagem", "nenhum passou do prazo" e "nenhum resolvido hoje"; sem abertos, "Nenhum chamado aberto." no lugar das duas primeiras partes. O peso forte fica só no que tem algum, porque ele chama a atenção;
- **as colunas** são as do quadro (`Colunas`, com `comTriagem` falso), com a prévia, o menu e o arraste entre as pessoas. A triagem do Início é uma lista, e não uma coluna, e não recebe o arraste: o "Devolver à triagem" fica no menu do quadrado. Os nomes das colunas descem a títulos de nível 3, embaixo do "Quem está com o quê", e o aviso do alcance vai para o alto, e não acima das colunas. A cabeça do bloco tem o "Quem está com o quê", os abertos das colunas ("9 abertos") e a dica do quadro, que diz o chamado no ar no arraste;
- **a triagem:** uma linha por chamado, na ordem da coluna da triagem do quadro (`quadradosDaColuna`), com o ícone do tipo de 34 px, o título, que é o link do chamado, "#1038 · Helena Prado, Diretoria" (quem pediu e o local dela), o prazo em texto, inteiro, "Assumir", primário, com a mão, e "Passar para…", o menu das pessoas (`pessoasParaPassar`), como o "Transferir" do chamado aberto. Os botões saem de uma função pura (`acoesDaTriagem`, com os testes antes), porque decidem a permissão: sem `chamados.atender`, a linha fica sem eles. O número que a lista ainda não trouxe fica só com o número, como no quadro. A linha da ação aceita sai na releitura, e o foco que estava nela, também o do menu do "Passar para…", que fica fora da lista na página, vai ao "Assumir" da linha que ficou no lugar, ou ao da última, ou, sem nenhuma, ao título da caixa. Sem chamados, "Nenhum chamado na triagem.";
- **os prazos** são a lista dos prazos (a `TabelaDosPrazos`, que sai da tela da 5.15 e da 5.16 para servir às duas), na forma do Início: sem os parados, as marcas de 8 em 8 h (−8 h, agora e +8 h), as colunas do m12 (72 px, até 320 px, a trilha e 176 px), as linhas de 38 px, sem a linha de quem e com os apoios curtos, na ponta direita da faixa. Cada linha é o link do chamado, porque o Início não tem o painel. Com a caixa abaixo de 600 px, a lista fica sem as barras, como a da tela dos prazos. No pé, a frase dos parados (`fraseDosParados`, com os testes antes), na ordem do grupo do relógio parado da lista, com até 5 números e "e mais 2"; sem parados, sem o pé. Sem nenhuma linha, "Nenhum prazo correndo.";
- **o lugar:** a tela cresce com a janela (`data-janela-inteira`), como o quadro: as colunas enchem a altura, com o pé no fim, e, à direita, a triagem fica no alto e os prazos enchem o resto, com o pé deles no fim. As larguras saem da largura do Início (as consultas de largura): a partir de 1.600 px, a coluna da direita tem 740 px, como no m12 a 1920; a partir de 1.200 px, 460 px, com as linhas da triagem em duas faixas, os botões embaixo, e os prazos sem as barras, que é a janela de 1440 (o m12 não cabe nela: as quatro colunas ficariam com 135 px); abaixo (a janela de 1280), a direita desce para baixo das colunas, na largura inteira, porque, ao lado, as colunas ficariam com 165 px.

**A gaveta da abertura (tarefa 5.18),** sem mockup próprio: a gaveta do kit, com "Novo chamado" no título, na largura larga, de 576 px, que a tarefa acrescenta ao kit: na de 432 px, a das Solicitações, a grade de duas colunas deixaria 122 px para o nome e a frase de cada tipo.
- **O botão:** "Novo chamado", primário, com o mais, depois do "Buscar nos chamados", nos cabeçalhos do Início, de "Quem está com o quê" e dos Prazos (o m01, o m02, o m05 e o m12), só a quem tem `chamados.atender` (`podeAbrirChamado`, com os testes antes). Ele põe o `abrir` no endereço da tela, o mesmo da ação "Abrir um chamado" da busca, que leva ao Início, e a gaveta abre sobre a tela em que se está. Abrir e fechar trocam o endereço sem entrada nova no histórico: o voltar do navegador sai da tela, e não reabre a gaveta. Para quem só vê os chamados, o endereço com o `abrir` não abre nada.
- **A ordem:** "Quem pediu", "Tipo", o formulário do tipo, "Título" e "Fica comigo". O formulário e o título só aparecem com o tipo escolhido, e o envio sem ele recebe a recusa da API no "Tipo".
- **"Quem pediu"** é a escolha da conta, com a busca da abertura (`GET /chamados/pessoas`, 4.22), cada pessoa com o local, como no campo Pessoa do formulário ("Marina Rocha · Jundiaí › Recepção"). O nome, sem o local, vai ao formulário, para o "Sugerido: de <nome>" das sugestões, que acompanham a troca da pessoa.
- **"Tipo"** é o grupo de rádios do kit em duas colunas, cada opção com a bolinha, o ícone do tipo de 34 px na série dele (decisão 22), o nome em peso forte e a frase embaixo, em legenda e em quantas linhas precisar. A escolhida tem a bolinha preenchida e a borda do destaque, como a escolha do ícone dos tipos de ativo, e as setas movem a escolha. Os tipos carregando dizem "Carregando os tipos…"; a falha, o texto da consulta ("Não foi possível carregar os tipos de chamado.", com o código de rastreio no erro do servidor), com "Tentar de novo"; sem nenhum em uso, "Nenhum tipo de chamado está em uso.".
- **A troca do tipo** recomeça as respostas e os citados, porque as respostas de um formulário não valem no outro, e tira as recusas do tipo e dos campos. A pessoa, o título escrito e o "Fica comigo" ficam.
- **"Título"** mostra o montado das respostas (`tituloDasRespostas`, com o contexto dos citados do estado, sem pedir nada à API), que acompanha as respostas até quem abre escrever nele; daí em diante, vale o escrito, e "Usar o título montado", que só aparece quando o escrito é outro, volta ao montado. A ajuda diz "Montado das respostas. Você pode trocá-lo." e, com o escrito, "Escrito por você. As respostas não o mudam mais.". O título que quem abre não tocou vai nulo, e a API monta o mesmo título com os nomes de agora; o escrito vai como está, e a API o confere: o vazio recebe "Escreva o título." e o longo, "Use até 120 caracteres.", no campo.
- **"Fica comigo"** é o interruptor, ligado, com a ajuda "Desligado, o chamado vai para quem atende o tipo ou para a triagem.".
- **O envio:** "Abrir o chamado", primário, com "Abrindo o chamado" enquanto vai, e "Cancelar", como na gaveta das Solicitações. O pedido sai do estado (`pedidoDaAbertura`, com os testes antes), com as respostas guardadas, também as do campo escondido, que a API deixa de fora (decisão 21).
- **O retorno:** a gaveta fecha, os chamados se releem (`CHAVE_DOS_CHAMADOS`), e o aviso diz "Chamado #1043 aberto.", com o "Abrir" do aviso, que leva ao chamado (`retornoDaAbertura`).
- **As recusas do 400** vão às chaves da tela (`errosDaAbertura`, com os testes antes): a `pessoa`, o `tipo`, o `titulo` e os `campos.<id>` ficam nos campos, e as chaves `respostas` e `formulario`, também as de dentro delas, viram a recusa geral do formulário, no alto dele, sem campo. O foco vai ao primeiro campo recusado. A recusa pelos locais (o 409), que vem do local da pessoa ou do ativo, e a falha sem resposta ficam antes dos botões, como na gaveta das Solicitações, e o que foi preenchido fica. Cada recusa do 400 vale enquanto o que ela recusou não muda (`errosQueValem`, com os testes antes); as dos campos e a geral, só no mesmo tipo, porque eram do formulário dele.
- **Fechar sem abrir** perde o que foi preenchido, como a gaveta das Solicitações, e o anexo enviado fica sem dono, para a manutenção (spec arquivos-e-imagens, "Anexo esquecido").

**A tela dos tipos (tarefa 5.19),** com o m07:
- **A tela** pede a janela inteira e rola por dentro, em três colunas, como o m07 a 1440: a tabela (412 px), o editor e a prévia (444 px), cada um rolando sozinho. Em janelas menores, as colunas dos lados encolhem até 340 e 380 px.
- **O tipo escolhido** fica no endereço (`?tipo=<id>`, trocado sem entrada no histórico); sem ele, ou com um que não existe mais, é o primeiro da ordem.
- **A tabela** é a que se ordena do kit (`TabelaQueSeOrdena`, sobre a do React Aria, que a web não importa), com a linha escolhida pelo clique ou pelo teclado. A ordem muda como a decisão 15 diz: a alça, só do ponteiro, como o ícone do m07, leva o aperto ao `useArrastar`, sem chegar à linha, que não troca de escolhida, e a linha de encaixe fica no alto ou embaixo da linha sob o ponteiro, pela metade dela; no teclado, o menu da linha (o clique direito, a tecla de menu e o Shift+F10, como no quadro) dá "Subir" e "Descer", só o que muda a ordem. A tela mostra a ordem nova na hora e a grava pelo `PUT /chamados/tipos/ordem`, com todos os ids (`reordenar`, `moverNaOrdem` e `movimentosNaOrdem`, com os testes antes); a resposta fica, e a recusa relê a lista e avisa. O selo marca só a exceção: "Só a TI abre", "Rascunho" e "Inativo". O prazo é o da resolução, curto e em mono ("8 h", "30 min", "3 d"); quem atende, o primeiro nome, ou "Triagem". No pé, "12 chamados abertos nestes tipos." e "Sem responsável por padrão, o chamado cai na triagem.".
- **O editor** mostra o tipo como está sendo escrito: o cabeçalho (o ícone de 56 px, o nome, a frase do colaborador, a situação e "1 aberto · 38 no último ano") e a prévia mudam a cada tecla. As seções são as do m07:
  - "Identificação": o nome, os 16 ícones num grupo de rádios compacto do kit (`EscolhaDeIconeCompacta`; o m07 desenha seis) e a frase;
  - "Prazo e atendimento": a frase do prazo, com os números na frase do kit (`NumeroNaFrase`), as unidades, que dizem "dias úteis" no horário da TI (`rotuloDaUnidadeDoPrazo`), e o modo de contar, com a seleção na frase do kit (`SelecaoNaFrase`, que a condição da 5.23 também usa); quem atende por padrão, com "Ninguém, cai na triagem" primeiro; e "Se não houver ninguém", com o "Fica com <pessoa> mesmo assim" só quando há alguém escolhido;
  - "O que acontece depois" e "Quem vê": as chaves com "Ligado" ou "Desligado" escrito. O "Gera uma Solicitação" ligado mostra a escolha entre Toner e Equipamento, e o Equipamento, o tipo de ativo.
- **O pé:** "Formulário: 6 campos", em texto até o construtor (5.21), que o faz botão; "Descartar" e "Salvar o tipo", desligados sem mudança, como nos Padrões. "Novo tipo" e "Duplicar" entram com a gaveta do rascunho (5.20).
- **A gravação** manda o tipo inteiro (`PUT /chamados/tipos/:id`), e o aviso diz "Tipo salvo.". As recusas ficam no campo, nas chaves do domínio, e as do formato do prazo (`prazo.resposta.valor`) vão ao número; cada uma vale enquanto o que ela recusou não muda (`errosDoTipo` e `errosQueValem`, com os testes antes). Trocar de tipo ou sair da tela com mudanças pede a confirmação, como nos Padrões.
- **A prévia** é a aba da 5.6, com o nome da conta como quem pede: os tipos Em uso que o colaborador escolhe, na ordem, com o editado marcado "editando" e com o que se escreve (`tiposNaPrevia`, com os testes antes). Embaixo, os que só a TI abre ("Troca de equipamento é só da TI e não aparece nesta grade.") e, com chamados abertos, "Vale para os próximos chamados. O 1 aberto mantém o formulário atual.".

**O rascunho, o duplicar e a situação (tarefa 5.20),** com o m08:
- **"Novo tipo" e "Duplicar"** ficam no cabeçalho da tabela, embaixo da frase, como no m07 e no m08: "Novo tipo", primário, com o mais, e "Duplicar", com a cópia, que duplica o tipo escolhido. Com mudanças no editor, a confirmação de trocar de tipo vem antes. O pedido (`POST /chamados/tipos` ou `POST /chamados/tipos/:id/duplicacao`) põe o Rascunho na lista, no fim da ordem, e o escolhe.
- **A gaveta** abre sempre que o tipo escolhido é um Rascunho: pelo "Novo tipo", pelo "Duplicar", pelo clique no Rascunho da tabela e pelo endereço. Sem o tipo no endereço, a tela escolhe o primeiro que não é Rascunho. É a gaveta do kit dentro da janela (`GavetaNaJanela`, sobre o Modal do React Aria, aberto no elemento da tela): o véu cobre a tela, e a gaveta cobre as colunas do editor e da prévia, com a borda e a sombra das camadas sobrepostas, e entra pela direita. A tabela fica inteira embaixo do véu, com o Rascunho escolhido; o m08 a desenha estreita, só com o tipo e o prazo, mas, coberta pela gaveta, ela cortaria o título, a frase e o pé. A gaveta prende o foco, fecha com Esc e com o clique no véu e devolve o foco a quem a abriu. Fechar volta ao tipo de antes, ou ao de onde se duplicou, ou ao primeiro; com mudanças, pede a confirmação, como trocar de tipo.
- **O editor do Rascunho** é o mesmo editor, com o que o m08 muda:
  - no cabeçalho, "Ainda não criado", sem as contagens;
  - antes das seções, no duplicado, o aviso "Duplicado de Computador. O prazo, o responsável e o formulário vieram de lá. Mude só o que for diferente.", pelo `duplicadoDe` gravado; logo depois de duplicar sem atender as solicitações em todos os locais, também o `AVISO_DA_SOLICITACAO_NO_DUPLICAR`, pelo `solicitacaoDesligada` da resposta, que não fica gravado;
  - depois das seções, "Formulário": "3 campos, a partir do tipo Computador", com cada campo e o tipo dele ("Quem vai usar? (pessoa) · Data de chegada (data)"), lido do `GET /chamados/tipos/:id/formulario`; sem campos, "Nenhum campo ainda.". O "Editar os campos" entra com o construtor (5.21);
  - no pé, "Só aparece para o colaborador depois de criado.", "Descartar rascunho", "Salvar rascunho" e "Criar o tipo", o primário. O "Salvar rascunho" não está no m08: é a gravação que deixa o tipo na situação dele (`PUT /chamados/tipos/:id`), que a spec pede quando o Rascunho é salvo com o nome "Scanner" antes do descarte, e sem ela o que se escreve no Rascunho só sairia criado ou perdido. Fica desligado sem mudança, como o "Salvar o tipo"; salvo o Rascunho, o foco vai ao "Criar o tipo", porque no botão desligado ele cairia fora da gaveta, onde o Esc não a fecha.
- **"Criar o tipo"** manda o tipo inteiro (`POST /chamados/tipos/:id/criacao`), com as recusas no campo, como a gravação. Criado, a gaveta fecha, o tipo fica escolhido no editor, e o aviso diz "Tipo criado.".
- **"Descartar rascunho"** pede a confirmação ("Descartar o rascunho Equipamento novo?", com "O rascunho sai da lista, com o formulário dele."), apaga o Rascunho (`DELETE /chamados/tipos/:id`) e volta ao tipo de antes, com o aviso "Rascunho descartado.".
- **A prévia da gaveta** é a do editor, sem a faixa de quem pede, como no m08: "A grade da aba, em Abrir chamado, já com o nono tipo.", com o lugar do Rascunho na grade por extenso até o vigésimo, e "já com o tipo novo" depois; o Rascunho fica marcado "novo", no lugar dele na ordem, com o que se escreve (`tiposNaPrevia`, com o editado que é Rascunho). Com o "Só a TI abre" ligado, a grade não o mostra, e a nota diz por quê. Embaixo, "Depois de escolher Equipamento novo:", com os campos que a pessoa vê, sem os que só a TI vê, numerados e com o tipo; sem nenhum, "Depois de escolher Novo tipo: nenhum campo.".
- **A tabela** marca a origem de um Rascunho duplicado com "copiado daqui", embaixo do nome, com o ícone da cópia, e a contagem do título deixa os Rascunhos de fora ("9 tipos").
- **A situação** é a última seção do editor de um tipo Em uso ou Inativo: em texto, o que a situação quer dizer, e o botão que a troca. "Inativar o tipo" pede a confirmação ("Inativar o tipo Impressora?", com o que acontece aos abertos), e o aviso diz "Tipo inativado."; "Reativar o tipo" grava sem confirmação, com o aviso "Tipo reativado.", e as recusas da reativação, que confere o tipo gravado, ficam no campo, com o foco no primeiro. Com mudanças no editor, os dois ficam desligados, com "Salve ou descarte as mudanças para mudar a situação.": a reativação confere o gravado, e a recusa num campo já mudado não teria onde aparecer.

**O construtor, a paleta (tarefa 5.21),** com o m09:
- **O endereço** é `/chamados/tipos/<id>/formulario`, numa rota própria, com o `chamados.configurar`, como a tela dos tipos. A tela pede a janela inteira e rola por dentro, em três colunas, como o m09 a 1440: a paleta (176 px), os campos (520 px) e a prévia, cada uma rolando sozinha. O formulário vem do `GET /chamados/tipos/:id/formulario`; a falha, como o tipo que não existe mais, fica no lugar das colunas, com "Tentar de novo".
- **As entradas:** no pé do tipo, o "Formulário: 6 campos" passa a botão, com a lista, como no m07, e abre o construtor; no Rascunho, o "Editar os campos" da seção Formulário, com o lápis, como no m08. Com mudanças no tipo, a confirmação de descartá-las vem antes, como ao sair da tela.
- **O cabeçalho** é o da página do kit: a trilha "Tipos de chamado › Impressora › Formulário" em cima, como no chamado aberto (o m09 a põe ao lado do tipo), com os dois primeiros em links, que voltam à tabela e ao tipo (`?tipo=<id>`, que reabre o Rascunho na gaveta), e o título "Campos do tipo", com o tipo num selo, o ícone e o nome, como no m09. "Descartar" e "Salvar o formulário" entram com o salvar (5.22); até lá, o que a paleta acrescenta fica só na tela.
- **A paleta,** "Campos", tem os 11 tipos de campo, na ordem do domínio, em botões com o ícone e o nome. Os ícones no lucide: Texto curto, o `Type`; Texto longo, o `AlignLeft`; Escolha única, o `List`; Várias opções, o `ListChecks`; Ativo, o `Package`; Local, o `MapPin`; Pessoa, o `User`; Data, o `Calendar`; Número, o `Hash`; Anexo, o `Paperclip`; e Sim ou não, o `ToggleLeft`. O mesmo ícone vai no campo da lista. Os botões são crus, com a cara do secundário do kit, porque o aperto vai ao `useArrastar`, que o botão do React Aria não repassa.
- **O clique** acrescenta o campo no fim, e o arraste o põe na linha de encaixe, com o item numa união (`{ de: 'paleta', tipo }`), que a ordem dos campos (5.22) amplia. No arraste, o botão de origem fica tracejado e apagado, o campo no ar segue o ponteiro, com o ícone e o nome, inclinado e com a sombra sobreposta, como no m09, e a tela inteira fica com o cursor de segurar. Só o mouse arrasta, como no quadro: no toque, o toque acrescenta no fim, e a lista rola por cima da paleta.
- **A linha de encaixe** é a do m09, tracejada no destaque, com "Solte o campo 'Número' aqui", e ocupa o lugar onde o campo vai entrar, empurrando os de baixo. A posição sai do alvo sob o ponteiro (`posicaoDoEncaixe`, com os testes antes): a metade do campo, antes ou depois dele; o espaço depois do último campo, o fim; e a própria linha, a posição em que ela já está, porque ela tira o campo de baixo do ponteiro, e a posição pularia a cada movimento. Os campos se encostam, sem vão entre os alvos: o espaço entre eles fica dentro de cada alvo. Fora da lista, a linha some, e soltar não faz nada; o Esc cancela.
- **O campo novo** (`campoNovo` e `acrescentarCampo`, com os testes antes) nasce opcional, que a pessoa vê, sem condição, com o "Apagar a resposta se o campo sumir" ligado e, no Ativo, de qualquer tipo. O rótulo é o nome do tipo de campo, único no formulário, como a gravação pede: "Número" e, com um "Número" no formulário, "Número 2". A Escolha única e as Várias opções nascem com "Opção 1" e "Opção 2", o mínimo que a gravação aceita. Os ids, do campo e das opções, saem do `idDoFormulario`, com o `crypto.getRandomValues`, e o que repetir um id do formulário é sorteado de novo. Com 20 campos, a paleta desliga, com "O formulário tem no máximo 20 campos." embaixo dos botões.
- **O aviso para o leitor de tela,** que só ele lê, diz onde o campo entrou: "Campo “Número” acrescentado no fim." ou "Campo “Número” acrescentado antes de “Contador de páginas”.". Acrescentado, o campo vem à vista na lista que rola, e o foco fica na paleta, para o próximo.
- **Os campos,** até a 5.22, são cartões com o ícone, o rótulo em peso forte e o tipo de campo embaixo, sem a alça, os selos e o campo aberto. Sem campos, "Nenhum campo ainda. Clique num tipo de campo ou arraste-o para cá.".
- **A prévia,** à direita, é a aba da 5.6 com o formulário que se preenche, no modo da prévia (`quem: 'pessoa'`, com a conta como quem pede e as sugestões dela), "Prévia do colaborador" no alto e a nota "menor que a real". Ela muda junto com a lista e responde ao clique, como a aba. A marca tracejada do campo condicional, com o resto da nota, entra com a condição (5.23), e o rodapé da aba e o aviso dos campos escondidos, com a prévia em tamanho real (5.24).

**O construtor, os campos (tarefa 5.22),** com o m09:
- **O cartão do campo** tem a alça, o ícone, o rótulo, a linha de detalhe e um selo. O detalhe: o tipo de campo; nas escolhas, "· 4 opções"; no Ativo com tipos, "· só Impressora ou Monitor"; e, no campo só da TI, "· preenchido pela TI". O selo é um só, nesta ordem: "Condicional" (atenção, com o ramo), "Só a TI vê" (neutro, com o cadeado), "Obrigatório" (informação) e "Opcional" (neutro). O campo com condição fica recuado, como no m09, e o só da TI com condição diz o "preenchido pela TI" no detalhe.
- **O campo aberto:** o clique no cartão o abre no lugar, um por vez, com a borda do destaque, e o segundo clique o fecha. O campo que a paleta acrescenta já nasce aberto, e o foco segue na paleta. No vigésimo campo, o foco vai ao rótulo dele, e a frase do limite é anunciada (revisão da 5.21). Dentro do campo aberto:
  - "Rótulo" e "Nome no resumo" (vazio, vale o rótulo sem o "?");
  - nas escolhas, "Opções", cada uma num campo de texto com o ×, e "Acrescentar", que cria "Opção 3" com o id novo e leva o foco a ela. O limite é de 12, com "O campo tem no máximo 12 opções.";
  - no Ativo, "Tipos de ativo": os tipos ativos e os que o campo já aceitava, com "Nenhum marcado, o campo aceita ativos de qualquer tipo.";
  - "Obrigatório" e "Só a TI vê", lado a lado, com "Sim" e "Não", como no m09;
  - "Remover o campo".
  A condição e o "Apagar a resposta se o campo sumir" entram com a 5.23.
- **A recusa na hora:** tirar um campo ou uma opção, mudar uma chave e mudar a ordem conferem antes o formulário com a mudança, pelo `conferirFormulario`. Se a mudança traz uma recusa nova, nada muda, e a recusa fica junto de quem a pediu. São exemplos:
  - "'Onde as manchas aparecem?' depende deste campo. Mude a condição antes.", no "Remover o campo";
  - o "Pede o ativo: …", no "Obrigatório" do primeiro campo Ativo;
  - "O campo tem no mínimo 2 opções.", na opção.
  O que se escreve (o rótulo, o nome no resumo e as opções) se confere ao salvar.
- **O salvar** fica no cabeçalho, como no m09, e não no pé, como a spec dizia. Ele tem "1 mudança não salva", "Descartar" e "Salvar o formulário"; os dois botões ficam desligados sem mudança. Embaixo do título, vem a frase dos abertos do editor do tipo. Cada campo acrescentado, tirado ou mudado conta 1, e a ordem e o título contam 1 cada.
  - Antes da API, o salvar confere o formulário pelo `conferirFormulario`, e só segue sem recusa.
  - Cada recusa, da conferência ou da API, fica junto do que recusa. A do "Pede o ativo" fica no primeiro campo Ativo e, sem nenhum, no alto da lista. As que não têm lugar ficam no alto do campo aberto; a da condição, até a seção dela (5.23), também.
  - O campo fechado com recusa mostra a primeira embaixo dele. O primeiro recusado abre, com o foco no que recusou.
  - A recusa de um campo vale enquanto o campo não muda, e as outras, enquanto o formulário não muda. A da condição tem a regra dela (5.23).
  - Gravado, aparece "Formulário salvo.". Sair com mudanças pede a confirmação, como no editor do tipo.
- **O título do chamado** fica fixo no alto da lista: tracejado, com o cadeado no lugar da alça e o selo "Automático". O detalhe é a frase do título:
  - "Das respostas: “Impressora manchando”", pela primeira opção da Escolha única;
  - no Texto curto e no Ativo, "Das respostas: “Impressora” e a resposta de “Qual impressora?”";
  - sem campo, "Das respostas: a primeira resposta de texto ou “Impressora”".
  Aberto, ele tem "A resposta que dá o título", com "Nenhuma: a primeira resposta de texto" e os campos de Escolha única, de Texto curto e de Ativo que a pessoa vê. Com uma resposta escolhida, ele tem também "Começar pelo nome do tipo".
- **A ordem** muda de dois jeitos:
  - a alça arrasta o campo, só com o mouse, pela linha de encaixe da paleta ("Solte o campo “Qual impressora?” aqui"), com o cartão de origem tracejado. A linha não aparece nos dois lugares em que nada mudaria;
  - o menu do campo, aberto pelo clique direito, pela tecla de menu ou pelo Shift+F10, tem "Subir" e "Descer", como a tabela dos tipos.

**A condição (tarefa 5.23),** com o m10:
- **O lugar** é a seção "Quando mostrar este campo", no campo aberto da 5.22, depois do "Obrigatório" e do "Só a TI vê" e antes do "Remover o campo". O m10 abre o campo só com a condição, sob o título "Condição do campo"; aqui ela fica com as outras propriedades, e o título da página segue "Campos do tipo".
- **A frase** fica numa caixa afundada, como no m10: "Mostrar “Onde as manchas aparecem?”" e, embaixo, uma linha por parte, com "quando", "e quando" ou "ou quando", o campo, "for" ("tiver", nas Várias opções), a resposta e o ×, que tira a parte ("Tirar a parte 2 da condição"). O campo e a resposta são as seleções na frase do kit (`SelecaoNaFrase`). O "for" é texto, e não a seleção do m10: a condição só compara a resposta com uma opção, e a seleção teria uma opção só.
- **O campo da parte** se escolhe entre os anteriores de Escolha única, Várias opções ou Sim ou não e, no campo que a pessoa vê, só entre os que ela também vê (`camposDaCondicao`). A resposta se escolhe entre as opções do campo, com "Opção 3" na opção ainda sem texto, ou entre "Sim" e "Não". Trocar o campo põe a primeira resposta dele.
- **"+ e quando…" e "+ ou quando…"** acrescentam uma parte (`novaClausula`, com os testes antes):
  - a do "ou" usa o campo da parte anterior;
  - a do "e" usa o campo mais perto que a condição ainda não usa, ou o da parte anterior;
  - a resposta é a primeira que nenhuma parte do mesmo campo usa.
  O foco vai ao campo da parte nova e, ao tirar uma parte, ao "+ e quando…". Com 5 partes, os dois desligam, com "A condição tem no máximo 5 partes.". Cada parte guarda a junção dela, como o domínio a grava, e o "e" vale antes do "ou", como no `camposVisiveis`.
- **Sem condição,** a frase é "Mostrar “Número” sempre.", com "+ Só quando…", que acrescenta a primeira parte, com o campo que serve mais perto, acima. Sem nenhum campo que sirva, o botão desliga, com "Nenhum campo antes deste serve à condição: ela usa um campo de Escolha única, Várias opções ou Sim ou não que a pessoa também vê." (no campo só da TI, sem o "que a pessoa também vê").
- **"O que cada resposta faz"** tem uma lista por campo da frase, com o nome dele quando são mais de um. Cada resposta tem o selo do que ela faz:
  - "O campo aparece", de sucesso, com o olho;
  - "O campo some", neutro, com o olho riscado;
  - com mais de um campo, "Depende das outras respostas", neutro, com o ramo.
  A conta (`efeitoDasRespostas`, com os testes antes) usa o `camposVisiveis` do domínio, a mesma do formulário que se preenche, com as respostas que as condições citam: a da linha, fixa, e todas as dos outros campos. Os campos da frase entram com as condições deles, e o caso em que um campo escondido teria resposta não conta, porque no formulário ele não tem: "Na borda", que só se responde com "Manchando", mostra o campo de "quando “Onde” for Na borda e “O que está acontecendo?” for Manchando". Acima de 4.096 casos, a conta deixa as condições da cadeia de lado. A linha da resposta que mostra o campo fica em peso forte, como no m10.
- **"Apagar a resposta se o campo sumir"** é a chave com "Sim" e "Não", e só aparece com a condição.
- **A marca na prévia:** o campo condicional que aparece na prévia tem embaixo dele a marca tracejada, na cor do selo "Condicional" e com o ramo, como "aparece só quando for Manchando". Com mais de um campo na condição, cada parte diz o campo (`marcaDaCondicao`). O m10 a põe entre o rótulo e as opções; aqui ela fica embaixo do campo, porque assim serve a todos os tipos e não separa a continuação da pergunta de que ela depende. Com um campo condicional no formulário, a nota do alto da prévia passa a "menor que a real; a marca tracejada é só do editor", como no m09 e na spec. O bloco do m10 embaixo da prévia ("Se escolher Manchando…") fica de fora, porque "O que cada resposta faz" já o diz.
- **As mudanças** da condição se conferem na hora, como as chaves, e a recusa fica embaixo da frase. A recusa da condição no salvar (`campos.<id>.condicao`) também fica ali, e não mais no alto do campo aberto. Ela vale enquanto não mudam a condição do campo, a ordem e o "Só a TI vê" dos campos, que é o que ela confere (revisão da 5.22).

**A prévia em tamanho real (tarefa 5.24),** com o m11:
- **A chave** fica no cabeçalho, antes do salvar, como no m11: o controle segmentado do kit, com "Editar", com o lápis, e "Prévia do colaborador", com o olho. A prévia mostra o formulário como está na tela, também o que não foi salvo, e o salvar e o "Descartar" seguem no cabeçalho. O salvar recusado ou que falha volta ao editor, onde a recusa e a falha aparecem. Ela troca a paleta, a lista e a prévia pequena por duas colunas; "Editar" volta a elas, com o campo aberto onde estava.
- **À esquerda,** afundada, com 420 px, que cedem até 300 px antes de a aba rolar para o lado: a aba cabe inteira a partir de uns 1.300 px de janela, como nos notebooks de 1.366:
  - **"Ver como":** a pessoa num cartão, com o avatar, o nome e, embaixo, o local e os ativos sob a responsabilidade dela, pelas sugestões do formulário (`GET /chamados/tipos/sugestoes`, a mesma consulta do campo Local), como "Financeiro · NB-0231": até dois ativos, pelo patrimônio, em mono, ou pelo nome, e depois "e mais 2" (`detalheDoVerComo`). Começa pela própria conta, e "Trocar" abre no lugar a busca da pessoa (`GET /chamados/tipos/pessoas`), com o foco nela e "Cancelar". Sem pessoa na conta, a busca já fica aberta. A pessoa escolhida vale também para a prévia pequena, e as respostas recomeçam, porque as sugestões mudam com ela;
  - **"O que ela vê, campo a campo"** (`oQueElaVe`): cada campo com o olho, verde quando ela o vê e riscado no só da TI, o nome e a nota "obrigatório", "opcional" ou "só a TI". O campo com condição diz embaixo do nome quando aparece, como "se for Manchando", pela mesma frase da marca do editor (`fraseDaCondicao`). O m11 põe o "se Manchando" no lugar da nota; aqui o campo condicional diz também se é obrigatório, e a condição longa quebra embaixo do nome, sem apertar a nota. A lista não muda com as respostas: ela diz a regra, e a aba mostra o que aparece agora;
  - **o aviso dos escondidos** (`avisoDosEscondidos`), na atenção: "2 campos ficaram escondidos. Só a TI vê “Contador de páginas” e “Contrato de manutenção”, depois que o chamado chega.". Os nomes vão entre aspas, sem o artigo do m11, porque o nome do campo não diz o artigo.
- **À direita,** a mesa:
  - **a régua:** "Tamanho real: 900 px de largura, como na tela do colaborador", com "clique como ele clicaria" na ponta;
  - **a aba em 900 px,** sem nenhuma marca do editor, com a faixa no nome da pessoa, com o "(você)", porque a aba fala com quem a usa, e o rodapé: "A resposta chega aqui e no chat da aba." e "Enviar para a TI". Na mesa mais estreita que a aba, a mesa rola para o lado, e a aba não encolhe;
  - **"Enviar para a TI"** (`envioDaPrevia`) confere as respostas como a abertura (`conferirRespostas`) e não envia nada. As recusas ficam em cada campo, com o foco no primeiro, e embaixo da aba vem "Na aba, o chamado não iria assim: veja os 2 campos marcados." ou "Na aba, o chamado iria para a TI. A prévia não envia nada.". A recusa de um campo vale enquanto a resposta dele não muda, como na gaveta da abertura (`recusasQueValem`), e o aviso, enquanto nenhuma muda. O botão que só enfeitasse enganaria;
  - **"O que chegaria para a TI"** (`oQueChegaria`): o título montado, o tipo, o ativo e as outras respostas, pelo resumo da conversa, e "Campos da TI: a TI preenche depois", com o formulário que tem um campo só da TI. O ativo é a resposta do primeiro campo Ativo, a que a abertura liga ao chamado, com o patrimônio em mono e o nome, ou "Nenhum"; sem campo Ativo que a pessoa responda, ele fica de fora.
- **O botão da aba** (`BotaoDaAba`) é o par do `ch3-aba.css`: o cheio, de 40 px, na cor da aba, do "Enviar para a TI"; e o de contorno, que o campo Anexo usa no visual da aba, no lugar do botão do kit. Os dois são cápsulas, como as pílulas da trilha.
- **Os dois consertos da prévia pequena** que a revisão da 5.21 deixou para aqui: o campo acrescentado vem à vista também na prévia; e, sem campo que a pessoa veja, as duas prévias mostram "O formulário ainda não tem campos." ou "A pessoa não vê nenhum campo: só a TI vê os deste formulário." no lugar da faixa vazia (`previaVazia`).
- **O "Como vai o chamado"** do m11, ao lado do formulário, fica para a S8, como na 5.6.

**As respostas prontas (tarefa 5.25),** sem mockup próprio, no molde da tabela dos tipos (m07) e da gaveta do kit:
- **A tela** pede a janela inteira e rola por dentro, como a dos tipos, com a lista numa coluna só. No alto: o título "Respostas prontas", a contagem ("6 respostas"), a frase "Quem atende as usa no campo de escrever do chamado, nesta ordem. Arraste pela alça para mudar a ordem." e "Nova resposta", primário, com o mais. Com 100 respostas, o botão desliga, e "A organização já tem 100 respostas prontas." aparece embaixo dele (`limiteDasRespostas`), em vez de a recusa vir só depois de a resposta estar escrita.
- **A tabela** é a `TabelaQueSeOrdena` da 5.19:
  - a alça;
  - a resposta: o rótulo em peso forte, com o selo "Espera a resposta" ao lado, e, embaixo, o começo do texto numa linha, com as quebras juntadas (`textoNumaLinha`) e as reticências do CSS. O selo tem o relógio de areia na tinta da informação, como "Aguardando o colaborador", que é a situação que a resposta dá ao chamado. O `{nome}` aparece como foi escrito, porque a lista é de quem configura;
  - os tipos: "Todos os tipos", ou os nomes, até dois, e depois "e mais N" (`tiposNaLista`). Os nomes vão separados por vírgula, porque muitos têm o "e", como "Acesso e senha" e "Rede e internet".

  A ordem muda pela alça, com o `useArrastar`, e, no teclado, pelo "Subir" e pelo "Descer" do menu da linha. Ela aparece na hora, e a resposta da API fica no lugar dela; se a API recusar, a ordem gravada volta, com o aviso "A ordem não mudou.", como nos tipos.
- **O kit:** a `TabelaQueSeOrdena` ganha o `aoAbrir`. Com ele, nenhuma linha fica escolhida, as setas só andam pelas linhas, e o clique e o Enter abrem a linha (o `onRowAction` do React Aria). Na escolha dos tipos, as setas trocam a linha escolhida, e aqui cada tecla abriria a gaveta. Sem o `aoAbrir`, a tabela segue como nos tipos. O selo "Espera a resposta" entra na lista dos selos dos chamados (`Pecas.tsx`).
- **Sem respostas,** a tela diz "Nenhuma resposta pronta.", com "Crie as que a TI manda sempre, como o pedido do print do erro." e "Nova resposta".
- **A gaveta** é a do kit (`Gaveta`), com o título "Nova resposta" ou o rótulo gravado. Ela fecha pelo ×, pelo Esc e pelo clique fora. Dentro:
  - "Rótulo", obrigatório, com a ajuda "Aparece no menu e nos botões do campo de escrever.";
  - "Texto", obrigatório, na área de texto, com a ajuda "{nome} vira o primeiro nome da pessoa do chamado.";
  - "Espera a resposta", o interruptor, com a ajuda "Mandar a resposta põe o chamado em Aguardando o colaborador, e o relógio para.";
  - "Tipos em que aparece": as caixas de marcar dos tipos Em uso e Inativos, na ordem dos tipos, com "inativo" escrito depois do nome (`tiposParaEscolher`). A ajuda diz "Sem nenhum marcado, a resposta aparece em todos os tipos.". O Rascunho fica de fora, como na API. Nenhum marcado vale como todos, como na API, e a ajuda diz isso em vez de uma recusa nova;
  - o pé: "Remover", só na resposta gravada, e "Salvar", primário.
- **O que "Salvar" faz:** cria a resposta nova, no fim da ordem, com "Resposta pronta criada.", ou grava a escolhida, com "Resposta pronta salva."; nos dois casos, a gaveta fecha.
- **As recusas da API** ficam nos campos (o rótulo, o texto e os tipos), com o foco no primeiro, e valem enquanto o campo não muda (`recusasQueValem`). A que não é de campo fica no pé, em texto: o limite de 100, a falta de conexão ou a resposta que outra conta removeu.
- **"Remover"** pede a confirmação "Remover “Pedir o print do erro”?", com "Ela sai do campo de escrever de todos os chamados. As mensagens já mandadas ficam na conversa." e o botão "Remover a resposta". Depois, o aviso é "Resposta pronta removida.".
- **Fechar com mudanças** pede a confirmação, como no editor dos tipos, com "Continuar editando" e "Descartar mudanças". O título é "Descartar as mudanças na resposta?", ou "Descartar a resposta nova?" na nova. Sair da tela com a gaveta mudada pede o mesmo (`useBlocker`).
- **O evento** `ajustes-dos-chamados.mudaram` relê a lista, e a gaveta aberta segue com o que se escreveu.

**A busca do ativo com mais opções (tarefa 5.30),** um pedido do usuário depois da 5.20, sem mockup:
- **o lugar:** o campo Ativo do "Trocar o ativo" e do "Ligar um ativo", e o da gaveta do "Virar OS" (5.31). O campo Ativo do formulário fica como está, com as sugestões da pessoa e a busca;
- **o texto** acha pelo nome, o patrimônio, o número de série, o hostname e o modelo, como a busca da lista dos ativos, e o texto de exemplo do campo dá os quatro mais usados: "Nome, patrimônio, série ou hostname";
- **"Mais opções de busca",** um botão na linha do rótulo do campo, à direita, mostra e esconde os filtros, com o `aria-expanded`. Embaixo do campo, a lista, que abre a cada tecla, o cobriria, e quem digita primeiro, como quem não achou o ativo, não veria a saída. Os filtros: "Tipo", com os tipos de ativo; "Local", na árvore dos locais, com os de dentro do escolhido; e "Responsável", pela busca da pessoa da gaveta da abertura. Com um filtro escolhido, a lista troca as sugestões da pessoa pelos ativos que passam nos filtros e no texto, pelo `GET /ativos` com o `tipo`, o `local` e o filtro `qualquer` do `ativo.responsavel`, sem mudar a API. Os filtros leem o que toda conta lê: os tipos de ativo e a árvore dos locais são de referência (`semPermissao: 'referencia'`), e o `local` da lista já pega o ramo, como o teste dela confere. Esconder as opções limpa os filtros, para nada filtrar fora da vista;
- **cada ativo achado** ganha uma segunda linha, com o tipo, o local e o responsável, cada um quando há, como "Impressora · Matriz › Financeiro · Marina Rocha", para distinguir os parecidos. As sugestões da pessoa, sem texto e sem filtro, ficam numa linha só, sob a origem, que já diz por que elas estão ali. O kit ganha o `detalhe` da opção da busca com sugestões, na linha de baixo e no texto secundário, que o leitor de tela lê como a descrição dela, e a ação na linha do rótulo dela (`acaoDoRotulo`), com a cara do link de cadastro e fora do botão que abre a lista;
- **o seletor de conta,** que o campo Ativo e o "Responsável" usam, passa a mostrar só o que está escolhido: o campo vazio tira a escolha, como o React Aria faz quando não é controlado, e, com uma escolha, o texto que não é de nenhuma opção volta, ao sair do campo, ao dela. Sem escolha, o texto fica, para a busca seguir com ele, como ao ir do campo aos filtros. Antes, o campo apagado ficava vazio com a escolha valendo, e o filtro "Responsável" seguiria filtrando sem aparecer. Vale para todas as telas que o usam.

**O "Virar OS" com os campos da OS (tarefa 5.31),** um pedido do usuário depois da 5.20, sem mockup:
- **a gaveta** "Virar o #1042 em OS" toma o lugar do diálogo, como a do "Pedir toner", com os campos:
  - "Ativo", com o do chamado já escolhido e a busca da 5.30. Trocar o ativo aqui muda só a OS, e a descrição do campo diz isso: o ativo do chamado fica, como na troca do ativo depois da OS (decisão 11). O outro ativo, num local onde quem abre não atende as OS, volta recusado no campo, com "Você não atende as OS no local deste ativo.", e nada abre; no ativo do chamado, a recusa segue a de hoje, o 403. Quem não vê os ativos não tem a busca: a gaveta diz "A OS abre no ativo do chamado, <ativo>.". Com a OS noutro ativo, o chamado diz qual, depois da situação: "OS 13 · Aberta · PAT-00200", com o patrimônio, ou o nome sem ele;
  - "Problema", em várias linhas, que começa com o título e, embaixo, uma linha por resposta do formulário, como no resumo da abertura ("Cor do toner: Preto"). A resposta que não cabe nos 1.000 caracteres do problema fica de fora, inteira;
  - "Situação", com "Aberta", a de sempre, "Em atendimento", "Aguardando peça" e "Aguardando fornecedor";
  - na Aguardando fornecedor, o "Fornecedor", com "Cadastrar novo fornecedor" numa aba, e o "Número da OS no fornecedor", como na mudança da situação da OS;
- **a API:** o `POST /chamados/:numero/os` aceita também o `ativo`, a `situacao`, o `fornecedor` e o `os`; sem o ativo, o do chamado, e sem a situação, a Aberta. As recusas do chamado vêm antes, como hoje. A OS abre pela abertura de hoje e, fora da Aberta, muda de situação pela mudança de hoje (`mudarSituacao`), na mesma transação: o histórico da OS tem as duas linhas no mesmo instante, com a da situação escolhida em cima, e a auditoria, o `ordem.aberta` e o `ordem.situacao`. As recusas da mudança, como "Escolha o fornecedor.", voltam no campo delas, e nada fica gravado. A OS que nasce fora da Aberta fica zero tempo nela, e os indicadores da operação, que leem o histórico, a contam assim. A ficha do chamado passa a trazer o ativo da OS, para o "· PAT-00200";
- **o problema em várias linhas** tira a pendência da 5.10 do Enter no "Problema": nele, o Enter quebra a linha, e a OS abre pelo botão;
- **o tipo que não vira OS** fica sem o botão (revisão da 5.31): a ficha traz o `podeVirarOs` do tipo, e a tela não oferece a gaveta que a API recusaria com "O tipo Toner não vira OS." depois de preenchida. A recusa da API fica para o tipo mudado com o chamado aberto na tela.

**A seta de voltar no chamado aberto (tarefa 5.32),** um pedido do usuário depois da 5.20, sem mockup:
- **o título** fica "Toner preto #2": o título e, depois dele, o número, em mono, como era antes do título;
- **a seta,** antes do título e na linha dele, é um botão só de ícone, com o nome "Voltar". Ela volta à tela de antes, quando o chamado abriu de outra tela do app, como o quadro, o Início ou uma notificação, e, com o chamado aberto direto pelo endereço, leva ao Início dos chamados. Ela fica também no carregamento e na falha;
- **o kit** ganha o `voltar` do cabeçalho da página, fora do título da janela, para o leitor de tela ler o título sem a seta. A trilha continua em cima.

## Risks / Trade-offs

- **A change é grande** (banco, domínio, API e dez telas) → As tarefas seguem a ordem banco, domínio, API e web. Cada tarefa tem o teste dela e o próprio commit, e cada tela é conferida no `pnpm dev` contra o PNG do mockup antes do commit.
- **A conta do relógio no fuso e na virada do horário de verão** → A função é pura e tem testes com os casos dos mockups (o #1031, o #1041 e o #1042), a sexta à tarde com dias úteis e um fuso com horário de verão (`America/New_York`).
- **A mensagem da TI fica no chamado até o chat e a aba existirem** → É o pedido do usuário: seguir na sequência das seis changes. A ajuda do campo diz "Escreva a resposta para Fernanda.", sem prometer a entrega.
- **A solicitação gerada pelo tipo é registrada por quem abriu, sem a permissão das solicitações** → Quem ligou o "Gera uma Solicitação" atende as solicitações na organização inteira, e a auditoria registra a solicitação com o chamado e o tipo de origem. Uma recusa do registro não impede a abertura (decisão 11).
- **As notificações da triagem para toda a TI do local** → A severidade é Informação, e as preferências de cada conta decidem o som e o aviso. Se pesar no uso, a 17 pode juntar as da triagem num resumo.
- **A carga mostra só os chamados que a conta que olha vê** → É a regra das outras listas. Uma conta com o alcance de um local vê a carga só nele, e a tela diz "Contando só os chamados dos locais que você vê.".
- **Os testes de integração dividem um banco** → As organizações dos testes novos usam endereços próprios, como `grafite.chamados-outra.local`.
- **A auditoria guarda o nome da pessoa citada** (o `chamado.aberto` e o `chamado.campos-trocados`, como os campos dos ativos) → A anonimização limpa a ficha e o resumo ("Pessoa anonimizada"), e não a auditoria, como no resto do app. Mudar isso atravessa o app e é decisão do usuário: fica nas pendências dele.
- **O campo só da TI com o nome de uma chave proibida da auditoria** (`senha`, `token`, `chave`, `hash`, `segredo`, `csrf`, `codigo` ou `codigos`, exatamente assim, em minúsculas e sem acento) dá 500 ao gravar, e, como a cópia do formulário guarda o nome, o campo não grava mais naquele chamado → O risco é baixo e é o mesmo dos campos dos ativos ("Senha" e "Código" passam). O conserto, a guarda olhar só as chaves do próprio registro, é de uma change da auditoria.

## Migration Plan

1. A migration cria as tabelas, as políticas e o contador, e grava os 9 tipos de fábrica em cada organização. O padrão do horário da TI vale sem linha.
2. O `organizacao criar` passa a gravar os 9 tipos com a auditoria. O teste do comando e o passo 5 do ponta a ponta da pilha contam as 9 `tipo-de-chamado.criado`.
3. O módulo Chamados começa ligado nas organizações que já existiam (spec modulos-da-organizacao).
4. Voltar a versão: a versão anterior ignora as tabelas novas. O `voltar` do comando de operação restaura o backup de antes da atualização, como em toda versão.
