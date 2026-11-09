## Why

Com a ficha de um ativo aberta, o formulário guarda os valores que leu ao abrir e só os lê de novo depois de salvar. Quando o servidor muda um valor com a ficha aberta, como o número de série que a coleta grava (P2b e P2c), o evento `ativos.mudaram` relê a ficha: o painel e a origem do campo ("Coleta · coletor · momento") mudam, mas o campo continua com o valor antigo. A ponta a ponta da pilha do P2c achou o caso e recarrega a página antes de conferir a série. Quem olha a ficha nesse estado vê no campo o valor antigo, com a origem do novo.

A change corrige o cadastro de ativos do P1b (spec mestre, seção 3.2), com a ficha atualizada pelos eventos do F2c. Ela não implementa nenhum subprojeto novo.

Fica fora desta change:
- a trava e o modelo, que seguem o que a pessoa escolheu na ficha aberta;
- tirar a recarga da ponta a ponta da pilha do P2c, que só existe na branch dela: ela continua passando e pode sair quando as duas estiverem na `main`.

## What Changes

- **O valor do servidor entra no campo intocado:** com a ficha aberta, quando o servidor muda o valor de um campo que a pessoa não editou, o campo passa a mostrar o valor novo, sem recarregar a página.
- **O campo editado fica como a pessoa deixou:** o que foi digitado continua no campo, e salvar envia só os campos editados, como antes.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `cadastro-de-ativos`: o requisito novo "Valores do servidor na ficha aberta".

## Impact

- **`apps/web`:** o `FormularioDoAtivo`, que acompanha os valores da ficha relida, e o teste da ficha.
