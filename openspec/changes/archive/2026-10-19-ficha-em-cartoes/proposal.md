## Why

Na aba Dados da ficha do ativo, os grupos de campos ficam um embaixo do outro, abaixo dos blocos da disponibilidade, dos suprimentos, do Control iD, dos alertas e dos segredos. Achar um campo pede rolar a tela inteira, e nada diz, sem abrir o grupo, o que ele tem ou o que falta.

O cadastro do ativo já é feito em etapas (change cadastro-em-etapas, #59). O usuário aprovou em 17/10 o mesmo formato para a ficha, com "Gostei", no desenho da aba "Ficha do ativo" da página dos desenhos, fora do repositório:
- à esquerda, um cartão por grupo, com o resumo do que tem;
- à direita, o grupo escolhido, com a imagem e os campos ao lado.

Esta change é a terceira da sequência pedida, em PRs separados e em sequência:
1. cadastro-em-abas (#58);
2. cadastro-em-etapas (#59);
3. **esta:** a ficha em cartões;
4. o guia de por onde começar;
5. o 3D do modelo no painel.

A change pertence à ficha do ativo (P1b e P1d) e à seção 7.4 da spec mestre.

Ficam fora desta change:
- o cabeçalho da ficha, a linha das relações e as abas Ligados e Histórico, que não mudam;
- o 3D do modelo, que entra num PR próprio no lugar da imagem;
- as fichas da pessoa, do local, do modelo e do tipo, que continuam como estão.

## What Changes

- **Cartões na aba Dados:** à esquerda, um cartão por grupo, na ordem da ficha:
  - "Visão geral", com os alertas, os outros blocos que os módulos mostram na ficha e os segredos;
  - Identificação, com o tipo, só para leitura, e o modelo;
  - Uso;
  - os grupos dos campos do tipo, e "Outros";
  - um cartão por capacidade ligada, com o painel dela, como o da disponibilidade, o dos suprimentos e o do Control iD, e os campos dela;
  - Administrativo.
- **Resumo de cada cartão, em texto:**
  - a Visão geral junta o resumo dos blocos dos módulos, como "1 alerta aberto"; sem nada para ver, ela diz "Nada pede atenção";
  - a capacidade diz a situação do painel dela, como "Offline" ou "18% · Black Toner Cartridge", como na coluna da tabela;
  - os outros dizem os valores dos dois primeiros campos preenchidos, como "Em uso · Expedição";
  - um obrigatório vazio aparece como "Falta: IP".
- **Painel do cartão:** à direita, o cartão escolhido, com a imagem do ativo, ou a do modelo, ou o ícone do tipo, e "Trocar imagem" para quem edita, e os campos ao lado, cada um com o estado e a trava.
- **Salvar:** "Salvar alterações" grava o que mudou em qualquer cartão.
  - O pé da coluna diz "Nenhuma alteração" ou quantas alterações não foram salvas.
  - Uma recusa abre o cartão do campo, com o foco nele.
- **Endereço:** o cartão aberto fica no endereço, como a aba, e recarregar a página volta nele.
- **Contrato de módulo:** a relação que um módulo mostra na ficha de outro pode dar um resumo de uma linha para o cartão da Visão geral; a dos alertas dá "N alertas abertos".
- **Biblioteca:** a lista das etapas ganha a variante sem a numeração, para os cartões da ficha, com o cartão aberto anunciado como o atual da lista.
- **Spec mestre:** a seção 7.4 ganha a ficha em cartões.
- **Mapa:** o `docs/mapa.md` traz a change em andamento.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `cadastro-de-ativos`: a aba Dados da ficha em cartões, com o resumo de cada um, o painel do cartão aberto com a imagem e "Trocar imagem", o salvar de todos os cartões e o cartão no endereço; os segredos dentro da Visão geral.
- `modulo-alertas`: o bloco Alertas dentro da Visão geral da ficha, e o resumo dele no cartão.
- `componentes-base`: a variante da lista das etapas sem a numeração.

## Impact

- **Web:**
  - a ficha do ativo, na aba Dados, com o formulário da ficha dividido em cartões;
  - o resumo de cada grupo, numa função pura;
  - o contrato das relações dos módulos e a relação dos alertas.
- **UI:** a lista das etapas, só a especificação da variante sem a numeração, que já existe no componente, com as histórias e a captura dela.
- **API e banco:** nada muda.
- **Documentação:** o contrato de módulo (`docs/casca/modulos.md`), a spec mestre (seção 7.4) e o mapa.
