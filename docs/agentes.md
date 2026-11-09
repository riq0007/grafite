# Como o trabalho anda

O Grafite é feito numa sessão só, junto com o usuário, sem subagentes.

## A sessão

- **Faz tudo, em sequência:** escreve as specs e as changes, muda os componentes compartilhados (`packages/ui`, `packages/domain`, `packages/db` e o contrato da API) e implementa as tarefas, uma de cada vez, na ordem do `tasks.md`.
- **Não usa subagentes:** nenhuma pesquisa nem tarefa vai para um subagente. A pesquisa do código é feita com leitura e busca diretas.
- **Lê só o que a tarefa pede:** o `CLAUDE.md`, o mapa (`docs/mapa.md`) e as seções e as specs que ele aponta.

## A entrega

- Cada tarefa: o teste antes do código, a verificação do `tasks.md` feita e um commit, no padrão da regra 8 do `CLAUDE.md`.
- **Ajuste pequeno vai direto para a `main`, sem PR:** a documentação e as specs, um texto da interface, um ajuste visual ou um conserto pontual. O commit passa pelos ganchos, e o CI da `main` roda depois, sem ninguém esperar por ele. Se ele reprovar, o conserto é outro commit.
- **Change grande ou sensível vai por PR para a `main`, com o CI verde, e o usuário faz o merge:** uma change com várias tarefas de código, uma migration, a operação e o instalador, as contas, as permissões e o cofre, e o próprio CI. Na dúvida, vai por PR.
- **A release só sai de uma `main` com o CI verde:** só ela chega ao servidor, depois de testar a instalação de verdade.
- Depois que a change entra na `main`, ela é arquivada, com as specs sincronizadas e o mapa em dia.
