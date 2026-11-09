## MODIFIED Requirements

### Requirement: Alertas no dock

A casca SHALL ter o módulo Alertas, depois do Ativos e antes do Cofre, visível só para quem tem `alertas.ver` em algum escopo, inclusive por `alertas.tratar` ou `alertas.administrar`, e só com o módulo ligado na organização (spec modulos-da-organizacao). O item do dock SHALL levar à lista dos alertas abertos, e o menu dele SHALL ter "Abertos", "Resolvidos", "Indicadores" (spec indicadores) e, para quem tem `alertas.administrar`, "Regras". No celular, o Alertas SHALL ficar na barra de abas, depois do Ativos.

A busca (Ctrl+K) SHALL oferecer os itens do menu, como "Abertos" e "Indicadores", no caminho "Alertas", e, para quem administra os alertas, a ação "Nova regra de alerta".

#### Scenario: Conta sem a permissão
- **WHEN** uma conta sem `alertas.ver` entra
- **THEN** o dock e a busca não mostram o Alertas

#### Scenario: Quem só vê
- **WHEN** uma conta com só `alertas.ver` abre o menu do Alertas
- **THEN** o menu mostra "Abertos", "Resolvidos" e "Indicadores", sem "Regras"

#### Scenario: Indicadores pela busca
- **WHEN** uma conta com `alertas.ver` busca "indicadores"
- **THEN** a busca oferece "Indicadores", no caminho "Alertas", que leva à tela dos indicadores
