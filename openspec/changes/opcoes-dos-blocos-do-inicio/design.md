## Context

O Início (`apps/web/src/modulos/inicio/Inicio.tsx`) desenha os blocos que os módulos registram em `blocosDoInicio`, um embaixo do outro, e guarda a ordem e os ocultos em `inicio.blocos`, uma lista de `{ id, visivel }` que o domínio valida item a item.

O bloco "Suprimentos que acabam primeiro" (`apps/web/src/modulos/ativos/suprimentos.tsx`) pede a lista dos ativos ordenada pela coluna `coleta.suprimentos`, com o limite 6. Essa coluna é o menor nível entre todos os suprimentos válidos do ativo, calculado no banco (`menorNivelNoBanco`, em `apps/api/src/coleta/suprimentos.ts`). O tipo do suprimento não está no banco: o domínio o tira da descrição (`tipoDoSuprimento`), e a regra de alerta do toner já faz o mesmo recorte.

A tela dos padrões da organização não tem uma parte do Início.

## Goals / Non-Goals

**Goals:**
- O bloco declara as opções, e o Início as mostra sem conhecer o bloco.
- O domínio valida a forma das opções sem conhecer o significado delas.
- O recorte dos suprimentos calculado no servidor, com o escopo de quem vê.

**Non-Goals:**
- Um bloco configurado duas vezes, com opções diferentes.
- Opções com formas livres, como um editor de filtro.
- Mudar a coluna Suprimentos da tabela dos ativos, que continua com o menor nível entre todos.

## Decisions

### 1. As opções no contrato de módulo

```ts
export type OpcaoDoBloco =
  | { chave: string; rotulo: string; forma: 'escolhas'; opcoes: { id: string; rotulo: string }[]; padrao: string[]; minimo?: number }
  | { chave: string; rotulo: string; forma: 'numero'; minimo: number; maximo: number; passo?: number; unidade?: string; padrao: number }
  | { chave: string; rotulo: string; forma: 'locais' };

export interface BlocoDoInicio extends ExigePermissoes {
  id: string;
  titulo: string;
  opcoes?: OpcaoDoBloco[];
  componente: ComponentType<{ opcoes: OpcoesResolvidas }>;
}
```

O Início resolve as opções antes de desenhar o bloco: para cada opção declarada, o valor guardado, se a forma dele confere, ou o de fábrica. O bloco recebe sempre todas as chaves, e nunca valida nada. Na forma `escolhas`, o Início tira os valores que saíram da lista e, se sobram menos que o mínimo, usa o de fábrica. Na forma `locais`, a lista vazia quer dizer todos os locais, e o Início tira os ids que não são mais locais ativos da organização; enquanto os locais não chegam, vale o que está guardado.

**Alternativa descartada:** o bloco trazer a própria gaveta de opções. Cada bloco refaria os controles, os nomes acessíveis e a gravação.

### 2. As opções e a largura nas preferências

O item de `inicio.blocos` passa a ser `{ id, visivel, largura?, opcoes? }`. O leitor do domínio:
- aceita `largura` como `'inteira'` ou `'metade'` e ignora outro valor;
- lê `opcoes` como um objeto de até 12 chaves, com os valores das quatro formas da spec, e tira a opção fora da forma;
- continua tirando o bloco inválido e o repetido.

A gravação continua trocando a lista inteira. As funções `moverItem` e `ocultarItem`, de `apps/web/src/preferencias/listaOrdenada.ts`, que servem ao Início e ao dock desde a change dock-personalizavel, passam a preservar o que o item traz além do id e da visibilidade: a largura e as opções do item que movem, ocultam e voltam a mostrar.

### 3. A gaveta das opções

No modo Personalizar, o cabeçalho do bloco ganha "Largura", um controle de dois segmentos, e "Opções…", quando o bloco declara opções. A gaveta desenha um controle por forma: a lista de caixas de marcar para `escolhas`, o controle deslizante para `numero` e, para `locais`, a lista dos locais escolhidos, cada um com "Tirar", e a escolha de local em árvore, a mesma dos cadastros, que acrescenta mais um. Sem nenhum escolhido, a lista diz "Todos os locais.". Cada mudança grava a lista, como o Subir e o Descer. "Restaurar as opções" tira o campo `opcoes` do item.

Na forma `escolhas` com `minimo`, a última caixa marcada fica desabilitada, com a explicação "Pelo menos um fica escolhido.".

A gaveta é um componente do `@grafite/ui`, o `OpcoesDoBloco`, que também declara a forma da opção: as histórias dela conferem os controles e a acessibilidade, que só o catálogo confere sozinho. A web resolve os valores, grava a escolha e entrega a árvore dos locais ativos.

### 4. A grade

O Início passa de uma coluna a uma grade de duas colunas na janela a partir de 1.200 px de largura da área. O bloco inteiro ocupa as duas; o de metade ocupa uma. A ordem no documento é a da lista, e a grade preenche linha a linha, sem reordenar. Abaixo dessa largura, e no tablet e no celular, a grade tem uma coluna.

### 5. O recorte dos suprimentos no servidor

Rota nova: `GET /ativos/suprimentos/menores`, com `tipos`, `locais`, `limite` e `nivel`, para quem tem `ativos.ver`. Ela:
1. lê do estado atual os suprimentos válidos dos ativos ativos que a conta vê, com o escopo pelo local, nos locais pedidos e nos de dentro;
2. dá o tipo a cada um pelo `tipoDoSuprimento`, o mesmo da ficha e da regra de alerta;
3. fica com os dos tipos pedidos, até o nível pedido;
4. escolhe o de menor nível de cada ativo e devolve os `limite` primeiros, com o ativo, o suprimento e o momento da leitura.

O bloco troca o pedido da lista dos ativos por essa rota e continua lendo a série de cada impressora para a estimativa, agora do suprimento escolhido.

**Alternativa descartada:** gravar o tipo no estado atual e filtrar no SQL. Mudaria a coleta e pediria uma migration, para uma leitura de poucas centenas de linhas.

### 6. O recorte em texto

O bloco monta o texto do recorte só com o que difere da fábrica, nesta ordem: os tipos, o nível e os locais, separados por " · ". Com mais de dois locais, diz "e mais N".

## Risks / Trade-offs

- **[A opção guardada perde o sentido quando o bloco muda]** → o Início ignora a chave desconhecida e volta ao valor de fábrica quando a forma não confere.
- **[A rota lê todos os suprimentos da organização a cada minuto, por conta]** → são poucas linhas por impressora; o bloco pede a cada 60 s, como hoje, e a consulta usa o índice do estado pela métrica.
- **[Dois blocos de metade com alturas diferentes]** → cada um fica com a altura do próprio conteúdo, alinhados em cima.

## Migration Plan

Nada a migrar: o item sem largura vale como inteiro, e sem opções, com as de fábrica.

## Open Questions

Nenhuma.
