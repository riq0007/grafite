# Como o trabalho anda

O Grafite é escrito por uma sessão só, junto com o usuário, sem subagentes. Uma segunda sessão, só de leitura, pode revisar o trabalho.

## A sessão que escreve

- **Faz tudo, em sequência:** escreve as specs e as changes, muda os componentes compartilhados (`packages/ui`, `packages/domain`, `packages/db` e o contrato da API) e implementa as tarefas, uma de cada vez, na ordem do `tasks.md`.
- **Não usa subagentes:** nenhuma pesquisa nem tarefa vai para um subagente. A pesquisa do código é feita com leitura e busca diretas.
- **Lê só o que a tarefa pede:** o `CLAUDE.md`, o mapa (`docs/mapa.md`) e as seções e as specs que ele aponta.

## A sessão revisora

- **Só lê:** não edita, não roda comandos (nem os testes, o build ou o git) e não usa subagentes.
- **Lê o plano uma vez:** a proposta, o design, as specs e as tarefas da change, antes do código.
- **Lê um diff só, no fim da change:** com as tarefas commitadas, a sessão que escreve grava o diff da change em `.grafite/revisoes/<change>.diff` e manda o caminho, com o resultado dos testes. A revisora devolve os pontos de melhora, com o arquivo e a linha de cada um. Numa change só visual, ela não lê diff nenhum.
- **No máximo duas voltas:** a sessão que escreve aplica o que aceita, num commit, e manda o diff novo uma vez. A divergência que sobrar vai para o usuário decidir.
- **As decisões ficam num arquivo:** cada ponto e o que foi feito com ele, em `.grafite/revisoes/<change>.md`, fora do Git.

## A entrega

- Cada tarefa: o teste antes do código, quando a regra 2 do `CLAUDE.md` o pede; os testes dos arquivos mexidos, o lint e o typecheck; e um commit, no padrão da regra 8. A bateria inteira roda uma vez, no fim da change, de preferência no CI do GitHub.
- **Ajuste pequeno vai direto para a `main`, sem PR:** a documentação e as specs, um texto da interface, um ajuste visual ou um conserto pontual. O commit passa pelos ganchos, e o CI da `main` roda depois, sem ninguém esperar por ele. Se ele reprovar, o conserto é outro commit.
- **Change grande ou sensível vai por PR para a `main`, com o CI verde, e o usuário faz o merge:** uma change com várias tarefas de código, uma migration, a operação e o instalador, as contas, as permissões e o cofre, e o próprio CI. Na dúvida, vai por PR.
- **A release só sai de uma `main` com o CI verde:** só ela chega ao servidor, depois de testar a instalação de verdade.
- Depois que a change entra na `main`, ela é arquivada, com as specs sincronizadas e o mapa em dia.
