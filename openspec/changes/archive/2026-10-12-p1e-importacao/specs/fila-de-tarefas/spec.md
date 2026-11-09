## MODIFIED Requirements

### Requirement: Manutenção diária de cada organização

A manutenção SHALL rodar uma vez por dia em cada organização, às 03:30 no horário de Brasília, como uma tarefa separada para cada uma. Ela SHALL:
- apagar os eventos com mais de 24 h;
- apagar do armazenamento o conteúdo dos arquivos removidos e registrar o apagamento;
- descartar as importações de ativos em rascunho com mais de 7 dias, apagando o conteúdo da planilha (spec importacao-de-ativos).

Rodar a manutenção duas vezes SHALL ter o mesmo efeito que rodar uma vez. Se o servidor estava desligado na hora marcada, a manutenção SHALL rodar uma vez quando ele voltar. Ela SHALL NOT apagar registros de auditoria, sessões nem nenhum registro de negócio: a importação descartada continua na lista de quem importou.

#### Scenario: Manutenção do dia
- **WHEN** são 03:30 no horário de Brasília
- **THEN** cada organização ganha a sua manutenção na fila, e cada uma roda no contexto da própria organização

#### Scenario: Servidor desligado na hora
- **WHEN** o servidor fica desligado das 02:00 às 05:00 e volta
- **THEN** a manutenção daquele dia roda uma vez, logo depois da volta

#### Scenario: Rascunho de importação esquecido
- **WHEN** a manutenção diária roda, e uma importação está em rascunho há 8 dias
- **THEN** a importação fica "Descartada", sem o conteúdo da planilha, e continua na lista de quem importou

#### Scenario: Manutenção repetida
- **WHEN** a manutenção de uma organização roda duas vezes seguidas
- **THEN** a segunda não encontra nada para apagar e conclui sem erro

