## Why

O cadastro de um ativo é hoje um formulário longo numa tela só: os grupos de campos vêm um embaixo do outro, nada diz o que falta preencher, e o que foi digitado se perde se a página recarregar, a sessão cair ou a pessoa sair da tela. O usuário pediu um cadastro que guie, com as etapas empilhadas à esquerda e, à direita, a etapa escolhida com a imagem do produto e as informações ao lado, e que nunca perca o que já foi preenchido.

Esta change é a segunda das pedidas pelo usuário, em PRs separados e em sequência:
1. a cadastro-em-abas: o link embaixo do campo abre o outro cadastro numa aba da janela;
2. **esta:** o cadastro do ativo em etapas, com o rascunho guardado na conta;
3. a ficha do ativo no mesmo formato, com os grupos em cartões;
4. o guia de por onde começar;
5. o 3D do modelo no painel.

O desenho aprovado é o `grafite_novo_ativo_abas_e_etapas`, da conversa em que o usuário escolheu o estilo das abas: as etapas 1 · Tipo, 2 · Modelo, 3 · Identificação, 4 · Uso e 5 · Administrativo, cada uma com o que falta, o painel da etapa com a imagem e os campos ao lado, "Voltar" e "Continuar para …", e "Rascunho guardado agora".

A change pertence ao cadastro de ativos (P1b) e à seção 7.4 da spec mestre, que ganha o cadastro em etapas. Ela usa o catálogo (P1a), os campos do ativo e a imagem do modelo (P1d), e depende da cadastro-em-abas, que entra antes.

Ficam fora desta change:
- o 3D do modelo no painel, que ainda não existe no sistema (seções 5.2 e 7.9 da spec mestre) e entra num PR próprio; o painel mostra a imagem do modelo, ou o ícone do tipo, como a ficha;
- a ficha do ativo, que ganha o mesmo formato, com os grupos em cartões à esquerda e o grupo escolhido à direita, numa change logo depois desta, pelo desenho aprovado em 17/10; até lá, ela continua com os grupos na aba Dados;
- os outros cadastros, como o do local e o da pessoa, que continuam num formulário só;
- o rascunho dos cadastros abertos numa aba, que fecham com a aba.

## What Changes

- **Etapas no cadastro do ativo:** à esquerda, as etapas empilhadas na ordem da ficha: Tipo, Modelo, Identificação, Uso, um grupo por grupo de campos do tipo, um por capacidade ligada e Administrativo. Cada etapa diz, em texto, o que falta ou o que já tem.
  - À direita, o painel da etapa escolhida: a imagem do modelo, ou o ícone do tipo, e os campos da etapa ao lado.
  - "Voltar" e "Continuar para <próxima etapa>" andam pelas etapas, e a pessoa também escolhe qualquer etapa na lista.
  - Na última, "Cadastrar". Com algum campo obrigatório vazio, o cadastro abre a primeira etapa com o problema, com a recusa no campo.
- **Rascunho na conta:** o que foi preenchido fica guardado no servidor enquanto a pessoa digita, com "Rascunho guardado agora" à vista.
  - Recarregar a página, entrar por outro aparelho ou voltar no dia seguinte retoma o cadastro onde ele parou.
  - "Descartar o rascunho" recomeça, com confirmação. Cadastrar o ativo apaga o rascunho.
  - Abrir o Novo ativo por uma origem, como a ficha de um local, com um rascunho guardado pergunta se a pessoa continua o começado ou começa um novo.
  - A manutenção diária apaga o rascunho parado há mais de 30 dias.
- **API:** o rascunho do cadastro da conta, para ler, guardar e apagar, para quem edita ativos.
- **Biblioteca:** a lista das etapas de um formulário, com a etapa atual marcada pela forma e pelo texto, e não só pela cor.
- **Spec mestre:** a seção 7.4 ganha o cadastro em etapas.
- **Mapa:** o `docs/mapa.md` traz a change em andamento.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `cadastro-de-ativos`: o cadastro do ativo em etapas e o rascunho guardado na conta.
- `componentes-base`: a lista das etapas de um formulário.
- `fila-de-tarefas`: a manutenção diária apaga os rascunhos do cadastro parados há mais de 30 dias.

## Impact

- **Banco:** a tabela dos rascunhos do cadastro, por organização e por conta, com RLS.
- **API:** as rotas do rascunho, o contrato (OpenAPI e cliente tipado) e a manutenção diária.
- **Web:** o cadastro do ativo, com as etapas, o painel da etapa e o rascunho.
- **UI:** a lista das etapas, com as histórias e a captura.
- **Documentação:** a spec mestre (seção 7.4) e o mapa.
