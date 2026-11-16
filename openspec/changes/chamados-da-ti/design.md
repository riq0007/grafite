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
  - a identificação: `nome`, `nome_normalizado` (único), `icone` e `frase`;
  - a situação e a ordem: `situacao` (`rascunho`, `em_uso` ou `inativo`), `ordem`;
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
  - o ativo e o alcance: `ativo_id`, `locais uuid[]` e `sem_local`;
  - o atendimento: `situacao` (`triagem`, `em_atendimento`, `aguardando` ou `resolvido`), `responsavel_id` e `responsavel_desde`;
  - o prazo (decisão 3): o `prazo` jsonb, com o modo, os minutos da resposta e da resolução e o valor e a unidade do tipo, só para o texto; `contado_s`; `relogio_desde`; `primeira_resposta_em`; `estouro_avisado_em`;
  - a resolução: `resolvido_em` e `resolvido_por`;
  - as ligações: `os_id` (única) e `solicitacao_id`;
  - a concorrência: `versao` (decisão 4).
- **`mensagens_dos_chamados`:**
  - `chamado_id` e `especie` (`mensagem`, `nota` ou `evento`);
  - a autoria: `autor_conta` ou `autor_pessoa`. A pessoa escreve a partir do chat; o CHECK aceita uma das duas;
  - o conteúdo: `texto`, e `evento` e `dados` jsonb, no evento;
  - o momento: `criada_em`.

  Não há UPDATE nem DELETE pelo papel da aplicação: só o INSERT tem política.
- **`anexos_dos_chamados`:** `arquivo_id` (único), com o arquivo na tabela `arquivos` de hoje, e o dono: `chamado_id` e `mensagem_id` ou `campo_id` (decisão 10). O CHECK aceita três formas: sem dono (os três nulos), o da mensagem (o chamado e a mensagem) e o do campo (o chamado e o id do campo).
- **`numeracao_dos_chamados`:** o contador por organização, como o das OS.
- **`respostas_prontas`:** `rotulo` e `rotulo_normalizado` (único), `texto`, `espera_a_resposta`, `tipos uuid[]` (vazio para todos) e `ordem`.
- **`horario_da_ti`:** uma linha por organização, opcional, com `dias smallint[]` (1 a 7, segunda a domingo), `inicio` e `fim` em minutos do dia, `fuso` e `carga_cheia`. Sem a linha, vale o padrão do domínio.

`chamados` e `mensagens_dos_chamados` recusam o DELETE pelo papel da aplicação, como as solicitações.

### 2. O formulário em JSON, com ids estáveis

O formulário é um documento validado por um esquema Zod do domínio (`packages/domain/src/chamados/formulario.ts`):

```ts
{
  titulo: { comecaPeloTipo: boolean, campoId: string | null },
  campos: Campo[],
}
```

Cada campo tem um id curto e estável, gerado na criação e nunca reaproveitado. Também tem o tipo, o rótulo, o nome no resumo, `obrigatorio`, `soDaTi`, `apagarSeSumir`, as opções e a condição:
- **as opções** têm id e texto;
- **a condição** é uma lista de cláusulas `{ campoId, opcaoId | valor, juncao: 'e' | 'ou' }`.

As respostas são um mapa do id do campo para a resposta.

Os ids, e não os textos, ligam as condições e as respostas. Assim, renomear uma opção não quebra a condição nem os chamados abertos.

Alternativa recusada: uma tabela por campo. O formulário é lido e gravado inteiro, sempre com o tipo, e a cópia de cada chamado também seria várias tabelas. O JSON com o esquema dá a mesma conferência com uma leitura só.

O domínio tem as funções puras:
- `conferirFormulario`: a gravação do tipo, com o limite de 20 campos, as opções, a ordem das condições e o campo do título;
- `camposVisiveis`: com as respostas, aplica as condições, com o "e" antes do "ou";
- `conferirRespostas`: a abertura;
- `tituloDasRespostas`: o título;
- `resumoDasRespostas`: a linha da conversa.

A prévia da web, a gaveta da abertura e a API usam as mesmas.

### 3. O relógio guardado e o prazo calculado

**O prazo em minutos, na abertura.** O chamado copia o prazo do tipo já em minutos (`prazoEmMinutos(tipo, horario)`):
- a hora vale 60 min;
- o dia vale 24 h em horas corridas e, no horário da TI, o comprimento da janela do horário de agora (`fim - inicio`).

A cópia guarda também o valor e a unidade do tipo, só para o texto ("Prazo do tipo, 3 dias úteis, no horário da TI"). Assim, mudar o horário depois não muda o prazo dos chamados abertos: 3 dias úteis de 10 h continuam 30 h com um horário de 9 h.

**O relógio.** O chamado guarda:
- `contado_s`: os segundos contados até a última parada, inteiros, arredondados para baixo a cada fechamento. O segundo, e não o minuto, para cada parada e retomada não perder até um minuto;
- `relogio_desde`: o instante em que o relógio voltou a contar, ou nulo, parado.

O domínio (`packages/domain/src/chamados/prazo.ts`) calcula:
- **`segundosNoHorario(de, ate, horario)`:** em horas corridas, a diferença. No horário da TI, a soma das sobreposições com as janelas de cada dia, no fuso do horário. O dia e a hora locais saem do `Intl.DateTimeFormat` com o `timeZone`, como no `software/quando.ts`, e valem também com o horário de verão;
- **`momentoEmQueAlcanca(desde, segundosQueFaltam, horario)`:** anda pelas janelas até completar o tempo;
- **`situacaoDoPrazo(chamado, horario, agora)`:**
  - o contado e o que resta;
  - o vencimento ou o relógio parado;
  - o texto curto ("vence em 2 h", "estourado há 20 min" e "relógio parado"), arredondado para baixo: as horas inteiras a partir de 1 h, os minutos inteiros de 1 min a 1 h e "menos de 1 min" abaixo dele;
  - o grupo: estourado, até 2 h, hoje, depois de hoje ou parado.

  O "hoje" e o "até as 11:40" saem no fuso da conta que olha.

A API manda o relógio guardado, o prazo copiado e o horário da TI. A web recalcula a cada minuto pela mesma função, sem pedir de novo ao servidor, como a idade das leituras. A lista dos prazos ordena no servidor pela mesma função: com as centenas de chamados em aberto de uma organização, a conta em memória custa menos que uma consulta com as janelas em SQL.

**A mudança do horário.** Ela fecha, na mesma transação, os relógios que estão contando no horário da TI: `contado_s += segundosNoHorario(relogio_desde, agora, horario antigo)` e `relogio_desde = agora`. Os de horas corridas não mudam. Assim, o tempo já contado não muda com o horário novo. O fechamento não sobe a `versao` (decisão 4).

Por isso, só a trava da linha separa o fechamento de uma ação que mexe no relógio ao mesmo tempo, como esperar ou resolver. O fechamento trava a linha do horário e os chamados que vai fechar (`FOR UPDATE`), e cada ação trava o chamado antes de ler o horário. Assim, uma espera pela outra, e o tempo não é contado duas vezes nem com o horário errado. Como ele muda os relógios guardados, a web relê os chamados ao receber o `chamados.ajustes.mudaram` (decisão 13).

Alternativa recusada: guardar o vencimento. Ele muda com o horário da TI e para com o relógio, e teria de ser recalculado a cada mudança. O relógio guardado é o que não muda.

### 4. A situação e as ações no domínio, com a versão

`packages/domain/src/chamados/acoes.ts` decide cada ação pela tabela da spec (chamados, requisito "Ações do atendimento"): assumir, passar, devolver, enviar a mensagem, enviar e esperar a resposta, a nota, retomar, resolver e reabrir. Ele recebe o chamado, quem age e o alcance dela e devolve a mudança, com o efeito no relógio e os eventos da conversa, ou a recusa com a frase da spec. A rota só aplica.

A tabela é uma matriz no código, situação × ação, e os testes da 2.7 e da 2.8 a percorrem célula a célula. O invariante do chamado aguardando, sempre com alguém atendendo, sai dela: o "enviar e esperar" na triagem passa o chamado a quem enviou, e o devolver do aguardando é recusado.

A `versao` sobe só nas ações que mudam a situação ou quem atende (assumir, desfazer, passar, devolver, enviar e esperar, retomar, resolver e reabrir) e na troca do ativo, que muda quem pode atender. A mensagem sem esperar, a nota, o título, os campos da TI e o fechamento dos relógios pela mudança do horário não a sobem. Assim:
- assumir devolve a versão nova e o estado de antes;
- o "Desfazer" manda os dois e é recusado com 409 e "O chamado mudou depois. Confira antes de desfazer." quando a versão não bate;
- a nota escrita entre o assumir e o desfazer não o impede;
- as outras ações usam a mesma conferência quando o cliente manda a versão, para dois técnicos não passarem o mesmo chamado ao mesmo tempo sem saber.

O atendimento na abertura (`decidirAtendimento`) também é do domínio. Ele recebe:
- o "Fica comigo";
- o tipo;
- quem atende por padrão, com o alcance;
- o horário da TI;
- o momento.

### 5. Os locais e o alcance

Como nas solicitações, com `locais uuid[]` e `sem_local`:
- o local de trabalho da pessoa na abertura;
- o local do ativo, recalculado quando o ativo muda;
- `sem_local` quando um dos dois falta.

As consultas usam os helpers de alcance das solicitações:
- ver: algum local no alcance;
- atender: todos no alcance;
- sem local: a organização inteira.

O público dos eventos é o `publicoDoChamado`, igual ao `publicoDaOrdem`, com os locais de antes e os de depois.

**A pessoa no chamado.** A leitura manda o nome e o local de trabalho da pessoa a toda conta que vê o chamado, porque o pedido é dela. Os contatos e o atalho da ficha vão só a quem tem `pessoas.ver` no local da pessoa, como a pessoa da máquina no software (spec distribuicao-de-software, "Pessoa da máquina"). A pessoa anonimizada vai com o nome anonimizado do cadastro dela, que já tem o código, e sem os contatos.

### 6. Os tipos de fábrica, numa lista só

`TIPOS_DE_CHAMADO_DE_FABRICA` (domínio) traz os 9 tipos com o formulário de cada um. O `organizacao criar` os grava na mesma transação, com uma `tipo-de-chamado.criado` por tipo na auditoria. A migration os grava nas organizações que já existem, como a `0057_categorias_de_software`. O texto da migration sai de um gerador conferido por um teste contra a lista do domínio, para os dois não se afastarem.

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

### 7. O atendimento padrão e o "fora do horário"

"Não houver ninguém" quer dizer:
- fora do horário da TI;
- ou quem atende por padrão não pode atender os locais;
- ou essa conta está inativa.

Com "Cai na triagem", o chamado vai à triagem. Com "Fica com <pessoa> mesmo assim", vai à pessoa fora do horário, e à triagem nos outros dois casos, porque a pessoa não pode atender. O LEIA dos mockups explica a triagem do #1038, do #1040 e do #1042 assim: os três abriram antes das 08:00.

**Quem não atende mais.** O chamado guarda quem atende, e a leitura confere a cada vez se essa conta ainda está ativa e atende os locais dele. Quando não, a leitura a marca "não atende mais os chamados": o quadro abre a coluna dela depois das outras, e a tarefa do prazo avisa quem atende os locais, como na triagem. O chamado não muda até alguém o assumir ou passar. Assim, a desativação de uma conta e a troca de um perfil não precisam saber dos chamados. A troca do ativo, que é dos chamados, recusa os locais novos que quem atende não atende.

### 8. A conversa e o resumo

A conversa é uma tabela só, ordenada pelo `criada_em` e pelo id (uuidv7).

O evento tem um `codigo`, como `assumiu`, `passou`, `aguardando`, `retomou`, `resolveu`, `reabriu`, `virou_os`, `solicitacao`, `ativo` e `abertura`, e os `dados`: as contas, a OS e a solicitação. A web monta a frase, para o nome atual das pessoas aparecer, como nas OS.

A abertura guarda o resumo pronto, porque ele usa o formulário da abertura.

Os alertas do ativo entram na leitura (decisão 9), e não na tabela.

### 9. Os alertas do ativo, lidos na hora

A rota da conversa junta os alertas do ativo ligado abertos entre a abertura do chamado e a resolução, ou agora, só para quem tem `alertas.ver` no local do ativo. Eles não são copiados para a conversa: o alerta tem dono, a regra dos alertas, e a cópia ficaria velha quando o alerta mudasse de texto.

### 10. Os anexos

**O envio, antes da gravação.** Cada anexo é enviado sozinho, com o corpo em `application/octet-stream`, como os campos de arquivo de hoje, e as regras de "Arquivos aceitos" (até 25 MB). O envio pede `chamados.atender` em algum local e grava o arquivo em `arquivos`, com o `enviado_por`, e a linha sem dono em `anexos_dos_chamados`.

**A gravação toma os anexos.** A mensagem, a nota, a abertura e o campo da TI tomam os anexos por um UPDATE só, na mesma transação: só as linhas sem dono, do arquivo enviado pela mesma conta e não removido, passam ao chamado, com a mensagem ou o campo. Se o número de linhas tomadas não bate com o de ids, a gravação é recusada com "O anexo não foi encontrado. Envie o arquivo de novo.", e a transação volta. O `arquivo_id` único impede o mesmo arquivo em dois donos. O campo Anexo do formulário guarda nas respostas os ids que tomou.

**A manutenção.** A manutenção diária marca `removido_em` nos anexos sem dono enviados há mais de 24 h. O anexo que sai de um campo só da TI, trocado ou tirado, ganha o `removido_em` na mesma transação, como o arquivo trocado de um campo do ativo. O apagamento do conteúdo segue o de hoje.

**A entrega.** A rota do anexo confere que ele é do chamado pedido e que a conta vê o chamado:
- o anexo da mensagem e o de um campo que a pessoa vê, a quem vê o chamado;
- o da nota e o de um campo só da TI, só com `chamados.ver`, que nesta change é o único jeito de ver um chamado;
- o sem dono, só a quem o enviou.

Quando o chat (17) e a aba (20) derem à pessoa a leitura do próprio chamado, a entrega dela recusa os anexos da nota e dos campos só da TI.

Alternativa recusada: conferir só o id do arquivo na gravação. Quem soubesse o id de um arquivo alheio o poria no chamado e o receberia pela entrega do chamado.

### 11. A OS e a solicitação pelo chamado

O chamado guarda `os_id`, único, e `solicitacao_id`, que vários chamados podem ter, porque o "Pedir toner" se junta à pendente.

A OS e a solicitação mostram os chamados delas por uma consulta, "Do chamado #1042" ou "Dos chamados #1040 e #1042". Elas não ganham coluna: o chamado é que muda.

"Virar OS" e "Pedir toner" chamam as funções de abertura e de registro de hoje (`ordens/abertura.ts` e o registro das solicitações), na mesma transação da ligação, para as regras e as recusas serem as delas.

A cor mais baixa do toner sai da última leitura válida dos suprimentos (P2b). Sem a leitura, o item é o preto.

**A solicitação gerada pelo tipo.** A abertura chama o registro das solicitações dentro de um ponto de salvamento (a transação aninhada do Drizzle, um `savepoint`). Uma recusa do registro volta só o ponto de salvamento: o chamado abre, e a conversa ganha o evento "A solicitação não foi gerada: <motivo>". O motivo tem texto próprio nos casos conhecidos (sem local, impressora sem consumíveis, tipo de ativo inativado e local inativado) e é a recusa do registro nos outros. Conferir antes, no lugar do ponto de salvamento, repetiria as regras do registro e se afastaria delas com o tempo.

A gravação do tipo pede `solicitacoes.atender` na organização inteira para ligar o "Gera uma Solicitação" ou trocar o que ele gera (spec tipos-de-chamado). Assim, a solicitação registrada sem a permissão de quem abre foi delegada por quem poderia registrá-la em qualquer local. A auditoria da solicitação gerada leva o chamado e o tipo de chamado.

Para a 19 e a 20: lá, quem abre o chamado é a pessoa, sem uma conta da TI. A solicitação gerada pelo tipo vai precisar de um registrador, e a decisão fica com essas changes.

### 12. As notificações e a tarefa do prazo

A tarefa `chamados.prazo` roda na fila (pg-boss) a cada minuto, com `missed: 'once'`. Por organização, ela:
- lê os chamados com o relógio contando e o `estouro_avisado_em` nulo;
- calcula o vencimento pela função do domínio;
- notifica os que passaram e marca o `estouro_avisado_em`.

O reabrir limpa a marca.

As notificações seguem a `notificar()`, com a origem "Chamados", e o e-mail e o push pela severidade, como os alertas.

### 13. Os eventos

| Evento | Quando |
|---|---|
| `chamados.mudaram` | toda mudança e mensagem do chamado, ao `publicoDoChamado` |
| `chamados.ajustes.mudaram` | os tipos, o formulário, as respostas prontas e o horário, a quem tem uma das três permissões |

Os dois entram na tabela de tipos de evento da plataforma (`eventos/tipos.ts`), com o teste de lá.

A web declara, no registro do módulo, as consultas que cada evento atualiza. O `chamados.ajustes.mudaram` atualiza também as consultas dos chamados, porque a mudança do horário fecha os relógios (decisão 3). O campo de escrever guarda o rascunho num estado próprio, fora da consulta, para não o perder.

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

### 18. O contrato e as permissões

As rotas entram no OpenAPI pelo Zod, e o cliente tipado sai do `contrato:gerar`. As três permissões entram no catálogo do domínio, na área "Chamados". O perfil Administrador, que tem todas por definição, passa a tê-las sem mudança no perfil.

As rotas ficam num bloco próprio em `apps/api/src/app.ts`, com o `exigirModuloLigado` do módulo `chamados`, como os outros módulos opcionais. Fora do bloco, a busca segue a regra dos módulos desligados (spec modulos-da-organizacao), e a tarefa do prazo pula a organização com o módulo desligado, pelo `modulosDesligados`.

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

## Migration Plan

1. A migration cria as tabelas, as políticas e o contador, e grava os 9 tipos de fábrica em cada organização. O padrão do horário da TI vale sem linha.
2. O `organizacao criar` passa a gravar os 9 tipos com a auditoria. O teste do comando e o passo 5 do ponta a ponta da pilha contam as 9 `tipo-de-chamado.criado`.
3. O módulo Chamados começa ligado nas organizações que já existiam (spec modulos-da-organizacao).
4. Voltar a versão: a versão anterior ignora as tabelas novas. O `voltar` do comando de operação restaura o backup de antes da atualização, como em toda versão.
