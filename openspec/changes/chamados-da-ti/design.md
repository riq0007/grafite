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
- `PATCH /chamados/:numero/campos`, com `{ respostas }`: só as chaves que mudam, com o vazio ou o nulo para apagar. O domínio (`mudarCamposDaTi`) junta as respostas novas às guardadas e confere tudo pelo `conferirRespostas`, com a cópia do formulário do chamado. A chave que não é um campo só da TI recebe a recusa geral, porque a tela não a monta, e as recusas de cada campo vão na chave dele. O campo que some pela condição perde a resposta, como na abertura. O ativo, o local e a pessoa a API confere como na abertura, só nos campos que mudaram: o ativo da resposta da pessoa que ficou inativo depois não recusa a mudança de outro campo. O anexo novo é tomado pelo campo (`tomarAnexos`), e o que sai do campo (trocado, tirado ou do campo que sumiu) ganha o `removido_em` na mesma transação, sem volta pela tela. Como a tela grava o campo ao sair dele, um clique errado num Sim ou não só da TI apagaria o anexo do campo que depende dele. Por isso, a tela pede a confirmação antes de gravar a mudança que esconde um campo com anexo, com o nome do campo e quantos arquivos saem (o m04 não mostra o caso; tarefa 5.14). A rota registra o `chamado.campos-trocados`, com cada campo que mudou, pelo nome no resumo, antes e depois, como o resumo mostra a resposta;
- quem age precisa atender os locais do chamado, e o resolvido é recusado com "O chamado #1042 está resolvido.", nessa ordem, as duas no 409 (`recusaDaEdicao`, do domínio). Nas três, essas recusas vêm antes das do campo, fora a do ativo, que é lido antes;
- o mesmo ativo, o mesmo título e as mesmas respostas não mudam nada: a rota responde o chamado como está, sem a auditoria, o evento e a versão. Assim, a tela que grava o campo ao sair dele não precisa saber se ele mudou;
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

| Ícone | Lucide |
|---|---|
| gota | `Droplet` |
| notebook | `Laptop` |
| impressora | `Printer` |
| cadeado | `LockKeyhole` |
| janela | `AppWindow` |
| globo | `Globe` |
| telefone | `Phone` |
| reticências | `CircleEllipsis` |
| setas | `ArrowLeftRight` |
| computador | `Monitor` |
| torre | `PcCase` |
| fone | `Headset` |
| chave | `KeyRound` |
| caixa | `Package` |
| câmera | `Camera` |
| wi-fi | `Wifi` |

Os mockups usam o Phosphor, mas o Grafite usa o lucide.

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

**A primeira tela.** O redirecionamento acontece só na primeira carga de cada aba:
- se o endereço é a raiz, a sessão vê os chamados com o módulo ligado e a aba ainda não tem a marca `grafite.entrou` no `sessionStorage`, a casca troca o endereço por `/chamados` (`replace`);
- a casca grava a marca quando decide, com a sessão conhecida, com ou sem a troca;
- recarregar a página mantém o Início, porque a marca continua na aba, e uma aba nova não tem a marca;
- a navegação interna para `/`, pelo dock, não passa por ali, e o Início continua no endereço dele.

O `sessionStorage` é lido e gravado num `try/catch`. Sem ele, a troca acontece em toda carga da raiz, o que só repete a primeira tela.

Alternativa recusada: mudar o Início para `/inicio` e fazer da raiz um redirecionamento sempre. Isso mudaria os links de hoje para o Início (a página não encontrada, as notificações e os endereços salvos) e a chegada.

### 15. Arrastar sem biblioteca

Um hook da web, `useArrastar`, com os eventos de ponteiro (`pointerdown`, `pointermove`, `pointerup` e a captura do ponteiro), serve às três listas:
- os tipos;
- os campos;
- as respostas prontas;

e às colunas de "Quem está com o quê".

Ele dá:
- a posição do encaixe;
- o alvo sob o ponteiro;
- o Esc para cancelar;
- o limiar de 4 px antes de começar, para o clique continuar sendo clique.

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
- a cor de preenchimento da informação nos tokens, para a faixa, sem token novo;
- o corpo neutro do tema;
- as funções do formulário do domínio.

A 19 (a aba, em Tauri 2) pode levá-los para um pacote comum quando precisar deles fora da web. Até lá, eles moram onde são usados.

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
- **m05:** o grupo "Vence depois de hoje";
- **m03:**
  - a ajuda do campo de escrever, "Escreva a resposta para Fernanda.", até a 17 e a 20;
  - "Reabra o chamado para escrever." no chamado resolvido;
- **m01 e m12:**
  - "Contando só os chamados dos locais que você vê." a quem não vê a organização inteira;
  - a coluna de quem não atende mais os chamados;
- **m02:** a coluna "Sem responsável", que recusa o chamado aguardando;
- **todos:** os textos com o nome da pessoa vão sem o artigo, como "Aguardando Fernanda", "Mensagem para Fernanda", "Avisar Sandra" e "Soltar para passar a Renato", porque o Grafite não sabe o gênero das pessoas. Os mockups põem o artigo.

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
