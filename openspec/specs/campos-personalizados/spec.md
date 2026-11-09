# campos-personalizados Specification

## Purpose
Ler, conferir, guardar e mostrar os valores dos campos dos ativos com as mesmas regras na API, nas telas e na importação, em pt-BR, para cada tipo de campo.

## Requirements

### Requirement: Tipos de campo

Um campo SHALL ter um destes tipos:
- texto;
- texto longo;
- número inteiro;
- número decimal;
- moeda;
- data;
- lista e lista múltipla;
- pessoa, local, ativo e fornecedor;
- licença;
- URL;
- IP;
- MAC;
- arquivo e imagem.

Para cada tipo, as mesmas regras SHALL valer na API, nas telas e na importação:
- ler o valor digitado ou vindo de uma planilha;
- conferir o valor;
- guardar o valor numa forma única;
- mostrar o valor.

O arquivo e a imagem SHALL ser enviados pela ficha do ativo (spec cadastro-de-ativos), e SHALL NOT ser digitados, gravados como um valor comum nem importados.

Ler de novo um valor já guardado SHALL dar o mesmo valor.

#### Scenario: Mesma regra na tela e na API
- **WHEN** alguém digita "31/02/2026" num campo de data
- **THEN** a tela recusa com "Data inválida: use dd/mm/aaaa.", e a API recusa o mesmo valor com a mesma mensagem

#### Scenario: Valor guardado lido de novo
- **WHEN** o valor "R$ 1.234,56" de um campo de moeda é guardado e depois lido de novo
- **THEN** o valor continua o mesmo

#### Scenario: Arquivo gravado como valor comum
- **WHEN** a gravação de um ativo traz um valor para o campo de arquivo "PDF da nota fiscal"
- **THEN** a gravação é recusada com "Envie o arquivo pela ficha do ativo.", no campo PDF da nota fiscal

#### Scenario: Campo da organização do tipo fornecedor
- **WHEN** quem administra o catálogo cria o campo "Assistência técnica", do tipo fornecedor, e o liga ao tipo Impressora
- **THEN** a ficha da impressora escolhe a assistência entre os fornecedores ativos e mostra o nome atual dele

### Requirement: Leitura dos valores

Cada tipo de campo SHALL ler os valores assim:

| Tipo | Aceita | Guarda | Mostra |
|---|---|---|---|
| Texto | até 200 caracteres | o texto, sem espaços nas pontas | o texto |
| Texto longo | até 5.000 caracteres | o texto, sem espaços nas pontas | o texto |
| Número inteiro | "1024", "1.024" ou o número, com até 15 algarismos | o número | "1.024" |
| Número decimal | "3,5", "1.234,56" ou o número, com até 15 algarismos | o número, sem arredondar | "1.234,56" |
| Moeda | "R$ 1.234,56", "1234,56" ou o número, de 0 a 9.999.999.999,99 | o número, com até duas casas | "R$ 1.234,56" |
| Data | dd/mm/aaaa, aaaa-mm-dd ou o número de série do Excel, de 1900 a 2200 | aaaa-mm-dd | dd/mm/aaaa |
| Lista | a opção pelo rótulo, sem diferenciar acento e maiúsculas, ou pelo identificador | o identificador da opção | o rótulo da opção, com "(inativa)" quando ela está inativa |
| Lista múltipla | as opções separadas por ";", ou a lista delas | os identificadores, sem repetir, na ordem das opções | os rótulos separados por ", " |
| Pessoa, local, ativo e fornecedor | o identificador de um registro da organização | o identificador | o nome do registro |
| Licença | a edição e a modalidade, até 200 caracteres | o texto | o texto |
| URL | endereços http e https, até 2.000 caracteres | o endereço | o endereço |
| IP | IPv4 e IPv6 | a forma canônica | a forma canônica |
| MAC | com ":", "-" ou "." entre os grupos, ou sem separador | AA:BB:CC:DD:EE:FF | AA:BB:CC:DD:EE:FF |
| Arquivo | o arquivo enviado pela ficha (spec arquivos-e-imagens) | o identificador do arquivo | o nome do arquivo, com o tamanho |
| Imagem | a imagem enviada pela ficha (spec arquivos-e-imagens) | o identificador da imagem | a miniatura da imagem |

O valor vazio SHALL ser guardado como a falta do valor, e nunca como zero ou texto vazio.

Quem confere se a pessoa, o local, o ativo ou o fornecedor existem na organização SHALL ser a API.

Os números SHALL respeitar os limites e as casas decimais da configuração do campo. O número com mais casas que as da configuração SHALL ser recusado, e nunca arredondado.

Num texto, a vírgula SHALL ser a separação das casas decimais, e o ponto, a dos milhares. Sem vírgula, o ponto seguido de três algarismos SHALL ser lido como separação de milhares, e o seguido de outra quantidade, como separação decimal: "1.024" é mil e vinte e quatro, e "1.5" é um e meio.

#### Scenario: Data do Excel
- **WHEN** uma planilha traz a data como o número de série 45658
- **THEN** o valor guardado é 2025-01-01, e a tela mostra 01/01/2025

#### Scenario: Opção sem acento
- **WHEN** um campo de lista tem a opção "Alugado" e alguém informa "alugado"
- **THEN** o valor guardado é o identificador da opção "Alugado"

#### Scenario: MAC com hífen
- **WHEN** alguém informa o MAC "aa-bb-cc-dd-ee-ff"
- **THEN** o valor guardado é AA:BB:CC:DD:EE:FF

#### Scenario: Campo deixado em branco
- **WHEN** alguém apaga o valor de um campo de número inteiro
- **THEN** o campo fica sem valor, e não com zero

#### Scenario: Arquivo mostrado
- **WHEN** o campo "PDF da nota fiscal" de um notebook guarda o arquivo "nota-fiscal-1234.pdf", de 240 KB
- **THEN** a ficha e a tabela mostram "nota-fiscal-1234.pdf", e a ficha mostra também o tamanho

### Requirement: Recusa que diz o que fazer

Um valor que não pode ser lido SHALL ser recusado com uma mensagem em pt-BR que diz o que fazer:

| Tipo | Mensagem |
|---|---|
| Texto e texto longo | "Use até 200 caracteres." ou "Use até 5.000 caracteres." |
| Número inteiro | "Use um número inteiro, como 1.024." |
| Número decimal | "Use um número, como 3,5." |
| Números fora dos limites | "Use um número de 1 a 64.", "Use um número a partir de 1." ou "Use um número até 64." |
| Números com mais de 15 algarismos | "Use até 15 algarismos." |
| Casas a mais | "Use até 2 casas decimais." |
| Moeda | "Use um valor em reais, como R$ 1.234,56." ou "Use um valor de R$ 0,00 a R$ 9.999.999.999,99." |
| Data | "Data inválida: use dd/mm/aaaa." ou "Use uma data entre 1900 e 2200." |
| Lista | "Escolha uma das opções: Próprio, Alugado.", com até 10 opções; com mais, "Escolha uma das opções do campo." |
| Opção inativa | "A opção Comodato está inativa." |
| Pessoa, local e ativo | "Escolha uma pessoa da lista.", "Escolha um local da lista." ou "Escolha um ativo da lista." |
| Licença com a chave de produto | "A chave de produto não fica no cadastro: guarde-a no cofre." |
| URL | "Use um endereço que comece com http:// ou https://." ou "Use até 2.000 caracteres." |
| IP | "Use um IP, como 192.168.0.10." |
| MAC | "Use um MAC, como AA:BB:CC:DD:EE:FF." |
| Arquivo e imagem gravados como valor comum | "Envie o arquivo pela ficha do ativo." |

A licença SHALL recusar o texto que traz uma chave de produto, em cinco blocos de cinco letras ou números, em qualquer lugar do texto.

#### Scenario: Chave de produto na licença
- **WHEN** alguém informa "Windows 11 Pro OEM ABCDE-12345-FGHIJ-67890-KLMNO" na licença do Windows
- **THEN** o valor é recusado com "A chave de produto não fica no cadastro: guarde-a no cofre."

#### Scenario: Número fora dos limites
- **WHEN** um campo de número inteiro aceita de 1 a 64 e alguém informa 128
- **THEN** o valor é recusado com "Use um número de 1 a 64."

### Requirement: Configuração de cada tipo de campo

A configuração de um campo SHALL depender do tipo dele:
- **números inteiros e decimais:** o mínimo e o máximo, opcionais, com o mínimo até o máximo;
- **números decimais:** as casas decimais, de 0 a 6, e 2 sem configuração;
- **listas:**
  - de 1 a 200 opções;
  - cada uma com o rótulo, de até 60 caracteres e único na lista sem diferenciar acento e maiúsculas, e com a situação;
  - cada opção SHALL ter um identificador que não muda;
- **ativo:**
  - os tipos de ativo aceitos, até 20, cada um ativo quando escolhido; sem nenhum, o campo aceita ativos de qualquer tipo;
  - o nome do lado de lá (spec ligacoes-de-ativos), opcional, de até 60 caracteres, como "Monitores";
- **os outros tipos:** nenhuma configuração.

Uma configuração fora dessas regras SHALL ser recusada com o motivo.

Uma opção SHALL NOT ser retirada da lista, só inativada:
- a opção inativa sai das escolhas, e os valores que a usam continuam;
- renomear uma opção SHALL NOT mudar os valores guardados, que levam o identificador.

#### Scenario: Opção renomeada
- **WHEN** a opção "Proprio" é renomeada para "Próprio"
- **THEN** os valores guardados continuam os mesmos e passam a ser mostrados como "Próprio"

#### Scenario: Mínimo maior que o máximo
- **WHEN** alguém configura um campo de número inteiro com o mínimo 10 e o máximo 5
- **THEN** a configuração é recusada com "O mínimo não pode passar do máximo."

#### Scenario: Campo de ativo com os tipos aceitos
- **WHEN** quem administra o catálogo configura o campo "Computador", do tipo ativo, com os tipos aceitos "Computador" e "Notebook" e o lado de lá "Monitores"
- **THEN** a escolha do campo passa a oferecer só computadores e notebooks, e a ficha deles mostra o grupo "Monitores"

#### Scenario: Tipo inativo nos aceitos
- **WHEN** alguém configura um campo do tipo ativo com o tipo inativo "Nobreak" entre os aceitos
- **THEN** a configuração é recusada com "O tipo Nobreak está inativo."
