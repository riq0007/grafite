## Why

Quem cadastra um ativo hoje não sabe por onde começar, e o cadastro anda desconectado. Quando um campo precisa de algo que ainda não existe, como o local, o responsável, o tipo ou o modelo, é preciso sair do cadastro do ativo, ir ao módulo do outro cadastro, criar o registro lá e voltar. A casca mostra uma tela por vez, então a troca descarta o formulário do ativo, e tudo o que já tinha sido preenchido se perde.

Esta change é a primeira de três pedidas pelo usuário, em PRs separados e em sequência:
1. **esta:** o link embaixo do campo abre o outro cadastro numa aba da janela, sem fechar a aba de onde veio, e volta com o registro escolhido no campo;
2. o cadastro do ativo em etapas: as etapas empilhadas à esquerda e o painel da etapa à direita, com a imagem do modelo e as informações ao lado, e o rascunho que continua depois de recarregar a página;
3. o guia de por onde começar.

A change pertence à casca (F1, seção 7.4 da spec mestre, que ganha as abas de cadastro) e ao cadastro de ativos (P1b), e usa os cadastros do catálogo (P1a), dos locais e das pessoas (F2b).

Ficam fora desta change:
- abrir qualquer tela numa aba, como no navegador: as abas são só dos cadastros que um campo pede;
- o rascunho que continua depois de recarregar a página, que é da change das etapas;
- o fabricante, que é digitado no modelo com as sugestões dos já usados e não tem cadastro próprio;
- o 3D do modelo, que ainda não existe no sistema (seções 7.9 e 8 da spec mestre) e entra num PR próprio, depois das etapas.

## What Changes

- **Abas na janela:** a janela da casca passa a ter abas quando um campo abre um cadastro. A primeira aba é a tela em que a pessoa estava; as outras são os cadastros abertos pelos campos.
  - A barra de abas só aparece com mais de uma aba.
  - Trocar de aba não descarta nada: a aba de antes continua aberta por baixo.
  - Fechar uma aba com dados preenchidos pede confirmação.
  - Escolher um módulo no dock, na busca ou num menu leva à primeira aba.
- **Link embaixo do campo:** "Cadastrar novo local", "Cadastrar nova pessoa", "Cadastrar novo tipo" e "Cadastrar novo modelo", só para quem pode criar aquele cadastro.
  - Ao salvar, a aba do cadastro fecha, a pessoa volta para a aba de onde veio, e o campo já vem com o registro criado.
  - Cancelar só fecha a aba.
  - Uma aba de cadastro pode abrir outra: a Nova pessoa abre o Novo local pelo campo Local de trabalho dela.
- **Os cadastros que abrem numa aba:** Novo local, Nova pessoa, Novo tipo e Novo modelo continuam nas telas de hoje e passam a abrir também numa aba, pelo mesmo formulário.
- **Os campos que ganham o link:** no cadastro e na ficha do ativo, o Tipo, o Modelo, o Local, o Responsável e os campos de pessoa e de local dos tipos; no modelo do catálogo, o Tipo; na pessoa, o Local de trabalho. O Novo modelo pedido pelo ativo vem com o tipo dele, que não muda. Sem nenhum tipo ainda, o cadastro do ativo abre o Novo tipo numa aba, em vez de levar ao catálogo.
- **Contrato de módulo:** cada módulo declara, no registro, os cadastros dele que abrem numa aba, com as permissões, e um campo de outro módulo pede o cadastro pelo que ele cria.
- **Spec mestre:** a seção 7.4 ganha as abas de cadastro.
- **Mapa:** o `docs/mapa.md` traz a change em andamento.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `estrutura-da-casca`: o registro de módulos declara os cadastros que abrem numa aba; a janela de conteúdo ganha as abas de cadastro.
- `componentes-base`: a barra de abas da janela e o link de cadastro embaixo do campo.
- `cadastro-de-ativos`: os campos do ativo que pedem outro cadastro mostram o link, e o cadastro sem tipos abre o Novo tipo numa aba.
- `catalogo-de-ativos`: o Novo tipo e o Novo modelo abrem numa aba, e o campo Tipo do modelo mostra o link.
- `locais`: o Novo local abre numa aba.
- `administracao-de-pessoas`: a Nova pessoa abre numa aba.

## Impact

- **Web:** a casca do app (as abas da janela e o registro dos cadastros), o cadastro e a ficha do ativo, o cadastro do modelo, e os formulários do local, da pessoa, do tipo e do modelo, que passam a servir à tela e à aba.
- **UI:** a barra de abas da janela e o link de cadastro do campo, com as histórias e as capturas.
- **API e banco:** nada muda; os cadastros usam as rotas de hoje.
- **Documentação:** a spec mestre (seção 7.4), o contrato de módulo (`docs/casca/modulos.md`) e o mapa.
