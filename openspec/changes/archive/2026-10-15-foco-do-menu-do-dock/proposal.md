## Why

A spec do dock diz que a seta para longe da borda abre o menu do módulo com o foco no primeiro item. Na ponta a ponta das visões no dock, apareceu um caso em que isso falha. Quem escolhe um item do menu e reabre o mesmo menu pelo teclado em menos de 100 ms, enquanto o painel anterior ainda sai com a animação, vê o menu abrir com o foco parado no item do dock. O painel que ainda está na tela é reaproveitado, e o foco no primeiro item não acontece de novo. Quem usa só o teclado fica sem como andar pelo menu até fechar e abrir outra vez.

A change corrige a casca do F1a (spec mestre, seção 3.2, e o comportamento do dock da seção 7.4). Ela não implementa nenhum subprojeto novo.

Fica fora desta change:
- o tempo da animação de saída dos menus;
- tirar a espera da ponta a ponta das visões no dock, que só existe na branch dela: ela continua passando e pode sair quando as duas estiverem na `main`.

## What Changes

- **O menu aberto pelo teclado sempre recebe o foco:** abrir o menu de um item do dock pela seta leva o foco ao primeiro item do menu também quando o menu anterior ainda está saindo da tela.
- **O ponteiro e o toque não mudam:** abrir pelo ponteiro continua sem tirar o foco de onde está, e o toque continua abrindo o menu na hora.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `dock`: o requisito "Dock pelo teclado" ganha o cenário do menu reaberto enquanto o anterior sai da tela.

## Impact

- **`packages/ui`:** o `Dock` e o `MenuDoDock`, com a história de interação do catálogo que reabre o menu logo depois de escolher um item.
- **Documentação:** o mapa lista a change em andamento.
