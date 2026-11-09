## Context

A aba Dados da ficha monta os cartões em `cartoesDaFicha` (`apps/web/src/modulos/ativos/cadastro/cartoes.ts`): a Visão geral primeiro e depois os grupos na ordem da ficha, que o domínio dá em `camposDoAtivo`:
- Identificação e Uso;
- os grupos da organização e "Outros";
- as capacidades;
- o Administrativo.

O cartão aberto vem do endereço (`grupo`). Sem ele, abre a Visão geral, que fica fora do endereço (`abas.ts`). O cadastro do ativo novo usa os mesmos grupos, em etapas, e não muda.

O tipo de ativo guarda as capacidades e a configuração delas no banco (`tipos_de_ativo`), e a ficha do tipo é onde quem administra o catálogo as escolhe.

## Goals / Non-Goals

**Goals:**
- A ficha abre na informação principal do tipo, com a Visão geral logo depois.
- O tipo escolhe o cartão que abre, com o automático de padrão.

**Non-Goals:**
- Reordenar os outros cartões.
- Mudar a ordem das etapas do cadastro.
- Escolher um grupo de campos, como "Rede", para abrir a ficha: os nomes dos grupos mudam com os campos, e as capacidades têm chave fixa.

## Decisions

### 1. A escolha no banco

`tipos_de_ativo` ganha a coluna `primeiro_cartao`, um texto nulo no automático, com a Visão geral (`visao-geral`) ou a chave de uma capacidade, como `snmp.suprimentos`. O banco confere só o tamanho. Quem confere o valor é o domínio, como na configuração das capacidades. A migration sai do `drizzle-kit generate`, e os tipos de antes ficam no automático.

### 2. O domínio

Em `packages/domain/src/ativos/catalogo.ts`:
- `CAPACIDADES_COM_CARTAO`: as capacidades que dão cartão na ficha, todas menos o acesso por VNC;
- `PRIORIDADE_DO_PRIMEIRO_CARTAO`: Suprimentos e contadores, Saúde do Control iD, Inventário de hardware e Disponibilidade na rede;
- `conferirPrimeiroCartao({ pedido, capacidades })`: o nulo ou o vazio ficam nulos; a Visão geral e uma capacidade ligada com cartão valem; a capacidade desligada é esquecida, com o nulo; o resto é recusado com "Escolha a Visão geral ou uma capacidade do tipo com cartão na ficha.";
- `primeiroCartaoAutomatico(capacidades)`: a primeira da prioridade que o tipo liga, ou a Visão geral.

### 3. A ordem na ficha

`cartoesDaFicha` recebe a escolha do tipo e devolve o primeiro cartão no alto e a Visão geral logo depois. O primeiro é o primeiro que existir entre:
1. o escolhido;
2. as capacidades da prioridade;
3. a Visão geral.

A ficha confere a existência porque um cartão pode faltar para a conta: o Backup do Control iD só aparece com `controlid.ver`, e os Consumíveis compatíveis, com o Operação ligado. Os outros cartões ficam na ordem de hoje, sem o primeiro.

### 4. O endereço

Sem `grupo`, a ficha abre no primeiro cartão. O `buscaDoCartao` deixa fora do endereço o primeiro cartão, e não mais a Visão geral, e o `lerAbaDaFicha` passa a aceitar `visao-geral`. O formulário avisa, ao abrir um cartão, se ele é o primeiro. O link antigo com a Visão geral fora do endereço passa a abrir no primeiro cartão, o que é a intenção.

### 5. A ficha do tipo

Embaixo das capacidades, a seleção "Primeiro cartão da ficha" tem:
- "Automático: <cartão>", com o nome do cartão que o automático abre;
- "Visão geral";
- as capacidades ligadas no tipo que têm cartão, na ordem da lista das capacidades.

Desmarcar a capacidade escolhida volta a seleção ao automático, como a API faria. Só para leitura, a escolha aparece em texto.

### 6. A API

O pedido do tipo aceita `primeiroCartao`, nulo ou ausente no automático. A resposta sempre o traz. A auditoria do tipo guarda a escolha no antes e no depois, pela chave.

## Risks / Trade-offs

**A Visão geral deixa de abrir primeiro nos tipos com capacidade.** Os alertas abertos continuam a um clique, no segundo cartão, e o tipo pode voltar a abrir nela.

**O link salvo sem `grupo` abre noutro cartão.** É a regra nova: o link sem cartão abre no principal do tipo.

## Migration Plan

A migration acrescenta a coluna nula. Nenhum dado muda, e os tipos de antes abrem pelo automático.

## Open Questions

Nenhuma.
