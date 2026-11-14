## Why

Em 08/11/2026 o usuário decidiu publicar o Grafite num repositório novo e público, `riq0007/grafite`, para usar de graça os executores hospedados pelo GitHub. O repositório antigo continua privado, como arquivo. As duas changes anteriores prepararam o caminho:
- a `ci-nos-executores-do-github` tirou os executores próprios;
- a `limpar-arvore-para-publicar` tirou os dados privados da árvore e pôs a guarda dos termos no pre-commit e no CI.

Falta publicar, e o estado de hoje ainda não deixa:
- o repositório novo não existe;
- a árvore traz o `.gitleaksignore`, com impressões de commits do repositório antigo, que não casam com nada no novo;
- o e-mail global do Git na máquina de desenvolvimento não é o noreply do GitHub, e o repositório não tem um local: um commit feito num clone novo publicaria o e-mail pessoal;
- não há README: a página do repositório não diria o que é o projeto nem que os direitos são reservados;
- o runbook manda baixar o pacote "da release", sem o endereço, porque o repositório era privado;
- a pasta `D:\grafite` aponta para o repositório antigo, com o histórico inteiro e as tags antigas. Um push errado dela publicaria o que a limpeza tirou.

A change pertence ao esqueleto técnico do F0 (spec `plataforma-base`) e às seções 9, item 6, e 12.1 da spec mestre. Ela vem depois da `limpar-arvore-para-publicar`, que deixou a publicação para a change seguinte.

Ficam fora desta change:
- o histórico do repositório antigo, que fica nele, privado;
- uma licença: o usuário decidiu que não há, e todos os direitos ficam reservados;
- o modo de trabalho, que não muda: o `dev` e a `main`, um PR por vez, o ajuste pequeno direto na `main`. As regras do GitHub só barram apagar e reescrever;
- a atualização da produção para a 0.1.11, que quem opera faz pelo runbook;
- outras proteções além das decididas, como o Dependabot e o relato privado de vulnerabilidades.

## What Changes

- **A árvore da publicação,** no repositório antigo, antes do commit único, por um PR que o usuário revisa:
  - um teste-guarda das ações dos workflows, como o dos executores: o `pnpm test` reprova uma ação que não seja do GitHub nem do próprio repositório;
  - um `README.md` com o que é o Grafite, como rodar no desenvolvimento, onde estão os documentos e a página das versões, e o aviso de direitos: todos reservados, e o código pode ser lido, mas não copiado, modificado nem redistribuído;
  - o `CLAUDE.md`, a spec mestre (seções 12.1 e 12.2) e o runbook passam a dizer o repositório novo, a página das versões e o e-mail dos commits;
  - a versão 0.1.11, a primeira do repositório novo.
- **O commit único:**
  - é a árvore da `main` do repositório antigo, sem o `.gitleaksignore`, num commit sem pai, com o autor e o committer no e-mail noreply;
  - é montado numa pasta descartável, fora do `D:\grafite`, que recebe só esse commit;
  - antes do push, é conferido: um commit, nenhuma tag, o gitleaks e a guarda dos termos sem achado.
- **O repositório novo, privado primeiro:**
  - nasce vazio, com as Actions limitadas às ações do GitHub e às do próprio dono, e com o token dos workflows só de leitura;
  - o usuário cadastra o secret `GRAFITE_TERMOS_PRIVADOS`;
  - o commit único vai para a `main` e o `dev`, e o CI tem de passar.
- **Público e protegido,** com o sim do usuário. O repositório vira público e, na sequência:
  - os workflows de um PR de qualquer pessoa de fora esperam a aprovação;
  - rulesets deixam a `main` e as tags `v*` sem remoção nem reescrita;
  - a busca de segredos do GitHub fica ligada, com o bloqueio no push.
- **A pasta `D:\grafite`:** um clone novo toma o lugar da pasta antiga, que fica renomeada como cópia de segurança. Ele tem o e-mail noreply na configuração local e leva os arquivos locais que o Git ignora: o `.env`, a `.grafite/` com as listas dos termos e a pasta da demonstração.
- **A versão 0.1.11:** a tag no repositório novo, com a release pelo `versao.yml`. Os pacotes passam a baixar sem login.
- **O repositório antigo:** depois das decisões pendentes do usuário sobre o que ainda está nele, é arquivado no GitHub, privado e só de leitura.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `plataforma-base`: requisito novo, "Repositório público protegido". Ele cobre:
  - o histórico, que começa num commit sem pai;
  - os commits e as tags, com o e-mail noreply;
  - o aviso de direitos no README;
  - as proteções do GitHub.

## Impact

- **Arquivos:**
  - `README.md`, novo;
  - `scripts/ci/acoes.ts` e o teste dele, novos;
  - o `.gitleaksignore`, que sai só da árvore do commit único;
  - o `CLAUDE.md`, a spec mestre, o `docs/operacao/runbook.md` e o `docs/mapa.md`;
  - a versão de `apps/api`, de `apps/collector`, de `apps/operacao` e do contrato da API.
- **GitHub:**
  - o repositório novo e as configurações dele;
  - o secret, que o usuário cadastra;
  - o repositório antigo, arquivado.
- **Máquina de desenvolvimento:**
  - a pasta `D:\grafite` trocada pelo clone novo, e a antiga renomeada;
  - a memória do Claude Code segue a pasta, que mantém o caminho;
  - o banco do desenvolvimento continua o mesmo, porque o `compose.yaml` fixa o nome do projeto.
- **Produção:** nada muda até quem opera instalar a 0.1.11, que sai do repositório novo.
- **Ações para fora,** cada uma só com o sim do usuário: criar o repositório, mudar a visibilidade, configurar as proteções e arquivar o antigo.
- **Ações do usuário:**
  - cadastrar o secret;
  - ligar, na conta do GitHub, "Keep my email addresses private" e "Block command line pushes that expose my email";
  - trocar as pastas com o Claude Code fechado;
  - decidir o que ainda está no repositório antigo: um webhook, as pré-releases de ensaio e um rascunho órfão.
