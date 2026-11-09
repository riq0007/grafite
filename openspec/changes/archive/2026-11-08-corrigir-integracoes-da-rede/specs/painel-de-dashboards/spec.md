## ADDED Requirements

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
