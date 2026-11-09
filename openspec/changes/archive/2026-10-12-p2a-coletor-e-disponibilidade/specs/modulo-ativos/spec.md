## MODIFIED Requirements

### Requirement: Ativos atualizados pelos eventos

A lista e a ficha dos ativos abertas SHALL se atualizar sozinhas, sem uma ação do usuário, quando chega:
- o evento `ativos.mudaram`;
- o evento de uma mudança que elas mostram: `catalogo.mudou`, pelo modelo e pelos campos, `locais.mudaram`, pelo caminho do local, `pessoas.mudaram`, pelo nome do responsável, e `disponibilidade.mudou`, pela situação da disponibilidade.

Um formulário em edição SHALL manter o que foi digitado.

#### Scenario: Ativo cadastrado em outra sessão
- **WHEN** Ana cadastra um ativo enquanto Bruno está com a lista dos ativos aberta
- **THEN** a lista de Bruno mostra o ativo novo

#### Scenario: Impressora que caiu com a lista aberta
- **WHEN** a impressora PAT-00412 fica offline enquanto Bruno está com a lista dos ativos aberta, com a coluna Disponibilidade
- **THEN** a lista de Bruno mostra a PAT-00412 "Offline" em até 5 s depois da gravação da leitura
