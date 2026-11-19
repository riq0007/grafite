## ADDED Requirements

### Requirement: Forma das conversas nas preferências

A aparência SHALL ter a preferência da forma das conversas, com dois valores: "No meio" e "Nos cantos". O padrão de fábrica SHALL ser "No meio". A organização SHALL poder definir o padrão dela, e a conta, a escolha dela, como nas outras preferências.

Um valor ausente ou desconhecido SHALL dar lugar ao da camada de baixo, e as outras preferências SHALL continuar valendo. A API SHALL recusar com 400 a gravação de um valor fora dos dois, com a mensagem no campo.

#### Scenario: Primeiro acesso às conversas
- **WHEN** uma conta que nunca mudou um ajuste abre um chamado, numa organização sem padrões
- **THEN** a conversa fica no meio

#### Scenario: Padrão da organização nas conversas
- **WHEN** a organização define "Nos cantos" como padrão, e uma conta que nunca mudou esse ajuste abre um chamado
- **THEN** a conversa dessa conta fica nos cantos

#### Scenario: Valor desconhecido das conversas
- **WHEN** as preferências salvas trazem as conversas como "em-lista" e o dock à esquerda, numa organização sem padrões
- **THEN** as conversas ficam no meio, e o dock continua à esquerda

#### Scenario: Gravar as conversas fora dos dois valores
- **WHEN** a conta grava as conversas como "em-lista"
- **THEN** a API recusa com 400, com a mensagem no campo das conversas
