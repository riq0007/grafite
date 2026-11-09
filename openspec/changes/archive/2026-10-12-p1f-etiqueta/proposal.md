## Why

Com o P1a ao P1e, a organização cadastra, cuida e importa os ativos, mas o equipamento na mesa ainda não diz qual registro ele é: quem vai atender um chamado ou conferir o inventário procura o patrimônio na lista, à mão. O PMG imprimia a etiqueta com o patrimônio; o Grafite põe nela um QR code que abre a ficha do ativo pelo celular, sem digitar nada.

O P1f · Etiqueta é a última das seis changes do P1 (spec mestre, seção 3.2): a etiqueta com QR code, uma ou várias de uma vez, para imprimir. O QR leva o id do ativo, um UUIDv7 que não permite adivinhar os outros, e abrir o link continua exigindo a entrada (spec mestre, seção 5.2, decisão 10).

Ficam fora desta change: a ficha resumida e o "abrir chamado" pelo QR, do portal do colaborador (A1); outros conteúdos na etiqueta, escolhidos pela organização; o código de barras; e a impressão direta numa impressora de etiquetas pela rede, sem o diálogo de impressão do navegador.

## What Changes

- **Spec mestre:** a seção 3.2 detalha o P1f, com o conteúdo da etiqueta e os formatos.
- **A etiqueta do ativo:** o QR code com o endereço da ficha, o patrimônio, o nome do ativo e o nome da organização, em preto sobre branco em qualquer tema.
- **A tela das etiquetas:** os ativos escolhidos, até 200 de uma vez; o formato, entre a folha A4 de 21 etiquetas de 63,5 × 38,1 mm e a impressora de etiquetas, uma por página, de 50 × 30 mm; a etiqueta onde começar na folha já usada em parte; a prévia; e "Imprimir", pelo diálogo de impressão do navegador, que imprime só as etiquetas, no tamanho do formato.
- **De onde se imprime:** "Imprimir etiquetas" na seleção da tabela dos ativos e no menu de contexto das linhas, e "Imprimir etiqueta" na ficha, para quem vê os ativos.
- **API:** a leitura dos ativos das etiquetas pelos ids, só os que a conta vê, na ordem pedida, com quantos ficaram de fora.

## Capabilities

### New Capabilities

- `etiquetas-de-ativos`: a etiqueta do ativo, com o QR code da ficha e o conteúdo dela; o link do QR, que exige a entrada; e a tela das etiquetas, com os formatos, a etiqueta onde começar, a prévia e a impressão de uma ou de várias.

### Modified Capabilities

- `cadastro-de-ativos`: "Imprimir etiquetas" no menu de contexto e na seleção da tabela dos ativos, e "Imprimir etiqueta" na ficha.
- `componentes-base`: a etiqueta do ativo entra na biblioteca, impressa em preto sobre branco em qualquer tema, como o código QR.

## Impact

- **`packages/ui`:** as cores fixas da impressão nos tokens e o componente da etiqueta, com as histórias no catálogo.
- **`apps/api`:** a rota dos ativos das etiquetas e o contrato da API.
- **`apps/web`:** a tela das etiquetas, com a prévia e a impressão, e as ações na tabela e na ficha.
- **Dependências:** nenhuma nova; o QR code é o `CodigoQR`, que já existe.
- **Documentação:** a spec mestre e o mapa (`docs/mapa.md`), com a capacidade nova e os termos novos.
