## Why

Depois do F2b, a administração funciona, mas a plataforma ainda é a do F1:
- as preferências ficam no navegador, então mudar de computador ou de navegador perde a personalização, e a organização não tem como definir os próprios padrões;
- não há como guardar arquivos, e a pessoa não tem foto;
- uma tela só vê o que outra pessoa mudou quando volta o foco ou recebe uma recusa, e uma mudança de permissão ou uma sessão encerrada só chegam na requisição seguinte;
- não há tarefas em segundo plano, e nada fica pronto para os alertas, os e-mails e os backups da fase 2.

A spec mestre pede:
- a personalização que acompanha o usuário em qualquer dispositivo (seção 2.3);
- os padrões da organização (seção 7.2);
- as imagens tratadas no servidor (seção 7.9);
- a escrita com evento de saída e o tempo real (seções 6.3 e 6.6);
- a fila no próprio Postgres (seção 4.2).

Esta change implementa a **terceira parte do subprojeto F2 · Núcleo** da spec mestre (`docs/superpowers/specs/2026-09-24-grafite-design.md`, seções 3.3, 4.2, 5.2, 6.3, 6.6, 6.7, 7.2, 7.9, 9 e 10): **F2c · Plataforma**. O F2 tem quatro changes, nesta ordem:
1. F2a · Contas e acesso (arquivado);
2. F2b · Permissões e locais (arquivado);
3. **F2c · Plataforma** (esta);
4. F2d · Operação.

## What Changes

- **Preferências no servidor**
  - As preferências de interface passam a ser gravadas no servidor, na conta, e acompanham a pessoa em qualquer navegador.
  - **Padrões da organização:** quem tem a permissão nova define os padrões da organização. Eles valem para quem não mudou aquele ajuste. A resolução é campo a campo: fábrica, depois a organização, depois a conta.
  - "Restaurar padrões" volta a seção aos padrões da organização.
  - O navegador guarda uma cópia para a primeira pintura e para quando o servidor não responde. A mudança feita sem servidor vale na hora e é enviada quando ele volta.
  - Sem sessão, a interface usa os padrões da organização.
  - Na primeira entrada depois do F2c, as preferências que o navegador já tinha passam para a conta.
  - Uma mudança feita em outro dispositivo chega pela conexão de eventos.
- **Arquivos e imagens**
  - Os arquivos passam por uma interface de armazenamento: em disco agora, trocável por S3 depois.
  - O envio de imagens aceita PNG, JPG, WebP, AVIF e SVG:
    - o tipo é conferido pelo conteúdo;
    - o SVG é sanitizado;
    - a imagem é regravada sem metadados nem localização;
    - saem as miniaturas de 64, 128, 256 e 512 px.
  - A entrega usa o tipo certo e só vai para quem pode ver o registro dono do arquivo.
  - O arquivo trocado ou removido deixa de ser entregue na hora e é apagado na manutenção seguinte.
  - **Foto da pessoa:**
    - quem edita pessoas troca e remove a foto na ficha, e cada um troca a própria nos Ajustes;
    - a foto aparece na ficha, na lista de pessoas e no menu do usuário;
    - a anonimização apaga a foto.
- **Eventos em tempo real**
  - Toda mudança gravada também grava um evento de saída na mesma transação, e o banco avisa a API depois do commit.
  - A tela recebe os eventos por uma conexão SSE, retoma de onde parou e atualiza sozinha as listas e as fichas que mudaram.
  - Cada conexão só recebe o que a conta pode ver.
  - Uma mudança de permissão vale na tela na hora, sem esperar uma ação, e uma sessão encerrada em outro lugar volta à tela de entrada.
  - A conexão de eventos não conta como uso da sessão.
- **Fila de tarefas**
  - O pg-boss roda no próprio Postgres, com o esquema criado pelas migrations.
  - Cada tarefa tenta de novo com intervalos crescentes. A que continua falhando fica na lista "Tarefas com falha" da Administração, com "Tentar de novo".
  - Uma manutenção diária roda em cada organização. Ela apaga os eventos com mais de 24 h e os arquivos removidos.
- **Administração:** as seções novas Padrões e Tarefas, cada uma com a sua permissão.
- **Permissões:** `organizacao.editar` para os padrões da organização, e `tarefas.administrar` para as tarefas com falha.
- **Contrato de módulo:** o módulo declara quais consultas cada tipo de evento atualiza.
- **Componentes base:** o avatar com a foto e a escolha de imagem, com o envio e a remoção.
- **Imagem de contêiner:** a aplicação com o tratamento de imagens e os arquivos num volume.
- **Spec mestre**
  - **Seções 3.2 e 3.3:** o F2c sai sem o nível do perfil nas preferências, que vai para o A1.
  - **Seção 4.4:** ligar e desligar módulos por organização vai para o P1.
  - **Seção 5.2:**
    - as preferências pessoais ficam fora da auditoria, e os padrões da organização, dentro;
    - a foto trocada ou removida é apagada, como as credenciais.
  - **Seção 6.7:** a retenção dos eventos de saída e dos arquivos removidos.
  - **Seção 9.4:**
    - a fila de tarefas e o aviso de eventos ficam fora das organizações e levam só identificadores;
    - a lista dos identificadores das organizações, que a manutenção usa, é a segunda consulta que atravessa organizações.
  - **Seção 9.8:** as fotos entregues com o tipo certo, e o SVG com a política que bloqueia scripts.

**Fora desta change:**
- **O nível do perfil nas preferências:** vai para o A1 (portal do colaborador), quando o perfil Solicitante precisar de padrões próprios. O modelo de dados deixa espaço para ele.
- **Ligar e desligar módulos por organização:** vai para o P1, junto do primeiro módulo opcional (Ativos). Hoje todos os módulos são da casca.
- **Visões de tabela salvas e compartilhadas:** vão para o P1, com a tabela que configura colunas.
- **O logo e as cores da organização:** ficam para depois do F2.
- **Notificações gravadas no servidor, e-mail e push:** ficam para o P3, sobre a mesma fila e os mesmos eventos.
- **Uma só conexão de eventos para todas as abas:** fica para o P3, que já precisa de uma aba líder para o toast. Até lá:
  - cada aba visível abre a sua;
  - uma aba escondida por mais de 5 min fecha a conexão e retoma quando volta;
  - com HTTPS (F2d), o HTTP/2 tira o limite de conexões por endereço.
- **F2d · Operação:** ambientes, serviços do Windows, HTTPS interno e backup, inclusive o dos arquivos.

## Capabilities

### New Capabilities
- `arquivos-e-imagens`: a interface de armazenamento, o envio e o tratamento das imagens, as miniaturas, a entrega com o tipo certo e a remoção.
- `eventos-em-tempo-real`: o evento de saída gravado com a mudança, o aviso depois do commit, a conexão SSE que retoma, o filtro pelo acesso de cada conta e a atualização das telas.
- `fila-de-tarefas`: as tarefas em segundo plano, as tentativas, a manutenção de cada organização e as tarefas com falha.

### Modified Capabilities
- `preferencias-da-interface`:
  - as preferências gravadas no servidor, na conta;
  - os padrões da organização e a resolução campo a campo;
  - a cópia no navegador;
  - a passagem das preferências do navegador para a conta.
- `ajustes-do-sistema`: "Restaurar padrões" volta aos padrões da organização, as mudanças ficam gravadas na conta, e a seção Conta ganha a foto.
- `administracao-de-pessoas`: a foto da pessoa, e a anonimização apaga a foto.
- `modulo-administracao`: as seções Padrões e Tarefas, e a foto na ficha e na lista de pessoas.
- `permissoes`: as permissões `organizacao.editar` e `tarefas.administrar` no catálogo, e a mudança de acesso que chega à tela sem esperar uma ação.
- `entrada-e-sessoes`:
  - o estado da sessão traz a foto e as preferências;
  - a conexão de eventos não conta como uso da sessão;
  - uma sessão encerrada em outro lugar termina na tela na hora.
- `estrutura-da-casca`: o menu do usuário com a foto, e o módulo que declara as consultas que cada evento atualiza.
- `auditoria`: os padrões da organização, a foto da pessoa e as tarefas repetidas registrados.
- `isolamento-organizacoes`:
  - a fila e o aviso de eventos como infraestrutura que leva só identificadores, com o trabalho de cada tarefa no contexto da organização dela;
  - a lista das organizações para a manutenção.
- `plataforma-base`: a pasta dos arquivos na configuração validada na partida, a saúde da fila e dos eventos, e os arquivos num volume da imagem de contêiner.
- `componentes-base`: o avatar com a foto e a escolha de imagem.

## Impact

- **Banco (`packages/db`):**
  - as preferências na organização e na conta;
  - as tabelas `arquivos`, `eventos` e `tarefas_com_falha`, com RLS forçado;
  - a foto na pessoa;
  - o gatilho que avisa os eventos;
  - a função que lista os identificadores das organizações;
  - o esquema do pg-boss gerado da versão fixada, com as permissões do papel da aplicação.
- **Domínio (`packages/domain`):**
  - o modelo das preferências, com a validação e a resolução campo a campo, para a API e a web;
  - as permissões novas no catálogo;
  - os tipos de evento e as ações novas da auditoria.
- **API (`apps/api`):**
  - as rotas das preferências da conta e da organização, das fotos e da conexão de eventos;
  - as rotas das tarefas com falha;
  - o canal que ouve o banco, a fila e a manutenção;
  - a configuração da pasta dos arquivos;
  - o contrato regenerado.
- **Web (`apps/web`):**
  - as preferências sincronizadas com o servidor, por trás do mesmo `usePreferencias()`;
  - a conexão de eventos e a atualização das consultas;
  - as seções Padrões e Tarefas;
  - a foto na ficha, na lista, nos Ajustes e no menu do usuário.
- **UI (`packages/ui`):** o avatar com a foto e a escolha de imagem.
- **Dependências na API:** `pg-boss`, `sharp`, `dompurify` e `jsdom`.
- **Imagem de contêiner:** o volume dos arquivos.
- **Documentação:**
  - `docs/casca/modulos.md`, com os eventos no contrato de módulo e as preferências no servidor;
  - `CLAUDE.md`, com a change em andamento e as variáveis novas;
  - a spec mestre, nas seções 3.2, 3.3, 4.4, 5.2, 6.7, 9.4 e 9.8.
- **PMG:** nenhum impacto. As fotos dos colaboradores do PMG, se houver, chegam na migração (P8).
