## ADDED Requirements

### Requirement: Contagens dos locais

Os detalhes de um local SHALL mostrar, no escopo de quem vê:
- os ativos, "12 aqui · 30 com os de dentro", com "Ver ativos", quando o módulo Ativos está ligado e a conta vê ativos;
- as pessoas que trabalham nele e dentro dele, com "Ver pessoas", quando a conta vê pessoas.

Quando o escopo de quem vê recorta o total, a contagem SHALL dizer "que você vê". A árvore SHALL ter "Mostrar contagens", desligado ao abrir, que mostra ao lado de cada local quantos ativos e pessoas ele tem, com os de dentro.

"Mover para…" e "Inativar" SHALL dizer, antes de confirmar, o que vai junto: os locais de dentro, os ativos e as pessoas, como "Vai junto: 3 locais, 30 ativos e 4 pessoas.".

#### Scenario: Detalhes de um local
- **WHEN** quem vê ativos e pessoas escolhe "Expedição" na árvore
- **THEN** os detalhes mostram "Ativos: 12 aqui · 30 com os de dentro" e "Pessoas: 4", cada um com o "Ver"

#### Scenario: Escopo menor que o total
- **WHEN** Bruno vê ativos só em "Jundiaí › TI" e escolhe "Jundiaí"
- **THEN** a contagem diz quantos ativos que ele vê, com "que você vê"

#### Scenario: O que vai junto
- **WHEN** quem altera locais escolhe "Mover para…" em "Administrativo", que tem 3 locais dentro, 30 ativos e 4 pessoas
- **THEN** a confirmação diz "Vai junto: 3 locais, 30 ativos e 4 pessoas."
