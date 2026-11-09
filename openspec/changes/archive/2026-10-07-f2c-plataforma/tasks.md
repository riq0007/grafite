## 1. Spec mestre

- [x] 1.1 Atualizar a spec mestre conforme o design (decisão 21):
  - seção 3.2: a linha do A1 com os padrões por perfil;
  - seção 3.3: o F2c sem o nível do perfil;
  - seção 4.4: ligar e desligar módulos no P1;
  - seção 5.2: a foto trocada ou removida apagada como as credenciais, as preferências pessoais fora da auditoria e o nível do perfil no A1;
  - seção 6.7: os eventos por 24 h e os arquivos removidos apagados na manutenção seguinte;
  - seção 9.4: a lista das organizações para as tarefas, e a fila e o aviso de eventos só com identificadores;
  - seção 9.8: as fotos com a política do SVG.

  Atualizar também o propósito das specs `preferencias-da-interface` e `ajustes-do-sistema`, que ainda falam das preferências no navegador e dos padrões de fábrica. Verificar: o diff da spec mestre e dos propósitos bate com as specs desta change.

## 2. Domínio

- [x] 2.1 Escrever os testes e depois criar o modelo das preferências no domínio (`preferencias/`: o tipo, `PADRAO_DE_FABRICA`, as listas de opções, `lerAjustes`, `resolverPreferencias`, `aplicarMudanca` e `fusoReconhecido`), conforme o design (decisão 1). Os casos:
  - cada campo inválido, desconhecido ou fora do intervalo numa camada;
  - a resolução campo a campo com fábrica, organização e conta;
  - o valor inválido da conta caindo no padrão da organização;
  - a mudança com `null` tirando o campo e a seção vazia saindo da camada;
  - o fuso desconhecido.

  Verificar: os testes unitários passam.
- [x] 2.2 Escrever os testes e depois acrescentar ao domínio:
  - `organizacao.editar` e `tarefas.administrar` ao catálogo de permissões, com as descrições da spec;
  - as ações `padroes.alterados`, `foto.trocada`, `foto.removida` e `tarefa.repetida` ao catálogo da auditoria, com os rótulos.

  Verificar: os testes unitários passam, inclusive o que fixa o catálogo.
- [x] 2.3 Escrever os testes por tabela e depois criar os eventos no domínio (`eventos/`), conforme o design (decisão 9):
  - `TIPOS_DE_EVENTO`;
  - `EVENTO_DA_ACAO`, com uma entrada para cada ação da auditoria;
  - `podeReceber(evento, conexao, arvore)`.

  Os casos de `podeReceber`:
  - todas as sessões;
  - a permissão sem local e com local, dentro e fora do ramo;
  - a conta da pessoa sem a permissão;
  - a sessão do alvo;
  - outra organização.

  Verificar: os testes unitários passam, e uma ação nova sem entrada no mapa reprova o teste.

## 3. Banco

- [x] 3.1 Escrever os testes de integração e depois criar a migration 0011, com `preferencias` na organização e na conta (design, decisão 2). Os casos:
  - o padrão `{}`;
  - o check de tamanho;
  - o papel da aplicação gravando só na própria organização.

  Verificar: `pnpm test:integration` passa no `packages/db`.
- [x] 3.2 Escrever os testes de integração e depois criar a migration 0012, com `arquivos` e `pessoas.foto_id` (design, decisão 6). Os casos:
  - o isolamento;
  - a chave composta recusando o arquivo de outra organização;
  - o check de que apagado implica removido.

  Verificar: `pnpm test:integration` passa no `packages/db`, com o teste-guarda do RLS.
- [x] 3.3 Escrever os testes de integração e depois criar a migration 0013, com `eventos` e o gatilho do aviso (design, decisão 10). Os casos:
  - o isolamento;
  - o check de público;
  - o aviso, que só chega depois do commit;
  - nenhum aviso de uma transação desfeita;
  - a carga só com o tipo, a organização e os identificadores.

  Verificar: `pnpm test:integration` passa no `packages/db`.
- [x] 3.4 Acrescentar o `pg-boss` 12 fixado e os scripts `fila:gerar` e `fila:verificar` do `packages/db`, e gerar a migration 0014, com o esquema `fila` e as permissões do papel da aplicação (design, decisão 14). Escrever antes os testes de integração:
  - o papel da aplicação sobe o pg-boss com `migrate: false`, cria uma fila, põe, pega e conclui uma tarefa;
  - o mesmo papel não consegue criar uma tabela no esquema `fila`.

  Pôr o `fila:verificar` no CI. Verificar: `pnpm test:integration` passa no `packages/db`, e `pnpm fila:verificar` passa.
- [x] 3.5 Escrever os testes de integração e depois criar a migration 0015, com `tarefas_com_falha` e `app.organizacoes_para_tarefas()` (design, decisões 15 e 16). Os casos:
  - o isolamento;
  - a função devolvendo só os identificadores de todas as organizações;
  - o `PUBLIC` sem `execute`.

  Verificar: `pnpm test:integration` passa no `packages/db`.

## 4. API: base

- [x] 4.1 Escrever os testes e depois acrescentar `GRAFITE_ARQUIVOS_PASTA` à configuração, com a conferência da pasta na partida (design, decisão 17). Os casos:
  - a variável ausente;
  - a pasta criada quando falta;
  - a pasta que não aceita gravação, com o nome da variável na mensagem.

  Definir a pasta no `pnpm dev`, no `.env.example`, no `.gitignore` e na ponta a ponta da pilha. Os ajudantes dos testes de integração montam a API sem o ambiente e ganham a pasta temporária com o armazenamento (6.4). Verificar: os testes unitários passam, e o `pnpm dev` sobe.
- [x] 4.2 Escrever os testes de integração e depois fazer o `registrarNaAuditoria` gravar o evento da ação, com o `registrarEvento` para as mudanças sem auditoria (design, decisão 9). Os casos, com os tipos que deduzem o público:
  - a sessão encerrada vai para a sessão do alvo;
  - os locais, os acessos e os padrões vão para todas as sessões;
  - a ação sem tipo não grava evento;
  - a transação desfeita não deixa evento.

  Verificar: `pnpm test:integration` passa na API.
- [x] 4.3 Escrever os testes de integração e depois passar o público de `pessoas.mudaram` em todas as escritas de pessoas e contas: pela administração, pela própria conta e pelo comando no servidor. Os casos:
  - a mudança do local de trabalho leva os dois locais;
  - a pessoa sem local;
  - a conta da pessoa no público.

  Verificar: `pnpm test:integration` passa na API, e o `typecheck` reprova uma chamada sem o público.
- [x] 4.4 Escrever os testes de integração e depois fazer o `lerSessao` aceitar `tocar: false` e não tocar `ultimo_uso_em` nas requisições com `x-grafite-segundo-plano: 1` (design, decisão 13). Os casos:
  - a requisição com a marca, que não toca a sessão;
  - a requisição sem a marca, que toca;
  - a sessão que expira com só requisições marcadas.

  Verificar: `pnpm test:integration` passa na API.
- [x] 4.5 Escrever os testes de integração e depois acrescentar ao estado da sessão os padrões da organização, sempre, e a foto e as preferências da conta, só com a sessão que vale. Regenerar o contrato. Verificar: `pnpm test:integration` passa na API, e `pnpm contrato:verificar` está em dia.

## 5. API: preferências

- [x] 5.1 Escrever os testes de integração e depois implementar o `PATCH /api/conta/preferencias` (design, decisão 3). Os casos:
  - a mudança aplicada como merge patch;
  - o `null` tirando o campo;
  - um campo inválido recusando o pedido inteiro com 400 e a mensagem no campo;
  - a sessão pendente recusada;
  - nenhum registro de auditoria;
  - o evento `preferencias.mudaram` só para as sessões da conta.

  Verificar: `pnpm test:integration` passa na API, e `pnpm contrato:verificar` está em dia.
- [x] 5.2 Escrever os testes de integração e depois implementar o `PATCH /api/organizacao/padroes`. Os casos:
  - a conta sem `organizacao.editar` recusada com 403 e auditada;
  - a gravação com a auditoria `padroes.alterados`, com o antes e o depois;
  - o evento `padroes.mudaram` para todas as sessões;
  - a recusa inteira com um campo inválido.

  Verificar: `pnpm test:integration` passa na API, e `pnpm contrato:verificar` está em dia.

## 6. API: arquivos e imagens

- [x] 6.1 Escrever os testes e depois criar a interface `Armazenamento` e o `ArmazenamentoEmDisco` (design, decisão 6). Os casos:
  - gravar, abrir e apagar pela chave;
  - a gravação atômica, sem arquivo pela metade se ela falha;
  - apagar o que não existe;
  - as chaves de cada organização separadas.

  Verificar: os testes unitários passam com uma pasta temporária.
- [x] 6.2 Acrescentar o `sharp` à API. Escrever os testes e depois implementar o tratamento das imagens raster (design, decisão 7), com imagens geradas nos próprios testes. Os casos:
  - o PNG com nome de JPG;
  - o executável com nome de PNG e o GIF recusados com 415;
  - mais de 10 MB com 413;
  - mais de 50 megapixels;
  - o PNG cortado;
  - o JPG com localização e orientação: sai sem metadados e de pé;
  - a redução a 2048 px;
  - as miniaturas da imagem larga e da pequena;
  - o AVIF aceito e o HEIC recusado.

  Verificar: os testes unitários passam.
- [x] 6.3 Acrescentar o `dompurify` e o `jsdom` à API. Escrever os testes e depois implementar a sanitização do SVG e as miniaturas dele. Os casos:
  - o `<script>` e o `onload` removidos com o desenho mantido;
  - a imagem externa removida, sem o servidor buscá-la;
  - o `foreignObject` removido;
  - o SVG sem desenho depois da sanitização, recusado;
  - as miniaturas desenhadas a partir do SVG.

  Verificar: os testes unitários passam.
- [x] 6.4 Escrever os testes de integração e depois implementar as rotas da foto da pessoa (design, decisão 8): o `PUT` e o `DELETE /api/pessoas/:id/foto`, o `GET` de cada tamanho, e a `foto` na pessoa e na lista. Os casos:
  - sem `pessoas.editar`, e fora do escopo;
  - a pessoa anonimizada;
  - a troca, que marca a anterior como removida;
  - a auditoria `foto.trocada` e `foto.removida`, e o evento;
  - a falha da transação apagando o que foi gravado;
  - os cabeçalhos da entrega e a política do SVG;
  - o 404 da removida e o de outra organização.

  Os ajudantes dos testes de integração passam a criar a pasta temporária do armazenamento. Regenerar o contrato. Verificar: `pnpm test:integration` passa na API, e `pnpm contrato:verificar` está em dia.
- [x] 6.5 Escrever os testes de integração e depois implementar a própria foto (o `PUT`, o `DELETE` e o `GET /api/conta/foto`) e a foto apagada na anonimização. Os casos:
  - a conta sem permissão trocando a própria foto;
  - a sessão pendente recusada;
  - a anonimização marcando a foto como removida, e a entrega dela com 404.

  Verificar: `pnpm test:integration` passa na API, e `pnpm contrato:verificar` está em dia.

## 7. API: eventos

- [x] 7.1 Escrever os testes e depois criar o distribuidor dos eventos na memória (design, decisão 10). Os casos, com conexões simuladas:
  - a entrega pelo `podeReceber`;
  - a árvore de locais guardada até `locais.mudaram`;
  - o acesso relido uma vez por conta em `acessos.mudaram`;
  - `reiniciar` para todas as conexões.

  Verificar: os testes unitários passam.
- [x] 7.2 Escrever os testes de integração e depois criar o ouvinte do banco, com o `LISTEN` num cliente próprio e a ligação refeita com intervalos crescentes. Os casos:
  - o evento entregue ao distribuidor depois do commit;
  - a ligação derrubada pelo banco, refeita e seguida de `reiniciar`.

  Verificar: `pnpm test:integration` passa na API.
- [x] 7.3 Escrever os testes de integração, com a API ouvindo numa porta, e depois implementar o `GET /api/eventos` (design, decisão 11). Os casos:
  - sem sessão (401) e com a sessão pendente (403);
  - o evento chegando em até 2 s depois do commit;
  - o filtro da conta com escopo de local;
  - o sinal de vida;
  - a conexão que não toca a sessão;
  - `sessao.encerrada` e o fechamento;
  - a sessão expirada fechando a conexão;
  - o limite de 20 conexões por sessão;
  - o `app.close()` fechando as conexões.

  Verificar: `pnpm test:integration` passa na API.
- [x] 7.4 Escrever os testes de integração e depois implementar a retomada pelo `Last-Event-ID` e por `?desde=`. Os casos:
  - os eventos perdidos reenviados, com a margem de 30 s;
  - só os que a conta pode receber;
  - o último evento desconhecido ou com mais de 24 h, que leva a `reiniciar`.

  Verificar: `pnpm test:integration` passa na API.
- [x] 7.5 Escrever os testes e depois acrescentar a fila e os eventos à saúde, com o estado `degradado` (design, decisão 17). Regenerar o contrato. Verificar: os testes unitários e de integração da saúde passam, e `pnpm contrato:verificar` está em dia.

## 8. API: fila

- [x] 8.1 Escrever os testes de integração e depois ligar a fila na partida da API, com o catálogo de tarefas, o encerramento gracioso no `onClose` e a recusa de partida sem o esquema da fila (design, decisão 14). Os casos:
  - o papel da aplicação;
  - uma tarefa de 5 s terminando antes do encerramento;
  - a tarefa interrompida voltando à fila.

  Verificar: `pnpm test:integration` passa na API.
- [x] 8.2 Escrever os testes de integração e depois implementar a manutenção diária (design, decisão 16). Os casos:
  - o cron com o fuso e a recuperação da execução perdida;
  - uma tarefa por organização, com a chave única do dia;
  - os eventos com mais de 24 h apagados;
  - os arquivos removidos apagados do armazenamento e marcados;
  - a segunda execução sem erro;
  - nada de auditoria, sessão ou registro de negócio apagado.

  Verificar: `pnpm test:integration` passa na API.
- [x] 8.3 Escrever os testes de integração e depois implementar as tarefas com falha (design, decisão 15), com uma tarefa que falha registrada só no catálogo dos testes. Os casos:
  - as tentativas com intervalos crescentes, conferidas nas opções da fila;
  - a falha passageira, que não entra na lista;
  - a falha final, que entra na lista da organização, com o evento;
  - a lista paginada por cursor, só com `tarefas.administrar`;
  - "Tentar de novo" na mesma transação, com a auditoria `tarefa.repetida`;
  - a tarefa da instalação, que vai para o log.

  Regenerar o contrato. Verificar: `pnpm test:integration` passa na API, e `pnpm contrato:verificar` está em dia.

## 9. Componentes

- [x] 9.1 Ampliar o `Avatar` com os tamanhos e as miniaturas, começando pelas histórias e pelos testes de interação (design, decisão 19). Os casos:
  - o `srcSet` e o `sizes` de cada tamanho;
  - a foto recortada no círculo;
  - a foto que não carrega, que cai nas iniciais com o mesmo nome acessível;
  - o tamanho da linha seguindo a densidade.

  Verificar: `pnpm test:stories` passa.
- [x] 9.2 Criar a `EscolhaDeImagem`, começando pelas histórias e pelos testes de interação. Os casos:
  - vazia e com imagem;
  - "Escolher imagem" com os formatos aceitos;
  - arrastar um arquivo;
  - "Enviando…" com o progresso;
  - a recusa com a imagem anterior mantida;
  - "Remover imagem" com confirmação e o foco depois;
  - tudo pelo teclado.

  Verificar: `pnpm test:stories` passa, com a acessibilidade.

## 10. Web: preferências

- [x] 10.1 Escrever o teste que confere as listas do domínio contra as chaves dos tokens do `@grafite/ui`, e depois fazer a web usar o modelo do domínio, sem a cópia própria. Verificar: os testes unitários da web passam sem mudança de comportamento.
- [x] 10.2 Escrever os testes e depois fazer o provedor das preferências trabalhar com as camadas da organização e da conta (design, decisão 4). Os casos:
  - as camadas do estado da sessão aplicadas antes de "Pronto";
  - `mudar` valendo na hora e gravado uma vez depois de 400 ms;
  - a gravação com `keepalive` ao ocultar a página;
  - `restaurar` voltando ao padrão da organização;
  - `preferencias.mudaram` e `padroes.mudaram` relendo o estado.

  Ajustar a fixture da ponta a ponta: o estado da sessão com as preferências e o `PATCH` simulado. Verificar: os testes unitários e `pnpm test:e2e` passam.
- [x] 10.3 Escrever os testes e depois implementar a cópia na versão 2. Os casos:
  - a mudança sem servidor, enviada quando a sessão da mesma conta volta;
  - descartada quando volta outra conta ou nenhuma sessão;
  - o armazenamento bloqueado;
  - a cópia sem a conta depois de "Sair";
  - o anti-flash lendo os atributos de sempre.

  Verificar: os testes unitários passam.
- [x] 10.4 Escrever os testes e depois implementar a passagem da cópia da versão 1 para a conta. Os casos:
  - a conta sem preferências recebendo só os campos diferentes da fábrica;
  - a conta com preferências, em que a cópia antiga é descartada;
  - a passagem uma vez só.

  Verificar: os testes unitários passam.
- [x] 10.5 Escrever os testes e depois fazer as seções de preferências dos Ajustes lerem o alvo das preferências, com as prévias seguindo o alvo (design, decisão 5). Verificar: os testes de componente das seções passam com o alvo da conta e com um alvo simulado.

## 11. Web: eventos e sessão

- [x] 11.1 Escrever os testes, com um `EventSource` simulado, e depois criar a conexão de eventos da casca (design, decisão 12). Os casos:
  - aberta só com a sessão que vale;
  - os repetidos descartados;
  - fechada depois de 5 min oculta e reaberta com `?desde=`;
  - `acessos.mudaram` com a espera aleatória;
  - `sessao.encerrada` levando à tela de entrada;
  - `reiniciar` invalidando tudo.

  Tirar o comentário do item de rede que previa a troca. Fazer a fixture da ponta a ponta responder `/api/eventos` com um fluxo vazio. Atualizar os trechos do `documentacao.test.ts` se o `main.tsx` mudar. Verificar: os testes unitários e `pnpm test:e2e` passam.
- [x] 11.2 Escrever os testes e depois acrescentar os `eventos` ao contrato de módulo e declarar os da Administração e os da seção Conta. Os casos:
  - o registro aceitando os eventos;
  - as consultas declaradas invalidadas pelo evento;
  - as não declaradas, intactas.

  Verificar: os testes unitários passam.
- [x] 11.3 Escrever os testes e depois implementar a marca de segundo plano no cliente da API (design, decisão 13). Os casos:
  - sem interação há 5 min, a requisição sai marcada;
  - depois de uma tecla, de um clique ou de um toque, sai sem marca.

  Verificar: os testes unitários passam.
- [x] 11.4 Escrever os testes de componente e depois garantir que os formulários de edição (a pessoa, o perfil, o grupo e o nome do local) mantêm o que foi digitado quando a consulta do registro é relida com outros dados. Verificar: os testes de componente passam.

## 12. Web: telas

- [x] 12.1 Implementar a foto na Administração, começando pelos testes de componente:
  - o avatar no título da ficha e no início da linha da lista, seguindo o ajuste Miniaturas;
  - a escolha de imagem na aba Dados, só com a ação permitida pela API;
  - os avisos "Foto trocada." e "Foto removida.";
  - a recusa junto da escolha.

  Verificar: os testes de componente e `pnpm test:e2e` passam.
- [x] 12.2 Implementar a foto nos Ajustes e na barra, começando pelos testes de componente:
  - a parte Foto da seção Conta, com endereço próprio e a entrada na busca;
  - o menu do usuário com a foto, e com as iniciais sem foto.

  Pôr a foto na sessão simulada da fixture da ponta a ponta. Verificar: os testes de componente e `pnpm test:e2e` passam.
- [x] 12.3 Implementar a tela de padrões, começando pelos testes de componente (design, decisão 5):
  - as abas das seções com endereço próprio;
  - o rascunho com a contagem, "Descartar" e "Salvar padrões";
  - a confirmação ao sair com mudanças;
  - "Restaurar padrões de fábrica" pendente até salvar;
  - a casca de quem edita sem mudar antes de salvar;
  - o aviso "Padrões salvos.".

  Verificar: os testes de componente passam.
- [x] 12.4 Implementar a tela de tarefas com falha, começando pelos testes de componente:
  - a lista com "Carregar mais";
  - "Nenhuma tarefa com falha.";
  - "Tentar de novo" com o aviso "Tarefa de volta na fila.";
  - a lista atualizada por `tarefas.mudaram`.

  Verificar: os testes de componente passam.
- [x] 12.5 Escrever os testes e depois pôr Padrões e Tarefas no menu da Administração, com as permissões novas na visibilidade do módulo e na ordem da spec. Verificar: os testes do registro e do menu passam.
- [x] 12.6 Escrever o teste e depois tirar o diálogo de "Criar conta" do trecho da aba Acesso que a releitura troca (achado da 15.2): o evento da criação relê a ficha, e a senha temporária, que não aparece de novo, continua no diálogo até ele fechar. Verificar: os testes da aba Acesso passam.

## 13. Imagem de contêiner

- [x] 13.1 Atualizar o `Dockerfile` conforme o design (decisão 18):
  - as dependências de produção da API, com os pacotes do workspace que ela importa ligados fora do `node_modules`;
  - a imagem final em `node:24-slim`;
  - o volume `/dados/arquivos`.

  Verificar:
  1. `docker build --target aplicacao` passa;
  2. a imagem sobe contra um PostgreSQL efêmero migrado e responde `/health`;
  3. uma foto enviada fica no volume e continua lá depois de recriar o contêiner.

## 14. Contrato de módulo e documentação

- [x] 14.1 Atualizar `docs/casca/modulos.md`, com trechos conferidos pelo `documentacao.test.ts`:
  - os eventos no registro do módulo;
  - as preferências do servidor por trás do `usePreferencias()`;
  - o alvo das preferências nas seções;
  - a foto da pessoa no avatar.

  Verificar: o `documentacao.test.ts` passa.

## 15. Verificação integrada e fechamento

- [x] 15.1 Estender a ponta a ponta com a API simulada, com o fluxo de eventos da fixture, que os testes podem empurrar. Os casos:
  - a preferência mudada, gravada na conta e mantida ao reabrir;
  - os padrões salvos e a confirmação ao sair com mudanças;
  - "Tentar de novo" numa tarefa com falha;
  - a foto trocada na ficha;
  - um evento empurrado atualizando a lista aberta.

  Verificar: `pnpm test:e2e` passa.
- [x] 15.2 Estender a ponta a ponta da pilha real, com duas contas em dois contextos. O caminho:
  1. o administrador troca a foto de uma pessoa e muda o tema padrão;
  2. a outra conta vê a foto nova e o tema sem recarregar;
  3. o administrador encerra as sessões dela, e ela vai para a tela de entrada;
  4. as preferências de uma conta aparecem num contexto novo.

  Verificar: `pnpm test:e2e:pilha` passa.
- [x] 15.3 Capturar as histórias novas em Grafite e Névoa nas três larguras e revisar as referências: o avatar com foto nos três tamanhos e a escolha de imagem em cada estado. Verificar: `pnpm test:visual` passa.
- [x] 15.4 Revisar as telas de padrões e de tarefas e a foto na ficha, na lista, nos Ajustes e na barra pelo checklist do ANTISLOP v2, com capturas em 1366, 1920 e 2560 px, nos temas Grafite e Névoa e no celular, e corrigir o que reprovar. Atualizar o `CLAUDE.md` com a change, a variável e os comandos novos. Verificar:
  - `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:stories`, `pnpm test:e2e`, `pnpm test:e2e:pilha` e `pnpm test:visual` verdes;
  - `pnpm tokens:verificar`, `pnpm marca:verificar`, `pnpm contrato:verificar` e `pnpm fila:verificar` em dia;
  - o CI verde no PR.
