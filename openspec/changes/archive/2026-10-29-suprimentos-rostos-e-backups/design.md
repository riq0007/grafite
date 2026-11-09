## Context

O que existe hoje:
- **As leituras dos suprimentos:** ficam na tabela `leituras` por 30 dias. A métrica `impressora.suprimento` tem um item por suprimento, o `valor_numero` com o percentual (válido de 0 a 100, nulo quando a impressora diz só "há suprimento") e os detalhes com a descrição.
- **O estado atual:** fica em `estado_dos_ativos`. Dele saem o painel Suprimentos (`apps/api/src/coleta/suprimentos.ts`) e a coluna da lista.
- **Os backups do Control iD:** ficam em `backups_do_controlid`, com a situação, o pedido, o fim, os registros, as fotos e as categorias, cada uma com a quantidade. As categorias "users" (Usuários) e "face_images" (Fotos) dão os usuários e os rostos.
- **Os dias do backup:** a agenda, a retenção e os dias são os de São Paulo (domínio `coleta/backup-do-control-id.ts`).

Os instrumentos estão no `@grafite/ui` (visualizacoes-de-dados).

## Goals / Non-Goals

**Goals:**
- O toner lido como cartucho, na tinta dele, com a estimativa de quando acaba.
- Os rostos e os usuários de cada controle à vista, com a tendência.
- Os dias sem backup visíveis de relance, por controle.
- A lógica (a tinta, a estimativa, os dias e as contagens) no domínio, em funções puras.

**Non-Goals:**
- A capacidade de rostos de cada modelo de controle.
- O limite da regra de alerta nos cartuchos.
- O estoque de toner.
- Mudar o banco ou o coletor.

## Decisions

### 1. A tinta pela descrição

`tintaDoSuprimento(descricao)` devolve `'ciano' | 'magenta' | 'amarelo' | 'preto' | null`. Ela procura a palavra da cor, sem acento e sem distinguir maiúsculas:

| Palavras | Tinta |
|---|---|
| cyan, ciano | ciano |
| magenta | magenta |
| yellow, amarelo | amarelo |
| black, preto, negro, e o "K" isolado | preto |

A tinta só vale para o tipo Toner. O cilindro, o fusor e o outro ficam sem tinta, mesmo com a cor na descrição, como "Black Drum": o cartucho deles é neutro.

### 2. A série dos suprimentos

`GET /ativos/{id}/suprimentos/serie` devolve:

```json
{ "itens": [{ "item": "1", "descricao": "Black Toner", "pontos": [{ "dia": "2026-10-01", "momento": "...", "percentual": 72 }] }] }
```

- **Os pontos:** o último percentual válido de cada dia de São Paulo, dos últimos 30 dias. Saem de uma consulta só, com o `DISTINCT ON (item, dia)`, pelo índice `leituras_do_ativo_idx`.
- **A permissão:** a mesma do painel na ficha, `ativos.ver` no local do ativo. Como a ficha, o ativo fora do alcance responde 403, e o que não existe, 404.
- **A capacidade:** sem a capacidade ligada no tipo, a resposta é a lista vazia.

### 3. A estimativa de quando acaba

`estimarFimDoSuprimento(pontos)` devolve `{ dias, desde }` ou `null`, assim:
1. Ordena os pontos e corta a série na última troca: o ponto que sobe mais de 10 pontos sobre o anterior começa uma série nova.
2. Exige pelo menos 3 pontos, cobrindo pelo menos 3 dias.
3. Faz a regressão linear do percentual pelo tempo. A inclinação precisa ser negativa, com pelo menos 0,1 ponto por dia, senão o nível está parado e não há estimativa.
4. Os dias até o zero contam do último ponto. Passando de 365, não há estimativa, porque o número não serve à decisão.

A web escreve "Acaba em cerca de N dias" (ou "1 dia", ou "hoje", com menos de 1). Embaixo vai "pelas leituras desde 12/10", a data de `desde`. É sempre uma estimativa e nunca toma o lugar do nível medido (ANTISLOP v3, seção 31).

### 4. O painel Suprimentos com os cartuchos

O painel mantém a resposta do SNMP, a idade, o coletor e o motivo. Os suprimentos viram uma fileira de `Cartucho`, na ordem da impressora:
- **o nome:** o tipo e a descrição, como "Toner · Black Toner Cartridge", resumido no cartucho ao nome da tinta, quando há tinta, e com a descrição inteira no título;
- **a tinta:** a da decisão 1;
- **o nível:** o do estado, medido, "há suprimento", sem dado ou inconsistente;
- **a estimativa:** a da decisão 3, pela série.

A idade da leitura de cada suprimento continua no título do cartucho. A resposta do SNMP mostra a idade da última leitura.

Os contadores, as condições e as mensagens continuam como estão.

### 5. O medidor na coluna da lista

A célula dos suprimentos ganha o `Medidor` compacto do menor nível, na tinta do suprimento, sem o número repetido. O texto continua ao lado, como "8% · Black Toner Cartridge", com a idade. O que a tabela copia (`textoDosSuprimentos`) não muda.

### 6. O resumo dos backups

`GET /controlid/backups/resumo?dias=30&ativo=<id>` devolve, para cada controle com o backup ligado que a conta vê (`controlid.ver` no local):

```json
{ "controles": [{
  "controle": { "id": "...", "rotulo": "...", "patrimonio": "PAT-00778" },
  "dias": [{ "data": "2026-10-01", "situacao": "ok" }],
  "ultimo": { "concluidoEm": "...", "situacao": "sucesso", "usuarios": 98, "rostos": 412 },
  "anterior": { "usuarios": 100, "rostos": 409 },
  "rostos": [{ "momento": "...", "valor": 380 }]
}] }
```

- **Os dias:** saem de `diasDosBackups(backups, dias, agora)`, no domínio. Cada dia de São Paulo dos últimos `dias` (de 7 a 90, 30 por padrão) fica com a melhor situação dos backups concluídos nele: sucesso → `ok`, parcial → `parcial`, falha → `falha`, e nenhum → `nada`. O dia de hoje entra.
- **O último e o anterior:** são os dois últimos backups Sucesso ou Parcial. Os usuários e os rostos saem de `contagensDoBackup(categorias)`, pela quantidade das categorias "users" e "face_images". Uma categoria com erro conta como sem dado (`null`).
- **Os rostos:** a série dos backups com a categoria das fotos lida, para a tendência.
- **O filtro `ativo`:** dá um controle só, para a ficha.

### 7. Na ficha e na tela dos backups

**Na ficha do controle**, a seção Backups ganha no topo, acima da lista:
- **a contagem dos rostos:** a variação desde o backup anterior, como "+3 desde o backup anterior";
- **a contagem dos usuários:** com a mesma variação;
- **a tendência dos rostos:** com o período "30 dias";
- **a faixa dos 30 dias:** com o resumo, como "26 de 30 dias com backup".

**Na tela "Backups do Control iD"**, acima da lista, vem a tabela "Últimos 30 dias", com uma linha por controle:
- o controle, com o patrimônio;
- a faixa;
- os rostos;
- os usuários;
- o último backup, com a idade.

A ordem põe primeiro quem tem mais dias sem backup.

## Risks / Trade-offs

- **30 dias de leituras a cada 10 minutos são 4.320 linhas por suprimento.** O `DISTINCT ON` com o índice da série devolve só 30 por suprimento. O teste de integração confere o resultado.
- **A regressão sofre com uma troca parcial**, como um cartucho remanufaturado que entra a 60%. O corte na subida de mais de 10 pontos cobre esse caso.
- **A tela de backups com muitos controles:** o resumo é uma consulta por organização, agrupada no banco. Os dias saem no domínio, a partir das linhas dos últimos 90 dias, no máximo.

## Migration Plan

Nada a migrar: as rotas e as telas são novas, sobre os dados que já existem.

## Open Questions

Nenhuma.
