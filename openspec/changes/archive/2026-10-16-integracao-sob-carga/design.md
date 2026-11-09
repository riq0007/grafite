## Context

O CI roda em três instâncias do executor na mesma máquina (ci-paralelo). Cada job tem 15 min no `ci.yml`, um limite curto para um travamento reprovar logo, em vez de esperar as 6 horas do padrão do GitHub.

Na integração, o turbo roda os pacotes ao mesmo tempo, cada um com o PostgreSQL dele, e mostra a saída de um pacote só quando ele termina. O banco e os dois pacotes da operação terminam em menos de 3 min; a suíte da API é o caminho mais longo. Num run sem carga, ela levou 587 s (o run do #53), e o job inteiro, uns 11 min com o preparo. Com outros jobs ao lado, cada pacote anda de 1,5 a 2,2 vezes mais devagar.

O teste de desempenho da importação aplica uma planilha de 5.000 linhas e mede o tempo da tarefa: sem carga, o arquivo dele leva uns 147 s no CI; com carga, a aplicação mediu 197,8 s. O limite de 180 s é do teste, e não de um requisito da spec, que pede que a planilha de 5.000 linhas não trave a API, a fila nem as telas.

O motivo da change está na proposta.

## Goals / Non-Goals

**Goals:**
- A integração e a regressão visual terminam dentro do limite com a máquina carregada.
- O teste de desempenho continua pegando uma regressão de ordem de grandeza, como um pedido ao banco a mais por linha.
- Uma falha no preparo do `svg.test.ts` aparece com a causa, sem um segundo erro por cima.
- A comparação das capturas e a primeira foto da pilha esperam o tempo da máquina carregada.

**Non-Goals:**
- Mudar o que os testes verificam ou a ordem dos jobs.

## Decisions

### 1. A integração e a regressão visual com 30 min

O limite desses dois jobs vai a 30 min, com o motivo no comentário do `ci.yml`. Os dois são os que já passaram dos 15 min; os outros ficam com 15. Um travamento de verdade nesses jobs leva 30 min para reprovar, ainda longe das 6 horas do padrão.

Alternativa descartada: a integração num rótulo próprio, numa instância só. O run do #55 passou dos 15 min com só os unitários ao lado, então a disputa não é só entre duas integrações.

Alternativa descartada: menos instâncias do executor. Isso é da ci-paralelo e devolveria a fila única.

### 2. O teste de desempenho com 480 s

O limite vai a 480 s, e o tempo do teste, a 540 s, para o teste reprovar pela asserção, com a medida na mensagem, e não pelo tempo esgotado. O primeiro limite desta change, de 300 s, também ficou curto: no CI do #57, com os outros jobs ao lado, o teste passou dos 330 s, e, de novo quase sozinho, a aplicação levou 221,1 s; com o limite novo e os outros jobs ao lado, levou 396,9 s. 480 s ainda reprova uma regressão de ordem de grandeza: um pedido ao banco a mais por linha leva a aplicação muito além disso.

Alternativa descartada: pular o teste no CI. A regressão de desempenho só seria vista em produção.

Alternativa descartada: medir o tempo de CPU do processo. A maior parte do trabalho é do PostgreSQL, em outro processo, e o tempo de CPU da API não mediria a aplicação.

### 3. O preparo do `svg.test.ts` com 120 s e o `afterAll` protegido

A espera do primeiro SVG vai a 120 s. O `afterAll` fecha o servidor só quando ele existe, para uma falha no preparo aparecer sozinha, com a causa.

O teste das fotos da API que entrega o SVG sanitizado (`fotos.int.test.ts`) também tem o primeiro SVG do arquivo, com a miniatura feita dele, e vai a 120 s pelo mesmo motivo.

### 4. A comparação das capturas com 30 s

A espera do `expect` da regressão visual vai dos 5 s do padrão do Playwright a 30 s. Ela cobre a captura inteira: as fontes, a tela parada e duas capturas iguais seguidas. O tempo de cada teste, de 60 s, continua cobrindo a espera da história e a da captura.

### 5. A primeira foto da pilha com 120 s

A espera do aviso "Foto trocada." vai de 30 s a 120 s. A primeira imagem carrega a biblioteca de imagens e grava as variantes em WebP, um trabalho de processador que a carga atrasa mais que os outros. O tempo do teste, de 300 s, comporta a espera nova.

### 6. O menu reaberto do Dock com a saída de 5 s

A história "Menu Reaberto Pelo Teclado" confere que, logo depois da escolha, o menu ainda está saindo da tela, e que a seta o reabre reaproveitando o painel que sai. A saída dura `--dur-opacidade`, 120 ms, e, com o executor carregado, a asserção chegava depois dela. Durante a história, a raiz da página põe 5 s nesse token, e o devolve no fim: a corrida deixa de existir, e o comportamento conferido é o mesmo.

Alternativa descartada: esperar com `waitFor` o menu sair e reabrir. A história deixaria de conferir o reaproveitamento do painel que sai, que é o que ela existe para mostrar.

## Risks / Trade-offs

- [Um travamento na integração ou na regressão visual demora 30 min para reprovar] → os dois jobs não travam um no outro, e o executor segue com os outros jobs.
- [O limite de 480 s deixa passar uma piora menor que uma ordem de grandeza] → o tempo do teste aparece no log de cada run; se a aplicação passar a se aproximar do limite sem carga, a importação ganha uma change de desempenho.
