## MODIFIED Requirements

### Requirement: Origem, momento, autor e trava

Cada valor do ativo SHALL guardar, junto dele:
- a origem: manual, planilha, coleta ou API;
- o momento da última gravação;
- o autor, a conta que gravou, quando houver;
- a trava.

O modelo do ativo SHALL ter o mesmo estado que um campo.

Quem edita ativos SHALL poder travar e destravar cada campo, com o valor ou sem ele. Um campo travado SHALL mudar só pela edição manual. A edição manual SHALL respeitar a trava de quem a ligou: ela muda o valor e mantém a trava. A política de escrita do campo só manual (spec catalogo-de-ativos) SHALL valer como uma trava que não se desliga.

A ficha SHALL mostrar, em cada campo gravado, a origem, o autor e o momento, no fuso escolhido. O valor gravado pela importação (spec importacao-de-ativos) SHALL ter a origem "planilha" e, como autor, a conta que importou.

#### Scenario: Valor digitado
- **WHEN** Ana muda o hostname da impressora para "IMP-ALMOX-01" e salva
- **THEN** a ficha mostra, no Hostname, "Manual · Ana Souza", com o momento da gravação

#### Scenario: Campo travado
- **WHEN** quem edita ativos trava o Local de um computador
- **THEN** o Local passa a mostrar a trava, e uma gravação que não seja manual não pode mudá-lo


#### Scenario: Valor importado
- **WHEN** Ana importa uma planilha que muda o hostname da impressora PAT-00412
- **THEN** a ficha mostra, no Hostname, "Planilha · Ana Souza", com o momento da gravação
