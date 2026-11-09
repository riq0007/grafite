## Context

A web tem um roteador só. A rota raiz desenha a casca, e a tela do módulo entra pelo `Outlet` dentro da janela única (`JanelaDeConteudo`). Navegar troca a tela, e a anterior sai da árvore com tudo o que estava preenchido.

Os cadastros que os campos pedem hoje vivem em lugares diferentes:
- o Novo tipo, o Novo modelo e a Nova pessoa são telas de rota (`TipoNovo`, `ModeloNovo`, `PessoaNova`): o formulário faz o pedido à API e, ao salvar, navega para a ficha do registro criado;
- o Novo local é um formulário dentro da gaveta da tela dos locais.

Os campos do ativo usam três controles: a `Selecao` para o tipo e o modelo, o `SeletorDeLocal` para o local e o `SeletorDeConta`, com a busca das pessoas, para os campos de pessoa. No modelo, o tipo também é uma `Selecao`.

O registro de módulos já tem um padrão para um módulo aparecer em outro sem a casca mudar: as relações, cada uma com o alvo e o componente. Os cadastros seguem o mesmo padrão.

O motivo da change e o que fica fora dela estão na proposta.

## Goals / Non-Goals

**Goals:**
- Um campo abre o cadastro que ele pede sem tirar a pessoa da tela em que ela está, e volta com o registro escolhido.
- Um módulo oferece os cadastros dele a outros módulos só pelo registro.
- Cada formulário de cadastro tem um corpo só, usado pela tela de hoje e pela aba.

**Non-Goals:**
- Abrir qualquer tela numa aba, ou mais de uma tela de rota ao mesmo tempo.
- Guardar as abas e o que foi digitado depois de recarregar a página.

## Decisions

### 1. As abas de cadastro ficam por cima da tela, sem mudar as rotas

A primeira aba é a tela do roteador, como hoje. As outras são os cadastros abertos pelos campos, desenhados pela casca do app fora das rotas. O endereço continua sendo o da primeira aba.

Alternativa descartada: um roteador por aba, como as abas do navegador. Cada aba poderia mostrar qualquer tela, mas a casca, a raiz e o endereço teriam de ser refeitos para seguir a aba da frente, e o pedido não precisa disso.

Alternativa descartada: uma aba só, que guarda o rascunho do formulário ao sair e o restaura ao voltar. A pessoa perderia a vista do ativo enquanto cadastra o outro, e cada formulário teria de guardar e restaurar o próprio rascunho.

### 2. As abas de trás continuam montadas, escondidas e inertes

Trocar de aba esconde a de trás com `hidden` e `inert`, sem tirá-la da árvore. O estado do formulário, a rolagem e o foco de cada aba ficam como estavam, e não há rascunho a guardar.

O estado das abas é uma lista com a aba da frente e, para cada aba de cadastro, a aba que o pediu e a chave do campo. As mudanças são funções puras, testadas sozinhas: abrir, trazer para a frente, fechar, concluir e cancelar. Um provedor na casca do app guarda esse estado.

### 3. O pedido de cadastro é uma promessa

O campo pede o cadastro pelo alvo, como `local`, e recebe uma promessa que resolve com o registro criado, `{ id, nome }`, ou com `null`, quando o cadastro é cancelado ou fechado. O campo preenche o valor quando ela resolve.

A chave do pedido junta a aba de origem e o campo. Um segundo pedido com a mesma chave traz a aba já aberta para a frente, em vez de abrir outra. Se a tela de origem desmontar, porque a pessoa navegou na primeira aba, o pedido é esquecido; ao salvar, a aba de cadastro fecha só com o retorno do cadastro.

### 4. Os módulos declaram os cadastros no registro

O registro do módulo ganha `cadastros`, cada um com:
- o alvo (`local`, `pessoa`, `tipo` ou `modelo`);
- o título da aba, como "Novo local", e o texto do link, como "Cadastrar novo local";
- as permissões;
- o componente, que recebe os valores iniciais, `aoConcluir`, `aoCancelar` e `aoMudarPreenchido`.

A casca oferece `useCadastro(alvo)`, que devolve o título e a função de pedir, ou nada quando a conta não tem a permissão ou o módulo está desligado. O campo mostra o link só quando recebe algo.

### 5. Cada formulário de cadastro vira um corpo reutilizável

O corpo faz o pedido à API, mostra as recusas nos campos e chama `aoConcluir` com o registro criado. A rota de hoje usa o corpo e, ao concluir, navega para a ficha, como antes. A aba usa o mesmo corpo e devolve o registro ao campo. O formulário do local sai da gaveta, e a tela dos locais continua a pô-lo nela.

### 6. A barra de abas e o link são componentes da UI

A barra de abas da janela (`AbasDaJanela`) usa o padrão de abas do React Aria para o teclado e o leitor de tela, pelos hooks, e desenha também os painéis: cada aba tem o seu, sempre no mesmo lugar da árvore, para o conteúdo da primeira não ser montado de novo quando a barra aparece. O botão de fechar não pode ficar dentro da aba, que não aceita elementos interativos dentro, nem na lista das abas, que só aceita abas. Por isso, os botões ficam fora da lista, numa mesma grade: as abas ocupam as colunas ímpares, por uma subgrade, e cada botão, a coluna logo depois da aba dele. Pelo teclado, eles vêm depois da lista.

Só a entrada de uma aba anima. A saída não ajuda a entender nada e exigiria manter na barra a aba que já saiu do estado.

O link de cadastro (`LinkDeCadastro`) recebe o texto e o nome do campo, que o leitor de tela anuncia como a descrição do link, pelo `aria-describedby`, sem depender de como cada campo monta o rótulo dele. Com o campo desabilitado ou só para leitura, o link não aparece. Ele é um botão, porque abre a aba sem navegar, com a aparência de link.

### 7. A navegação leva à primeira aba

O dock, a busca, os menus e os links dentro da primeira aba navegam o roteador e trazem a primeira aba para a frente. As abas de cadastro continuam abertas. Uma navegação feita dentro de uma aba de cadastro não existe: os corpos de cadastro não navegam.

### 8. Fechar com dados pede confirmação

O corpo avisa, por `aoMudarPreenchido`, se algo já foi digitado. Fechar uma aba nesse estado abre o diálogo "Fechar sem salvar?", com "Fechar" e "Continuar editando". Cancelar dentro do formulário segue a mesma regra.

## Risks / Trade-offs

- [Muitas abas montadas ao mesmo tempo pesam na memória] → as abas nascem de campos, e a cadeia mais longa do sistema tem três (o ativo, a pessoa e o local); sem limite por enquanto.
- [Recarregar a página fecha as abas de cadastro e perde o que foi digitado nelas] → a change das etapas traz o rascunho que continua depois de recarregar.
- [O foco se perde ao trocar de aba] → abrir leva o foco ao título da aba; ao concluir ou cancelar, o foco volta ao campo que pediu.
- [Um formulário que navega dentro da aba quebraria a primeira aba] → os corpos de cadastro não usam o roteador; o teste de cada corpo confere que ele só chama `aoConcluir` e `aoCancelar`.
