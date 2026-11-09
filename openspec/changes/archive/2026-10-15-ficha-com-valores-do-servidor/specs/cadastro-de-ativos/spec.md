## ADDED Requirements

### Requirement: Valores do servidor na ficha aberta

Com a ficha aberta, um valor que o servidor muda num campo que a pessoa não editou, como o número de série gravado pela coleta, SHALL entrar no campo, sem recarregar a página. O campo que a pessoa editou SHALL manter o que foi digitado, e salvar SHALL enviar só os campos editados.

#### Scenario: Série gravada pela coleta
- **WHEN** a ficha da PAT-00412 está aberta, e a coleta grava o número de série "VNB3K12345"
- **THEN** o campo "Número de série" mostra "VNB3K12345", sem recarregar a página

#### Scenario: Campo editado
- **WHEN** a pessoa digitou "IMP-ALMOX-01" no Hostname, e o servidor muda o hostname para "IMP-SERVIDOR"
- **THEN** o campo continua com "IMP-ALMOX-01", e salvar envia só o hostname digitado
