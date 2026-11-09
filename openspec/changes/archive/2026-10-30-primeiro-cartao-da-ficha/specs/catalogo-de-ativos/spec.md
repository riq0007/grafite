## ADDED Requirements

### Requirement: Primeiro cartão da ficha

Quem administra o catálogo SHALL poder escolher, no tipo, o cartão em que a ficha dos ativos dele abre (spec cadastro-de-ativos, "Aba Dados em cartões"):
- "Automático", o padrão, abre no cartão da capacidade principal do tipo;
- a Visão geral;
- uma capacidade do tipo que tem cartão na ficha: Inventário de hardware, Disponibilidade na rede, Suprimentos e contadores, Saúde do Control iD, Backup do Control iD ou Consumíveis compatíveis.

A seleção "Primeiro cartão da ficha" SHALL dizer, no "Automático", qual cartão ele abre, como "Automático: Suprimentos e contadores". Desligar a capacidade escolhida SHALL esquecer a escolha, e o tipo volta ao automático, como a configuração da capacidade desligada. Uma escolha que não é a Visão geral nem uma capacidade com cartão SHALL ser recusada com "Escolha a Visão geral ou uma capacidade do tipo com cartão na ficha.". A escolha SHALL entrar na auditoria do tipo, com o antes e o depois.

#### Scenario: Impressora no automático
- **WHEN** o tipo "Impressora" liga a disponibilidade na rede e os suprimentos e contadores, sem escolher o primeiro cartão
- **THEN** a seleção diz "Automático: Suprimentos e contadores", e a ficha das impressoras abre nos suprimentos

#### Scenario: Visão geral escolhida
- **WHEN** quem administra o catálogo escolhe a Visão geral no tipo "Impressora" e salva
- **THEN** a ficha das impressoras abre na Visão geral, e a auditoria registra a mudança do tipo

#### Scenario: Capacidade escolhida desligada
- **WHEN** o tipo "Face ID" escolheu a Saúde do Control iD, e quem administra o catálogo desliga essa capacidade
- **THEN** o tipo volta ao automático
