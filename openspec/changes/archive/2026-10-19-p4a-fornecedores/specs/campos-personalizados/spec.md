## MODIFIED Requirements

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
