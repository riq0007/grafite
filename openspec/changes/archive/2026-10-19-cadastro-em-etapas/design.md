## Context

O cadastro do ativo é hoje o `AtivoNovo`, que escolhe o tipo numa `Selecao` e monta o `FormularioDoAtivo` com os grupos da ficha um embaixo do outro. O mesmo `FormularioDoAtivo` serve à ficha (aba Dados) e ao cadastro, com o `preenchido` da origem e o `ficha` opcional. Os grupos vêm do `camposDoAtivo` do domínio, na ordem da ficha: Identificação, Uso, os grupos da organização, "Outros", as capacidades e o Administrativo. O modelo não é um campo: ele fica no alto da Identificação, numa `Selecao` com até 100 modelos.

A cadastro-em-abas (PR #58) trouxe as abas da janela e o `CampoComCadastro`, que o Tipo, o Modelo, o Local e o Responsável já usam. Esta change depende dela e só abre o PR depois que ela entra.

O desenho aprovado é o `grafite_novo_ativo_abas_e_etapas`: uma coluna de 200 px com as etapas em cartões ("1 · Tipo", com a situação embaixo), a atual com a borda de destaque mais grossa, e "Rascunho guardado agora" no pé da coluna; à direita, o nome da etapa, a imagem (150 × 118) e os campos ao lado; no Modelo, a busca "Procure pelo nome ou fabricante", o link "Cadastrar novo modelo", o fabricante e o tipo; embaixo, "Voltar" e "Continuar para Identificação".

Já existem, e esta change reaproveita: o padrão de tabela por conta das `visoes` (orgScoped, chave estrangeira `(org_id, conta_id)` para `contas`, limite do JSONB por `check`), o `config: { permissao }` das rotas, o 413 genérico do `problemas.ts`, a manutenção diária em `apps/api/src/fila/manutencao.ts`, o `SeletorDeConta` (busca na API com sugestões), a `MiniaturaDeAtivo` e o `formatarHora` do `useDataHora`.

## Goals / Non-Goals

**Goals:**
- O cadastro do ativo num componente próprio, em etapas, com a mesma conferência e o mesmo envio de hoje.
- O estado inteiro do cadastro num objeto só, que é o próprio rascunho, retomado por funções puras testáveis.
- O rascunho no servidor sem auditoria nem eventos, e apagado na mesma transação do cadastro.
- A lista das etapas na biblioteca, genérica, para outro formulário longo usar depois.

**Non-Goals:**
- A ficha continua com o `FormularioDoAtivo` em grupos, inclusive a `Selecao` do modelo. Ela ganha os cartões na change seguinte, pelo desenho aprovado em 17/10.
- Sem sincronia ao vivo do rascunho entre aparelhos abertos ao mesmo tempo: o outro aparelho lê o rascunho ao abrir o Novo ativo.
- Sem rascunho nos cadastros do local, da pessoa, do tipo e do modelo, nem nas abas.
- Sem envio de arquivo e imagem no cadastro: o campo continua dizendo "Envie depois de cadastrar o ativo.".

## Decisions

### 1. Um componente novo para o cadastro, e o `FormularioDoAtivo` só para a ficha

O `CadastroEmEtapas` (em `apps/web/src/modulos/ativos/cadastro/`) é dono do estado do cadastro: o tipo, o modelo, as entradas, as travas, os nomes dos registros apontados, a etapa aberta e a origem. O `AtivoNovo` carrega o catálogo, o rascunho e a origem e decide o que abrir. O `FormularioDoAtivo` perde os ramos do cadastro (`preenchido`, `ficha` opcional), e o que os dois usam sai dele:
- o `CampoDoAtivo`, como está;
- a conferência do envio e a tradução das recusas da API (`valores.<chave>` e `modeloId`) para a chave do campo, numa função pura (`pedidoDoAtivo.ts`).

Alternativa: um `FormularioDoAtivo` com `disposicao: 'grupos' | 'etapas'`. Ela junta num componente de 377 linhas dois comportamentos que já divergem: o tipo dentro das etapas, a troca do tipo com confirmação, o Enter que continua, o rascunho e o foco por etapa. Fica um componente para cada uso, com as partes comuns fora deles.

### 2. As etapas são calculadas por uma função pura

`etapasDoCadastro` (`etapas.ts`, com testes) recebe o tipo, os grupos do `camposDoAtivo`, já filtrados pelos restritos, as entradas e o modelo, e devolve, para cada etapa, a chave, o nome, os campos, a situação em texto e, quando não abre, o motivo. Sem o tipo, ela devolve Tipo, Modelo, Identificação, Uso e Administrativo, as quatro últimas com "Escolha o tipo antes".

A situação segue a spec: o nome escolhido no Tipo e no Modelo; "Falta: <campo>", com "e mais N"; "Preenchida"; "Opcional". Conta como preenchido o campo que não está vazio para o motor de campos (`vazio` do domínio), e o campo com valor padrão, como a situação de uso, começa preenchido. Os campos de arquivo não contam: eles não podem ser obrigatórios e não são enviados no cadastro.

O domínio ganha a chave estável de cada grupo (`GrupoDoAtivo.chave`): `identificacao`, `uso`, `organizacao:<nome>`, `outros`, `capacidade:<chave>` e `administrativo`. A etapa guardada no rascunho é essa chave, e não a posição nem o nome, que podem repetir entre um grupo da organização e uma capacidade. O Tipo e o Modelo são `tipo` e `modelo`. O Modelo vira uma etapa própria e sai do alto da Identificação.

### 3. A lista das etapas na biblioteca: `EtapasDoFormulario`

Em `packages/ui/src/componentes/etapas/`. Recebe o rótulo da lista, as etapas (`id`, `nome`, `situacao`, `motivo` quando não abre), a atual e `aoEscolher`. A numeração "N · Nome" é dela.

A semântica é uma `nav` com o rótulo e uma lista ordenada de botões. A atual tem `aria-current="step"`, e a situação e o motivo descrevem o botão (`aria-describedby`). O foco anda pelas setas, nas duas direções do teclado, com um só ponto de Tab (tabindex móvel pelo `useFocusManager` do React Aria). A etapa sem a escolha fica com `aria-disabled` e focável, para o leitor de tela ler o motivo, e o clique e o Enter não fazem nada.

A atual é marcada pela forma, além da cor: a borda mais grossa e a barra de destaque à esquerda, pelos tokens de borda e de destaque. A largura vem de uma consulta de contêiner, e não da janela do navegador: abaixo de um limite, a lista vira a faixa horizontal que rola e mantém a atual à vista (`scrollIntoView` com `inline: 'nearest'`). Assim, a janela estreita no computador também ganha a faixa.

A ficha em cartões, da change seguinte, reaproveita a lista. Por isso a numeração e o valor do `aria-current` (`step` no cadastro) são opções da lista, e não fixos nela.

Alternativas:
- um `role="tablist"`: as etapas não são abas de conteúdo, e o padrão de abas não tem estado desabilitado com motivo nem "etapa atual";
- a `Toolbar` do React Aria: ela dá as setas, mas anuncia "barra de ferramentas".

### 4. O painel da etapa

O painel tem:
- o nome da etapa num `h2` com `tabIndex={-1}`, que recebe o foco a cada troca;
- a `MiniaturaDeAtivo` com a imagem do modelo escolhido, ou o ícone do tipo;
- os campos da etapa ao lado;
- no pé, "Voltar" e "Continuar para <próxima>", ou "Cadastrar" na última.

O `Formulario` envolve o painel inteiro. O envio continua para a próxima etapa, e só na última cadastra; assim o Enter num campo continua, e o botão principal é sempre o `submit`.

Na etapa Modelo:
- a busca usa o `SeletorDeConta` com `GET /modelos?tipo&situacao=ativos&busca`, como o mockup pede, e deixa de ter o limite de 100 da `Selecao`;
- o modelo escolhido é lido por id (`useModelo`), para a imagem e o fabricante;
- o link "Cadastrar novo modelo" continua pelo `CampoComCadastro`, com o tipo do ativo.

A troca do tipo com algo preenchido fora da etapa Tipo pede a confirmação "Trocar o tipo?" pelo `Dialogo`, com "Trocar o tipo" e "Manter o tipo". Conta como preenchido o modelo, uma trava ou uma entrada diferente da inicial.

Não há "Cancelar". Sair pela casca guarda o rascunho, e "Descartar o rascunho", no pé da coluna, abaixo da situação dele, é a forma de recomeçar.

### 5. Cadastrar, recusas e foco

"Cadastrar" confere tudo com o `conferirValoresDoAtivo`, como hoje. Com recusas, o cadastro abre a primeira etapa, na ordem da lista, que tem um campo recusado (o tipo vazio abre o Tipo). Depois da renderização, o foco vai ao primeiro campo com `aria-invalid` do painel. A recusa da API passa pelo mesmo caminho, e a falha sem campo aparece na `MensagemDoPasso` do pé do painel.

### 6. O rascunho no banco: `rascunhos_de_cadastro`

```
rascunhos_de_cadastro (orgScoped)
  conta_id        uuid not null   → (org_id, conta_id) em contas, on delete cascade
  cadastro        text not null   check (cadastro in ('ativo'))
  conteudo        jsonb not null  check (objeto e octet_length(conteudo::text) <= 262144)
  atualizado_em   timestamptz not null default now()
  unique (org_id, conta_id, cadastro)
  index (org_id, atualizado_em)   para a manutenção
```

O RLS por organização é o do `orgScoped`, e o teste-guarda cobre a tabela. A conta não é um parâmetro da rota: a API sempre usa a da sessão. Por isso outra conta da mesma organização não alcança o rascunho, sem precisar de política por conta. A coluna `cadastro` deixa outro cadastro ganhar rascunho depois sem uma tabela nova; hoje só existe `ativo`.

Alternativas:
- o rascunho nas preferências da conta: elas são lidas no início de toda sessão e vão para todas as telas, e o rascunho tem até 256 KB;
- no navegador: a spec pede outro aparelho e a volta depois de sair e entrar.

### 7. As rotas do rascunho

As rotas ficam em `apps/api/src/rotas/rascunho-do-ativo.ts`, com `config: { permissao: 'ativos.editar' }`, ou seja, a permissão em algum escopo:

| Rota | O que faz |
|---|---|
| `GET /ativos/rascunho` | `{ rascunho: RascunhoDoAtivo \| null }`, com o `atualizadoEm`. Sem rascunho, é 200 com `null`, e não 404, para a tela não tratar a ausência como erro |
| `PUT /ativos/rascunho` | Grava (upsert) o conteúdo inteiro e devolve `{ atualizadoEm }`. `bodyLimit` de 256 KB, com o 413 "O rascunho passa de 256 KB."; o `check` do banco é a segunda barreira |
| `DELETE /ativos/rascunho` | 204, mesmo sem rascunho |

A rota estática `/ativos/rascunho` ganha da `/ativos/:id` no roteador do Fastify.

O conteúdo é conferido na forma, e não no catálogo:
- `tipoId` e `modeloId`: uuid ou `null`;
- `valores`: o texto, a lista de textos ou `null`, pela chave;
- `travas`: booleanos pela chave;
- `nomes`: o texto pelo id;
- `etapa` e `origem`: texto ou `null`.

O rascunho pode estar incompleto ou inválido. Quem confere os valores é o cadastro, na hora de cadastrar.

O `POST /ativos` apaga o rascunho `ativo` da conta na mesma transação da gravação. Se o envio falha, o rascunho fica. A anonimização da pessoa apaga os rascunhos da conta dela, junto com as visões, porque o que foi digitado é dela. As rotas não chamam a auditoria nem publicam evento. A recusa de permissão continua auditada como em toda rota (`permissao.recusada`).

Alternativa: o cliente apagar o rascunho depois do `POST`. Se o `DELETE` falhasse, o próximo Novo ativo retomaria o cadastro de um ativo já gravado.

### 8. Guardar enquanto a pessoa preenche

O `useRascunhoDoAtivo` (web) lê o rascunho pelo TanStack Query e guarda com espera:
- **Espera:** 1 s depois da última mudança, o que deixa margem para os 2 s da spec.
- **Fila:** um envio de cada vez. A mudança que chega durante um envio marca o estado como sujo, e ele vai quando o envio termina, para um `PUT` antigo nunca chegar depois de um novo.
- **Quando não guarda:** antes de o tipo ser escolhido; antes de o rascunho ser lido; e enquanto a pergunta da origem está aberta.
- **Ao sair da tela:** a desmontagem e o `pagehide` mandam na hora o que estava esperando, sem esperar a resposta.
- **Antes de cadastrar e de descartar:** a espera é cancelada, e o envio em curso é aguardado, para o `PUT` atrasado não recriar o rascunho apagado.

A situação em texto vem do hook:
- "Guardando o rascunho…" com o envio em curso;
- "Rascunho guardado agora" até 1 min depois;
- depois, "Rascunho guardado às 14:32", pelo `formatarHora` no fuso da conta;
- "O rascunho não foi guardado." com "Tentar de novo", que manda de novo na hora.

Só a falha é anunciada (`role="status"`): anunciar cada gravação interromperia quem digita com o leitor de tela.

### 9. Retomar, a origem e o descarte

`retomarRascunho` (`rascunho.ts`, puro, com testes) recebe o rascunho lido, os tipos ativos, os campos do catálogo e o que a conta edita, e devolve o estado inicial do cadastro:
- **Tipo:** o tipo que não está mais ativo volta sem tipo e sem valores.
- **Valores:** ficam os das chaves que o tipo usa, que a conta edita (sem os restritos sem `ativos.restritos`) e que não são de arquivo, com a forma certa, texto ou lista.
- **Travas e nomes:** ficam os das chaves e os dos ids que ficaram.
- **Etapa:** a guardada, se ainda existir; senão, a primeira.

O modelo é conferido depois, pela leitura dele por id. O inativo, o de outro tipo ou o que não existe mais sai do estado.

A origem guardada é o texto do parâmetro `origem` da tela, e decide o que abrir:

| Na abertura | O que acontece |
|---|---|
| Sem origem na URL | Retoma o rascunho sem perguntar |
| A mesma origem do rascunho | Retoma sem perguntar, como depois de recarregar |
| Outra origem, e o rascunho tem outra ou nenhuma | Pergunta "Continuar o cadastro começado?" |

As respostas da pergunta:
- "Continuar o começado" retoma o rascunho e tira a origem da URL (`replace`).
- "Começar um novo" apaga o rascunho e começa pelo que a origem preenche, com a origem no estado.

"Descartar o rascunho" pede a confirmação "Descartar o rascunho?", com "Continuar editando" e "Descartar". Ela apaga o rascunho, tira a origem da URL e recomeça sem nada. Se o `DELETE` falha, o estado fica, com a falha na mensagem do pé do painel.

A falha ao ler o rascunho mostra o `EstadoVazio` com "Tentar de novo", como a falha do catálogo. Começar vazio sobrescreveria o rascunho na primeira gravação.

### 10. A manutenção apaga os rascunhos parados

A `manutencao` de cada organização ganha um passo: apagar os rascunhos com `atualizado_em` de mais de 30 dias, na organização dela, com a contagem no log. O passo não grava auditoria, como os outros passos da retenção. Rodar de novo não acha mais nada.

## Risks / Trade-offs

- **Dois aparelhos com o cadastro aberto ao mesmo tempo:** a última gravação vence, e o aparelho que cadastrou primeiro apaga o rascunho que o outro ainda recria. → Ao abrir o Novo ativo, o rascunho retomado mostra a hora em que foi guardado, e "Descartar o rascunho" está à vista. Um ativo repetido esbarra na recusa do patrimônio repetido, que é único na organização, quando ele foi preenchido. Um controle de versão do rascunho entraria só se isso aparecer na operação.
- **Recarregar até 1 s depois da última mudança:** o `pagehide` manda o que esperava, mas o navegador pode cortar o envio. → A perda se limita ao que foi digitado no último segundo, dentro do que a spec aceita.
- **O rascunho guarda os nomes dos registros apontados, que podem mudar:** o nome antigo aparece até a pessoa trocar o campo. → O id é o que vai no cadastro, e a API recusa o registro que não existe mais, no próprio campo.
- **O `FormularioDoAtivo` perde o modo de cadastro:** os testes do cadastro saem do `AtivoNovo.test.tsx` e vão para os do `CadastroEmEtapas`. → A ficha mantém os testes dela, que não mudam, e a ponta a ponta do cadastro é refeita pelas etapas.
- **As pontas a ponta que cadastram ativos pelo formulário antigo quebram:** as de ativos, catálogo, coleta, Control iD, etiquetas e abas, e a da pilha. → Uma tarefa própria refaz os passos delas pelas etapas, com um ajudante comum, e a simulação da API ganha o rascunho em memória, por página.

## Migration Plan

1. A migration cria a `rascunhos_de_cadastro`, com o RLS ativo e forçado e as permissões do `grafite_app`, como as outras do `orgScoped`. Ela só acrescenta: nenhuma tabela existente muda.
2. O contrato (OpenAPI e cliente tipado) é gerado de novo com as três rotas.
3. Voltar a versão (`grafite.ps1 voltar`) volta o banco pelo backup da atualização, como em toda versão. Uma versão anterior com a tabela a mais funciona: nada a lê.
