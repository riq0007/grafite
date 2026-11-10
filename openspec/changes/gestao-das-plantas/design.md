## Context

A API do mapa (`apps/api/src/mapa/mapa.ts`) tem o `cadastrarPlanta`, que converte o arquivo na própria requisição, grava o modelo no armazenamento, pela chave `chaveDoModeloDaPlanta`, e cria a planta já ativa, e o `alterarPlanta`, que renomeia, liga a um local e muda a situação, menos a da planta que falhou. A rota `PATCH /mapa/plantas/{id}` existe e não é usada pela web.

A tabela `posicoes_na_planta` aponta a planta com `ON DELETE CASCADE`: apagar a planta apaga as posições dela no banco. Nada apaga uma planta hoje.

Na web, a `Plantas.tsx` mostra os cartões e a gaveta "Nova planta". A API já devolve todas as plantas a quem edita e só as ativas a quem vê. A consulta do modelo fica 60 minutos sem reler (`staleTime`).

A spec mestre (seção 5.2, decisão 8) diz "Nada se exclui, tudo se inativa" para os registros de negócio, com as exceções do que se substitui, como a foto da pessoa.

## Goals / Non-Goals

**Goals:**
- Pôr na tela o que a API já faz, e acrescentar a exclusão e a troca do desenho.
- A exclusão sem resto: nem arquivo, nem posição.
- Trocar o desenho sem refazer as posições.

**Non-Goals:**
- Guardar versões do desenho ou desfazer a troca.
- Mover as posições sozinho quando o desenho muda de tamanho.
- A conversão em segundo plano dos arquivos grandes.

## Decisions

### 1. As ações num menu, em cada planta

Cada cartão da planta ganha o menu "Ações", como as linhas das tabelas. "Renomear…", "Ligar a um local…" e "Substituir o desenho…" abrem uma gaveta; "Inativar" e "Reativar" valem na hora, com o retorno, porque se desfazem; "Excluir…" abre a confirmação.

A `Confirmacao` da Administração ganha a propriedade `conferir`, com o texto que precisa ser digitado: com ela, a confirmação mostra o campo e deixa o botão desabilitado até o texto conferir, sem diferenciar espaços nas pontas. É a primeira confirmação por nome digitado da web; o painel da operação já usa a mesma ideia nas operações sensíveis.

### 2. A exclusão

`DELETE /mapa/plantas/{id}`, com a permissão `mapa.editar`. Numa transação:
1. lê a planta e conta as posições dela;
2. apaga a planta, e as posições saem pela chave estrangeira;
3. registra `planta.excluida` na auditoria, com o nome, as medidas e a contagem das posições;
4. grava o evento `mapa.mudou`.

Depois do commit, a rota apaga o modelo do armazenamento. A falha nesse passo fica no log e não desfaz a exclusão: o arquivo sem dono não aparece em tela nenhuma.

**Alternativa descartada:** apagar o arquivo antes do commit. Se a transação falhasse depois, a planta continuaria na lista sem o desenho.

O teste de integração prova que o papel da aplicação consegue apagar em `plantas`. Se faltar a concessão, entra uma migration só com ela.

### 3. A substituição do desenho

`PUT /mapa/plantas/{id}/modelo`, com o arquivo e o nome dele, como o cadastro. A rota converte o arquivo antes de tocar em qualquer coisa: o arquivo recusado ou que não converte responde o erro do cadastro, e a planta fica como estava. Com o modelo convertido, numa transação:
1. atualiza a largura, a profundidade, as contagens e a fonte; a planta que falhou passa a ativa, com o erro limpo;
2. conta as posições fora de `0…largura` e `0…profundidade`;
3. registra `planta.desenho-substituido` na auditoria, com as medidas e as contagens de antes e de depois;
4. grava o modelo novo na mesma chave, que o armazenamento troca inteiro ou não troca;
5. grava o evento `mapa.mudou`.

A resposta traz a planta e `posicoesFora`. A web invalida a consulta do modelo daquela planta, na sessão que trocou e nas que recebem o evento.

### 4. A planta que falhou

O `alterarPlanta` continua sem mudar a situação da planta que falhou, e a tela não oferece "Inativar" nela. Os caminhos dela são substituir o desenho ou excluir.

### 5. O mapa de uma planta excluída

Com o evento, a consulta das plantas relê. O mapa aberto de uma planta que saiu da lista mostra o estado vazio "Esta planta foi excluída.", com "Ver as plantas", no lugar do canvas.

### 6. A exceção na spec mestre

A decisão 8 da seção 5.2 ganha um item: a planta do mapa é um desenho enviado, que se substitui e se exclui por quem cuida do mapa; a exclusão apaga as posições, e a auditoria guarda o nome, as medidas e a contagem.

## Risks / Trade-offs

- **[A exclusão apaga as posições de muitos ativos de uma vez]** → a confirmação diz quantas são e pede o nome digitado, e a auditoria guarda a contagem.
- **[O commit falha depois de o modelo novo gravar, na substituição]** → o desenho novo fica com as medidas antigas no banco; substituir de novo conserta. O arquivo é o último passo antes do commit, para a janela ser mínima.
- **[Posições fora do desenho novo]** → ficam onde estavam, e a tela diz quantas são; apagar ou mover sozinho perderia trabalho de quem posicionou.

## Migration Plan

Nada a migrar. Se o teste mostrar que falta a concessão de `DELETE` em `plantas` ao papel da aplicação, entra uma migration só com ela.

## Open Questions

Nenhuma.
