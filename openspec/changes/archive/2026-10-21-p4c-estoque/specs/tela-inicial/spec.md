## MODIFIED Requirements

### Requirement: Ocorrências dos módulos

Um módulo SHALL poder registrar uma fonte de ocorrências abertas. Cada ocorrência SHALL trazer:
- a severidade: Crítico, Atenção ou Informação;
- o texto da ocorrência, como "Toner preto em 8%";
- o ativo, ou o registro de que ela fala, como o coletor ou o consumível: o nome, o tipo e, se houver, as imagens;
- o momento em que abriu;
- o endereço do registro.

A tela inicial SHALL juntar as ocorrências de todas as fontes, sem mudança na casca. Quando uma fonte avisar que as suas ocorrências mudaram, a tela SHALL atualizar a lista sem recarregar a página.

#### Scenario: Fonte de um módulo
- **WHEN** um módulo registra uma fonte com duas ocorrências abertas
- **THEN** as duas aparecem na tela inicial, sem mudança no código da casca

#### Scenario: Ocorrência resolvida
- **WHEN** a fonte avisa que uma ocorrência foi resolvida
- **THEN** a ocorrência sai da lista, sem recarregar a página

#### Scenario: Ocorrência de um consumível
- **WHEN** a fonte do Operação traz o CF258A abaixo do mínimo no Almoxarifado
- **THEN** a ocorrência aparece com o CF258A no lugar do ativo, com a imagem genérica, e o clique abre o estoque do CF258A no Almoxarifado
