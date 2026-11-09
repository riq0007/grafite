## 1. Spec mestre

- [x] 1.1 Atualizar a spec mestre conforme o design (decisão 18):
  - seção 5.1: a árvore livre com tipos (Unidade, Prédio, Andar, Setor, Sala e Outro), com o rack como ativo;
  - seção 5.2: a pessoa com nome, e-mail, matrícula, local de trabalho e telefone;
  - seção 9.2: a exigência dos dois passos pela conta ou pelo perfil, valendo já;
  - seção 9.3: o escopo na atribuição, o catálogo no código, o Administrador protegido, o último administrador e a quem pedir acesso;
  - seção 9.9: a política de anonimização, com a auditoria intacta pela retenção;
  - seção 15: sai a decisão da LGPD.

  Verificar: o diff da spec mestre bate com as specs desta change.

## 2. Domínio

- [x] 2.1 Escrever os testes do catálogo de permissões e depois implementá-lo (`acesso/permissoes.ts`: `PERMISSOES`, `Permissao`, `descricaoDa`, `fechamento` e `permissaoConhecida`). Os casos:
  - as chaves únicas e no formato `area.acao`;
  - as inclusões que existem, sem ciclo;
  - o fechamento com as incluídas;
  - as descrições preenchidas;
  - a chave desconhecida.

  Verificar: os testes unitários passam.
- [x] 2.2 Escrever os testes da árvore de locais e depois implementá-la (`locais/arvore.ts`: `montarArvore`, os tipos, `validarNomeDoLocal`). Os casos:
  - o caminho "Jundiaí › Expedição";
  - os ancestrais e o ramo;
  - a profundidade e a altura do ramo;
  - mover para dentro de si mesmo ou de um descendente;
  - passar de 8 níveis ao cadastrar e ao mover;
  - o nome repetido entre irmãos sem acento nem maiúsculas;
  - o nome vazio ou com mais de 80 caracteres.

  Verificar: os testes unitários passam.
- [x] 2.3 Escrever os testes do acesso efetivo e depois implementá-lo (`acesso/acesso.ts`: `resolverAcesso`, `pode`, `podeEm` e `alcance`). Os casos:
  - o perfil direto e o perfil pelo grupo;
  - o perfil, o grupo, a participação e a atribuição inativos ou encerrados;
  - o escopo da organização e o de um ramo;
  - a permissão só da organização ignorada num ramo;
  - as inclusões e `todas_as_permissoes`;
  - `exigeDoisPassos` e `perfisQueExigem`;
  - as origens de cada permissão;
  - `podeEm` com um local nulo;
  - `alcance` juntando ramos.

  Verificar: os testes unitários passam.
- [x] 2.4 Escrever os testes das regras da pessoa e depois implementá-las (`pessoas/pessoa.ts`: `validarPessoa` e `textoDeBusca`). Os casos:
  - o nome obrigatório e até 120 caracteres;
  - o e-mail válido;
  - a matrícula até 32 caracteres;
  - o telefone com os caracteres aceitos;
  - as mensagens da spec;
  - a busca sem acento com nome, matrícula e e-mail.

  Verificar: os testes unitários passam.
- [x] 2.5 Escrever o teste e depois criar `ACOES_DA_AUDITORIA` (`auditoria/acoes.ts`), com o rótulo em pt-BR de cada ação do F2a e do F2b e `rotuloDaAcao`. A ação desconhecida devolve a própria chave. Verificar: os testes unitários passam.

## 3. Banco

- [x] 3.1 Escrever os testes de integração e depois criar a tabela `locais`, com a migration e o isolamento (design, decisão 3). Os casos:
  - o isolamento entre organizações;
  - a chave composta do pai recusando um local de outra organização;
  - o nome normalizado único entre irmãos, também na raiz;
  - o tipo e a situação fora da lista recusados.

  Verificar: `pnpm test:integration` passa, e o teste-guarda continua sem tabela sem RLS.
- [x] 3.2 Escrever os testes de integração e depois ampliar `pessoas` e `contas` (design, decisão 9). As mudanças:
  - em `pessoas`: matrícula, local, telefone, busca e `anonimizada_em`;
  - a situação `anonimizada`;
  - o usuário e o hash anuláveis, só na conta anonimizada;
  - os motivos novos do fim da sessão.

  Os casos:
  - a matrícula única na organização e repetida em outra;
  - a chave composta do local;
  - o check da conta anonimizada;
  - dois usuários nulos aceitos.

  Ajustar os tipos do F2a que leem o usuário e o hash. Verificar: `pnpm test:integration` e `pnpm typecheck` passam.
- [x] 3.3 Escrever os testes de integração e depois criar `perfis`, `grupos`, `membros_do_grupo` e `atribuicoes` (design, decisão 4). Os casos:
  - o isolamento;
  - as chaves compostas;
  - os nomes normalizados únicos;
  - só o protegido com todas as permissões;
  - a atribuição com conta ou grupo, nunca os dois;
  - a participação e a atribuição em vigor únicas, com a encerrada podendo se repetir.

  Verificar: `pnpm test:integration` passa.
- [x] 3.4 Escrever o teste de integração e depois criar a migration que semeia o Administrador nas organizações que já existem (design, decisão 8). O teste:
  1. aplica as migrations até a anterior;
  2. cria duas organizações com contas, uma exigindo os dois passos e outra não;
  3. aplica o resto;
  4. confere o perfil, a atribuição à conta mais antiga, a exigência herdada e o RLS forçado de volta.

  Verificar: `pnpm test:integration` passa.

## 4. Acesso na API

- [x] 4.1 Escrever os testes de integração e depois carregar o acesso efetivo na leitura da sessão (design, decisão 5). Os casos:
  - o `GET /sessao` com o acesso e o escopo;
  - a mudança de perfil valendo na requisição seguinte;
  - a exigência dos dois passos pelo perfil virando a pendência numa sessão que vale, que mantém o fim;
  - a conclusão do cadastro sem mudar a ativação;
  - o `GET /conta` com `exigidaPor`;
  - a desativação recusada quando um perfil exige.

  Verificar: `pnpm test:integration` passa, e `pnpm contrato:verificar`, depois de `pnpm contrato:gerar`, também.
- [x] 4.2 Escrever os testes e depois implementar a guarda de permissão (design, decisão 6):
  - o `config.permissao` e o `config.semPermissao` nas rotas, incluindo as do F2a;
  - o `exigirPermissao` e o `exigirEm`;
  - o problem `sem-permissao` com os administradores;
  - a recusa auditada numa transação própria;
  - o `GET /acesso/administradores`;
  - o teste-guarda que reprova rota sem declaração.

  Verificar: os testes unitários e de integração passam.
- [x] 4.3 Escrever os testes de integração e depois implementar `contarAdministradores` e a proteção do último administrador com a trava `acessos` (design, decisão 7). Os casos:
  - a contagem pelo perfil direto, pelo grupo e por `todas_as_permissoes`;
  - a recusa `ultimo-administrador` desfazendo tudo;
  - as duas retiradas simultâneas, em conexões separadas, com só uma gravada.

  Verificar: `pnpm test:integration` passa.

## 5. Locais na API

- [x] 5.1 Escrever os testes de integração e depois implementar o `GET /locais` e o `POST /locais`. Os casos:
  - a leitura por qualquer sessão ativa;
  - o cadastro na raiz só com escopo da organização;
  - o cadastro dentro do ramo permitido;
  - o 9º nível e o nome repetido recusados;
  - a auditoria do cadastro.

  Verificar: `pnpm test:integration` e `pnpm contrato:verificar` passam.
- [x] 5.2 Escrever os testes de integração e depois implementar o `PATCH /locais/:id`, o movimento, a inativação e a reativação. Os casos:
  - renomear e mudar o tipo;
  - mover com os filhos e recusar o ciclo;
  - mover exigindo a permissão no local e no destino;
  - inativar recusado por filho ativo, por pessoa ativa e por atribuição em vigor, com o motivo;
  - reativar com o pai inativo recusado;
  - a auditoria de cada mudança.

  Verificar: `pnpm test:integration` e `pnpm contrato:verificar` passam.

## 6. Pessoas na API

- [x] 6.1 Escrever os testes de integração e depois implementar o `GET /pessoas` (design, decisão 12). Os casos:
  - a ordem alfabética com o cursor;
  - o `limite` acima de 100 recusado;
  - a busca sem acento e em qualquer ordem pelo nome, pela matrícula, pelo e-mail e pelo usuário;
  - os filtros de situação, conta e local, com o ramo;
  - o alcance de uma conta com escopo de local, sem as pessoas sem local;
  - o resumo da conta em cada linha.

  Verificar: `pnpm test:integration` e `pnpm contrato:verificar` passam.
- [x] 6.2 Escrever os testes de integração e depois implementar o `POST /pessoas`, o `GET /pessoas/:id` e o `PATCH /pessoas/:id`, com o `permite`. Os casos:
  - o cadastro com o local do escopo;
  - a matrícula repetida no campo;
  - o local inativo recusado;
  - a pessoa de fora do ramo recusada na leitura e na edição;
  - a mudança de local exigindo o antigo e o novo;
  - a auditoria com o antes → depois.

  Verificar: `pnpm test:integration` e `pnpm contrato:verificar` passam.
- [x] 6.3 Escrever os testes de integração e depois implementar a inativação e a reativação da pessoa. Os casos:
  - a conta inativada e as sessões encerradas com `conta-inativada`;
  - a reativação sem reativar a conta;
  - a recusa da própria pessoa;
  - o último administrador.

  Verificar: `pnpm test:integration` passa.
- [x] 6.4 Escrever os testes de integração e depois implementar a anonimização (design, decisão 10). Os casos:
  - a pessoa ativa recusada;
  - a própria pessoa e o último administrador recusados;
  - os campos da pessoa, da conta, das sessões e das tentativas apagados;
  - as credenciais apagadas;
  - as atribuições e as participações encerradas;
  - o usuário livre para outra conta;
  - o registro da auditoria sem os dados apagados;
  - a pessoa anonimizada sem edição nem reativação.

  Verificar: `pnpm test:integration` e `pnpm contrato:verificar` passam.

## 7. Contas na API

- [x] 7.1 Escrever os testes de integração e depois implementar o `POST /pessoas/:id/conta` e o `PATCH /contas/:id`. Os casos:
  - a senha temporária devolvida uma vez e a troca na primeira entrada;
  - a pessoa inativa ou já com conta recusada;
  - o usuário pela regra e repetido no campo;
  - a mudança do usuário e da exigência;
  - a auditoria sem a senha.

  Verificar: `pnpm test:integration` e `pnpm contrato:verificar` passam.
- [x] 7.2 Escrever os testes de integração e depois implementar a redefinição, a remoção dos dois passos e o desbloqueio. Os casos:
  - a senha temporária nova;
  - as sessões encerradas;
  - as tentativas zeradas;
  - a remoção pedindo o cadastro de novo quando o perfil exige;
  - a própria conta recusada;
  - a auditoria.

  Verificar: `pnpm test:integration` e `pnpm contrato:verificar` passam.
- [x] 7.3 Escrever os testes de integração e depois implementar a inativação e a reativação da conta e as sessões da conta (listar e encerrar todas). Os casos:
  - a inativação encerrando as sessões e mantendo as atribuições;
  - a reativação com a pessoa inativa recusada;
  - a própria conta recusada;
  - o último administrador;
  - a lista sem token.

  Verificar: `pnpm test:integration` e `pnpm contrato:verificar` passam.

## 8. Perfis, grupos e atribuições na API

- [x] 8.1 Escrever os testes de integração e depois implementar as rotas de perfis. Os casos:
  - a lista e a ficha com quem tem;
  - o cadastro, com a permissão desconhecida e o nome repetido recusados;
  - a edição com a auditoria das permissões antes → depois;
  - o Administrador protegido;
  - a inativação, com o último administrador;
  - `acessos.ver` sem alterar.

  Verificar: `pnpm test:integration` e `pnpm contrato:verificar` passam.
- [x] 8.2 Escrever os testes de integração e depois implementar as rotas de grupos e membros. Os casos:
  - o cadastro e a edição;
  - incluir, a inclusão repetida recusada e retirar, encerrando a participação;
  - a inativação do grupo tirando os perfis dos membros;
  - o último administrador ao retirar e ao inativar.

  Verificar: `pnpm test:integration` e `pnpm contrato:verificar` passam.
- [x] 8.3 Escrever os testes de integração e depois implementar as atribuições e o `GET /contas/:id/acesso`. Os casos:
  - atribuir à conta e ao grupo, com escopo;
  - a atribuição repetida recusada;
  - as permissões ignoradas no local;
  - o local e o perfil inativos recusados;
  - encerrar, com o último administrador;
  - o acesso com as origens.

  Verificar: `pnpm test:integration` e `pnpm contrato:verificar` passam.

## 9. Auditoria na API

- [x] 9.1 Escrever os testes de integração e depois implementar o `GET /auditoria` e o `GET /auditoria/contas` (design, decisão 13). Os casos:
  - a ordem e a inversão;
  - o cursor sem pular nem repetir com registros novos;
  - cada filtro e os alvos repetidos;
  - o total exato e o "mais de 10.000", com 10.001 registros;
  - os nomes atuais do ator e do alvo;
  - o dispositivo da sessão;
  - a permissão exigida.

  Conferir que toda ação gravada pela API tem rótulo em `ACOES_DA_AUDITORIA`. Verificar: `pnpm test:integration` e `pnpm contrato:verificar` passam.

## 10. Comando no servidor

- [x] 10.1 Escrever os testes de integração e depois fazer o `organizacao criar` semear o Administrador e atribuí-lo à primeira conta. O `--sem-exigir-dois-passos` passa a valer também para o perfil, e o `conta criar` ganha `--administrador`. Atualizar a ajuda e o `scripts/dev.ts`, se preciso. Verificar: os testes de integração do comando passam, e `pnpm grafite --ajuda` mostra a opção nova.

## 11. Componentes

- [x] 11.1 Criar a `Arvore`, começando pelas histórias e pelos testes de interação. Os casos:
  - expandir e recolher pelo clique e pelas setas;
  - mover o foco;
  - escolher com Enter;
  - o ícone, o detalhe e a situação por texto;
  - a altura da densidade;
  - a acessibilidade do catálogo.

  Verificar: `pnpm test:stories` passa.
- [x] 11.2 Criar o `CampoDeData`, com o `@internationalized/date`, começando pelos testes de interação e pelas histórias. Os casos:
  - digitar 01102026 e ler 01/10/2026;
  - a data inexistente recusada;
  - o rótulo, a descrição e o erro;
  - o valor em `aaaa-mm-dd`.

  Verificar: `pnpm test:stories` passa.
- [x] 11.3 Criar os `FiltrosAtivos` e o `TextoParaCopiar`, começando pelas histórias e pelos testes de interação:
  - limpar um filtro;
  - "Limpar filtros";
  - os nomes acessíveis;
  - "Copiar" virando "Copiado".

  Passar os passos da entrada ao `TextoParaCopiar`. Verificar: `pnpm test:stories` passa.
- [x] 11.4 Acrescentar o "Carregar mais" à `Tabela`, começando pelos testes de interação e pelas histórias:
  - o botão enquanto houver mais;
  - o carregando sem pedido duplo;
  - as linhas novas ao fim;
  - o foco quando acabam.

  Verificar: `pnpm test:stories` passa.
- [x] 11.5 Extrair a `JanelaComSecoes` do `AjustesDoSistema` para o `packages/ui`, começando pelas histórias, com os grupos e a troca no celular. Passar os Ajustes a usá-la e dar à `BuscaComSugestoes` o modo de sugestões vindas de fora. Verificar: `pnpm test:stories`, os testes dos Ajustes e `pnpm test:e2e` passam.

## 12. Web: dados e acesso

- [x] 12.1 Acrescentar o `@tanstack/react-query` à web, com o `QueryClient` no `App` e os ajudantes `consultar` e `paginar` sobre o `pedir()`, começando pelos testes:
  - a falha em texto com o código de rastreio;
  - a nova tentativa só sem conexão;
  - a página seguinte pelo `proximo`.

  Verificar: os testes unitários passam.
- [x] 12.2 Escrever os testes e depois guardar o acesso na loja da sessão, com o `useAcesso()`. A loja passa a validar de novo numa 403 `pendencia` ou `sem-permissao`. Os casos:
  - `pode` em qualquer escopo;
  - a sessão desconhecida sem permissão nenhuma;
  - a pendência que surge cobrindo a casca com o cadastro e a mensagem da exigência;
  - a volta à mesma tela.

  Verificar: os testes unitários e de componente passam.
- [x] 12.3 Escrever os testes e depois implementar as `permissoes` no registro de módulos e o `registroDaConta`, e ligar a casca, a busca e a tela inicial ao registro filtrado. Os casos:
  - o módulo, o item de menu, a entrada, o provedor e a fonte escondidos sem a permissão;
  - os destinos tipados continuam conferidos.

  Verificar: os testes unitários e `registro.test.ts` passam.

## 13. Módulo Administração

- [x] 13.1 Criar o módulo Administração, começando pelos testes de componente:
  - as rotas e a `JanelaComSecoes`;
  - a ida à primeira seção permitida;
  - a tela "sem permissão" com os administradores;
  - o menu do dock por permissão;
  - "Mais" no celular;
  - o registro antes de Ajustes.

  Verificar: os testes de componente e `registro.test.ts` passam.
- [x] 13.2 Criar o `SeletorDeLocal` e o `SeletorDeConta`, começando pelos testes de componente:
  - os locais ativos pelo caminho;
  - a busca sem acento;
  - as contas vindas da API enquanto se digita.

  Verificar: os testes passam.
- [x] 13.3 Implementar a tela de pessoas, começando pelos testes de componente:
  - a busca e os filtros com os filtros ativos;
  - a tabela com as colunas;
  - "Carregar mais" e o número de pessoas;
  - a ficha pelo clique e por Enter;
  - a prévia pela barra de espaço;
  - os estados carregando, vazio, erro e sem conexão;
  - "Nova pessoa" só com permissão.

  Verificar: os testes passam.
- [x] 13.4 Implementar a pessoa nova e a aba Dados da ficha, começando pelos testes de componente:
  - o formulário com as regras do domínio antes de enviar;
  - a recusa da API no campo;
  - o aviso "Pessoa cadastrada.";
  - a ficha só de leitura sem `pessoas.editar`.

  Verificar: os testes passam.
- [x] 13.5 Implementar a conta na aba Acesso, começando pelos testes de componente:
  - criar a conta com a senha temporária uma vez;
  - redefinir;
  - remover os dois passos;
  - desbloquear;
  - inativar e reativar;
  - as sessões e "Encerrar todas as sessões";
  - as confirmações;
  - as ações conforme o `permite`.

  Verificar: os testes passam.
- [x] 13.6 Implementar os perfis, os grupos e o acesso efetivo na aba Acesso, começando pelos testes de componente:
  - atribuir um perfil com o escopo e o aviso das permissões ignoradas;
  - encerrar;
  - incluir e retirar de grupos;
  - "O que esta conta pode fazer", com as origens.

  Verificar: os testes passam.
- [x] 13.7 Implementar a inativação, a reativação e a anonimização da pessoa e a aba Histórico, começando pelos testes de componente:
  - a anonimização liberada só com o nome digitado;
  - o texto do que é apagado e do que fica;
  - o último administrador;
  - os registros recentes com "Ver na auditoria".

  Verificar: os testes passam.
- [x] 13.8 Implementar as telas de perfis, começando pelos testes de componente:
  - a lista;
  - a ficha com as permissões por área, as só da organização e as incluídas;
  - "Exige verificação em dois passos";
  - quem tem;
  - o Administrador protegido;
  - o perfil novo;
  - a inativação.

  Verificar: os testes passam.
- [x] 13.9 Implementar as telas de grupos, começando pelos testes de componente:
  - a lista;
  - a ficha com os membros e os perfis;
  - incluir e retirar;
  - o grupo novo;
  - a inativação.

  Verificar: os testes passam.
- [x] 13.10 Implementar a tela de locais, começando pelos testes de componente:
  - a árvore com os tipos e "Mostrar inativos";
  - o local novo na raiz e dentro, numa gaveta;
  - renomear;
  - "Mover para…" mantendo o foco;
  - inativar com o motivo da recusa;
  - reativar;
  - as ações conforme a permissão no ramo.

  Verificar: os testes passam.
- [x] 13.11 Implementar a tela da auditoria, começando pelos testes de componente:
  - os períodos e o personalizado no fuso escolhido;
  - quem fez, a ação e o código de rastreio;
  - o alvo vindo da query string;
  - os filtros ativos;
  - o total e "mais de 10.000 registros";
  - "Carregar mais";
  - o detalhe na prévia, com o antes → depois e as setas.

  Verificar: os testes passam.
- [x] 13.12 Implementar a busca da Administração, começando pelos testes:
  - o provedor "Pessoas" pelo nome, pela matrícula e pelo usuário;
  - as entradas "Nova pessoa", "Novo perfil", "Novo grupo" e "Novo local", conforme a permissão;
  - a seção Conta dos Ajustes com "Exigida pelo perfil <nome>".

  Verificar: os testes passam.

## 14. Contrato de módulo

- [x] 14.1 Atualizar `docs/casca/modulos.md`, com trechos conferidos pelo `documentacao.test.ts`:
  - as permissões no registro e no catálogo;
  - `useAcesso()`;
  - o alcance e o `exigirEm` nas rotas da API;
  - o TanStack Query (`consultar` e `paginar`);
  - a tela "sem permissão".

  Verificar: o teste confere os exemplos com o código.

## 15. Verificação integrada e fechamento

- [x] 15.1 Fazer a fixture da ponta a ponta simular o acesso da sessão de "Ana Souza" como administradora, com a opção de uma conta sem permissões. Escrever a ponta a ponta da Administração, com a API simulada. Os casos:
  - cadastrar uma pessoa;
  - criar a conta e ver a senha temporária;
  - atribuir um perfil;
  - cadastrar e mover um local;
  - filtrar a auditoria pelo código de rastreio;
  - a conta sem permissões sem o item no dock;
  - o endereço sem permissão;
  - no celular, a Administração em "Mais".

  Verificar: `pnpm test:e2e` passa.
- [x] 15.2 Estender a ponta a ponta da pilha real. O caminho:
  1. o administrador cadastra uma pessoa, cria a conta e atribui um perfil só com `pessoas.ver` num local;
  2. a conta nova entra com a senha temporária e a troca;
  3. ela vê só Pessoas, com as pessoas do local;
  4. a auditoria do administrador mostra a atribuição.

  Verificar: `pnpm test:e2e:pilha` passa.
- [x] 15.3 Capturar as histórias novas em Grafite e Névoa nas três larguras e revisar as referências: árvore, campo de data, filtros ativos, texto para copiar, tabela com "Carregar mais" e janela com seções. Verificar: `pnpm test:visual` passa.
- [x] 15.4 Revisar as telas da Administração pelo checklist do ANTISLOP v2, com capturas em 1366, 1920 e 2560 px, nos temas Grafite e Névoa e no celular, e corrigir o que reprovar. Atualizar o `CLAUDE.md` com a change e o comando novo. Verificar:
  - `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:stories`, `pnpm test:e2e`, `pnpm test:e2e:pilha` e `pnpm test:visual` verdes;
  - `pnpm tokens:verificar`, `pnpm marca:verificar` e `pnpm contrato:verificar` em dia;
  - o CI verde no PR.
