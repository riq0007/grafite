## ADDED Requirements

### Requirement: Retenção dos alertas resolvidos

Os alertas resolvidos SHALL ficar guardados por 13 meses depois do fim, para a lista dos resolvidos, o bloco Alertas da ficha do ativo e os indicadores (spec indicadores). A manutenção diária (spec fila-de-tarefas) SHALL apagar os resolvidos há mais tempo. Os alertas não resolvidos SHALL NOT ser apagados pela retenção, e o que a auditoria registrou sobre um alerta apagado, como o reconhecimento, SHALL continuar nela (spec auditoria).

#### Scenario: Alerta resolvido há mais de 13 meses
- **WHEN** a manutenção diária roda, e um alerta terminou há 13 meses e 1 dia, e outro há 12 meses
- **THEN** o primeiro é apagado, o segundo fica, e o reconhecimento do primeiro continua na auditoria

#### Scenario: Alerta aberto há muito tempo
- **WHEN** a manutenção diária roda, e o alerta do toner de uma impressora guardada está aberto há 14 meses
- **THEN** o alerta continua aberto
