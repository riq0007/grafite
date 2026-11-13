# Como o trabalho anda

O Grafite é escrito por uma sessão só, junto com o usuário, sem subagentes. Uma segunda sessão, só de leitura, pode revisar o trabalho.

## A sessão que escreve

- **Faz tudo, em sequência:** escreve as specs e as changes, muda os componentes compartilhados (`packages/ui`, `packages/domain`, `packages/db` e o contrato da API) e implementa as tarefas, uma de cada vez, na ordem do `tasks.md`.
- **Não usa subagentes:** nenhuma pesquisa nem tarefa vai para um subagente. A pesquisa do código é feita com leitura e busca diretas.
- **Lê só o que a tarefa pede:** o `CLAUDE.md`, o mapa (`docs/mapa.md`) e as seções e as specs que ele aponta.

## A sessão revisora

- **Só lê:** não edita, não roda comandos (nem os testes, o build ou o git) e não usa subagentes.
- **Lê o plano uma vez:** a proposta, o design, as specs e as tarefas da change, antes do código.
- **Lê cada tarefa antes do commit:** com os testes verdes, a sessão que escreve grava o diff da tarefa em `.grafite/revisoes/<change>/<tarefa>.diff` e manda o caminho, com o resultado dos testes. A revisora devolve os pontos de melhora, com o arquivo e a linha de cada um.
- **No máximo duas voltas por tarefa:** a sessão que escreve aplica o que aceita e manda o diff novo uma vez. A divergência que sobrar vai para o usuário decidir.
- **As decisões ficam num arquivo:** cada ponto e o que foi feito com ele, em `.grafite/revisoes/<change>.md`, fora do Git.

## A entrega

- Cada tarefa: o teste antes do código, a verificação do `tasks.md` feita, a revisão (quando há uma sessão revisora) e um commit, no padrão da regra 8 do `CLAUDE.md`.
- **Ajuste pequeno vai direto para a `main`, sem PR:** a documentação e as specs, um texto da interface, um ajuste visual ou um conserto pontual. O commit passa pelos ganchos, e o CI da `main` roda depois, sem ninguém esperar por ele. Se ele reprovar, o conserto é outro commit.
- **Change grande ou sensível vai por PR para a `main`, com o CI verde, e o usuário faz o merge:** uma change com várias tarefas de código, uma migration, a operação e o instalador, as contas, as permissões e o cofre, e o próprio CI. Na dúvida, vai por PR.
- **A release só sai de uma `main` com o CI verde:** só ela chega ao servidor, depois de testar a instalação de verdade.
- Depois que a change entra na `main`, ela é arquivada, com as specs sincronizadas e o mapa em dia.
