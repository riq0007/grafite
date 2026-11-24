## Why

O usuário pediu, em 22/11/2026, duas coisas no chat dos chamados: "mudar andamento do chamado pelo chat tbm" e "selecionar varias mensagens para virar chamado, mas agrupar tudo em um quando virar chamado". Hoje, quem é da TI e abre um chamado pelo chat precisa ir ao módulo Chamados para assumir, passar, esperar a resposta ou resolver. A mensagem dela no chamado do chat ainda sai como a de quem pediu: não avisa a pessoa, não cumpre a primeira resposta e, no chamado que aguarda, o retoma como se a pessoa tivesse respondido. E o problema contado em várias mensagens vira um chamado com uma só delas.

A change é a terceira do subprojeto **S7 · Chamados** da spec mestre. Ela vem logo depois da `chat-com-chamados`, que a deixou em "Fica fora", e antes das changes da aba dos colaboradores (S8).

## What Changes

- **O andamento pelo chat**, pelas respostas do usuário de 22 e 23/11:
  - quem participa do chamado e atende os locais dele vê, no chamado aberto no chat, o menu "Andamento", com as ações da tela do Chamados:
    - "Assumir", com o "Desfazer";
    - "Passar para…";
    - "Devolver à triagem";
    - "Aguardar Fernanda…", com a mensagem para ela;
    - "Retomar";
    - "Resolver…", com "O que foi feito";
    - no resolvido, "Reabrir";
    - e "Abrir no Chamados";
  - quem só pediu o chamado não vê nenhuma ação. A TI que atende o chamado sem participar dele segue abrindo-o no Chamados;
  - **quem participa pela TI:** a conta que abriu o chamado no nome de outra pessoa e atende os locais dele.
    - A mensagem dela na caixa é a da TI: avisa a pessoa, cumpre a primeira resposta e não retoma a espera.
    - A espera, para ela, é "Aguardando o colaborador", e não "Aguardando você", também no chip, e o chamado que aguarda a pessoa não sobe na lista dela nem conta como resposta nova na trilha.
    - Ela não escolhe a opção, não avalia nem reabre como quem pediu, e não recebe as notificações de quem pediu;
  - no chat, o selo de "Aguardando o colaborador" passa da atenção à informação, como no Chamados;
  - a pessoa do chamado que também atende, como quem é da TI e pede um chamado para si, segue escrevendo como quem pediu, com o andamento.
- **Várias mensagens num chamado**, pela resposta de 22/11:
  - "Selecionar" entra no menu da mensagem e na folha do celular;
  - com até 20 mensagens da mesma conversa marcadas, "Transformar em chamado" abre um chamado só. Ele cita todas, na ordem da conversa, com quem escreveu, a hora, o texto e os anexos;
  - cada mensagem ganha a marca "Virou o chamado #1045", e o menu dela diz "Já virou o #1045";
  - a conversa ganha o evento "Fernanda Rocha transformou 3 mensagens no chamado #1045 · 10:32";
  - a TI vê todas as mensagens na origem do chamado.

Fica fora:
- **abrir o chamado no chat** a quem atende sem participar dele: pela resposta de 23/11, ele segue abrindo no Chamados, com as notas e o prazo;
- **juntar mensagens de conversas diferentes:** pela resposta de 22/11, só as da mesma conversa;
- **acrescentar mensagens a um chamado que já existe;**
- **a nota interna, as opções, o "/ativo" e as respostas prontas** na caixa de quem participa pela TI: ficam no campo de escrever do Chamados;
- **a aba dos colaboradores** (S8).

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `chamados`:
  - quem atende pelo chat: as ações que o chamado aceita, na leitura do chat, e quem participa pela TI;
  - o chamado aberto por até 20 mensagens da mesma conversa;
  - a espera "Aguardando o colaborador", a abertura, a resposta nova, a resposta, a escolha, a reabertura, a avaliação e as notificações de quem participa pela TI;
  - a frase das permissões de quem participa.
- `chat`:
  - os chamados da conversa abertos por várias mensagens, com a marca em cada uma e o evento;
  - a espera do chip a quem participa pela TI.
- `modulo-chat`:
  - o menu "Andamento" no chamado do chat, no computador e no celular;
  - a caixa de quem participa pela TI;
  - "Selecionar" e as mensagens marcadas;
  - o formulário com as mensagens citadas;
  - a vista Chamados de quem participa pela TI;
  - o selo de "Aguardando o colaborador".
- `modulo-chamados`: a origem pelo chat com as mensagens citadas.

## Impact

- **Banco** (`packages/db`): na conversa do chamado, uma linha `origem` por mensagem citada, até 20. A mensagem fica num chamado só pelo índice único parcial da mensagem nas linhas `origem`, no lugar do índice de uma linha `origem` por chamado. A `origem_mensagem_id` do chamado segue com a primeira mensagem.
- **Domínio** (`packages/domain`):
  - as ações do andamento, pela matriz das ações;
  - quem participa pela TI;
  - a espera, as listas e a resposta nova de quem participa pela TI;
  - as recusas de quem participa pela TI;
  - a conferência das mensagens a transformar.
- **API e contrato:**
  - o `andamento` e o `pelaTi` na leitura do chamado do chat;
  - `GET /chamados/:numero/quem-recebe`, para o "Passar para…";
  - `POST /chat/conversas/:id/chamado`, com as mensagens;
  - as origens na leitura do chat e na ficha do chamado;
  - as marcas e o evento das mensagens;
  - as recusas das rotas de quem participa a quem participa pela TI, e as notificações de quem participa, que não vão a ela;
  - a resposta nova no resumo do chat.
- **Web:**
  - o menu "Andamento", os diálogos de aguardar e de resolver e o aviso do assumir, no chamado do chat;
  - a caixa de quem participa pela TI;
  - a seleção das mensagens, com a barra no lugar da caixa;
  - o formulário do transformar com as mensagens citadas;
  - a origem no chamado aberto do Chamados.
- **Documentação:**
  - a linha do S7 na spec mestre;
  - o `docs/mapa.md`;
  - o runbook, com a exceção da volta à versão anterior.
- **Testes de ponta a ponta:** na pilha, uma conta da TI transforma duas mensagens num chamado no nome de outra pessoa, assume pelo menu e responde no chat, e a resposta chega à pessoa como a da TI.
