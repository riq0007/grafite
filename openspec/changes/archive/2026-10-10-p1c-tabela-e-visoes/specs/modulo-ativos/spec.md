## MODIFIED Requirements

### Requirement: Ativos na busca

A busca (Ctrl+K) SHALL oferecer:
- a ação "Novo ativo", a quem tem `ativos.editar`;
- os ativos que a conta pode ver, pelo nome, pelo patrimônio, pela série, pelo hostname e pelo modelo, cada um com o patrimônio, o tipo e o local, e levando à ficha;
- as visões dos ativos que a conta pode usar, as da organização e as dela, pelo nome, cada uma com "Ativos › Visões" e levando à tabela dos ativos aberta nela, a quem tem `ativos.ver`.

#### Scenario: Ativo pelo patrimônio
- **WHEN** quem vê ativos digita "00412" na busca
- **THEN** a busca mostra a impressora PAT-00412, com o tipo e o local, e Enter abre a ficha dela

#### Scenario: Visão pela busca
- **WHEN** quem vê ativos digita "jundiai" na busca, e a organização tem a visão "Impressoras de Jundiaí"
- **THEN** a busca mostra a visão, com "Ativos › Visões", e Enter abre a tabela dos ativos nela
