## Context

**O medidor na célula.** A régua do `Medidor` tem `flex: 1` e `min-width: 64px` em todos os tamanhos (`Medidor.module.css`). O tamanho compacto só muda a altura da trilha e a fonte do número.

Na tabela dos ativos, o `SuprimentosNaCelula` (`apps/web/src/modulos/ativos/suprimentos.tsx`) põe na parte fixa do valor composto:
- o medidor compacto, sem o número e sem as marcas, numa caixa de 40 px (`.medidorNaCelula`, `Ativos.module.css`);
- o número do menor nível, 8 px depois da caixa (o `gap` da parte fixa).

A régua de 64 px passa 24 px da caixa e cobre o número. A caixa continua com 40 px, e por isso a largura medida da célula não muda com o defeito.

A história "Larguras Que A Coleta Pede" (`ValorComposto.stories.tsx`) mede a largura de cada coluna da coleta com um `span` vazio de 40 px no lugar do medidor. Com ele, o catálogo nunca viu a régua por cima do número.

**Os cartuchos na ficha.** O painel Suprimentos põe os cartuchos numa lista flexível que quebra a linha (`.cartuchos`), com 12 px entre eles. Cada item (`.suprimento`) é uma grade centrada de 112 px de largura, com:
- o cartucho;
- a descrição, que quebra em qualquer ponto;
- a idade e o "Desatualizado", numa linha flexível que quebra (`.disponibilidade`).

O rótulo "Desatualizado" mede uns 124 px na captura da 4.4 da `ajustes-dos-tokens`, mais que a coluna. A linha da idade transborda para a direita, alinhada à esquerda, e o rótulo encosta no do cartucho seguinte.

## Goals / Non-Goals

**Goals:**
- A régua compacta caber na caixa de 40 px da célula, com o número inteiro à vista, nas três densidades.
- A idade e o "Desatualizado" de cada cartucho ficarem embaixo dele, centrados, sem encostar nos do vizinho.
- O catálogo e as pontas a ponta guardarem os dois consertos.

**Non-Goals:**
- Redesenhar a célula dos suprimentos como no mockup r3-01, com a barra de 84 px e o percentual em peso forte. Isso vem com a change da tabela por tipo.
- Trocar os cartuchos pelos três arcos do mockup r3-04 ou tirar o rótulo de cada cartucho. Isso vem com a change da ficha.
- Mudar a largura de fábrica da coluna Suprimentos, a não ser que a sobra passe do limite da história.
- Mudar o medidor normal e o grande.
- O rótulo "Inconsistente", que o `Cartucho` põe dentro da figura de 88 px e é tão largo quanto o "Desatualizado". Pela leitura do CSS, dois cartuchos inconsistentes vizinhos também encostariam. É raro, e a change da ficha troca os cartuchos.

## Decisions

### 1. A régua compacta com 40 px de mínimo, e não a caixa da célula com 64 px

O tamanho compacto ganha `min-width: 40px` na régua. O normal e o grande ficam com os 64 px.

A caixa de 40 px é a medida que a "Larguras Que A Coleta Pede" usa para a coluna Suprimentos. Com uma caixa de 64 px, o conteúdo da coluna cresceria 24 px:
- passaria da largura de fábrica de 340 px, que hoje sobra 17 px no Windows e 25 no Linux;
- pediria uma largura nova, numa célula que a change da tabela por tipo vai redesenhar.

Alternativas:
- **`min-width: 0` no compacto:** recusada. Quando o compacto mostra o número, como nos "Rostos cadastrados" do catálogo, a régua divide a linha com ele e poderia encolher até sumir. Os 40 px são a menor caixa em que o compacto é usado.
- **Uma propriedade com a largura da régua:** recusada. Seria uma API nova para um uso só.
- **Um seletor no `Ativos.module.css` que alcance a régua por dentro do medidor:** recusada. Prenderia a web à estrutura interna do componente.

### 2. A coluna do cartucho cresce até caber o rótulo

- O `.suprimento` troca o `width: 112px` por `min-inline-size: 112px`. Como item da lista flexível, ele fica com a largura do conteúdo.
- A descrição ganha `max-inline-size: 112px` só dentro da coluna do cartucho (`.suprimento .descricaoDoSuprimento`). Ela continua quebrando onde quebra hoje, e a prateleira do Início, que usa a mesma classe, não muda.
- A idade e o rótulo vão para uma classe própria, uma grade centrada, com 4 px entre os dois, no lugar da `.disponibilidade`. A linha flexível da `.disponibilidade`, numa coluna que cresce, poria os dois lado a lado e levaria a coluna a uns 180 px.

Com a leitura em dia, a coluna continua com 112 px. Com a leitura velha, ela fica com a largura do rótulo, e os 12 px entre os cartuchos separam os rótulos vizinhos.

Alternativas:
- **A coluna fixa em 128 px:** recusada. Ela depende da largura do rótulo em cada fonte e densidade, e a sobra mudaria em toda ficha, com a leitura em dia.
- **Um "Desatualizado" só para o painel:** recusada aqui. O painel mostra a leitura de cada suprimento, e é a change da ficha, pelo r3-04, que tira o rótulo de cada cartucho.
- **O rótulo só com o ícone:** recusada. O ANTISLOP pede todo estado em texto.

### 3. Os testes: a história no catálogo e as pontas a ponta na web

O jsdom não calcula o layout, e os testes de unidade da web não medem posição. Os consertos são medidos no navegador:
- **A história "Medidor compacto numa caixa de 40 px"** (`Dados.stories.tsx`): o medidor compacto do toner a 8%, sem o número e sem as marcas, numa caixa de 40 px, com o "8%" depois dela, como na célula, nas três densidades.
  - O play confere que a régua acaba dentro da caixa e antes do número.
  - Antes do conserto, a régua mede 64 px e passa 24 px da caixa.
  - A história leva a marca `captura`, para a regressão visual guardar o desenho.
- **A célula, no `coleta.spec.ts`:** na tabela dos ativos, a régua do menor nível acaba antes do "8%".
- **Os cartuchos, no `coleta.spec.ts`:** com as leituras dos suprimentos de 16 dias atrás, cada "Desatualizado" da lista "Níveis dos suprimentos" fica dentro da coluna do seu cartucho, e as duas colunas não se sobrepõem.
  - O `comSuprimentos` passa a receber o momento da leitura dos suprimentos, nos itens e no menor. A resposta do SNMP e o resto do painel ficam com os 3 minutos, como na tela de verdade, em que a resposta é recente e os cartuchos são da última leitura que deu certo. O teste de hoje continua com os 3 minutos.
  - Quem reprova antes do conserto é o rótulo fora da coluna. As colunas já não se sobrepõem hoje, porque são itens flexíveis. A segunda conferência guarda o conserto, para a coluna que cresce não invadir a vizinha.
- **A "Larguras Que A Coleta Pede":** o `Medidor` compacto entra na caixa de 40 px, no lugar do `span` vazio.
  - A sobra da coluna Suprimentos é medida de novo no Windows e no contêiner do Playwright, com o roteiro da 4.4 da `ajustes-dos-tokens`.
  - Como a caixa continua com 40 px, a medida não deve mudar.
  - O comentário diz que o medidor é o de verdade.

As pontas a ponta comparam posições, como "acaba antes de", e não larguras absolutas. Por isso, a fonte, que mede alguns pixels a menos no Linux, não muda o resultado.

### 4. O contrato de módulo descreve os cartuchos

Em "Vários itens", o `docs/casca/modulos.md` ainda descreve a ficha da P2b: os itens numa tabela, com uma barra ao lado. A linha da ficha passa a descrever os cartuchos, com a descrição, a idade e o "Desatualizado" embaixo de cada um.

## Risks / Trade-offs

- **[A `Contagem` também usa o medidor compacto]** → O mínimo da régua dela cai de 64 para 40 px. Nas telas de hoje, a régua ocupa a largura do bloco, maior que 64 px, e nada muda. A regressão visual confere. Se alguma captura mudar, é uma `Contagem` num bloco estreito, e o design registra o caso.
- **[Colunas de larguras diferentes quando só parte das leituras está velha]** → As leituras dos suprimentos de uma impressora chegam juntas, com o mesmo momento. Na prática, o rótulo aparece em todos os cartuchos ou em nenhum. A ficha do r3-04 troca os cartuchos.
- **[O e2e da ficha depende do momento simulado]** → O `comSuprimentos` recebe o momento, e o teste usa 16 dias, longe do limite de 30 minutos. O relógio não muda o resultado.

## Migration Plan

Nada a migrar: a change só muda a folha de estilos, a marcação da idade embaixo do cartucho, os testes e a documentação.
