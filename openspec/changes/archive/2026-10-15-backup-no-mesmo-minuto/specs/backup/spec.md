## ADDED Requirements

### Requirement: Dois backups no mesmo minuto

A pasta de um backup SHALL ter o nome do minuto em que ele começou, em UTC, como `2026-10-14T0605Z`. Quando um destino já tem um backup pronto com esse nome, o backup novo SHALL ganhar o sufixo `-2`, ou o primeiro número a partir dele que nenhum destino tenha, como `2026-10-14T0605Z-3`. A lista dos backups, a retenção e a restauração pelo nome SHALL tratar o nome com sufixo como os outros, com o momento pelo minuto do nome. Na ordem do mais antigo ao mais novo, o nome sem sufixo SHALL vir antes do `-2`, e o `-9` antes do `-10`.

#### Scenario: Backup pedido logo depois de outro
- **WHEN** quem opera pede um backup e, no mesmo minuto, atualiza a produção, que faz o backup dela antes de mudar
- **THEN** o segundo backup fica pronto em todos os destinos, com o sufixo `-2`, e a atualização segue; a retenção trata os dois como dois backups do mesmo dia e guarda o `-2`, o mais novo

#### Scenario: Nome ocupado só num destino
- **WHEN** o segundo destino já tem um backup com o nome do minuto, e o primeiro não tem
- **THEN** o backup novo ganha o sufixo `-2` em todos os destinos

#### Scenario: Restauração de um backup com sufixo
- **WHEN** quem opera restaura a produção pelo nome `2026-10-14T0605Z-2`
- **THEN** a restauração usa esse backup, e não o `2026-10-14T0605Z`
