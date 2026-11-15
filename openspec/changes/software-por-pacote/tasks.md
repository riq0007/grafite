## 1. Banco

- [x] 1.1 A migration das categorias e do pacote (design, decisões 1, 3 e 4): `categorias_de_software` com `orgScoped()`, RLS e as 7 de fábrica em cada organização; no pacote, a `categoria_id`, o `nome_no_inventario` e o `nome_no_inventario_normalizado`, preenchido nos de hoje pelo nome, e quem guardou o arquivo e quando; os pacotes de hoje em Utilitários. Começa pelo teste da migration e do teste-guarda do RLS. Verificar: esses testes, o lint e o typecheck.
- [x] 1.2 A migration do inventário, da distribuição e do agente (decisões 1, 6, 7, 8, 8a, 9 e 11): no software do ativo, o `nome_normalizado`, preenchido nos de hoje com o `lower`, o `translate`, o `regexp_replace` e o `btrim`, e o `do_sistema`; na distribuição, o `quando`, o `a_partir_de`, o `fuso` e o `para_quem`; na máquina, a situação `tirada`, o `codigo_de_saida`, a `chamada_em` e a `chamada_respondeu`; no agente, o `volta_ate`; no cadastro dos agentes, o `dias_sem_contato`, de 1 a 30, com 2 de fábrica. Começa pelo teste da migration. Verificar: esse teste, o lint e o typecheck.
- [x] 1.3 As 7 categorias na organização nova, junto com os perfis de fábrica (`pnpm grafite organizacao criar`). Começa pelo teste da criação. Verificar: esse teste, o lint e o typecheck.

## 2. Domínio

- [x] 2.1 As versões e o casamento (decisões 1 e 2): `compararVersoes`, com o "v" do começo, as letras ("8u401", "1.2.3a", "2.4.1-beta"), o pedaço que falta e os zeros à esquerda; `casaComOPacote`; a situação da máquina frente ao pacote, também sem a versão-alvo; e o corte da versão das barras. Começa pelos testes unitários. Verificar: esses testes, o lint e o typecheck.
- [x] 2.2 O comando e o código de saída (decisões 5 e 6): `explicarOComando`, com os pedaços e o resumo; `explicarOCodigoDeSaida`; e o código lido da mensagem "exit status". Começa pelos testes unitários. Verificar: esses testes, o lint e o typecheck.
- [x] 2.3 O quando e a volta do agente (decisões 7 e 8): `podeSeguir`; o próximo momento em que o pedido pode seguir (o dia marcado ou as próximas 22:00 no fuso); o `expiration` do CONTACT, em minutos, até uma hora depois desse momento e com o máximo de 24 horas; a conferência do dia de amanhã em diante e do fuso. Começa pelos testes unitários, com o horário de verão e a virada do dia. Verificar: esses testes, o lint e o typecheck.
- [x] 2.4 A conta do assistente e a ficha (decisões 4, 9, 10 e 13): o sem contato, a classe de cada máquina na ordem pulada, na fila e vai instalar, com os grupos por versão, o "Para quem", o tipo pela extensão, o monograma, a comparação com a base e a ordem "Frente à base". Começa pelos testes unitários, com a máquina sem contato já na versão-alvo. Verificar: esses testes, o lint e o typecheck.

## 3. API

- [x] 3.1 O inventário com o do sistema e o nome normalizado (decisões 1 e 13): a leitura do `system_category`, pelos valores da decisão 13, e do `no_remove`, como booleano, número ou texto, no `lerInventarioDoGlpi`, e a gravação do `do_sistema` e do `nome_normalizado` no software do ativo. Começa pelos testes da leitura e da integração do inventário, com um inventário escrito à mão, sem nome de máquina nem de pessoa. Verificar: esses testes, o lint e o typecheck.
- [x] 3.2 As categorias e os campos novos do pacote: o cadastro das categorias (criar, renomear, ordenar e remover), com a auditoria e o `software.mudou`; a categoria e o nome no inventário no pacote; quem guardou o arquivo na troca; o tipo nas respostas; o contrato regerado. Começa pelos testes de integração. Verificar: esses testes, o lint, o typecheck e o `pnpm contrato:verificar`.
- [x] 3.3 A base e a ficha do pacote frente ao inventário (decisão 2): as contas da lista (instalado, na versão, desatualizadas e sem, a última distribuição) e as da ficha (os quatro números, as barras e as distribuições), com o casamento no banco e o índice. Começa pelos testes de integração, com as máquinas fora dos locais da conta. Verificar: esses testes, o lint, o typecheck e o contrato.
- [x] 3.4 O prazo do sem contato no cadastro dos agentes (decisão 9), com a auditoria. Começa pelo teste de integração. Verificar: esse teste, o lint, o typecheck e o contrato.
- [x] 3.5 A prévia do assistente (decisão 10): `POST /software/distribuicoes/previa`, com os locais, as visões, a busca e a lista colada (até 2.000), cada máquina com a classe, o sem contato e a outra instalação em andamento, e os não achados da lista. Começa pelos testes de integração da permissão: as máquinas fora dos locais com o `software.distribuir` que a visão, a busca e a lista acham ficam de fora em silêncio; o local e o ativo mandados pelo id dão 403; a visão de outra conta dá 404. Verificar: esses testes, o lint, o typecheck e o contrato.
- [x] 3.6 A criação com o quando (decisões 7, 8a e 10): a mesma permissão da prévia; as puladas fora; o "Para quem"; o fuso, com 400 no que não existe; a auditoria; e a tarefa `software.acordar` na hora, para agora, com os 20 chamados por vez e o chamado gravado na máquina e no log; a rota do "Pedir agora" e o botão da ficha saem. Começa pelos testes de integração. Verificar: esses testes, o lint, o typecheck e o contrato.
- [x] 3.7 O Deploy, a volta e o chamado (decisões 6, 7, 8 e 8a): o `getJobs` só com o que pode seguir; o código de saída no `setStatus`; o `expiration` do CONTACT e do INVENTORY e o `volta_ate` do agente; a periódica `software.acordar-agendados`, a cada 15 minutos, com a regra das 2 horas, que chama pelo mesmo caminho da `software.acordar`. Começa pelos testes do Deploy, do protocolo e das tarefas. Verificar: esses testes, o lint e o typecheck.
- [x] 3.8 Tentar de novo e tirar da fila (decisão 11), e a distribuição com o sem contato, o código e a explicação de cada máquina. Começa pelos testes de integração. Verificar: esses testes, o lint, o typecheck e o contrato.
- [x] 3.9 A matriz (decisão 12): `GET /software/matriz`, por máquina de um local e por local. Começa pelos testes de integração. Verificar: esses testes, o lint, o typecheck e o contrato.
- [x] 3.10 O software na ficha (decisão 13): `GET /ativos/:id/software`, com os mandados, os instalados frente à base, a origem, o sem contato e a fila; a permissão de cada parte. Começa pelos testes de integração. Verificar: esses testes, o lint, o typecheck e o contrato.

## 4. Web

Visual, sem teste novo: o usuário confere na tela. Cada tarefa ajusta os testes que já existem dos arquivos que mexe e roda esses testes, o lint e o typecheck.

- [x] 4.1 A base de pacotes (m12), com as abas, a busca, "Só os desatualizados", a tabela, o pé e "Categorias…"; o formulário do pacote com a categoria, o nome no inventário e a dica da versão (decisão 2).
- [ ] 4.2 A ficha do pacote (m01): a coluna da esquerda, os quatro números, "O que a instalação faz", as barras e as distribuições.
- [ ] 4.3 A distribuição aberta (m02): a lista à esquerda, o número com a régua, "Precisa de você", "Na fila" (com o chamado sem resposta e até quando o agente volta), "Em andamento", as concluídas, o log pelo nome, "Exportar", "Tentar de novo" e "Tirar da fila"; o "Pedir agora" sai.
- [ ] 4.4 O assistente, primeira parte (m03): o trilho com "Já enviado hoje", o passo Pacote e o passo Máquinas, com as quatro abas e o "Até agora".
- [ ] 4.5 O assistente, segunda parte (m04, m05 e m08): o passo Quando, com a faixa das 24 horas; o Conferir; a entrada pela matriz; o envio; e o passo 37 da ponta a ponta da pilha no assistente novo.
- [ ] 4.6 A matriz (m06 e m07): por máquina, com a marcação e a dica, e por local, com o painel da direita; "Exportar".
- [ ] 4.7 A aba Software da ficha (m09 e m11): os mandados, a tabela frente à base, o aviso e a fila do sem contato e o rótulo do cabeçalho, pelo `GET /ativos/:id/software`; o `/ativos/:id/softwares` e o `/ativos/:id/distribuicoes` saem, com os testes deles.
- [ ] 4.8 "Instalar outro pacote nesta máquina" (m10): a camada, a busca, o quando e a instalação.
- [ ] 4.9 O menu do Software na Gestão de ativos (a Base de pacotes, as Distribuições e a Matriz) e o prazo do sem contato na Administração.

## 5. Documentação e fim

- [ ] 5.1 A documentação: a linha do S6 na spec mestre, o runbook (a porta 62354 acorda o agente no "Agora" e na janela da noite), o contrato de módulo, se mudar, e o `docs/mapa.md`. Verificar: o `scripts/mapa.test.ts` e o lint.
- [ ] 5.2 A bateria inteira no CI do PR; o diff de `packages/db`, `packages/domain` e `apps/api` à revisora (a seção 4 é visual, e o usuário confere na tela) e os pontos dela; e o arquivamento.
