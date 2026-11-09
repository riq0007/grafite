## Why

Com o P2a, o Grafite sabe se cada impressora responde na rede, mas não sabe o que importa no dia a dia de quem atende: o toner que está acabando, o contador de páginas e o que a própria impressora diz que está errado, como "Sem papel" ou "Tampa aberta". O PMG lê tudo isso por SNMP a cada ciclo, com a comunidade `public` fixa no código, e a virada (P8) precisa da paridade.

O P2b · Impressoras por SNMP é a segunda das três changes do P2 · Coletor local (spec mestre, seção 3.2), depois do P6 · Cofre: a comunidade SNMP é um segredo e mora no cofre (seção 5.2, decisão 7). Por decisão do usuário:
- o P2b lê o SNMP v1 e v2c, com a comunidade num segredo do cofre, e sem segredo vale a `public`;
- a comunidade e a versão são escolhidas no tipo, ao ligar a capacidade;
- o nível dos suprimentos aparece em percentual, sem faixas de "baixo" e "crítico", que chegam com as regras editáveis do P3;
- os suprimentos, os contadores e as condições aparecem no painel Suprimentos da ficha, e a tabela ganha as colunas Suprimentos e Total de páginas.

Ficam fora desta change:
- o SNMP v3;
- os alertas, as notificações e as faixas de nível (P3); o P2b mostra o estado e não abre ocorrência, para não haver dois mecanismos de alerta;
- a previsão de troca dos suprimentos pelo consumo, que depende dos consumíveis do P4;
- os gráficos do histórico das leituras;
- uma impressora simulada no `pnpm dev`.

## What Changes

- **A capacidade `snmp.suprimentos`** (Suprimentos e contadores):
  - o tipo que a liga escolhe o campo de IP, a versão do SNMP (1 ou 2c) e a comunidade: um segredo do tipo novo "Comunidade SNMP", ou a `public`, quando nenhum é escolhido;
  - o coletor lê cada impressora a cada 10 minutos.
- **O que o coletor lê,** pelo Printer-MIB e pelo Host Resources MIB:
  - os suprimentos, com a descrição, a capacidade e o nível;
  - os contadores de páginas;
  - as condições do equipamento, como "Sem papel", "Tampa aberta" e "Atolamento de papel";
  - as mensagens do fabricante;
  - o número de série.
- **O que a tela mostra:**
  - o nível em percentual, "Há suprimento" quando a impressora não mede o nível exato e "Sem dado" quando ela não informa; nunca um nível inventado;
  - o tipo do suprimento (Toner, Cilindro, Fusor ou Outro), pela descrição;
  - as páginas em preto e branco, que saem do total e das coloridas.
- **A comunidade** vai ao coletor só na configuração dos alvos dele e fica só na memória: nunca na fila em disco nem no log.
- **O número de série** lido grava o campo comum Número de série com a origem "coleta", respeitando a trava, e a mudança entra na auditoria.
- **A tela:**
  - o painel Suprimentos na ficha da impressora, com a resposta do SNMP, os suprimentos, os contadores, as condições e as mensagens do fabricante, sempre com a idade do dado;
  - as colunas Suprimentos (o menor nível) e Total de páginas na tabela dos ativos, com a ordem e o filtro "de e até";
  - na ficha do tipo, a versão e a comunidade da capacidade.
- **As leituras** ganham o item (o suprimento ou o contador da impressora) e os detalhes do item.
- **Os agregados por hora:** a manutenção diária guarda, para cada hora e cada ativo, métrica e item, a contagem, o mínimo, o máximo, a média e o último valor, antes de apagar as leituras com mais de 30 dias. Os agregados ficam 13 meses.
- **No cofre,** o tipo de segredo "Comunidade SNMP".

## Capabilities

### New Capabilities

- `impressoras-por-snmp`: a capacidade `snmp.suprimentos`, com a leitura SNMP v1 e v2c das impressoras, a comunidade do cofre, os suprimentos, os contadores, as condições do equipamento, as mensagens do fabricante e o número de série, e o painel Suprimentos.

### Modified Capabilities

- `catalogo-de-ativos`: a capacidade `snmp.suprimentos` entra no catálogo, com o campo de IP, a versão e a comunidade escolhidos no tipo.
- `cadastro-de-ativos`: o painel Suprimentos na ficha, as colunas Suprimentos e Total de páginas, com a ordem e o filtro, e o valor gravado pela coleta com a origem "coleta".
- `coletor-local`: a configuração da coleta traz a leitura SNMP com a versão e a comunidade, que o coletor guarda só na memória; o lote aceita as métricas novas.
- `leituras-e-estado`: o item e os detalhes de cada leitura, e os agregados por hora, guardados por 13 meses.
- `fila-de-tarefas`: a manutenção diária agrega as leituras por hora antes de apagá-las e apaga os agregados com mais de 13 meses.
- `cofre-de-segredos`: o tipo "Comunidade SNMP", e o uso do valor pelo coletor, sem revelação.

## Impact

- **`packages/domain`:**
  - a capacidade e a configuração dela no tipo;
  - as métricas novas, com o item, e os limites de cada valor;
  - o nível do suprimento, o tipo do suprimento pela descrição e as condições do equipamento, com os rótulos em pt-BR;
  - as páginas em preto e branco;
  - o tipo de segredo novo.
- **`packages/db`:**
  - o item e os detalhes nas leituras e no estado atual;
  - a tabela dos agregados por hora, com o isolamento por organização;
  - a migration.
- **`apps/collector`:**
  - a leitura SNMP, com a dependência `net-snmp`, que o PMG já usa;
  - um simulador de agente SNMP para os testes, alimentado por gravações no formato do snmpsim;
  - um comando que grava uma impressora de verdade nesse formato.
- **`apps/api`:**
  - a configuração da coleta com a comunidade decifrada;
  - o lote com as métricas novas e o número de série;
  - o painel na ficha, as colunas, o filtro e a ordem;
  - a agregação e a retenção na manutenção;
  - o contrato e o cliente gerados de novo.
- **`apps/web`:** a configuração da capacidade na ficha do tipo, o painel Suprimentos, as colunas e o tipo de segredo novo no cofre.
- **Dependências:** `net-snmp` no coletor.
- **Documentação:** o mapa e o contrato de módulo, com o valor coletado de vários itens.
