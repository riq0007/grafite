# painel-de-dashboards Specification

## Purpose

Reunir os dashboards da empresa, que ficam em VMs, num lugar só: o cadastro de cada endereço, a verificação de que ele está no ar e a exibição lado a lado.

## Requirements

### Requirement: Painéis cadastrados

Quem tem `paineis.administrar` SHALL cadastrar, editar, inativar e reativar os painéis. Cada painel SHALL ter:
- o nome, de 1 a 80 caracteres, único na organização;
- o endereço, com `http://` ou `https://`, o host e, se houver, a porta e o caminho, até 500 caracteres;
- o local, opcional;
- a ordem na grade, de 1 a 999, com os de mesma ordem pelo nome.

A gravação SHALL recusar com a mensagem no campo:

| O que não confere | Mensagem |
|---|---|
| nome vazio | "Informe o nome." |
| nome com mais de 80 caracteres | "Use até 80 caracteres no nome." |
| nome de outro painel da organização | "Já existe um painel com esse nome." |
| endereço sem `http://` ou `https://`, sem o host ou com mais de 500 caracteres | "Informe o endereço, como http://10.0.0.20:3000." |
| ordem fora de 1 a 999 | "Informe uma ordem de 1 a 999." |
| local que falta ou está inativo | "Escolha um local ativo." |

O painel inativo SHALL sair da grade e da verificação.

#### Scenario: Painel novo
- **WHEN** quem administra os painéis cadastra "Produção da linha 2", com o endereço "http://10.0.5.21:3000"
- **THEN** o painel entra na grade, e a verificação seguinte diz se ele está no ar

#### Scenario: Endereço sem o protocolo
- **WHEN** alguém grava o endereço "10.0.5.21:3000"
- **THEN** a gravação é recusada com "Informe o endereço, como http://10.0.0.20:3000."

### Requirement: Verificação dos painéis

A cada minuto, o servidor SHALL pedir o endereço de cada painel ativo das organizações com o módulo ligado, com 5 segundos de prazo, seguindo até 3 redirecionamentos. O painel SHALL ficar:
- "No ar", com a resposta de 100 a 499;
- "Fora do ar", sem resposta no prazo, com a falha da conexão ou com a resposta de 500 em diante, guardando o motivo em texto, como "Sem resposta em 5 s" ou "Respondeu 502";
- "Sem verificação", até a primeira verificação.

A verificação SHALL guardar o momento e o tempo da resposta. A mudança de situação SHALL gravar o evento `paineis.mudaram`, e a verificação que não muda a situação SHALL NOT gravar evento. Quem administra os painéis SHALL pedir a verificação de um painel na hora, com "Verificar agora".

#### Scenario: Painel que caiu
- **WHEN** a VM do painel "Produção da linha 2" desliga, e o endereço não responde em 5 s
- **THEN** na verificação seguinte o painel fica "Fora do ar", com o motivo "Sem resposta em 5 s", e a grade aberta se atualiza

#### Scenario: Painel com erro do servidor
- **WHEN** o endereço do painel responde 502
- **THEN** o painel fica "Fora do ar", com o motivo "Respondeu 502"

### Requirement: Permissões, auditoria e evento dos painéis

O catálogo SHALL ter, na área "Painéis":
- `paineis.ver`: "Ver os painéis", na organização;
- `paineis.administrar`: "Cadastrar os painéis", na organização, incluindo `paineis.ver`.

O perfil Administrador SHALL ter as duas. A API SHALL repetir as verificações. O cadastro, a mudança, a inativação e a reativação dos painéis SHALL ir para a auditoria e gravar o evento `paineis.mudaram`, entregue a quem vê os painéis. A verificação SHALL NOT ir para a auditoria.

#### Scenario: Conta sem a permissão
- **WHEN** uma conta sem `paineis.ver` lê os painéis pela API
- **THEN** a API responde 403

### Requirement: Painéis no mapa da planta

O mapa da planta SHALL ter a camada "Painéis", só para quem vê os painéis, com os painéis ativos posicionados, cada um com a situação em texto e no tom: "No ar", "Fora do ar" ou "Sem verificação". O marcador SHALL ter a ação "Ver o painel", que abre a tela dos painéis com ele expandido. Quem edita o mapa SHALL posicionar os painéis como os ativos.

#### Scenario: Painel no ar no mapa
- **WHEN** o painel "Produção da linha 2" está no ar e posicionado na planta
- **THEN** o marcador mostra "No ar" e "Ver o painel"

### Requirement: Conteúdo HTTP pela conexão do Grafite

A API SHALL permitir a quem tem `paineis.ver` carregar o documento e recursos do servidor de um painel ativo por HTTPS. A ponte SHALL ficar restrita à organização, à sessão e à origem cadastrada, com prazo e limite de tamanho. SHALL NOT encaminhar cookies ou Authorization do Grafite, acessar destinos arbitrários ou permitir que o documento alcance a sessão ou o DOM do Grafite. URLs relativas, absolutas da mesma origem e redirecionamentos internos SHALL continuar pela ponte. Falhas SHALL produzir uma mensagem em pt-BR.

#### Scenario: Recursos de um painel HTTP
- **WHEN** o documento referencia CSS, imagens e chamadas de dados no próprio servidor
- **THEN** os recursos passam pela ponte HTTPS e o conteúdo permanece isolado

#### Scenario: Acesso revogado
- **WHEN** a sessão expira, a permissão é removida, o módulo é desligado ou o painel é inativado
- **THEN** novos pedidos pela ponte são recusados

#### Scenario: Redirecionamento externo
- **WHEN** o servidor tenta redirecionar a ponte para outra origem
- **THEN** a API recusa o destino
