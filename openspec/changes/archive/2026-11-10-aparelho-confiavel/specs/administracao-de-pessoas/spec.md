## ADDED Requirements

### Requirement: Aparelhos confiáveis pela administração

Quem administra contas SHALL poder, na conta de outra pessoa:
- **ver os aparelhos confiáveis:** com o dispositivo, o IP, desde quando é confiável, o último uso e até quando vale;
- **esquecer todos os aparelhos:** as entradas seguintes da conta pedem o código em qualquer navegador, e as sessões abertas continuam;
- **mudar o prazo da confiança da conta:** "Seguir o perfil ou a organização", o de fábrica, um número de 1 a 90 dias, ou "Pedir o código em toda entrada" (spec verificacao-em-dois-passos, "Prazo da confiança").

A tela SHALL dizer o prazo que vale para a conta e de onde ele vem, como "30 dias, pela organização" ou "Em toda entrada, pelo perfil Administrador". Os retornos SHALL ser "Aparelhos esquecidos." e "Prazo da confiança alterado.". A própria conta SHALL ser cuidada na seção Conta dos Ajustes: a administração SHALL recusar a mudança do prazo da própria conta com "Use outra conta para mudar o seu prazo.".

#### Scenario: Notebook roubado
- **WHEN** quem administra contas escolhe "Esquecer todos os aparelhos" na conta de João, que tinha o notebook marcado
- **THEN** a entrada seguinte de João, em qualquer navegador, pede o código, e a auditoria registra quem esqueceu os aparelhos

#### Scenario: Prazo de uma conta
- **WHEN** quem administra contas dá à conta de Carla o prazo "Pedir o código em toda entrada"
- **THEN** a tela mostra "Em toda entrada, pela conta", com o retorno "Prazo da confiança alterado.", e a entrada seguinte de Carla pede o código

#### Scenario: De onde vem o prazo
- **WHEN** João não tem prazo próprio, tem o perfil Técnico, sem prazo, e a organização usa 30 dias
- **THEN** a tela da conta de João mostra "30 dias, pela organização"

#### Scenario: Prazo da própria conta
- **WHEN** quem administra contas tenta mudar o prazo da própria conta pela administração
- **THEN** a mudança é recusada com "Use outra conta para mudar o seu prazo."
