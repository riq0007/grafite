## Why

Em 08/11/2026 o usuário decidiu publicar o Grafite num repositório novo e público, com a árvore de hoje num commit só. O repositório antigo continua privado, como arquivo, e o histórico não vai junto. Mas os arquivos que vão junto ainda trazem dados da empresa e do desenvolvedor. A auditoria de 09/11 achou:
- o domínio da empresa, nos testes do comando de operação e dos endereços da organização, num cenário da spec `operacao-servicos` e no runbook;
- o nome da estação de trabalho do desenvolvimento e o das instâncias do executor, nas changes arquivadas e no mapa;
- o nome do executor da rede da empresa, o da conta local e o da VM de testes, nas mesmas changes;
- o nome completo do desenvolvedor, nos testes e nas histórias do avatar;
- a marca do antivírus da empresa e os diagnósticos de uma estação e de uma impressora reais, nos guias da operação e numa change arquivada;
- a licença de servidor que a empresa tem, numa change arquivada;
- o segundo nome, interno, do PMG e a lista dos segredos que ele versionava, na spec mestre;
- os fatos da planta real (as medidas, o arquivo do PMG e um trecho do modelo), na spec mestre, na change do P7, na spec `mapa-da-planta` e nos testes do mapa;
- duas séries de impressora e um telefone que parecem reais, nas gravações do coletor e nos testes;
- links para o repositório antigo e para uma página privada.

O gitleaks não achou segredo nos arquivos versionados. Mas as impressões do `.gitleaksignore` são de commits do repositório antigo, que não existirão no novo. O job "Segredos no histórico" reprovaria o primeiro push com os quatro falsos positivos que elas escondem.

A change pertence ao esqueleto técnico do F0 (spec `plataforma-base`, "Proteção contra segredos") e às seções 9, item 6, e 12.1 da spec mestre. Ela vem depois da `ci-nos-executores-do-github`, que tirou os executores próprios e deixou a limpeza para a change seguinte.

Ficam fora desta change:
- a criação do repositório novo, com as proteções do GitHub, e a passagem do `D:\grafite` para ele: ficam para a change seguinte, que parte da árvore limpa;
- o histórico do Git, que não se limpa: o repositório novo começa de um commit só;
- as cidades dos exemplos, que ficam (design, decisão 6);
- os nomes de pessoa, as séries, as faixas de rede e as salas dos exemplos, que são inventados;
- o nome PMG, que é o do sistema que o Grafite substitui;
- um README e o aviso de direitos reservados, que são da publicação.

## What Changes

- **A lista dos termos fora do Git:** os termos privados ficam numa lista local, em `.grafite/termos-privados/`, que o `.gitignore` já ignora. Nenhum documento desta change cita um termo: eles dizem só o tipo e o substituto.
- **Os testes e as fixtures, com o código e as expectativas juntos:**
  - o domínio da empresa vira `acme.example`, e o interno, `acme.local`; a organização do teste vira "Acme";
  - o nome completo do desenvolvedor vira "Helena Matos de Osório", com as mesmas iniciais, HO, para as capturas visuais não mudarem;
  - as duas séries das gravações SNMP e o telefone viram valores inventados;
  - o trecho do modelo da planta nos testes vira a `planta-exemplo`, com medidas e posições inventadas.
- **O gitleaks:** os quatro falsos positivos conhecidos ganham `gitleaks:allow` na própria linha, com o motivo. O `.gitleaksignore` fica até a publicação, porque o CI do repositório antigo varre o histórico, e sai na change seguinte.
- **Os documentos e o arquivo das changes:**
  - as máquinas viram `PC-DEV`, `PC-DEV-2`, `PC-DEV-3` e `PC-TI`, e a conta, `.\usuario`; a VM de testes perde o nome;
  - os guias da operação perdem a marca do antivírus e os diagnósticos datados de uma estação e de uma impressora reais;
  - a spec mestre e a change do P7 perdem os fatos da planta real, e a seção 13.3 da spec mestre fica genérica;
  - os links para o repositório antigo e para a página dos desenhos viram texto.
- **As pastas locais no `.gitignore`:** a dos roteiros da demonstração e a das worktrees do Claude Code, que hoje só o `.git/info/exclude` ignora e que um clone novo não ignoraria.
- **A guarda dos termos:** um conferidor, com teste, roda no job de segredos do CI, com a lista num secret, e no pre-commit, com a lista local. Ele diz só o arquivo e o número do termo, nunca o termo.
- **A verificação final:**
  - a busca de cada lista na árvore inteira, com os binários;
  - o gitleaks como o CI do repositório novo vai rodar, num commit único.
- **Mapa:** o `docs/mapa.md` traz a change em andamento.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `operacao-servicos`: o cenário "Endereço acrescentado" passa a usar o domínio de exemplo. O requisito não muda.
- `mapa-da-planta`: o cenário "Planta do PMG importada" passa a usar o modelo de exemplo, sem as medidas da planta real. O requisito não muda.
- `plataforma-base`: o requisito novo "Árvore sem termos privados". Os arquivos versionados não têm os termos da lista, conferidos no CI e antes do commit.

## Impact

- **Testes e fixtures:**
  - `apps/operacao/src/comando.test.ts` e `apps/operacao/src/painel/tarefas.test.ts`;
  - `apps/painel/src/configuracoes/Configuracoes.test.tsx`;
  - `apps/api/src/comando/organizacao.int.test.ts`;
  - `packages/ui/src/componentes/avatar/iniciais.test.ts`, `packages/ui/src/componentes/exibicao/Exibicao.test.tsx`, `Exibicao.stories.tsx` e `packages/ui/src/componentes/Matriz.stories.tsx`;
  - `apps/collector/src/snmp.test.ts` e duas gravações em `apps/collector/test/gravacoes/`;
  - `packages/domain/src/pessoas/pessoa.test.ts`;
  - `packages/domain/src/mapa/mapa.test.ts`, `apps/api/src/rotas/mapa.int.test.ts`, `apps/web/src/modulos/mapa/Mapa.test.tsx` e `packages/db/src/mapa.int.test.ts`.
- **Código:**
  - só comentários: o do modelo do PMG em `packages/domain/src/mapa/mapa.ts` e os `gitleaks:allow` em `packages/domain/src/acesso/senha.ts` e em dois testes;
  - a guarda: `scripts/termos-privados.ts`, o teste dele, `.github/workflows/ci.yml` e `lefthook.yml`.
- **Configuração:** o `.gitignore`. O `.gitleaksignore` não muda aqui.
- **Documentação:**
  - `docs/operacao/runbook.md`, `docs/operacao/agente-glpi.md` e `docs/operacao/integracoes-da-rede.md`;
  - `docs/superpowers/specs/2026-09-24-grafite-design.md`, seções 1, 3.4 e 13.3;
  - `docs/mapa.md`.
- **OpenSpec:**
  - as specs `operacao-servicos`, `mapa-da-planta` e `plataforma-base`, sincronizadas pelas deltas;
  - 20 changes arquivadas, inclusive a `ci-nos-executores-do-github`, só nos termos e nos detalhes do ambiente.
- **GitHub:** o secret `GRAFITE_TERMOS_PRIVADOS`, que o usuário cadastra.
- **Fora do repositório:** a lista local dos termos.
