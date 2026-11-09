## Why

Com o P1b e o P1c, a organização cadastra os ativos e trabalha neles pela tabela, mas a ficha ainda é a básica: os campos e a miniatura do modelo. Falta o que a TI usa para entender um equipamento: com o que ele está ligado (o monitor do computador e, mais adiante, o switch no rack e o equipamento na porta), o que mudou nele e quem mudou, uma foto do próprio equipamento quando a do modelo não basta, e os documentos dele, como a nota fiscal e o laudo.

O P1d · Ficha e relacionamentos é a quarta das seis changes do P1 (spec mestre, seção 3.2). Ele entrega a seção 5.2, decisão 3: os ativos se relacionam entre si, cada ficha leva aos registros ligados a ela, e a imagem é do modelo, que o ativo sobrescreve quando precisa. Entrega também os tipos de campo arquivo e imagem, que a seção 5.3 deixou para a ficha.

Ficam fora desta change: a importação (P1e); a etiqueta (P1f); as ligações com posição, como o rack U a U e a porta do switch (T2); o 3D do ativo (T1); as ordens de serviço e as solicitações ligadas ao ativo (P4); os alertas (P3); e ligar pelo lado de lá de um campo, porque a ligação por campo muda no ativo que tem o campo.

## What Changes

- **Spec mestre:** as decisões das ligações (os campos do tipo ativo, com os tipos aceitos e o nome do lado de lá, e a ligação livre "Ligado a"), da imagem própria do ativo e dos tipos arquivo e imagem (o que o arquivo aceita, o tamanho e o envio depois do cadastro).
- **O campo do tipo ativo** ganha configuração:
  - os tipos de ativo aceitos, e a escolha só oferece ativos desses tipos;
  - o nome do lado de lá, como "Monitores" para o campo "Computador" do monitor, que dá o título do grupo na ficha do computador.
- **A ligação livre "Ligado a":** entre dois ativos quaisquer, sem tipo nem sentido, para o que não tem campo. Quem edita os dois ativos liga e desliga na ficha, e a ligação aparece nas duas.
- **A ficha completa,** com o cabeçalho e três abas:
  - **Dados:** o formulário de hoje;
  - **Ligados:** os ativos que apontam para este pelos campos deles, num grupo por campo, e os ligados pela ligação livre;
  - **Histórico:** as mudanças do ativo, da mais nova para a mais antiga, com quem, quando e o antes → depois, para quem vê o ativo, e os valores restritos só para quem vê os restritos.
- **A imagem própria do ativo:** enviada, trocada e removida na ficha. Ela vale no lugar da imagem do modelo na ficha, na tabela, na prévia e nas listas de ligados.
- **Os tipos de campo arquivo e imagem:**
  - o arquivo aceita PDF, imagens, documentos e planilhas do Office e do LibreOffice, texto, CSV e ZIP, com o tipo conferido pelo conteúdo, até 25 MB, e é entregue sempre como anexo;
  - a imagem segue as imagens da spec arquivos-e-imagens;
  - um arquivo por campo, enviado na ficha depois do cadastro; um campo de arquivo ou de imagem não pode ser obrigatório no tipo;
  - na tabela, o nome do arquivo e a miniatura da imagem, com os filtros "Está vazio" e "Está preenchido".
- **Auditoria e eventos:** a troca e a remoção da imagem do ativo e dos arquivos dos campos, e as ligações livres feitas e desfeitas, no histórico dos dois ativos; o `ativos.mudaram` avisa as telas abertas dos dois.

## Capabilities

### New Capabilities

- `ligacoes-de-ativos`: os ativos ligados entre si: pelos campos do tipo ativo, com os tipos aceitos e o lado de lá, e pela ligação livre "Ligado a", com as permissões, os limites, a auditoria e a aba Ligados da ficha.

### Modified Capabilities

- `cadastro-de-ativos`: a ficha completa, com as abas Dados, Ligados e Histórico; o histórico do ativo; a imagem própria, que substitui a do modelo na tabela, na ficha e na prévia; os campos de arquivo e de imagem no formulário e na tabela.
- `campos-personalizados`: os tipos arquivo e imagem, com a leitura e as recusas; a configuração do tipo ativo, com os tipos aceitos e o nome do lado de lá.
- `catalogo-de-ativos`: um campo de arquivo ou de imagem não pode ser obrigatório no tipo, e a tela do campo configura o tipo ativo.
- `arquivos-e-imagens`: os documentos aceitos no campo de arquivo, com o limite e as recusas, e a entrega deles como anexo, só a quem pode ver o ativo e o campo.
- `auditoria`: os eventos dos ativos ganham a imagem do ativo, os arquivos dos campos e as ligações livres.
- `consulta-da-auditoria`: a ficha do ativo também leva à auditoria filtrada por ele, para quem tem `auditoria.ver`.

## Impact

- **`packages/domain`:** os tipos de campo arquivo e imagem no motor de campos, a configuração do tipo ativo, as colunas novas da tabela dos ativos, as ações novas da auditoria e as regras da ligação livre.
- **`packages/db`:** a migration com a tabela das ligações livres, isolada pela organização, e a imagem própria na tabela dos ativos.
- **`apps/api`:**
  - a imagem do ativo e os arquivos dos campos: o envio, a troca, a remoção e a entrega;
  - as ligações livres: listar, ligar e desligar;
  - o histórico do ativo, a partir da auditoria, com os restritos protegidos;
  - a ficha e a lista com a imagem do ativo, os ligados e os nomes dos arquivos;
  - o contrato da API e o cliente gerado.
- **`packages/ui`:** o envio de arquivo, com o nome, o tamanho e "Baixar", e o que a ficha precisar para as abas, o histórico e as listas de ligados, com as histórias no catálogo.
- **`apps/web`:** a ficha completa com as abas, a imagem do ativo, os campos de arquivo e de imagem, a configuração do campo do tipo ativo no catálogo, as colunas e a prévia com a imagem do ativo.
- **Dependências:** nenhuma nova. O tipo dos documentos é conferido pelo conteúdo com o que o projeto já usa para as imagens, ou por uma leitura própria dos primeiros bytes.
- **Documentação:** a spec mestre e o mapa (`docs/mapa.md`), com a capacidade nova e os termos novos.
