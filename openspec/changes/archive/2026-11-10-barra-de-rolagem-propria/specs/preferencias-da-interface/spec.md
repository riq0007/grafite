## ADDED Requirements

### Requirement: Barra de rolagem nas preferências

A aparência SHALL ter a preferência da barra de rolagem, com dois valores: "Ao rolar" e "Sempre visível". O padrão de fábrica SHALL ser "Ao rolar". A organização SHALL poder definir o padrão dela, e a conta, a escolha dela, como nas outras preferências.

Um valor ausente ou desconhecido SHALL dar lugar ao da camada de baixo, e as outras preferências SHALL continuar valendo. A API SHALL recusar com 400 a gravação de um valor fora dos dois, com a mensagem no campo.

A preferência SHALL valer antes da primeira pintura, pela cópia do navegador, como o tema: a barra SHALL NOT aparecer de um jeito e mudar depois.

#### Scenario: Primeiro acesso
- **WHEN** uma conta que nunca mudou um ajuste abre a aplicação, numa organização sem padrões
- **THEN** a barra de rolagem vale como "Ao rolar"

#### Scenario: Padrão da organização
- **WHEN** a organização define "Sempre visível" como padrão, e uma conta que nunca mudou esse ajuste entra
- **THEN** a barra de rolagem dessa conta fica sempre visível

#### Scenario: Valor desconhecido da barra
- **WHEN** as preferências salvas trazem a barra de rolagem como "grossa" e o dock à esquerda, numa organização sem padrões
- **THEN** a barra vale como "Ao rolar", e o dock continua à esquerda

#### Scenario: Sempre visível antes da primeira pintura
- **WHEN** o usuário reabre a aplicação com "Sempre visível" salvo
- **THEN** a primeira pintura já mostra o polegar da janela à vista
