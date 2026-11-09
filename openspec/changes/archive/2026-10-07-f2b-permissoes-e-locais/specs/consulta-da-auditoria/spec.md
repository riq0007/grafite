## Purpose

Responder, pela tela, quem fez o quê, quando e com qual efeito, consultando a auditoria inteira com filtros e sem nenhum registro fora de alcance.

## ADDED Requirements

### Requirement: Consulta só com permissão

A auditoria SHALL ser consultada só por quem tem `auditoria.ver` para a organização inteira. Nenhuma rota e nenhuma tela SHALL alterar ou apagar um registro de auditoria.

#### Scenario: Sem permissão
- **WHEN** uma conta sem `auditoria.ver` pede a auditoria à API
- **THEN** a API responde 403, e a recusa entra na própria auditoria

#### Scenario: Nada para alterar
- **WHEN** quem consulta abre um registro de auditoria
- **THEN** a tela não oferece nenhuma ação de alterar ou apagar

### Requirement: Lista da auditoria

A lista SHALL vir do registro mais recente para o mais antigo e SHALL poder ser invertida. Cada linha SHALL mostrar:
- o momento, no fuso escolhido;
- quem fez:
  - uma conta, pelo nome atual da pessoa e pelo usuário;
  - "Comando no servidor";
  - ou "Sem sessão";
- a ação, num texto em pt-BR, como "Senha trocada";
- o alvo, com o tipo e o nome atual do registro, quando ele tem nome;
- o endereço IP;
- o código de rastreio.

#### Scenario: Registro de uma troca de senha
- **WHEN** Ana trocou a senha às 14:32
- **THEN** a lista mostra 14:32, "Ana Souza (ana.souza)", "Senha trocada", a conta de Ana como alvo, o IP e o código de rastreio

### Requirement: Filtros da auditoria

A consulta SHALL filtrar por:
- período, com as datas de início e de fim incluídas, no fuso escolhido;
- quem fez: uma conta;
- ação;
- alvo: o tipo e o registro;
- código de rastreio.

Os filtros SHALL valer para o conjunto inteiro, e não para a página. Os filtros ativos SHALL ficar à vista, e cada um SHALL poder ser limpo, um a um ou todos de uma vez.

#### Scenario: Filtro pelo código de rastreio
- **WHEN** um usuário informa à TI o código "R7K2-9QXM" e a TI o digita no filtro
- **THEN** a lista mostra só os registros dessa requisição

#### Scenario: Recusas de um período
- **WHEN** o filtro é a ação "Entrada recusada" de 01/10/2026 a 02/10/2026
- **THEN** a lista e o total consideram todas as recusas desses dois dias

### Requirement: Paginação sem teto e total

A lista SHALL ser paginada sem limite fixo, e todo registro que atende aos filtros SHALL ser alcançável. O total SHALL ser exato até 10.000 registros e, acima disso, SHALL aparecer como "mais de 10.000 registros".

#### Scenario: Muitos registros
- **WHEN** existem 12.000 registros que atendem aos filtros
- **THEN** a tela diz "mais de 10.000 registros", e "Carregar mais" alcança todos eles

### Requirement: Detalhe do registro

O detalhe de um registro SHALL mostrar tudo o que a lista mostra e mais:
- o "antes → depois" de cada campo que mudou;
- os dados da ação, como o motivo de uma recusa;
- o dispositivo, quando houver.

#### Scenario: Pessoa editada
- **WHEN** quem consulta abre o registro da edição do e-mail de João
- **THEN** o detalhe mostra o e-mail antigo e o novo, lado a lado

### Requirement: Histórico de um registro

A ficha de uma pessoa, de um perfil, de um grupo e de um local SHALL levar à auditoria já filtrada por aquele registro, para quem tem `auditoria.ver`. O histórico da pessoa SHALL incluir os registros da conta dela.

#### Scenario: Histórico da pessoa
- **WHEN** quem consulta escolhe "Ver na auditoria" na ficha de João
- **THEN** a auditoria abre filtrada por João, com os registros da pessoa e da conta dele, e o filtro à vista
