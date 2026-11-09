## Context

A sondagem de cada Control iD já escolhe o login assim (`loginDoControle`, em `packages/domain/src/coleta/control-id.ts`):
- o segredo do cofre ligado ao controle, quando há um só que serve;
- senão, o login escolhido no tipo.

A configuração do coletor (`apps/api/src/rotas/coleta.ts`) decifra o segredo que a escolha devolve, seja o próprio ou o do tipo. A situação no banco, que filtra e ordena a coluna Control iD, já trata o tipo sem um login ativo: o controle sem login próprio fica "Não verificado".

Duas coisas faltam:
- o domínio recusa o tipo sem login ("Escolha o login do Control iD no cofre.");
- o vínculo do segredo com o controle só se muda pela ficha do segredo, no cofre (`PATCH /cofre/segredos/:id`, com `cofre.administrar`), que pede a lista inteira dos ativos do segredo.

## Goals / Non-Goals

**Goals:**
- O tipo com a saúde do Control iD sem login.
- O login de cada controle escolhido na ficha dele.

**Non-Goals:**
- A porta de cada controle.
- Cadastrar um login novo pela ficha do controle.
- Dar a quem só edita os ativos a escolha do login: quem escolhe muda o cofre.

## Decisions

### 1. O login do tipo opcional

`conferirConfiguracaoDasCapacidades` aceita a saúde do Control iD sem o `segredoId`, que fica `null`. O id fora do formato continua recusado com a frase de hoje. A API já pula a conferência do segredo quando ele é nulo (`conferirLogin`). Na ficha do tipo, a seleção do login ganha a primeira opção "Nenhum", como a "public" da comunidade SNMP, e deixa de ser obrigatória.

### 2. O motivo sem login

O `loginDoControle` passa a receber `escolhidoNoTipo`, porque o `doTipo` nulo hoje quer dizer "o escolhido não existe mais". Sem login próprio:
- com o tipo sem login, o motivo é "Sem login: escolha o login deste controle ou o do tipo.";
- com o login do tipo inativo ou apagado, o motivo continua "O login escolhido no tipo está inativo.".

A situação no banco não muda. O tipo sem login não entra nos `tiposComLogin`, e o controle sem login próprio já fica "Não verificado" na coluna.

### 3. As rotas do login do controle no escopo do cofre

O login de um controle ganha duas rotas, registradas no escopo do cofre, que já exige o módulo ligado e os dois passos ativos:
- `GET /cofre/controles/:id/login` devolve o que o diálogo mostra: os logins que servem, pelo id e pelo nome, o login próprio do controle, quando há um só, e se o tipo tem login;
- `PUT /cofre/controles/:id/login`, com `{ segredoId }` ou `{ segredoId: null }`, grava a escolha.

As duas pedem `cofre.administrar`, a mesma permissão que muda os vínculos pela ficha do segredo. A escolha, então, não dá a ninguém um poder que ele não tem. O ativo precisa estar ao alcance da conta (`ativos.ver` no local dele), ativo e de um tipo com a capacidade. Fora disso, a resposta é 404 ou a recusa em texto.

O `PUT` roda numa transação:
1. desliga do controle os segredos do tipo Usuário e senha ou Conta administrativa que não são o escolhido;
2. liga o escolhido, se ele ainda não aponta o controle;
3. registra `segredo.alterado` para cada segredo que mudou, com a visão de antes e de depois (`visaoDoSegredo`), como a edição pelo cofre.

O escolhido precisa servir de login, como no tipo. Senão, a gravação é recusada com a frase do tipo. A resposta é o mesmo corpo do `GET`.

### 4. A ficha diz se a conta escolhe o login

A ficha do ativo ganha `permite.escolherLoginDoControle`, verdadeiro com:
- o ativo ativo;
- o tipo com `controlid.saude`;
- o módulo Cofre ligado;
- a conta com `cofre.administrar`.

Os dois passos ficam de fora: sem eles, o diálogo mostra a frase do cofre com o caminho do cadastro, em vez de esconder o botão sem explicar.

### 5. A tela

No cartão Saúde do Control iD, a linha "Login" continua com a origem. Com a permissão, o botão secundário "Escolher login" abre o diálogo "Login do controle":
- uma seleção com "Login do tipo", ou "Nenhum" quando o tipo não tem login, e os logins do cofre pelo nome;
- a descrição "O coletor usa o login novo na próxima configuração, em até 5 minutos.";
- "Salvar" grava, avisa "Login do controle salvo." e atualiza a ficha e a lista dos ativos;
- a recusa aparece no diálogo.

## Risks / Trade-offs

**Um segredo de login ligado a um Face ID só para registro passa a ser o login dele.** É a regra de hoje: escolher na ficha só a deixa à vista.

**Quem administra o cofre escolhe o login sem precisar editar o ativo.** O vínculo é dado do segredo, e a mesma pessoa já o muda pela ficha do segredo.

## Migration Plan

Nada a migrar: o login do tipo fica no JSON da configuração das capacidades, que já aceita o nulo na API, e o vínculo do segredo com o ativo já existe.

## Open Questions

Nenhuma.
