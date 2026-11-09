## 1. Domínio

- [x] 1.1 Escrever primeiro os testes e depois as definições dos indicadores (design, decisão 2): as chaves, os nomes, o que cada um mede, as unidades, as metas de fábrica, os limites, a conferência da meta com a mensagem e a decisão de cada um. Verificar: os testes do domínio passam com o cenário "Meta fora dos limites" e as quatro metas de fábrica.
- [x] 1.2 Escrever primeiro os testes e depois o texto dos valores e das metas: os tempos ("menos de 1 min", "32 min", "1,5 h", "1 dia", "1,5 dia", "2,3 dias"), a disponibilidade ("97,5%", "99%"), as vezes, o "antes → depois" da meta e a notificação do indicador fora da meta (o título no singular e no plural, a descrição e o endereço com o foco). Verificar: os testes do domínio passam com os títulos da spec, como "Tempo de atendimento do toner fora da meta: 3,2 dias, com a meta de 2 dias".
- [x] 1.3 Escrever primeiro os testes e depois o tempo de atendimento do toner e o tempo até reconhecer o Crítico (decisão 1): as medianas do período e do anterior, a base do cálculo, a situação, as listas ordenadas e cortadas em 20 com quantas mais, o toner esperando primeiro, o Crítico ainda sem reconhecimento com o tempo até agora e o que se resolveu sozinho fora. Verificar: os testes do domínio passam com os cenários "Mediana dos toners trocados", "Toner ainda esperando", "Regra que deixou de valer", "Crítico sem reconhecimento" e "Crítico que se resolveu sozinho".
- [x] 1.4 Escrever primeiro os testes e depois a disponibilidade dos ativos e os alertas que voltam: os intervalos cortados no período, a regra de ativo offline ausente como sem dado, a contagem por ativo ou coletor e regra, os alertas do silêncio fora e o resultado dos quatro indicadores numa função só. Verificar: os testes do domínio passam com os cenários "Ativo abaixo da meta", "Queda que começou antes do período", "Switch que cai sempre" e "Ativo em manutenção".

## 2. Banco

- [x] 2.1 Escrever primeiro o teste de integração e depois a migration (decisão 3): a tabela `indicadores_da_organizacao`, com o RLS forçado, a chave única da organização com o indicador, as checagens do indicador e da meta e a conta de quem mudou pela chave estrangeira; e o índice dos alertas pelo momento de abertura. Verificar: os testes de integração do banco passam, com o teste-guarda do RLS.

## 3. API

Cada tarefa entra com os esquemas das rotas dela e o cliente gerado de novo (`pnpm contrato:gerar`).

- [x] 3.1 Escrever primeiro o teste de integração e depois `GET /alertas/indicadores` (decisões 1 e 6): os alertas dos 60 dias pelo alcance da conta, as metas da organização, o alvo com o local, quem reconheceu pelo nome atual, o 403 sem `alertas.ver` e o módulo desligado. Verificar: os testes de integração passam com os cenários "Conta de um local", "Ativo em manutenção" e "Toner ainda esperando".
- [x] 3.2 Escrever primeiro o teste de integração e depois `PUT /alertas/indicadores/{indicador}/meta` (decisão 6): a permissão `alertas.administrar`, com a descrição nova no catálogo, os limites, a auditoria com o "antes → depois" e o evento `alertas.mudaram`. Verificar: os testes de integração passam com os cenários "Meta mudada", "Meta fora dos limites", "Quem só vê os alertas" e "Meta do toner mudada" da auditoria.
- [x] 3.3 Escrever primeiro o teste de integração e depois a avaliação diária (decisão 4): a `indicadores-diarios` às 07:00, a `avaliar-indicadores` por organização com a chave do dia, a marca `fora_da_meta_desde` e a notificação para as contas ativas com `alertas.administrar`. Verificar: os testes de integração passam com os cenários "Toner sai da meta", "Continua fora da meta", "Volta e sai de novo", "Módulo desligado" e "Avaliação diária" da auditoria.
- [x] 3.4 Escrever primeiro o teste de integração e depois a retenção dos alertas resolvidos na manutenção diária (decisão 5), em blocos, depois das notificações. Verificar: os testes de integração passam com os cenários "Alerta resolvido há mais de 13 meses", "Alerta aberto há muito tempo" e "Manutenção repetida".

## 4. Web

- [x] 4.1 Escrever primeiro os testes e depois o `Indicador` do `@grafite/ui` (decisão 7), com a história no catálogo: o nome, o que mede, o valor em algarismos tabulares ou o motivo sem valor, o anterior, a meta, a situação e a decisão fora da meta, o detalhe e a ação de quem usa. Verificar: os testes do componente e `pnpm test:stories` passam com os cenários "Indicador sem dado" e "Fora da meta sem cor".
- [x] 4.2 Escrever primeiro os testes e depois a tela Indicadores do Alertas: o período, os quatro indicadores com a base, as listas com "E mais <N>." e a linha que leva à ficha, o esqueleto, a falha com "Tentar de novo", a atualização pelo evento `alertas.mudaram` e o `data-foco` de cada indicador. Verificar: os testes da web passam com os cenários "Lista longa", "Toner fora da meta" e "Sem dado".
- [x] 4.3 Escrever primeiro os testes e depois a meta pela tela: "Mudar a meta" só para quem administra os alertas, o diálogo com o número e a unidade dos tempos, a conferência do domínio antes de mandar e o retorno "Meta salva.". Verificar: os testes da web passam com os cenários "Meta mudada", "Meta fora dos limites" e "Quem só vê os alertas".
- [x] 4.4 Escrever primeiro os testes e depois o item "Indicadores" no menu do Alertas, a rota e a entrada da busca. Verificar: os testes da web passam com os cenários "Quem só vê" e "Indicadores pela busca".

## 5. Ponta a ponta

- [x] 5.1 A ponta a ponta com a API simulada: a tela dos indicadores com um indicador fora da meta e a decisão, a meta mudada por quem administra, quem só vê sem "Mudar a meta", e a notificação que abre a tela com o foco no indicador. Verificar: `pnpm test:e2e` passa.
- [x] 5.2 A ponta a ponta da pilha: depois de a administradora reconhecer o Crítico do toner, a tela dos indicadores mostra o tempo até reconhecer o Crítico com "menos de 1 min", dentro da meta, e o toner sem dado, porque nenhum foi trocado. Verificar: `pnpm test:e2e:pilha` passa.

## 6. Fechamento

- [x] 6.1 Atualizar a documentação:
  - a spec mestre: os indicadores (seção 7.6), a retenção dos alertas resolvidos (seção 6.7), as metas decididas e as páginas por toner no P4 (seção 15) e o P3d na seção 3.2;
  - o contrato de módulo (`docs/casca/modulos.md`), com o `Indicador` da biblioteca para os indicadores de outros módulos;
  - o mapa (`docs/mapa.md`), com a capacidade `indicadores` e o glossário.

  Verificar: `pnpm test` passa, com o teste-guarda do mapa e o dos trechos do contrato.
- [x] 6.2 Conferir as verificações: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:stories`, `pnpm test:e2e`, `pnpm test:e2e:pilha` e `pnpm test:visual` verdes; `contrato:verificar` em dia; `openspec validate p3d-indicadores --strict` sem erros. Verificar: os comandos passam, e o CI do PR fica verde.
