## Context

O CI roda em três instâncias do executor próprio na mesma máquina Windows (changes ci-no-executor-proprio e ci-paralelo), ao lado do Docker com o PostgreSQL de cada job. Com os três jobs pesados ao mesmo tempo, subir um processo do Node e carregar o TypeScript, montar o Fastify pela primeira vez num arquivo de teste, gerar o contrato da API ou rasterizar a marca leva mais de 5 s. O pacote da operação já passou por isso e tem `testTimeout: 30_000` no `vitest.config.ts`, com o motivo no comentário, e o comando da operação dá 60 s ao processo que o teste sobe. O coletor não tem `vitest.config.ts`, a API, a web e a UI ficam com os 5 s do padrão, e os testes da partida da API dão 15 s ao processo.

Nos testes da web, o `findBy` e o `waitFor` da Testing Library esperam 1 s pelo que a tela vai mostrar, o padrão da biblioteca. Um teste da prévia, que espera o resumo da linha abrir depois da pausa do mouse, pede 3 s.

A história "Busca Com Sugestoes De Fora" simula a API da busca: cada tecla agenda a resposta para o texto daquele momento, 400 ms depois, e a lista mostra a que chegar. Digitar "ana.s" gera cinco respostas; as de "a", "an" e "ana" trazem Ana Souza e Anabela Reis, e as de "ana." e "ana.s", só Ana Souza. A história acha "Ana Souza" e confere, na hora, que "Anabela Reis" não está na lista.

Os códigos de recuperação da conta são dez linhas de `codigos_de_recuperacao`, lidas pelo teste com `select().from(...).where(...)`, sem ordem. O PostgreSQL não garante a ordem sem `ORDER BY`.

## Goals / Non-Goals

**Goals:**
- Os testes unitários passam com o executor carregado, também os da web que esperam a tela.
- A comparação dos códigos de recuperação não depende da ordem das linhas.
- A história da busca confere a lista da última resposta, e não a de uma resposta do meio.

**Non-Goals:**
- Mudar o que os testes verificam.
- Mexer no p95 do teste de desempenho ou na regressão visual (proposta, fora da change).

## Decisions

### 1. O tempo limite no `vitest.config.ts` de cada pacote

O coletor ganha um `vitest.config.ts` com `testTimeout: 30_000`, o mesmo valor do pacote da operação, e a API, a web e o projeto unitário da UI ganham o mesmo limite no deles, cada um com o motivo no comentário. O limite vale para o pacote inteiro, porque o que demora é a primeira coisa de cada arquivo, seja ela qual for. Os testes da partida da API dão 60 s ao processo, como o comando da operação, e o limite do teste segue 5 s acima dele.

Alternativa descartada: o tempo limite só nos testes que reprovaram. O próximo teste a abrir um arquivo novo reprovaria do mesmo jeito.

Alternativa descartada: um limite na raiz, para todos os pacotes. Cada pacote roda o próprio Vitest pelo turbo, com a própria configuração, e o domínio e o banco não reprovaram.

### 2. A espera da Testing Library em 10 s

O arquivo de preparo dos testes da web, que todo teste dela carrega, passa a espera do `findBy` e do `waitFor` a 10 s, pela configuração da biblioteca. A espera só acaba antes quando o que o teste procura aparece, então o teste que passa não fica mais lento. Os 10 s ficam abaixo dos 30 s do teste inteiro, que pode esperar mais de uma coisa. O teste do resumo da linha perde a espera própria de 3 s e fica com a de todos.

Alternativa descartada: a espera maior só no `Modelos.test.tsx`. A carga atrasa qualquer tela, e o próximo teste a reprovar seria outro.

### 3. A comparação ordenada dos códigos

O teste compara os identificadores dos códigos ordenados, antes e depois da tentativa com o código errado. O que ele verifica continua o mesmo: nenhum código foi trocado, apagado ou criado.

Alternativa descartada: o `ORDER BY` na leitura do teste. Funcionaria igual, e a ordenação na comparação deixa explícito que a ordem não importa.

### 4. A história espera a lista da última resposta

A conferência de que "Anabela Reis" não está na lista passa a esperar, pelo `waitFor`, até a lista chegar à última resposta, a de "ana.s". O que a história verifica continua o mesmo: as sugestões que vêm de fora aparecem sem um filtro novo, e Ana Souza é achada pelo e-mail.

Alternativa descartada: a API simulada responder só ao último texto, cancelando as respostas antigas. A história deixaria de mostrar o caso real, em que a lista mostra cada resposta que chega.

### 5. A espera da sondagem do Control iD nos testes

Os testes da sondagem esperavam 300 ms por pedido. Com a PC-DEV-3 carregada (CI do PR #35), o logout, que vai sem tentativa a mais, passou disso e foi abortado, e o teste viu a sessão do simulador aberta. Os controles que respondem passam a ter 5 s de espera, e só o teste do controle calado, que confere o tempo esgotado, fica com os 300 ms.

Alternativa descartada: dar uma tentativa a mais ao logout. A spec diz que a saída vai sem tentativa a mais, e o defeito era só do teste.

### 6. O resumo da linha na ponta a ponta tenta de novo

A ponta a ponta do resumo da linha para o mouse uma vez e espera o resumo. Com a PC-DEV-3 carregada (CI do PR #35), a tabela ainda se ajustava depois do hover, e essa rolagem cancelou a espera, como a spec manda. O mouse não se mexia de novo, e o resumo nunca abria. O teste passa a tirar o mouse e pará-lo de novo, até o resumo abrir, por até 15 s. Cada tentativa espera os 1,5 s inteiros.

Alternativa descartada: esperar a tabela "assentar" antes do hover. Não há um sinal na página de que a rolagem acabou, e uma espera fixa só esconderia o problema até a próxima carga maior.

## Risks / Trade-offs

- [Um teste que trave de verdade demora 30 s para reprovar, e o da partida da API, 65 s] → o mesmo da operação; o CI ainda indica o teste que travou.
- [Um teste da web que procura o que nunca aparece leva 10 s para reprovar, no lugar de 1 s] → só o teste que já reprovaria fica mais lento.
