## ADDED Requirements

### Requirement: Ordens de serviço na ficha do ativo

Com o módulo Operação ligado, a ficha do ativo SHALL mostrar a seção "Ordens de serviço" a quem vê as OS (spec ordens-de-servico): as em aberto do ativo e as 5 mais novas entre as resolvidas e as encerradas, cada uma com o número, a situação, o problema e quando foi aberta, levando à ficha dela. Para quem atende, a seção SHALL oferecer "Nova ordem de serviço", que abre o formulário já com o ativo. Sem nenhuma, a seção SHALL dizer "Nenhuma ordem de serviço deste ativo.".

#### Scenario: OS pela ficha do notebook
- **WHEN** Carla escolhe "Nova ordem de serviço" na ficha do NB-0031
- **THEN** o formulário da nova OS abre com o NB-0031

#### Scenario: Ativo sem OS
- **WHEN** quem vê as OS abre a ficha de um ativo sem nenhuma
- **THEN** a seção diz "Nenhuma ordem de serviço deste ativo."

#### Scenario: Problema que voltou
- **WHEN** a ficha do NB-0031 tem a OS 12 Encerrada, "Não liga", e a OS 20 Aberta, "Não liga de novo"
- **THEN** a seção mostra a OS 20 entre as em aberto e a OS 12 entre as encerradas, cada uma com o problema
