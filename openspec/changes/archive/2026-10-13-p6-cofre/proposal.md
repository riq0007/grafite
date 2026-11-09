## Why

O PMG guarda no cofre as senhas das contas administrativas, dos equipamentos e dos serviços, com o acesso dado a usuários, grupos e perfis. O Grafite ainda não tem onde guardá-las. O P2b (SNMP das impressoras), o P2c (saúde do Control iD) e o P5 (backups do Control iD) dependem de credenciais, e a spec mestre manda que todo segredo more no cofre (seção 5.2, decisão 7). O campo de licença já recusa a chave de produto e manda guardá-la no cofre, que ainda não existe.

O P6 · Cofre (spec mestre, seção 3.2) entra entre o P2a e o P2b, por decisão do usuário. Ele entrega:
- os segredos, cada um com o acesso dado a contas, grupos e perfis;
- o revelar e o copiar, com a confirmação pelo código do app e a auditoria;
- a cifragem em duas camadas, com a troca da chave mestra.

As escolhas do usuário nesta change foram:
- o acesso é concedido por segredo, como no PMG;
- a confirmação pelo código do app libera revelar e copiar por 5 minutos naquela sessão;
- o segredo aponta a pessoa e os ativos dele, e a ficha do ativo mostra os segredos que a conta pode ver.

Ficam fora desta change:
- a migração do cofre do PMG, com a recifragem ensaiada no teste (P8);
- os tipos de segredo com estrutura própria, como a credencial SNMP, que o P2b acrescenta, e o login do Control iD, que chega com o P2c;
- os avisos de segredo vencido ou com a rotação atrasada em "O que resolver agora" e nas notificações (P3);
- o gerador de senhas e o histórico dos valores anteriores de um segredo.

## What Changes

- **Spec mestre:** a seção 9.2 diz que a confirmação pelo código do app libera revelar e copiar por 5 minutos naquela sessão.
- **Os segredos:**
  - cada segredo tem o nome, o tipo, a classificação, o identificador (como o usuário da conta), o endereço, as notas, a validade, a próxima rotação, a pessoa e os ativos ligados, e o valor secreto;
  - o valor é cifrado com uma chave própria, e essa chave é cifrada pela chave mestra do servidor, que nunca vai ao banco nem ao backup;
  - o segredo é inativado e reativado, nunca excluído;
  - os tipos e as classificações vêm do PMG, para a migração os trazer como estão.
- **O acesso:**
  - quem administra o cofre cadastra e edita os segredos, troca o valor e decide, segredo a segredo, as contas, os grupos e os perfis que o acessam;
  - quem acessa vê os segredos liberados a ela e os revela e copia;
  - quem administra vê todos os segredos, mas só revela os que liberou a si mesmo, e a liberação fica na auditoria;
  - o cofre só abre para a conta com a verificação em dois passos ativa.
- **Revelar e copiar:**
  - o código do app libera revelar e copiar por 5 minutos naquela sessão;
  - cada revelação e cada cópia entram na auditoria, sem o valor;
  - a resposta com o valor não fica guardada no navegador;
  - a recusa entra na auditoria também.
- **O módulo Cofre:**
  - um módulo opcional, com a lista dos segredos, a busca, os filtros, a ficha, o cadastro e o acesso;
  - a validade vencida e a rotação atrasada aparecem na lista em texto;
  - a ficha do ativo mostra os segredos ligados a ele que a conta pode ver;
  - a busca acha os segredos pelo nome e oferece "Novo segredo".
- **A chave mestra:**
  - vem do ambiente, validada na partida;
  - o `pnpm dev`, a instalação e a atualização a geram uma vez;
  - o comando no servidor a troca sem refazer os segredos, recifrando só as chaves deles;
  - a operação do Windows troca a chave dos dois ambientes, e o runbook diz como guardar a chave antiga com os backups feitos antes da troca.

## Capabilities

### New Capabilities

- `cofre-de-segredos`: o segredo e os campos dele, a cifragem em duas camadas, o acesso por conta, grupo e perfil, a confirmação de 5 minutos pelo código do app, o revelar e o copiar auditados, os vínculos com a pessoa e os ativos, e a troca da chave mestra pelo comando no servidor.
- `modulo-cofre`: o módulo Cofre na casca, com a lista, a busca, os filtros, a ficha, o cadastro, o acesso, o revelar e o copiar na tela, a busca global e a atualização pelos eventos.

### Modified Capabilities

- `permissoes`: as permissões de usar e de administrar o cofre.
- `verificacao-em-dois-passos`: o cofre pede a verificação ativa, e o código do app libera revelar e copiar por 5 minutos na sessão.
- `auditoria`: o cadastro, a edição, a troca do valor, o acesso, a inativação e a reativação de um segredo, a liberação do cofre, cada revelação e cada cópia, e as recusas, sem o valor.
- `eventos-em-tempo-real`: o evento da mudança no cofre.
- `cadastro-de-ativos`: a ficha do ativo mostra os segredos ligados que a conta pode ver.
- `modulos-da-organizacao`: o Cofre é um módulo opcional.
- `plataforma-base`: a chave mestra do cofre no ambiente, validada na partida, e no `.env` do desenvolvimento.
- `operacao-servicos`: a chave mestra na configuração dos ambientes, gerada na instalação e na atualização, e a troca dela pelo comando de operação.
- `backup`: a chave mestra fica fora do backup, e a chave antiga é guardada com os backups feitos antes de uma troca.

## Impact

- **`packages/domain`:**
  - os tipos e as classificações dos segredos;
  - as regras dos campos e do valor;
  - quem alcança um segredo;
  - a validade e a rotação;
  - as permissões, o evento e as ações da auditoria novas;
  - o Cofre nos módulos opcionais.
- **`packages/db`:**
  - as tabelas dos segredos, dos acessos e dos ativos ligados, com o isolamento por organização;
  - a liberação do cofre na sessão;
  - a migration.
- **`apps/api`:**
  - a cifragem em duas camadas, com a chave mestra do ambiente e a anterior, durante uma troca;
  - as rotas do cofre: a lista, a ficha, o cadastro, a edição, o acesso, a inativação, a liberação, o revelar e o copiar;
  - os segredos na ficha do ativo;
  - o comando `cofre trocar-chave`;
  - o contrato e o cliente gerados de novo.
- **`apps/web`:**
  - o módulo Cofre;
  - a seção dos segredos na ficha do ativo;
  - a busca;
  - o evento novo.
- **`apps/operacao` e `scripts/dev.ts`:**
  - a chave mestra na instalação, na atualização e no `.env` do desenvolvimento;
  - o comando `cofre trocar-chave` no `grafite.ps1`.
- **Dependências:** nenhuma nova; a cifragem usa o `node:crypto`.
- **Documentação:**
  - a spec mestre, o mapa e o contrato de módulo, com um módulo que pede a confirmação pelo código do app;
  - o runbook, com a guarda e a troca da chave do cofre.
