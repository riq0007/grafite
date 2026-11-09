## Purpose

Abrir o Grafite no que precisa de ação: as ocorrências abertas dos módulos, das mais graves para as mais leves, com a imagem do ativo e o caminho para resolver cada uma.

## ADDED Requirements

### Requirement: Ocorrências dos módulos

Um módulo SHALL poder registrar uma fonte de ocorrências abertas. Cada ocorrência SHALL trazer:
- a severidade: Crítico, Atenção ou Informação;
- o texto da ocorrência, como "Toner preto em 8%";
- o ativo: o nome, o tipo e, se houver, as imagens;
- o momento em que abriu;
- o endereço do registro.

A tela inicial SHALL juntar as ocorrências de todas as fontes, sem mudança na casca. Quando uma fonte avisar que as suas ocorrências mudaram, a tela SHALL atualizar a lista sem recarregar a página.

#### Scenario: Fonte de um módulo
- **WHEN** um módulo registra uma fonte com duas ocorrências abertas
- **THEN** as duas aparecem na tela inicial, sem mudança no código da casca

#### Scenario: Ocorrência resolvida
- **WHEN** a fonte avisa que uma ocorrência foi resolvida
- **THEN** a ocorrência sai da lista, sem recarregar a página

### Requirement: O que resolver agora

A tela inicial SHALL ser "O que resolver agora", com o número de ocorrências abertas no título, como "4 abertas". As ocorrências SHALL aparecer na tabela base, com:
- a miniatura do ativo;
- o nome do ativo;
- a ocorrência;
- há quanto tempo está aberta, como "agora", "32 min", "1 h" ou "2 d", atualizado a cada minuto;
- a severidade em texto.

Clicar na linha ou pressionar Enter nela SHALL abrir o registro. A tela SHALL NOT mostrar indicadores sem uma decisão ligada a eles.

#### Scenario: Abrir o registro
- **WHEN** o usuário pressiona Enter na linha "Toner preto em 8%"
- **THEN** a casca navega até o registro da impressora

#### Scenario: Há quanto tempo
- **WHEN** uma ocorrência abriu há 90 minutos
- **THEN** a coluna mostra "1 h", e passa a "2 h" quando ela completa duas horas, sem recarregar a página

### Requirement: Ordem ajustável

A ordem de fábrica SHALL ser pela severidade (Crítico, Atenção e Informação) e, dentro da mesma severidade, a mais antiga primeiro. O usuário SHALL poder ordenar pelas colunas Severidade, Há, Ativo e Ocorrência, em ordem crescente ou decrescente. Ordenar pela Severidade SHALL usar a mesma regra da ordem de fábrica. A escolha SHALL ficar gravada até o usuário mudá-la.

#### Scenario: Ordem de fábrica
- **WHEN** há uma ocorrência de Atenção de 7 h, uma de Atenção de 1 h e uma Crítica de 32 min
- **THEN** a tela mostra a Crítica, depois a de Atenção de 7 h e por último a de 1 h

#### Scenario: Ordem escolhida
- **WHEN** o usuário ordena pelo nome do ativo, sai da tela e volta
- **THEN** a lista continua ordenada pelo nome do ativo

### Requirement: Estados da tela inicial

Enquanto as fontes respondem, a tela SHALL mostrar o esqueleto de carregamento no lugar das linhas.
- **Uma fonte falha:** a tela SHALL mostrar "Não foi possível carregar as ocorrências de <módulo>." e "Tentar de novo", e as ocorrências das outras fontes SHALL continuar à vista.
- **Nenhum módulo registra uma fonte:** a tela SHALL mostrar "Nenhum módulo registra ocorrências ainda".
- **Há fontes e nada aberto:** a tela SHALL mostrar "Nenhuma ocorrência aberta.".

A tela SHALL NOT mostrar ocorrências de exemplo fora do catálogo de componentes.

#### Scenario: Fonte com falha
- **WHEN** a fonte do módulo Rede falha, e a de Ativos responde com duas ocorrências
- **THEN** a tela mostra as duas ocorrências de Ativos e "Não foi possível carregar as ocorrências de Rede.", com "Tentar de novo"

#### Scenario: Nenhuma fonte
- **WHEN** nenhum módulo registra uma fonte de ocorrências
- **THEN** a tela mostra "Nenhum módulo registra ocorrências ainda", sem ocorrências inventadas

#### Scenario: Nada aberto
- **WHEN** as fontes respondem sem nenhuma ocorrência
- **THEN** a tela mostra "Nenhuma ocorrência aberta."
