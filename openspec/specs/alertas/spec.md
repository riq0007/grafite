# alertas Specification

## Purpose
Transformar o estado atual da coleta em alertas: as regras da organização dizem o que é um problema, o motor abre o alerta depois da duração da regra e o resolve quando o valor volta ao normal, e quem cuida reconhece, adia ou silencia, sem que o mesmo problema vire dois alertas.

## Requirements

### Requirement: Condições de alerta

As condições de alerta SHALL ser definidas pelo sistema, cada uma com o que lê, quando abre, o item do alerta, os parâmetros e quando se recupera:

| Condição | Abre quando | Item | Parâmetros | Recupera quando | Vale para |
|---|---|---|---|---|---|
| Ativo offline | a leitura válida da disponibilidade diz offline | — | — | a leitura válida diz online | os ativos dos tipos com `rede.disponibilidade` |
| Nível do toner | o nível medido de um suprimento do tipo Toner fica no limite ou abaixo | cada toner | o limite, de 1 a 99%, e a folga, de 0 a 50 pontos | o nível medido passa do limite mais a folga | os ativos dos tipos com `snmp.suprimentos` |
| Condição da impressora | a leitura válida das condições do equipamento traz uma das escolhidas | cada condição | as condições da impressora, ao menos uma | a leitura válida não traz mais a condição | os ativos dos tipos com `snmp.suprimentos` |
| Saúde do Control iD | a situação da sondagem é uma das escolhidas | — | as situações Sem resposta, Login recusado e Resposta inesperada, ao menos uma | a situação deixa de ser uma das escolhidas | os ativos dos tipos com `controlid.saude` |
| Coleta atrasada | a leitura de uma capacidade coletada não chega há tantos ciclos dela, com o coletor falando com a API | cada capacidade | os ciclos, de 2 a 20 | a leitura volta a chegar | os ativos que o coletor ainda lê pela capacidade |
| Coletor sem contato | o coletor ativo não fala com a API há tantos minutos | — | os minutos, de 5 a 1.440 | o coletor volta a falar com a API | os coletores ativos que já falaram com a API |

Uma leitura sem dado SHALL NOT abrir nem recuperar um alerta: ela não diz que o problema começou nem que acabou.

#### Scenario: Suprimento que não é toner
- **WHEN** o cilindro de uma impressora está em 5%, e o toner, em 60%
- **THEN** a condição Nível do toner não abre alerta para o cilindro

#### Scenario: Impressora que parou de responder
- **WHEN** uma impressora com o toner em 8% passa a não responder ao SNMP, e a leitura chega sem dado
- **THEN** o alerta do toner continua aberto, e nenhum alerta novo do toner abre

### Requirement: Regras de alerta

Uma regra de alerta SHALL ter:
- o nome, de 1 a 80 caracteres, único entre as regras da organização;
- a condição, com os parâmetros dela;
- a duração, de 0 a 1.440 minutos, só nas condições Ativo offline, Nível do toner, Condição da impressora e Saúde do Control iD: o tempo que a condição precisa durar até o alerta abrir;
- a severidade: Crítico, Atenção ou Informação;
- o escopo: a organização inteira, um tipo de ativo, um modelo, um ativo ou um local com os locais de baixo. A regra do Coletor sem contato SHALL valer para a organização inteira;
- a situação: ativa ou inativa.

Quem tem `alertas.administrar` SHALL poder cadastrar, editar, inativar e reativar as regras. A condição de uma regra SHALL NOT mudar depois do cadastro. A gravação SHALL recusar o que não confere, com a mensagem no campo:

| O que não confere | Mensagem |
|---|---|
| nome vazio | "Informe o nome da regra." |
| nome com mais de 80 caracteres | "Use até 80 caracteres no nome." |
| nome de outra regra da organização | "Já existe uma regra com esse nome." |
| limite fora de 1 a 99 | "Informe um limite de 1 a 99%." |
| folga fora de 0 a 50 | "Informe uma folga de 0 a 50 pontos." |
| limite mais a folga em 100 ou acima | "O limite mais a folga precisa ficar abaixo de 100%." |
| nenhuma condição da impressora | "Escolha ao menos uma condição." |
| nenhuma situação do Control iD | "Escolha ao menos uma situação." |
| ciclos fora de 2 a 20 | "Informe de 2 a 20 ciclos." |
| minutos fora de 5 a 1.440 | "Informe de 5 a 1.440 minutos." |
| duração fora de 0 a 1.440 | "Informe uma duração de 0 a 1.440 minutos." |
| tipo, modelo, ativo ou local que falta ou está inativo | "Escolha um tipo ativo.", "Escolha um modelo ativo.", "Escolha um ativo que não esteja inativo." ou "Escolha um local ativo." |
| a regra do coletor com outro escopo | "A regra do coletor vale para a organização inteira." |
| a condição trocada numa regra que existe | "A condição de uma regra não muda: cadastre outra regra." |

A mudança de uma regra SHALL valer na avaliação seguinte, em até um minuto.

#### Scenario: Regra de um tipo
- **WHEN** quem administra os alertas cadastra "Servidor offline", com a condição Ativo offline, 2 minutos, Crítico e o tipo "Servidor"
- **THEN** a regra é gravada ativa, e só os servidores entram nela

#### Scenario: Limite inválido
- **WHEN** quem administra os alertas grava a regra do toner com o limite em 120
- **THEN** a gravação é recusada com "Informe um limite de 1 a 99%."

#### Scenario: Sem a permissão
- **WHEN** uma conta sem `alertas.administrar` tenta cadastrar uma regra
- **THEN** o cadastro é recusado, e nada é gravado

### Requirement: Regras de fábrica

Cada organização SHALL começar com as regras de fábrica, todas ativas e com a organização inteira como escopo:

| Nome | Condição | Parâmetros | Duração | Severidade |
|---|---|---|---|---|
| Ativo offline | Ativo offline | — | 5 min | Atenção |
| Toner em 10% ou menos | Nível do toner | limite de 10% e folga de 5 pontos | 0 | Crítico |
| Impressora parada | Condição da impressora | Sem papel, Sem toner, Tampa aberta, Atolamento de papel, Serviço solicitado, Bandeja de entrada ausente, Suprimento de impressão ausente e Bandeja de saída cheia | 0 | Crítico |
| Impressora pede atenção | Condição da impressora | Pouco papel, Toner baixo, Bandeja de saída ausente, Bandeja de saída quase cheia, Bandeja de entrada vazia e Manutenção preventiva vencida | 0 | Atenção |
| Control iD sem resposta | Saúde do Control iD | Sem resposta | 10 min | Crítico |
| Control iD não aceita a sondagem | Saúde do Control iD | Login recusado e Resposta inesperada | 0 | Atenção |
| Coleta atrasada | Coleta atrasada | 3 ciclos | — | Atenção |
| Coletor sem contato | Coletor sem contato | 10 minutos | — | Crítico |

As regras de fábrica SHALL ser criadas para a organização nova, pelo comando no servidor, e uma vez para cada organização que já existia antes delas. Elas SHALL ser editadas, inativadas e reativadas como qualquer outra regra.

#### Scenario: Organização que já existia
- **WHEN** a versão com os alertas é instalada numa organização que já coletava
- **THEN** a organização tem as oito regras de fábrica, ativas, sem nenhuma ação de quem administra

#### Scenario: Regra de fábrica editada
- **WHEN** quem administra os alertas muda o limite do "Toner em 10% ou menos" para 15%
- **THEN** a regra fica com 15%, e a atualização da versão não a volta para 10%

### Requirement: Avaliação a cada minuto

O motor SHALL avaliar, a cada minuto, as regras ativas de cada organização com o módulo Alertas ligado, sobre o estado atual da coleta e o último contato dos coletores. Com o módulo Alertas desligado, a organização SHALL NOT ser avaliada, e os alertas dela ficam como estavam. Com o módulo Ativos desligado, as condições dos ativos SHALL NOT abrir alertas.

Um alerta SHALL ser identificado pela regra, pelo ativo ou pelo coletor, e pelo item. SHALL NOT haver dois alertas não resolvidos com a mesma identidade.

O alerta SHALL abrir quando a condição dura a duração da regra, contada da primeira avaliação que a viu. Enquanto o alerta está aberto, a avaliação SHALL atualizar o texto com o valor atual e a severidade com a da regra. A condição que some antes da duração SHALL NOT abrir alerta.

#### Scenario: Toner que acaba
- **WHEN** uma leitura válida diz que o toner preto de uma impressora está em 8%
- **THEN** em até um minuto abre o alerta "Toner preto em 8%", Crítico, nessa impressora

#### Scenario: Leitura que piora
- **WHEN** o alerta "Toner preto em 8%" está aberto e chega a leitura de 7%
- **THEN** o mesmo alerta passa a "Toner preto em 7%", e nenhum outro abre

#### Scenario: Condição curta
- **WHEN** a regra Ativo offline tem 5 minutos, e uma impressora fica offline das 10:00 às 10:03
- **THEN** nenhum alerta abre

#### Scenario: Condição que dura
- **WHEN** a mesma impressora fica offline das 10:10 em diante
- **THEN** o alerta "Offline" abre por volta das 10:15

#### Scenario: Módulo Alertas desligado
- **WHEN** a organização desliga o módulo Alertas
- **THEN** o motor para de avaliar as regras dela, e nenhum alerta abre nem se resolve

### Requirement: Recuperação com folga

Um alerta aberto SHALL se resolver sozinho quando uma leitura válida mostra a recuperação da condição, com a folga da regra: o toner que abriu em 10% com a folga de 5 pontos só se resolve acima de 15%. O alerta resolvido SHALL guardar quando se resolveu e que voltou ao normal. A condição que volta depois SHALL abrir um alerta novo.

#### Scenario: Valor dentro da folga
- **WHEN** o alerta do toner abriu em 8%, com o limite em 10% e a folga de 5 pontos, e chega a leitura de 12%
- **THEN** o alerta continua aberto, com o texto "Toner preto em 12%"

#### Scenario: Valor recuperado
- **WHEN** chega a leitura de 100% depois da troca do toner
- **THEN** o alerta se resolve, como "Voltou ao normal", em até um minuto

#### Scenario: Problema que volta
- **WHEN** o toner trocado chega a 9% semanas depois
- **THEN** abre um alerta novo, e o resolvido continua resolvido

### Requirement: Encerramento quando a regra deixa de valer

Um alerta não resolvido SHALL ser encerrado, como "A regra deixou de valer", quando:
- a regra é inativada;
- o escopo ou a condição da regra deixa de alcançar o ativo, como o ativo movido para outro local;
- o ativo é inativado;
- o tipo do ativo desliga a capacidade da condição;
- o módulo Ativos é desligado, nos alertas dos ativos;
- o coletor é inativado;
- o ativo deixa de ser lido pelo coletor, na Coleta atrasada.

O alerta encerrado SHALL ficar com os resolvidos, com quando foi encerrado.

#### Scenario: Ativo inativado
- **WHEN** a impressora com o alerta do toner aberto é inativada
- **THEN** o alerta é encerrado, como "A regra deixou de valer", em até um minuto

#### Scenario: Regra inativada
- **WHEN** quem administra os alertas inativa a "Impressora pede atenção"
- **THEN** os alertas abertos dela são encerrados, e nenhum outro abre por ela

### Requirement: Coleta atrasada

A Coleta atrasada SHALL valer para cada capacidade coletada de um ativo que o coletor ainda lê: a disponibilidade na rede, os suprimentos e contadores e a saúde do Control iD. Ela SHALL abrir quando a última leitura da capacidade tem mais que os ciclos da regra, contados pelo intervalo dela, e o coletor dessa leitura falou com a API depois desse prazo. Com o coletor sem contato, a Coleta atrasada SHALL NOT abrir: o alerta do coletor já diz o problema. O ativo que nunca teve uma leitura da capacidade SHALL NOT abrir a Coleta atrasada.

#### Scenario: Leitura que não chega
- **WHEN** o coletor fala com a API a cada minuto, mas a disponibilidade de uma impressora não chega há 7 minutos, com a regra de 3 ciclos de 2 minutos
- **THEN** abre o alerta "Coleta atrasada: Disponibilidade na rede" nessa impressora

#### Scenario: Coletor parado
- **WHEN** o coletor para, e nenhuma leitura dele chega há 12 minutos
- **THEN** abre o alerta "Coletor sem contato" no coletor, e nenhuma Coleta atrasada abre nos ativos dele

#### Scenario: IP apagado
- **WHEN** o IP de uma impressora com a Coleta atrasada aberta é apagado, e o coletor deixa de lê-la
- **THEN** o alerta é encerrado, como "A regra deixou de valer"

### Requirement: Coletor sem contato

O Coletor sem contato SHALL abrir quando um coletor ativo, que já falou com a API alguma vez, fica sem falar com ela pelos minutos da regra, e SHALL se resolver quando ele volta a falar. O coletor cadastrado que nunca falou com a API SHALL NOT abrir o alerta.

#### Scenario: Coletor que para
- **WHEN** o "Coletor de Jundiaí" falou com a API pela última vez às 10:00, com a regra de 10 minutos
- **THEN** o alerta "Coletor sem contato", Crítico, abre por volta das 10:10 e se resolve quando o coletor volta a falar

#### Scenario: Coletor recém-cadastrado
- **WHEN** um coletor é cadastrado e ainda não foi instalado
- **THEN** nenhum alerta abre para ele

### Requirement: Texto do alerta

O texto do alerta SHALL dizer o problema com o valor atual, em pt-BR:

| Condição | Texto |
|---|---|
| Ativo offline | "Offline" |
| Nível do toner | a descrição do toner, como a impressora a informa, e o nível, como "Toner preto em 8%" |
| Condição da impressora | o rótulo da condição, como "Sem papel" |
| Saúde do Control iD | "Control iD sem resposta", "Control iD com login recusado" ou "Control iD com resposta inesperada" |
| Coleta atrasada | "Coleta atrasada:" e o nome da capacidade, como "Coleta atrasada: Disponibilidade na rede" |
| Coletor sem contato | "Coletor sem contato" |

#### Scenario: Condição da impressora
- **WHEN** a impressora informa a condição "Sem papel", e a regra "Impressora parada" a inclui
- **THEN** abre o alerta "Sem papel", Crítico

### Requirement: Reconhecer o alerta

Quem tem `alertas.tratar` no escopo do local do ativo SHALL poder reconhecer um alerta não resolvido, e o alerta SHALL guardar quem o reconheceu e quando. O alerta reconhecido SHALL continuar aberto até se resolver. No alerta de um coletor, a permissão SHALL valer para a organização inteira. Reconhecer um alerta resolvido SHALL ser recusado com "O alerta já foi resolvido.".

#### Scenario: Ana reconhece
- **WHEN** Ana reconhece o alerta "Sem papel" da impressora do RH
- **THEN** o alerta mostra "Reconhecido por Ana Souza", com o momento, e continua aberto

#### Scenario: Fora do escopo
- **WHEN** Bruno tem `alertas.tratar` só em Campinas e tenta reconhecer um alerta de Jundiaí
- **THEN** o reconhecimento é recusado, e o alerta continua como estava

### Requirement: Adiar o alerta

Quem tem `alertas.tratar` no escopo do local do ativo SHALL poder adiar um alerta não resolvido por 15 minutos, 30 minutos ou 1 hora, e nunca por mais de uma hora. O alerta adiado SHALL guardar até quando e quem adiou, e SHALL sair das ocorrências da tela inicial até essa hora, quando volta sozinho, em até um minuto, se continuar aberto. Adiar de novo SHALL trocar a hora. Adiar um alerta resolvido SHALL ser recusado com "O alerta já foi resolvido.".

#### Scenario: Adiado por meia hora
- **WHEN** Ana adia o alerta "Offline" do switch às 14:00, por 30 minutos
- **THEN** o alerta mostra "Adiado até 14:30", sai da tela inicial e volta a ela por volta das 14:30, se continuar aberto

### Requirement: Silenciar os alertas de um ativo

Quem tem `alertas.tratar` no escopo do local do ativo SHALL poder silenciar os alertas de um ativo ativo:
- até um momento futuro, em até um ano, ou até alguém retomar;
- com um motivo opcional, de até 200 caracteres.

Enquanto o ativo está silenciado, o motor SHALL continuar abrindo e resolvendo os alertas dele, e esses alertas SHALL sair das ocorrências da tela inicial. O silêncio SHALL terminar quando alguém retoma os alertas do ativo ou quando passa o momento escolhido, em até um minuto. A gravação SHALL recusar o momento que já passou ou que passa de um ano, com "Escolha um momento no futuro, em até um ano.", e o motivo longo, com "Use até 200 caracteres no motivo.".

#### Scenario: Impressora em manutenção
- **WHEN** Ana silencia os alertas da impressora do RH até 20/10 às 18:00, com o motivo "Em manutenção"
- **THEN** os alertas da impressora continuam abrindo e se resolvendo, com a impressora silenciada, e nenhum deles aparece na tela inicial até lá

#### Scenario: Silêncio retomado
- **WHEN** Ana retoma os alertas da impressora antes da data
- **THEN** os alertas abertos dela voltam à tela inicial

#### Scenario: Até alguém retomar
- **WHEN** Ana silencia os alertas da impressora fiscal até alguém retomar
- **THEN** o silêncio não termina sozinho

### Requirement: Quem vê os alertas

Quem tem `alertas.ver` SHALL ver os alertas dos ativos no escopo do local deles. Os alertas dos coletores SHALL ser vistos só por quem tem `alertas.ver` na organização inteira. Os alertas resolvidos e encerrados SHALL continuar guardados.

#### Scenario: Escopo de um local
- **WHEN** Bruno tem `alertas.ver` só em Campinas
- **THEN** ele vê os alertas dos ativos de Campinas, e não vê os de Jundiaí nem os dos coletores

### Requirement: Retenção dos alertas resolvidos

Os alertas resolvidos SHALL ficar guardados por 13 meses depois do fim, para a lista dos resolvidos, o bloco Alertas da ficha do ativo e os indicadores (spec indicadores). A manutenção diária (spec fila-de-tarefas) SHALL apagar os resolvidos há mais tempo. Os alertas não resolvidos SHALL NOT ser apagados pela retenção, e o que a auditoria registrou sobre um alerta apagado, como o reconhecimento, SHALL continuar nela (spec auditoria).

#### Scenario: Alerta resolvido há mais de 13 meses
- **WHEN** a manutenção diária roda, e um alerta terminou há 13 meses e 1 dia, e outro há 12 meses
- **THEN** o primeiro é apagado, o segundo fica, e o reconhecimento do primeiro continua na auditoria

#### Scenario: Alerta aberto há muito tempo
- **WHEN** a manutenção diária roda, e o alerta do toner de uma impressora guardada está aberto há 14 meses
- **THEN** o alerta continua aberto

### Requirement: Exceções da regra

Uma regra de uma condição dos ativos SHALL poder ter até 50 exceções. Cada exceção SHALL ter:
- onde vale: um tipo de ativo, um modelo, um ativo ou um local com os locais de baixo;
- o efeito: "Não alertar", em qualquer condição dos ativos, ou "Outro limite", só na regra do Nível do toner, com o limite e a folga dela.

Na avaliação, cada ativo do escopo SHALL seguir a exceção mais específica que o alcança: a do ativo, depois a do modelo, a do tipo e, por último, a do local mais fundo. Sem exceção, o ativo SHALL seguir a regra.
- O ativo com "Não alertar" SHALL ficar fora da regra, e o alerta aberto dele SHALL terminar como o da regra que deixou de valer.
- O ativo com "Outro limite" SHALL abrir e recuperar o alerta pelo limite e pela folga da exceção.

A regra do Coletor sem contato SHALL NOT ter exceções. A gravação SHALL recusar o que não confere, com a mensagem na exceção:

| O que não confere | Mensagem |
|---|---|
| exceção sem o lugar | "Escolha onde vale a exceção." |
| tipo, modelo, ativo ou local que falta ou está inativo | as mensagens do escopo da regra |
| duas exceções no mesmo lugar | "Já existe uma exceção nesse lugar." |
| "Outro limite" fora da regra do toner | "Outro limite só vale na regra do toner." |
| limite ou folga fora dos limites | as mensagens do limite e da folga da regra |
| mais de 50 exceções | "Use até 50 exceções na regra." |
| exceção na regra do coletor | "A regra do coletor não tem exceções." |

#### Scenario: Modelo que acaba antes
- **WHEN** a regra "Toner em 10% ou menos" tem a exceção "Outro limite" de 20% no modelo HP M404, e o toner de uma M404 chega a 18%
- **THEN** o alerta do toner abre para essa impressora, e as dos outros modelos continuam no limite de 10%

#### Scenario: Local sem o alerta de offline
- **WHEN** a regra "Ativo offline" tem a exceção "Não alertar" no local Laboratório, e um computador do laboratório fica offline
- **THEN** nenhum alerta abre para ele

#### Scenario: Ativo vence o local
- **WHEN** a regra do toner tem "Não alertar" no local Laboratório e "Outro limite" de 30% numa impressora desse local
- **THEN** a impressora segue o limite de 30%
