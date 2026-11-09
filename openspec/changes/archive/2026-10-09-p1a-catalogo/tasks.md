# P1a · Catálogo — plano de implementação

**Objetivo:** a organização cadastra os tipos de ativo, os campos, as capacidades de cada tipo e os modelos de equipamento, sem programação, com as regras de cada tipo de campo iguais na API e nas telas.

**Arquitetura:**
- **`packages/domain`:**
  - o motor de campos, em funções puras;
  - o registro das capacidades e os ícones dos tipos;
  - as permissões, as ações da auditoria e o evento novos.
- **`packages/db`:** as quatro tabelas, isoladas pela organização.
- **`apps/api`:** as rotas do catálogo e o fluxo comum das imagens, tirado da foto da pessoa.
- **`packages/ui`:** a escolha do ícone e o editor das opções.
- **`apps/web`:** o módulo Ativos, com as telas de tipos, de campos e de modelos.

**Tecnologias:**
- o Node 24 com TypeScript;
- o Fastify com o Zod, o Drizzle e o PostgreSQL 18;
- o React com o React Aria e o TanStack Query;
- o Vitest, o Storybook e o Playwright.

**Spec:** `proposal.md`, `specs/` e `design.md` desta change. Cada tarefa cita a decisão do design que segue.

## Restrições globais

- **Limites:**
  - o nome do tipo e o rótulo do campo têm até 60 caracteres, e o grupo, até 40;
  - o fabricante tem até 60 caracteres, e o nome do modelo, até 80;
  - cada lista tem até 200 opções, e cada rótulo de opção, até 60 caracteres;
  - cada tipo tem até 100 campos, e a configuração de um campo, até 32 KB.
- **Ícones dos tipos:** `impressora`, `computador`, `notebook`, `monitor`, `switch`, `rack`, `controle-de-acesso`, `camera`, `storage`, `nobreak` e `generico`.
- **Textos da interface, exatamente:**
  - **recusas:**
    - "Já existe um tipo com este nome.";
    - "Já existe um campo com este rótulo.";
    - "Já existe este modelo neste tipo.";
    - "O campo <rótulo> está inativo.";
    - "O tipo <nome> está inativo.";
    - "Capacidade desconhecida: <chave>.";
    - "As opções não são excluídas: inative a opção.";
    - "O mínimo não pode passar do máximo.";
    - as do motor de campos, na tabela da spec campos-personalizados;
  - **estado vazio:** "Nenhum tipo de ativo ainda.";
  - **retornos:**
    - "Tipo cadastrado.", "Tipo salvo.", "Tipo inativado." e "Tipo reativado.";
    - "Campo cadastrado.", "Campo salvo.", "Campo inativado." e "Campo reativado.";
    - "Modelo cadastrado.", "Modelo salvo.", "Modelo inativado." e "Modelo reativado.";
    - "Imagem do modelo trocada." e "Imagem do modelo removida.";
    - "A imagem do modelo não foi enviada.", com o motivo, quando o modelo é cadastrado e a imagem escolhida é recusada.
- **Commits:** um por tarefa, no padrão `tipo(escopo): assunto`, com "Tarefa X.Y do p1a-catalogo." no corpo (regra 8). Esta sessão é a orquestradora: os pacotes compartilhados mudam aqui (regra 7).

## Foco da revisão

Situações que as specs implicam e que nenhum cenário cobre, cada uma com o teste na tarefa dona:
1. **Acento e maiúsculas nos nomes:**
   - "Câmera" e "camera" são o mesmo tipo;
   - "Propriedade" e "propriedade" são o mesmo campo;
   - "Próprio" e "proprio" são a mesma opção (tarefas 2.2, 3.1, 4.2 e 4.3).
2. **Campo inativo que já está num tipo:**
   - gravar a lista de campos do tipo com ele continua aceito;
   - só a inclusão nova de um campo inativo é recusada;
   - ao reativar, o campo volta aos tipos em que estava (tarefa 4.2).
3. **Duas pessoas mudando a lista de campos do mesmo tipo ao mesmo tempo:** a última gravação vale inteira, sem campo repetido nem ordem quebrada (tarefa 4.2).
4. **Número de série do Excel abaixo de 61:** antes de 1º de março de 1900, o Excel conta um 29 de fevereiro que não existiu. Esses números são recusados como data inválida (tarefa 2.1).
5. **A grafia do fabricante quando o primeiro modelo está inativo:** a grafia do modelo mais antigo vale, ativo ou não (tarefa 4.4).
6. **Imagem do modelo com a transação falhando:** as variantes gravadas são apagadas, como na foto da pessoa (tarefas 4.1 e 4.4).

## 1. Spec mestre

- [x] 1.1 Atualizar a spec mestre conforme o design e o brainstorming:
  - **seção 3.2:** a divisão do P1 em seis changes, com a entrega de cada uma;
  - **seção 5.2, decisão 2:** a organização começa sem tipos, e cada tipo escolhe um dos ícones genéricos;
  - **seção 5.2, decisão 4:**
    - os campos são da organização, e cada tipo escolhe os seus, com a obrigatoriedade na ligação;
    - os valores ficam num JSONB pelo id do campo, com a origem, o momento, o autor e a trava num segundo JSONB;
    - os campos das capacidades têm uma chave fixa;
  - **seção 5.3:**
    - os tipos arquivo e imagem chegam com a ficha (P1d);
    - a obrigatoriedade sai da definição do campo e vai para a ligação com o tipo;
  - **seção 5.4:** o inventário de hardware sem os monitores, que viram ativos ligados ao computador.

  Verificar: o diff da spec mestre bate com as specs e o design desta change.

## 2. Domínio

- [x] 2.1 Escrever os testes e depois o motor de campos (decisão 2), para texto, texto longo, número inteiro, número decimal, moeda e data:
  - `TIPOS_DE_CAMPO`, com o rótulo de cada tipo;
  - `lerValor` e `mostrarValor`, cada tipo com uma tabela de casos que aceitam e que recusam, com as mensagens da spec:
    - os limites e as casas decimais;
    - o vazio como falta de valor;
    - a moeda de 0 a 9.999.999.999,99;
    - a data em dd/mm/aaaa, aaaa-mm-dd e o número de série do Excel, de 1900 a 2200 (o foco 4);
  - **a releitura:** ler o valor guardado dá o mesmo valor, conferido em todos os tipos.

  Verificar: os testes do `packages/domain` passam.
- [x] 2.2 Escrever os testes e depois o resto do motor de campos (decisões 2 e 3):
  - **listas:**
    - a lista e a lista múltipla, pelo rótulo sem diferenciar acento e maiúsculas (o foco 1) e pelo id;
    - a opção inativa recusada;
    - a lista múltipla sem repetir e na ordem das opções;
  - **referências:** pessoa, local e ativo, como identificadores;
  - **licença:** com a recusa da chave de produto em qualquer lugar do texto;
  - **URL:** só http e https;
  - **IP:** IPv4, e IPv6 na forma canônica, comprimido e em minúsculas;
  - **MAC:** com ":", "-", "." ou sem separador;
  - **`conferirConfiguracao`:**
    - os limites, com "O mínimo não pode passar do máximo.";
    - as casas de 0 a 6;
    - as opções, de 1 a 200, com rótulo único e um id cada;
    - nenhuma configuração nos outros tipos;
  - **`opcoesExcluidas(antes, depois)`:** as opções que sumiram da configuração nova.

  Verificar: os testes do `packages/domain` passam.
- [x] 2.3 Escrever os testes e depois o catálogo no domínio (decisões 4, 7 e 8):
  - **`ICONES_DE_TIPO`:** as chaves dos ícones;
  - **`CAPACIDADES`:** a `hardware.inventario`, com os oito campos da spec, e a consulta pela chave;
  - **as permissões:** `catalogo.administrar` e `modelos.editar`, com o catálogo conferido;
  - **as ações da auditoria do catálogo:** com o rótulo e o evento `catalogo.mudou`;
  - **o evento `catalogo.mudou`:** em `TIPOS_DE_EVENTO`, com o público de toda sessão;
  - **`conferirCamposDoTipo(atuais, pedidos, campos)`:**
    - sem campo repetido;
    - até 100 campos;
    - o campo novo precisa estar ativo, e o inativo que já estava no tipo fica (o foco 2).

  Verificar: os testes do `packages/domain` passam.

## 3. Banco

- [x] 3.1 Escrever os testes de integração e depois a migration do catálogo (decisão 1):
  - as tabelas `tipos_de_ativo`, `campos`, `campos_do_tipo` e `modelos`, com `orgScoped()` e `app.isolar_por_organizacao`;
  - as referências com o `org_id`: o tipo e o campo da ligação, e o tipo e a imagem do modelo;
  - os nomes únicos pela forma normalizada (o foco 1), e o modelo único pelo tipo, o fabricante e o nome;
  - as conferências do ícone, do tipo de campo, da escrita, da situação, dos tamanhos e da configuração como objeto de até 32 KB.

  Verificar:
  - o teste-guarda e o das chaves com `org_id` passam com as tabelas novas;
  - a referência a um tipo de outra organização é recusada pelo banco;
  - `pnpm test:integration` passa no `packages/db`.

## 4. API

- [x] 4.1 Tirar da foto da pessoa o fluxo comum das imagens dos registros (decisão 6):
  - `arquivos/imagem-do-registro.ts`, com `trocarImagem`, `tirarImagem`, `entregarImagem`, `gravarVariantes`, `apagarChaves` e `aceitarImagens`;
  - o registro dono entra por funções: a que confere e trava o dono, a que aponta a imagem e a que audita;
  - as rotas da foto passam a usá-lo, sem mudar o comportamento;
  - um teste do fluxo comum com um dono de teste, que cobre a limpeza das variantes quando a transação falha (o foco 6).

  Verificar: os testes de integração das fotos passam sem mudança, e `pnpm test:integration` passa no `apps/api`.
- [x] 4.2 Escrever os testes de integração e depois as rotas dos tipos e das capacidades (decisões 1, 4, 7, 8 e 10):
  - **leitura:**
    - `GET /capacidades` e `GET /tipos-de-ativo`, para qualquer sessão;
    - cada tipo com a lista de campos e `permite`;
  - **cadastro e edição:**
    - `POST /tipos-de-ativo` e `PATCH /tipos-de-ativo/:id`, com `catalogo.administrar`;
    - o nome repetido em 409, também com outro acento (o foco 1);
    - o ícone e a capacidade desconhecidos;
    - a lista de campos (o foco 2);
    - a gravação concorrente da lista (o foco 3);
  - **situação:** `inativacao` e `reativacao`;
  - **auditoria e evento:** cada mudança com o antes → depois, que leva os rótulos dos campos, e o evento `catalogo.mudou`;
  - **recusa:** a conta sem a permissão recusada com 403 e auditada.

  Verificar: `pnpm test:integration` passa no `apps/api`, e `pnpm contrato:verificar` está em dia depois do `pnpm contrato:gerar`.
- [x] 4.3 Escrever os testes de integração e depois as rotas dos campos (decisões 2, 3, 8 e 10):
  - **leitura:** `GET /campos`, com quantos tipos ativos usam cada campo;
  - **cadastro e edição:**
    - `POST /campos` e `PATCH /campos/:id`, sem mudar o tipo de campo;
    - a configuração conferida pelo domínio, em 400, com o motivo em cada parte;
    - o id dado a cada opção nova;
    - a opção excluída em 409, com "As opções não são excluídas: inative a opção.";
    - o rótulo repetido em 409 (o foco 1);
  - **situação:** a inativação, que tira o campo dos formulários e mantém as ligações, e a reativação (o foco 2);
  - **auditoria e evento:** com a configuração antes e depois.

  Verificar: `pnpm test:integration` passa no `apps/api`, e `pnpm contrato:verificar` está em dia.
- [x] 4.4 Escrever os testes de integração e depois as rotas dos modelos e da imagem (decisões 5, 6, 7, 8 e 10):
  - **leitura:**
    - `GET /modelos`, com o filtro de tipo e de situação, a busca e o cursor;
    - `GET /modelos/:id`;
    - `GET /modelos/fabricantes`;
  - **cadastro e edição:**
    - `POST /modelos`, com o tipo ativo ("O tipo Câmera está inativo.");
    - a grafia do fabricante do modelo mais antigo (o foco 5);
    - o modelo repetido em 409;
    - `PATCH /modelos/:id`, sem mudar o tipo;
  - **situação:** a inativação e a reativação;
  - **imagem:**
    - `PUT` e `DELETE /modelos/:id/imagem` pelo fluxo comum, e `GET` da imagem para qualquer sessão;
    - a imagem antiga em 404 depois da troca;
    - a limpeza quando a transação falha (o foco 6);
  - **auditoria e evento:** cada mudança, com `catalogo.mudou`.

  Verificar: `pnpm test:integration` passa no `apps/api`, e `pnpm contrato:verificar` está em dia.

## 5. UI

- [x] 5.1 Escrever os testes e depois a `EscolhaDeIcone` no `packages/ui`:
  - a grade dos ícones de tipo, com o nome de cada um, escolhida pelo teclado e pelo ponteiro;
  - um teste que reprova a chave de `ICONES_DE_TIPO` sem desenho em `iconesDeAtivo`;
  - as histórias, com os testes de interação e de acessibilidade.

  Verificar: `pnpm test:stories` e os testes do `packages/ui` passam, e `pnpm test:visual --atualizar` grava as referências novas.
- [x] 5.2 Escrever os testes e depois o `EditorDeOpcoes` no `packages/ui`:
  - incluir, renomear e mover as opções de uma lista;
  - inativar e reativar uma opção, com a situação em texto, sem a ação de excluir;
  - a recusa de cada opção no próprio campo;
  - as histórias, com os testes de interação e de acessibilidade.

  Verificar: `pnpm test:stories` e os testes do `packages/ui` passam, e `pnpm test:visual --atualizar` grava as referências novas.

## 6. Web

- [x] 6.1 Escrever os testes de componente e depois a tela e a ficha dos tipos (decisão 9):
  - **o módulo:** entra no registro com a janela do catálogo e a seção Tipos, entre o Início e a Administração, para quem tem `catalogo.administrar` ou `modelos.editar`;
  - **a lista:**
    - os tipos ativos pelo nome, com o ícone, o número de campos, as capacidades e a situação em texto;
    - o filtro de situação;
    - o estado vazio, com "Nenhum tipo de ativo ainda." e "Novo tipo";
  - **a ficha:**
    - o nome, a `EscolhaDeIcone` e as capacidades com a descrição;
    - os campos do tipo, para incluir, ordenar, tirar e marcar como obrigatórios;
    - os campos das capacidades ligadas, só para leitura;
    - inativar e reativar com confirmação;
    - os retornos e as recusas da API nos campos;
  - **só leitura:** sem `catalogo.administrar`.

  Verificar: os testes de componente passam.
- [x] 6.2 Escrever os testes de componente e depois a tela e a ficha dos campos (decisão 9):
  - **a lista:** o rótulo, o tipo de campo, o grupo, "usado por N tipos", a marca de restrito e a situação em texto;
  - **a ficha:**
    - o tipo de campo só na criação;
    - o grupo com as sugestões dos grupos já usados;
    - a configuração conforme o tipo, com o `EditorDeOpcoes` nas listas;
    - a marca de restrito e a política de escrita;
    - os tipos que usam o campo;
    - a inativação com a confirmação que diz de quantos tipos o campo sai;
  - **só leitura:** sem `catalogo.administrar`.

  Verificar: os testes de componente passam.
- [x] 6.3 Escrever os testes de componente e depois a tela e a ficha dos modelos (decisões 5, 6 e 9):
  - **a lista:**
    - a miniatura da imagem ou o ícone do tipo, o fabricante, o modelo, o tipo e a situação em texto;
    - os filtros de tipo e de situação no endereço e a busca;
    - "Carregar mais";
  - **a ficha:**
    - o tipo só na criação, entre os ativos;
    - o fabricante com as sugestões;
    - o nome;
    - a imagem pela `EscolhaDeImagem`, enviada logo depois do cadastro;
    - inativar e reativar;
  - **só leitura:** sem `modelos.editar`.

  Verificar: os testes de componente passam.
- [x] 6.4 Escrever os testes e depois o módulo Ativos completo no registro (decisão 9):
  - **a entrada:**
    - o menu Catálogo › Tipos, Campos e Modelos, com as três telas já ligadas;
    - logo depois do Início no celular;
  - **a busca:** as ações de cadastro, com a permissão de cada uma, e o provedor de modelos;
  - **os eventos:** `catalogo.mudou` invalida as consultas do catálogo;
  - **o contrato de módulo (`docs/casca/modulos.md`):** o menu em árvore com submenu, com o exemplo conferido pelo teste da documentação.

  Verificar: `registro.test.ts`, `documentacao.test.ts` e os testes da web passam.
- [x] 6.5 Estender a ponta a ponta com a API simulada:
  - o estado vazio;
  - o campo de lista com opções, o tipo com o campo e o inventário de hardware, e o modelo com o fabricante sugerido e a imagem;
  - a conta só com `modelos.editar`, que vê tipos e campos só para leitura;
  - o modelo pela busca.

  Verificar: `pnpm test:e2e` passa.
- [x] 6.6 Estender a ponta a ponta da pilha: com as duas contas em dois navegadores, o modelo cadastrado por uma aparece na tela de modelos aberta da outra, pelo evento `catalogo.mudou`. Verificar: `pnpm test:e2e:pilha` passa.

## 7. Fechamento

- [x] 7.1 Atualizar o `CLAUDE.md`, com o P1a nas referências, e conferir as verificações:
  - `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:stories`, `pnpm test:e2e`, `pnpm test:e2e:pilha` e `pnpm test:visual` verdes;
  - `pnpm tokens:verificar`, `pnpm marca:verificar`, `pnpm contrato:verificar` e `pnpm fila:verificar` em dia;
  - `openspec validate p1a-catalogo --strict` sem erros.

  Verificar: os comandos passam, e o CI fica verde no PR.
