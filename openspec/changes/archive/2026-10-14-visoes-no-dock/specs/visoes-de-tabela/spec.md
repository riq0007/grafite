## ADDED Requirements

### Requirement: Visões fixadas no menu

O menu da visão SHALL oferecer "Fixar no menu" e, numa visão fixada, "Desafixar do menu":
- numa visão da conta ou da organização, a conta SHALL poder fixá-la só para ela, nas preferências dela, valendo em qualquer aparelho;
- quem tem `organizacao.editar` SHALL poder fixar uma visão da organização para todos, nos padrões da organização, com a auditoria; a conta SHALL NOT poder desafixar para si uma visão fixada pela organização.

Cada conta SHALL ter até 20 visões fixadas, e a organização, até 20: "Você já fixou 20 visões. Desafixe uma para fixar outra." e o equivalente da organização. A visão fixada SHALL aparecer no menu do módulo da tabela (spec modulo-ativos), com o nome dela, e levar à tabela nela. Uma visão removida, ou que a conta não pode mais usar, SHALL sair do menu sem aviso. Os retornos SHALL ser "Visão fixada no menu." e "Visão desafixada do menu.".

#### Scenario: Fixar para si
- **WHEN** Bruno escolhe "Fixar no menu" na visão "Meus notebooks"
- **THEN** o menu do Ativos no dock de Bruno mostra "Meus notebooks", e o de nenhuma outra conta

#### Scenario: Fixar para todos
- **WHEN** Ana, com `organizacao.editar`, fixa para todos a visão da organização "Impressoras de Jundiaí"
- **THEN** o menu do Ativos de todas as contas que veem os ativos mostra "Impressoras de Jundiaí", e a auditoria registra a fixação

#### Scenario: Visão removida
- **WHEN** a visão fixada "Meus notebooks" é removida
- **THEN** ela sai do menu do dock de Bruno
