## Context

Hoje a aba Dados da ficha (`FichaDoAtivo`) empilha, de cima para baixo:
- as relações dos outros módulos (`RelacoesDaFicha`, como o bloco dos alertas);
- os painéis das capacidades: a disponibilidade, os suprimentos e o Control iD;
- os segredos, a imagem do ativo (`ImagemDoAtivo`) e o `FormularioDoAtivo`, com os grupos um embaixo do outro.

O `FormularioDoAtivo` guarda o estado da ficha inteira: as entradas, as iniciais, as travas, o modelo e os erros. Ele também segue "Valores do servidor na ficha aberta" e salva só o que mudou, pelo `montarPedidoDoAtivo` (change cadastro-em-etapas).

A cadastro-em-etapas trouxe três peças que esta change reaproveita:
- a lista `EtapasDoFormulario`, que já aceita `numerar={false}`, com o `aria-current="true"`;
- a chave estável de cada grupo (`GrupoDoAtivo.chave`);
- o padrão de abrir a etapa com a recusa e pôr o foco no campo.

As capacidades da disponibilidade, dos suprimentos e do Control iD não têm campos. O grupo delas sai vazio do `camposDoAtivo`, e o painel vem da ficha (`ficha.disponibilidade`, `ficha.painelDeSuprimentos` e `ficha.controlId`). Os textos da situação de cada uma já existem nas colunas da tabela: `rotuloDaDisponibilidade`, `textoDosSuprimentos` e o do Control iD.

O desenho aprovado está na página dos desenhos, fora do repositório, aba "Ficha do ativo".

## Goals / Non-Goals

**Goals:**
- A aba Dados em cartões, com o estado do formulário num lugar só, para "Salvar alterações" gravar todos os cartões.
- Resumos calculados por funções puras, testáveis, a partir do que está na tela.
- O resumo dos blocos dos módulos sem quebrar a regra dos hooks quando as permissões mudam com a ficha aberta.

**Non-Goals:**
- O cabeçalho, as relações do cabeçalho e as abas Ligados e Histórico não mudam.
- A API não muda: os resumos vêm do que a ficha e as consultas dos módulos já trazem.
- As fichas da pessoa, do local, do modelo e do tipo continuam como estão.

## Decisions

### 1. O `FormularioDoAtivo` vira o formulário em cartões

O estado continua no `FormularioDoAtivo`, que passa a desenhar a `EtapasDoFormulario` sem a numeração e só o painel do cartão aberto. O conteúdo que não é campo vem da `FichaDoAtivo`, por props, pela chave do cartão:
- a Visão geral, com as relações e os segredos;
- o painel de cada capacidade;
- a imagem (`ImagemDoAtivo`), que aparece em todos os painéis.

Os campos dos cartões fechados não ficam montados, mas as entradas ficam no estado. Trocar de cartão não perde nada, e "Salvar alterações" manda tudo o que mudou, como hoje.

Alternativa: um componente novo, como na cadastro-em-etapas. Aqui o estado e as regras da ficha já moram no `FormularioDoAtivo`, inclusive os valores do servidor na ficha aberta, e só a disposição muda. Um componente novo duplicaria essas regras.

### 2. Os cartões e os resumos em função pura (`cartoes.ts`)

`cartoesDaFicha` recebe os grupos do `camposDoAtivo`, as capacidades que têm painel, as entradas, a forma de mostrar um valor e se a conta vê os restritos. Ela devolve os cartões, cada um com a chave, o nome, os campos, o resumo e o tom:
- **Visão geral:** sempre primeiro, com a chave `visao-geral`. O resumo vem dos blocos (decisão 3).
- **Capacidade:** o cartão aparece com campos ou com painel. O resumo é o texto da situação, pelos mesmos textos da tabela: a disponibilidade pelo `rotuloDaDisponibilidade`, os suprimentos pelo `textoDosSuprimentos` do `menor` e o Control iD pelo rótulo da situação dele. Sem leitura, "Não verificado".
- **Grupos de campos:** o grupo sem campo visível sai, como na cadastro-em-etapas. O resumo segue esta ordem:
  - com um obrigatório vazio, "Falta: <campo>", com "e mais N", e o tom de atenção;
  - senão, os dois primeiros campos preenchidos, cada valor pelo `mostrarValor` do domínio, e as pessoas, os locais e os ativos pelo nome que a ficha traz;
  - sem nenhum, "Nada preenchido".
- **Valores fora do resumo:** os de arquivo e os restritos que a conta não vê. O resumo usa as entradas na tela, então acompanha o que a pessoa digita.

`alteracoesNaoSalvas` conta as chaves cuja entrada difere da inicial, as travas mudadas e o modelo trocado, para o texto do pé da lista: "Nenhuma alteração", "1 alteração não salva" ou "N alterações não salvas".

`cartaoComRecusa` acha o primeiro cartão, na ordem, com um campo recusado. O modelo recusado abre a Identificação.

### 3. O resumo dos blocos dos módulos, pelas consultas deles

A `RelacaoDoModulo` ganha um campo opcional, `resumo`, com duas funções:
- `consulta(id, api)`, que devolve as opções da consulta do TanStack Query;
- `texto(dados)`, que devolve a linha do resumo, ou `null`.

A ficha chama o `useQueries` com as consultas das relações que têm resumo. O `useQueries` aceita uma lista que muda de tamanho, então a regra dos hooks continua valendo quando as permissões mudam com a ficha aberta.

A consulta do resumo dos alertas lê o silêncio e o total dos abertos pelas mesmas consultas do `AlertasNaFicha`, com as mesmas chaves (`fetchQuery` e `fetchInfiniteQuery`). Assim, com o bloco aberto, o resumo não faz pedido a mais. A chave do resumo fica sob a dos alertas, e o evento `alertas.mudaram` também a relê. O texto é "1 alerta aberto", "N alertas abertos" ou "Alertas silenciados", e `null` sem nada.

Os resumos não nulos se juntam por " · ". Sem nenhum, a Visão geral diz "Nada pede atenção".

Alternativas:
- `useResumo` em cada relação: um hook por relação muda de número quando as permissões mudam, e o React reclama da ordem dos hooks.
- Um componente que desenha o resumo: a lista das etapas recebe o texto da situação, e juntar componentes com " · ", sabendo quais vieram vazios, pede truques de CSS.

### 4. O cartão no endereço

A busca da ficha ganha `grupo`, ao lado de `aba`. A Visão geral fica fora do endereço, como a aba Dados. Um grupo desconhecido, ou de um cartão que sumiu, abre a Visão geral. Trocar de cartão substitui a entrada do histórico, como a troca de aba: voltar sai da ficha.

### 5. O painel do cartão aberto

O painel mostra o nome do grupo num `h2` com `tabIndex={-1}`, que recebe o foco na troca de cartão, como na cadastro-em-etapas. Ao lado do nome ficam a `ImagemDoAtivo`, com "Trocar imagem" para quem edita, e o conteúdo do cartão.

O conteúdo de cada cartão:
- **Identificação:** o tipo, só para leitura, e o modelo, com o estado e a trava, como hoje.
- **Capacidade com campos:** o painel em cima dos campos.

Embaixo da lista ficam a contagem das alterações e, para quem edita, "Salvar alterações".

Numa recusa, a ficha abre o cartão com o problema e põe o foco no primeiro campo com `aria-invalid`. A falha sem campo aparece na mensagem do pé, como hoje.

### 6. Testes

As funções puras têm testes próprios. Os testes da `FichaDoAtivo` que mexem nos campos passam a abrir o cartão antes, com um ajudante `abrirCartao`.

As pontas a ponta da web e da pilha que editam a ficha também abrem o cartão, com um ajudante comum em `e2e/etapas.ts`. Entre elas: o patrimônio travado, a senha do painel, o PDF da nota fiscal, o IP e a ligação.

A variante sem a numeração ganha uma história capturada na regressão visual.

## Risks / Trade-offs

- **Os testes da ficha são muitos e acessam os campos direto:** a reescrita é grande. → Um ajudante só para abrir o cartão. Os testes que só leem o estado de um campo abrem o cartão dele, sem mudar o que conferem.
- **O resumo dos alertas depende da consulta do módulo de alertas:** sem `alertas.ver`, ou com o módulo desligado, a relação some, e o resumo também. → A Visão geral diz "Nada pede atenção" com o que a conta vê, e não promete o que ela não alcança.
- **O campo de quem só vê a ficha não aparece de uma vez:** a pessoa precisa abrir o cartão para ver o valor. → O resumo de cada cartão mostra os dois primeiros valores, e a tabela e a prévia continuam mostrando todas as colunas.

## Migration Plan

Só a web e a documentação mudam. O banco e a API não mudam, então voltar a versão não tem efeito no banco.
