## 1. Spec mestre e tokens

- [x] 1.1 Atualizar a spec mestre conforme o design (decisão 11):
  - seção 7.5: o limite de 500 ms também no primeiro acesso, "Bem-vindo ao Grafite", a montagem só depois das boas-vindas e as etapas como lista aberta;
  - seção 7.6: a ordem ajustável e gravada;
  - seção 7.2: o fuso "Seguir o sistema" de fábrica;
  - seção 4: a base da PWA;
  - Apêndice B: a chegada.

  Verificar: o diff da spec mestre bate com as specs desta change.
- [x] 1.2 Escrever os testes do gerador para os valores novos e depois acrescentar os tokens:
  - em `tempos.ts`: `chegada.mostrarDepoisDe` (500 ms) e `pwa.conferirVersao` (1 h);
  - em `escalas.ts`, as durações das boas-vindas: traço de 2,1 s, preenchimento de 0,7 s a partir de 1,75 s, subtítulo de 0,5 s a partir de 2,1 s e saída de 0,38 s;
  - também em `escalas.ts`, as da montagem: barra de 0,42 s, janela de 0,5 s com 0,08 s de atraso e dock de 0,62 s com 0,16 s de atraso, com as curvas existentes;
  - a exceção das boas-vindas registrada junto à da mola do aviso.

  Verificar: os testes passam, e `pnpm tokens:verificar` fica em dia depois de `pnpm tokens:gerar`.

## 2. Preferências

- [x] 2.1 Escrever os testes do modelo com as seções `regiao` e `inicio`:
  - o fuso "sistema" de fábrica;
  - um fuso IANA válido mantido, e um desconhecido de volta ao sistema;
  - a ordem de fábrica `severidade`/`decrescente`;
  - coluna ou direção desconhecidas de volta à fábrica;
  - preferências gravadas pelo F1b sem as seções novas.

  Depois, estender o modelo. Verificar: os testes unitários passam.
- [x] 2.2 Escrever os testes do provedor para as seções novas: a mudança aplicada na hora e gravada, e restaurar a seção `regiao` sem mexer nas outras. Depois, ajustá-lo. Verificar: os testes de componente passam, também com o armazenamento bloqueado.

## 3. Fuso horário

- [x] 3.1 Escrever os testes das funções de data no fuso, no `packages/ui`, com datas e fusos fixos. Depois, implementá-las. Os testes cobrem:
  - `formatarHorario` ("qui 24 set 14:32"), `formatarHora` e `formatarDia` no fuso pedido;
  - `grupoDoDia` com a virada do dia no fuso, no cenário "Hoje" e não "Ontem" da spec;
  - a validação de um identificador IANA;
  - a lista de fusos: os do Brasil primeiro, as cidades em português e "UTC−4" no rótulo.

  Verificar: os testes unitários passam.
- [x] 3.2 Criar o `ProvedorDaRegiao` e o gancho `useDataHora()`, e passar a central para ele: horários e grupos por dia no fuso do contexto. Começar pelas histórias da central num fuso diferente do navegador. Verificar: `pnpm test:stories` passa.
- [x] 3.3 Ligar o `ProvedorDaRegiao` ao provedor das preferências e passar o relógio da barra para o `useDataHora()`, começando pelo teste de componente em que o fuso de Manaus nas preferências tira uma hora do relógio. Verificar: o teste passa.

## 4. Aviso com ação e persistente

- [x] 4.1 Escrever os testes da fila e as histórias da região e depois implementar `acao` e `persistente` no aviso. Os casos:
  - o persistente de Informação sem tempo, que fica além dos 20 s;
  - a ação "Atualizar" como botão primário antes de "Fechar", que age e fecha o aviso;
  - os avisos atuais sem mudança.

  Verificar: os testes unitários e `pnpm test:stories` passam.

## 5. Chegada

- [x] 5.1 Escrever com relógio falso os testes da orquestração das etapas no `apps/web` e depois implementá-la. Os casos:
  - a ordem das etapas;
  - a barra como fração das etapas concluídas, parada enquanto uma demora;
  - a camada visível só depois de 500 ms;
  - uma etapa acrescentada na lista;
  - "Pronto" por último;
  - o estado `data-chegada` do `<html>`.

  Verificar: os testes unitários passam.
- [x] 5.2 Criar a marcação e o CSS do carregamento no `packages/ui`: a marca, a barra com `role="progressbar"` e a etapa numa região viva, só com tokens. Criar a história estática e depois o plugin do `apps/web` que injeta a marcação no `index.html`, com o roteiro dos 500 ms e o `<link>` dos tokens. Verificar:
  - a história passa na checagem de acessibilidade;
  - o `index.html` da compilação traz a camada `#chegada`.
- [x] 5.3 Ligar a chegada no `main.tsx`, com as etapas reais: o módulo principal executando, as preferências lidas e aplicadas, e a primeira renderização mais o `document.fonts.ready`. A saída é de 200 ms, com a camada removida no fim. Verificar: o teste de componente confere a ordem das etapas e o `data-chegada` até `pronta`.
- [x] 5.4 Escrever os testes do gerador do "olá" e depois estender o `pnpm marca:gerar`, com o `@fontsource/sacramento` de desenvolvimento, para gravar `brand/gerado/ola.ts`. Os testes cobrem:
  - os caminhos das letras e o do acento, separados;
  - as medidas do desenho;
  - o `marca:verificar` reprovando o arquivo desatualizado.

  Verificar: `pnpm marca:gerar` e `pnpm marca:verificar` passam.
- [x] 5.5 Escrever as histórias e os testes de interação das `BoasVindas` e depois implementá-las. Os casos:
  - o "olá" escrito da esquerda para a direita e "Bem-vindo ao Grafite";
  - "Pular" com o foco;
  - Esc e clique pulando;
  - `aoTerminar` chamado uma vez;
  - com movimento reduzido, o "olá" já preenchido e só troca de opacidade.

  Verificar: `pnpm test:stories` passa, sem violações de acessibilidade sérias ou críticas.
- [x] 5.6 Escrever os testes de interação da montagem e depois implementá-la no CSS da casca, para `html[data-chegada='montando']`:
  - a barra desce, a janela aparece e o dock ou a barra de abas sobem com mola;
  - a casca fica `inert` e invisível durante as boas-vindas;
  - com movimento reduzido, nenhum deslocamento.

  Verificar: `pnpm test:stories` passa.
- [x] 5.7 Escrever os testes de componente do primeiro acesso no app e depois implementá-lo. Os casos:
  - as boas-vindas no primeiro acesso, com a marca gravada ao aparecerem;
  - o acesso seguinte direto e sem montagem;
  - o armazenamento bloqueado sem boas-vindas;
  - a montagem só depois delas.

  No preparo dos testes do `apps/web` e na fixture da ponta a ponta, marcar as boas-vindas como vistas (design, decisão 10). Verificar: os testes novos e as suítes existentes passam.

## 6. Tela inicial

- [x] 6.1 Escrever os testes de `ordenarOcorrencias` e `idadeRelativa` e depois implementá-las. Os casos:
  - na ordem de fábrica, a severidade e a mais antiga primeiro, também invertida;
  - cada coluna nas duas direções, com o desempate pela fábrica;
  - "agora", "32 min", "1 h" aos 90 min e "2 d", arredondando para baixo.

  Verificar: os testes unitários passam.
- [x] 6.2 Escrever os testes do contrato `ocorrencias` no registro e do `useOcorrencias`, e depois implementá-los. Os casos:
  - várias fontes juntas;
  - a falha de uma fonte, com `tentarDeNovo`, sem esconder as outras;
  - `assinar` buscando de novo a fonte que avisou;
  - tudo abortado ao sair.

  Verificar: os testes passam, e `pnpm typecheck` também.
- [x] 6.3 Criar o `OQueResolverAgora` no `packages/ui`, com histórias de dados de exemplo marcados como exemplo. Começar pelos testes de interação:
  - o título com a contagem ("4 abertas", "1 aberta");
  - as colunas, com a severidade em texto;
  - a ordem pelo cabeçalho;
  - Enter e clique abrindo;
  - o esqueleto, a falha de uma fonte com "Tentar de novo", "Nenhum módulo registra ocorrências ainda" e "Nenhuma ocorrência aberta.".

  Verificar: `pnpm test:stories` passa, sem violações sérias ou críticas.
- [x] 6.4 Ligar o Início ao `useOcorrencias` e ao `OQueResolverAgora`, começando pelos testes de componente:
  - a ordem vinda das preferências e gravada ao mudar;
  - a idade andando na virada do minuto;
  - Enter navegando ao `destino`;
  - sem fontes no registro, "Nenhum módulo registra ocorrências ainda".

  Verificar: os testes de componente passam.

## 7. PWA

- [x] 7.1 Escrever os testes da API e depois ajustar o cache: `sw.js`, o manifesto, os ícones e os demais arquivos sem versão no nome sem cache longo, e cache longo e imutável só em `/assets/`. Verificar: os testes do `apps/api` passam.
- [x] 7.2 Acrescentar o `vite-plugin-pwa` e o `workbox-window` e configurar:
  - `generateSW` no modo "perguntar", sem manifesto próprio;
  - pré-cache da web compilada e navegação pelo `index.html`, fora de `/api/` e `/health`;
  - limpeza das versões antigas e service worker desligado no `pnpm dev`.

  Verificar: a compilação gera o `sw.js`, com o `index.html` e os arquivos de `/assets/` no pré-cache, e sem `/api`.
- [x] 7.3 Escrever os testes de componente do registro e da versão nova, simulando o `virtual:pwa-register`, e depois implementá-los. Os casos:
  - `onNeedRefresh` mostra o aviso persistente "Nova versão do Grafite";
  - "Atualizar" chama a troca com recarga;
  - "Fechar" não recarrega;
  - a conferência de versão a cada hora, com relógio falso;
  - o aviso fora da central.

  Verificar: os testes passam.

## 8. Ajustes do Sistema

- [x] 8.1 Criar a seção Idioma e região entre Tabelas e Acessibilidade, começando pelos testes de componente. Os casos:
  - o idioma como texto;
  - "Seguir o sistema" dizendo qual é o fuso;
  - a busca de fusos com "manaus";
  - escolher um fuso muda a prévia na hora e fica gravado;
  - o `data-foco="fuso-horario"` e a entrada de busca "Fuso horário";
  - "Restaurar padrões";
  - as sete seções na ordem.

  Atualizar os exemplos do contrato de módulo que reproduzem as rotas. Verificar: os testes de componente e o `documentacao.test.ts` passam.

## 9. Contrato de módulo

- [x] 9.1 Atualizar `docs/casca/modulos.md`, com trechos conferidos pelo `documentacao.test.ts`:
  - a fonte de ocorrências;
  - a formatação de datas pelo `useDataHora()`;
  - o aviso com ação e persistente;
  - as etapas da chegada para o F2 e o P3.

  Verificar: o teste confere os exemplos com o código.

## 10. Verificação integrada e fechamento

- [x] 10.1 Escrever a ponta a ponta da chegada. Os casos:
  - primeiro acesso com as boas-vindas e Esc levando à casca;
  - acesso seguinte sem elas;
  - o carregamento aparecendo depois de 500 ms, com "Carregando o Grafite", só quando o JavaScript principal é atrasado por rota;
  - com movimento reduzido emulado, sem deslocamentos.

  Verificar: `pnpm test:e2e` passa.
- [x] 10.2 Escrever a ponta a ponta da PWA:
  - o service worker assume depois da primeira abertura;
  - o endereço da seção Dock abre sem rede, com "Sem conexão com o servidor";
  - o `/api/health` sem rede falha, e não vem do cache.

  Verificar: `pnpm test:e2e` passa.
- [x] 10.3 Escrever a ponta a ponta da tela inicial e do fuso:
  - o Início com "Nenhum módulo registra ocorrências ainda";
  - o fuso de Manaus escolhido nos Ajustes muda o relógio;
  - no celular, a tela inicial e a seção Idioma e região sem rolagem horizontal.

  Verificar: `pnpm test:e2e` passa.
- [x] 10.4 Capturar as histórias novas em Grafite e Névoa nas três larguras e revisar as referências:
  - o carregamento;
  - as boas-vindas paradas;
  - a tela inicial com dados de exemplo e os estados;
  - o aviso de versão nova.

  Verificar: `pnpm test:visual` passa e falha quando o tamanho do "olá" é alterado de propósito.
- [x] 10.5 Revisar as telas novas pelo checklist do ANTISLOP v2 e atualizar o `CLAUDE.md` (change em andamento e o contrato de módulo). Verificar:
  - `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:stories`, `pnpm test:e2e` e `pnpm test:visual` verdes;
  - `pnpm tokens:verificar` e `pnpm marca:verificar` em dia;
  - o CI verde no PR.
